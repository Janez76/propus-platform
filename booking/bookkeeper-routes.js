/**
 * Bookkeeper-Routes — Proxy auf den propus-bookkeeper / Paperless-NGX-Stack auf der NAS.
 *
 * Erlaubt dem Admin-UI in propus-platform die Kontrolle über die KI-Cascade-Pipeline,
 * ohne dass der Bookkeeper-Token im Frontend gehalten werden muss.
 *
 * ENV-Variablen (in .env.vps — single-source-of-truth auf VPS):
 *   PAPERLESS_BOOKKEEPER_URL=https://paperless.propus.ch
 *   PAPERLESS_BOOKKEEPER_TOKEN=<bookkeeper-service-Token>
 *
 * Tag-IDs sind Konstanten im Code (entsprechen den Buchhaltungs-Pipeline-Tags
 * in Paperless, siehe Y:\Arhive\propus-bookkeeper\.env).
 *
 * Werden in server.js mit requireAdmin registriert.
 */
const PAPERLESS_URL = process.env.PAPERLESS_BOOKKEEPER_URL || "https://paperless.propus.ch";
const PAPERLESS_TOKEN = process.env.PAPERLESS_BOOKKEEPER_TOKEN || "";

// Tag-IDs (Stand 2026-05-05)
const T = {
  buchhaltung: 475,
  propus: 470,
  pending: 476,
  vorgeschlagen: 477,
  approved: 478,
  verbucht: 479,
  fehler: 480,
  privat: 481,
  spam: 482,
  abgleich: 483,
  duplikat: 484,
};
const STATUS_TAGS = new Set([
  T.pending, T.vorgeschlagen, T.approved, T.verbucht,
  T.fehler, T.privat, T.spam, T.abgleich,
]);

// Custom-Field-IDs
const F = {
  belegart: 2,
  belegdatum: 3,
  beleg_nr: 4,
  lieferant: 5,
  betrag_brutto: 6,
  waehrung: 7,
  mwst_gesamt: 8,
  mwst_aufteilung_json: 9,
  soll_konto: 10,
  haben_konto: 11,
  buchungstext: 12,
  confidence: 13,
  bexio_buchungs_id: 14,
  verbuchungs_status: 15,
  privat_anteil_chf: 16,
  auftrag_propus: 17,
  notiz_ai: 18,
};

function isConfigured() {
  return Boolean(PAPERLESS_URL && PAPERLESS_TOKEN);
}

/**
 * Bug-Hunt MEDIUM M08: Rate-Limit fuer Feedback-Endpoint, damit ein
 * kompromittierter oder boeswilliger Admin-Account das Self-Learning-
 * Korpus (`core.bookkeeper_feedback`) nicht durch Massen-Korrekturen
 * vergiften kann. Zwei Schichten:
 *   1) In-Memory Burst (50/min/User) gegen Skript-Spam
 *   2) DB-basiertes Per-(User,Doc,Field)-Tageslimit (3/Tag) — verhindert,
 *      dass ein einzelner User dieselbe Korrektur immer wieder einreicht
 *      (z. B. um Aggregator-Heuristik zu triggern).
 *
 * Defaults konfigurierbar via env. Exemption fuer ASSISTANT_UNLIMITED_EMAILS
 * (selbe Liste wie /api/assistant) — Standard-Admins koennen damit Bulk-
 * Korrekturen machen, ohne ans Burst-Limit zu stossen.
 */
const BOOKKEEPER_FEEDBACK_PER_MIN_LIMIT = (() => {
  const raw = process.env.BOOKKEEPER_FEEDBACK_PER_MIN_LIMIT;
  const n = raw ? parseInt(raw, 10) : 50;
  return Number.isFinite(n) && n > 0 ? n : 50;
})();
const BOOKKEEPER_FEEDBACK_PER_DOC_FIELD_DAY_LIMIT = (() => {
  const raw = process.env.BOOKKEEPER_FEEDBACK_PER_DOC_FIELD_DAY_LIMIT;
  const n = raw ? parseInt(raw, 10) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
})();
const BOOKKEEPER_BURST_WINDOW_MS = 60_000;
const _bookkeeperBurstBuckets = new Map(); // key: userId, val: { count, resetAt }

function checkBookkeeperBurst(userKey) {
  if (!userKey) return true; // wer keinen Key hat, kommt durch — DB-Constraint faengt es
  const now = Date.now();
  const bucket = _bookkeeperBurstBuckets.get(userKey);
  if (!bucket || bucket.resetAt <= now) {
    _bookkeeperBurstBuckets.set(userKey, { count: 1, resetAt: now + BOOKKEEPER_BURST_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= BOOKKEEPER_FEEDBACK_PER_MIN_LIMIT;
}

if (!global._bookkeeperBurstGC) {
  global._bookkeeperBurstGC = true;
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of _bookkeeperBurstBuckets) {
      if (b.resetAt <= now) _bookkeeperBurstBuckets.delete(k);
    }
  }, 5 * 60_000).unref?.();
}

function isFeedbackRateLimitExempt(email) {
  const list = String(process.env.ASSISTANT_UNLIMITED_EMAILS || "").trim();
  if (!list) return false;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  return list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(e);
}

async function plFetch(path, init = {}) {
  if (!isConfigured()) {
    const err = new Error("PAPERLESS_BOOKKEEPER_URL/TOKEN nicht konfiguriert");
    err.code = "NOT_CONFIGURED";
    throw err;
  }
  // Bug-Hunt LOW L02: defense-in-depth gegen SSRF. Vorher akzeptierte plFetch
  // alles, was mit "http" anfaengt — falls je ein Caller User-Input direkt
  // durchreicht, wird der Bookkeeper-Token an einen Angreifer-Host gesendet.
  // Heute strippt der einzige absolute-URL-Caller (recascade-Pagination,
  // Z. ~596) Protocol+Host bevor er weiterruft, also ist das Allow-Listen
  // auf relative Paperless-API-Pfade unkritisch. Wer doch absolute URLs
  // braucht, muss das explizit aufmachen — und dann mit Allowlist.
  if (typeof path !== "string" || !path.startsWith("/api/")) {
    const err = new Error(`plFetch: ungueltiger Pfad (erwartet /api/...): ${String(path).slice(0, 80)}`);
    err.code = "INVALID_PATH";
    throw err;
  }
  const url = `${PAPERLESS_URL.replace(/\/$/, "")}${path}`;
  const headers = {
    Authorization: `Token ${PAPERLESS_TOKEN}`,
    Accept: "application/json",
    ...(init.headers || {}),
  };
  if (init.body && typeof init.body === "string") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Paperless ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function countByTag(tagId) {
  const data = await plFetch(`/api/documents/?tags__id__all=${T.buchhaltung},${tagId}&page_size=1`);
  return Number(data.count || 0);
}

// bexio-Storno-Helper: löscht/storniert eine manual_entry, falls eine bexio_buchungs_id im Custom Field steht
async function bexioStornoIfBooked(doc) {
  const bexioToken = process.env.BEXIO_API_TOKEN;
  if (!bexioToken) return { skipped: true, reason: "kein BEXIO_API_TOKEN" };
  const cfs = (doc.custom_fields || []).reduce((acc, cf) => { acc[cf.field] = cf.value; return acc; }, {});
  const buchungsId = cfs[14]; // bexio_buchungs_id
  if (!buchungsId || String(buchungsId).startsWith("MOCK")) {
    return { skipped: true, reason: "keine bexio-Buchung" };
  }
  const url = `${process.env.BEXIO_API_URL || "https://api.bexio.com"}/3.0/accounting/manual_entries/${buchungsId}`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${bexioToken}`, Accept: "application/json" },
  });
  if (!r.ok && r.status !== 404) {
    const t = await r.text().catch(() => "");
    throw new Error(`bexio DELETE ${r.status}: ${t.slice(0, 200)}`);
  }
  return { ok: true, buchungs_id: buchungsId };
}

function registerBookkeeperRoutes(app, db, requireAdmin) {
  const pool = db && db.getPool ? db.getPool() : null;
  // ─── Status-Counts (für die Bookkeeper-Übersichts-Page) ────────────────
  app.get("/api/admin/bookkeeper/counts", requireAdmin, async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({
        error: "PAPERLESS_BOOKKEEPER_URL/TOKEN nicht konfiguriert",
        configured: false,
      });
    }
    try {
      const [pending, vorgeschlagen, approved, verbucht, fehler, spam, abgleich, duplikat] =
        await Promise.all([
          countByTag(T.pending),
          countByTag(T.vorgeschlagen),
          countByTag(T.approved),
          countByTag(T.verbucht),
          countByTag(T.fehler),
          countByTag(T.spam),
          countByTag(T.abgleich),
          // Duplikat-Tag ist OHNE buchhaltung-Tag-Zwang, weil er auch auf released-belegen sein kann
          plFetch(`/api/documents/?tags__id__all=${T.duplikat}&page_size=1`).then((d) => Number(d.count || 0)),
        ]);
      res.json({
        configured: true,
        counts: { pending, vorgeschlagen, approved, verbucht, fehler, spam, abgleich, duplikat },
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e), configured: true });
    }
  });

  // ─── Liste der Belege eines Status (für Approval-Queue etc.) ───────────
  // Filter: ?status=vorgeschlagen&min_confidence=85&max_confidence=100
  app.get("/api/admin/bookkeeper/documents", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const status = String(req.query.status || "vorgeschlagen");
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const minConf = req.query.min_confidence ? parseInt(req.query.min_confidence, 10) : null;
    const maxConf = req.query.max_confidence ? parseInt(req.query.max_confidence, 10) : null;
    const tag = T[status];
    if (!tag) return res.status(400).json({ error: `Unbekannter Status: ${status}` });
    try {
      const data = await plFetch(
        `/api/documents/?tags__id__all=${T.buchhaltung},${tag}&page_size=${limit}&ordering=-added`,
      );
      let docs = (data.results || []).map((d) => ({
        id: d.id,
        title: d.title,
        added: d.added,
        created: d.created,
        tags: d.tags,
        custom_fields: (d.custom_fields || []).reduce((acc, cf) => {
          acc[cf.field] = cf.value;
          return acc;
        }, {}),
      }));
      if (minConf !== null || maxConf !== null) {
        docs = docs.filter((d) => {
          const c = Number(d.custom_fields[13] || 0);
          if (minConf !== null && c < minConf) return false;
          if (maxConf !== null && c > maxConf) return false;
          return true;
        });
      }
      res.json({ count: docs.length, total: data.count || 0, results: docs });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // ─── Bexio-Pre-Flight-Check (vor Live-Push) ──────────────────────────
  // Prüft ob die im Beleg verwendeten Soll/Haben-Konten in bexio existieren UND ob
  // die MwSt-Kombination eine bekannte tax_id ergibt. Verhindert HTTP-400-Fehler beim
  // tatsächlichen Push.
  app.get("/api/admin/bookkeeper/preflight/:id", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const bexioToken = process.env.BEXIO_API_TOKEN;
    if (!bexioToken) return res.status(503).json({ error: "BEXIO_API_TOKEN fehlt" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ungueltige id" });
    try {
      const doc = await plFetch(`/api/documents/${id}/`);
      const cfs = (doc.custom_fields || []).reduce((acc, cf) => { acc[cf.field] = cf.value; return acc; }, {});
      const issues = [];
      const soll = cfs[10]; const haben = cfs[11];
      const datum = cfs[3]; const betrag = cfs[6]; const lieferant = cfs[5];

      // Pflichtfelder
      if (!datum) issues.push({ severity: "error", field: "belegdatum", msg: "Datum fehlt" });
      if (!betrag) issues.push({ severity: "error", field: "betrag", msg: "Betrag fehlt" });
      if (!soll) issues.push({ severity: "error", field: "soll_konto", msg: "Soll-Konto fehlt" });
      if (!haben) issues.push({ severity: "error", field: "haben_konto", msg: "Haben-Konto fehlt" });
      if (!lieferant) issues.push({ severity: "warn", field: "lieferant", msg: "Lieferant leer" });

      // Konten-Existenz in bexio prüfen
      if (soll || haben) {
        const r = await fetch(`${process.env.BEXIO_API_URL || "https://api.bexio.com"}/2.0/accounts?limit=500`, {
          headers: { Authorization: `Bearer ${bexioToken}`, Accept: "application/json" },
        });
        if (r.ok) {
          const accs = await r.json();
          const nrs = new Set(accs.map((a) => String(a.account_no || "")));
          if (soll && !nrs.has(String(soll))) {
            issues.push({ severity: "error", field: "soll_konto", msg: `Konto ${soll} existiert nicht in bexio` });
          }
          if (haben && !nrs.has(String(haben))) {
            issues.push({ severity: "error", field: "haben_konto", msg: `Konto ${haben} existiert nicht in bexio` });
          }
        }
      }

      // MwSt-Aufteilung-Check
      if (cfs[9]) {
        try {
          const mwstParts = JSON.parse(String(cfs[9]));
          if (Array.isArray(mwstParts)) {
            for (const p of mwstParts) {
              if (p.netto != null && p.mwst != null) {
                if (p.satz === "0.00" || (p.satz === "0" )) continue;
              }
            }
          }
        } catch (_) {
          issues.push({ severity: "warn", field: "mwst_aufteilung_json", msg: "MwSt-JSON nicht parsebar" });
        }
      }

      const ok = issues.filter((i) => i.severity === "error").length === 0;
      res.json({ ok, issues, doc_id: id });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  // ─── Single Document Detail ────────────────────────────────────────────
  app.get("/api/admin/bookkeeper/documents/:id", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ungueltige id" });
    try {
      const data = await plFetch(`/api/documents/${id}/`);
      res.json(data);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  // ─── Custom Fields editieren (Inline-Edit) ─────────────────────────────
  // Body: { fields: { [fieldId]: value, ... } }
  // MUSS bestehende Custom Fields mergen, weil PATCH bei Paperless ein REPLACE der Liste ist.
  app.patch("/api/admin/bookkeeper/documents/:id", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ungueltige id" });
    const fields = req.body && req.body.fields;
    if (!fields || typeof fields !== "object") {
      return res.status(400).json({ error: "fields object required" });
    }
    try {
      // 1) bestehende Custom Fields lesen
      const existing = await plFetch(`/api/documents/${id}/`);
      const merged = {};
      for (const cf of existing.custom_fields || []) {
        merged[cf.field] = cf.value;
      }
      for (const [fid, value] of Object.entries(fields)) {
        merged[parseInt(fid, 10)] = value;
      }
      const custom_fields = Object.entries(merged).map(([fid, value]) => ({
        field: parseInt(fid, 10),
        value,
      }));

      // 2) PATCH mit gemergten Werten
      const updated = await plFetch(`/api/documents/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ custom_fields }),
      });
      res.json({ ok: true, id: updated.id });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  // ─── Approve: Tag von vorgeschlagen → approved ─────────────────────────
  app.post("/api/admin/bookkeeper/documents/:id/approve", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ungueltige id" });
    try {
      const doc = await plFetch(`/api/documents/${id}/`);
      const newTags = (doc.tags || []).filter((t) => !STATUS_TAGS.has(t));
      newTags.push(T.approved);
      await plFetch(`/api/documents/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ tags: newTags }),
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  // ─── Reject: zurück auf pending (für Re-Cascade) ──────────────────────
  app.post("/api/admin/bookkeeper/documents/:id/reject", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ungueltige id" });
    try {
      const doc = await plFetch(`/api/documents/${id}/`);
      const newTags = (doc.tags || []).filter((t) => !STATUS_TAGS.has(t));
      newTags.push(T.pending);
      await plFetch(`/api/documents/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ tags: newTags }),
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  // ─── Mark as spam ─────────────────────────────────────────────────────
  app.post("/api/admin/bookkeeper/documents/:id/spam", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ungueltige id" });
    try {
      const doc = await plFetch(`/api/documents/${id}/`);
      const newTags = (doc.tags || []).filter((t) => !STATUS_TAGS.has(t));
      newTags.push(T.spam);
      await plFetch(`/api/documents/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ tags: newTags }),
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  // ─── DELETE: in Paperless Trash + (optional) bexio-Storno ─────────────
  // Body: { also_bexio?: boolean } — wenn true und bexio_buchungs_id existiert, wird auch dort gelöscht.
  app.delete("/api/admin/bookkeeper/documents/:id", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ungueltige id" });
    const alsoBexio = Boolean(req.query.also_bexio || (req.body && req.body.also_bexio));
    const result = { paperless: null, bexio: null };
    try {
      // Doc-Detail vorab holen, um an die bexio_buchungs_id zu kommen
      const doc = await plFetch(`/api/documents/${id}/`);

      if (alsoBexio) {
        try {
          result.bexio = await bexioStornoIfBooked(doc);
        } catch (e) {
          result.bexio = { error: e.message };
        }
      }

      // Paperless-Trash via bulk_edit
      const r = await plFetch(`/api/documents/bulk_edit/`, {
        method: "POST",
        body: JSON.stringify({ documents: [id], method: "delete" }),
      });
      result.paperless = r;
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e), partial: result });
    }
  });

  // ─── KI-Training-Feedback (Option 4) ──────────────────────────────────
  // Speichert User-Korrekturen, die später als Few-Shot-Beispiele in den
  // Cascade-Prompts eingewoben werden können.
  // Body: { doc_id, field, original_value, corrected_value, reason? }
  // Storage: in einer JSON-Liste auf der NAS unter /volume1/docker/propus-bookkeeper/feedback/.
  // Persistierung über Backend-Proxy: POST hier → Paperless-API patcht Document
  // (custom field) UND Feedback wird in einer DB-Tabelle gespeichert (TODO).
  app.post("/api/admin/bookkeeper/feedback", requireAdmin, async (req, res) => {
    const body = req.body || {};
    if (!body.doc_id || !body.field_id) {
      return res.status(400).json({ error: "doc_id und field_id required" });
    }
    const fid = parseInt(body.field_id, 10);
    if (!Number.isFinite(fid)) return res.status(400).json({ error: "ungueltige field_id" });

    // Bug-Hunt MEDIUM M08: Korpus-Vergiftungs-Schutz. Burst-Limit greift
    // unabhaengig vom DB-State; das per-(User,Doc,Field)-Tageslimit greift
    // nach der ersten Korrektur derselben Stelle.
    const userEmail = req.user && req.user.email ? String(req.user.email) : "";
    const burstKey = req.user && req.user.id != null
      ? String(req.user.id)
      : userEmail || (req.ip || "anon");
    const exempt = isFeedbackRateLimitExempt(userEmail);
    if (!exempt && !checkBookkeeperBurst(burstKey)) {
      return res.status(429).json({
        error: "Zu viele Korrekturen pro Minute. Bitte kurz warten.",
        persisted: false,
        paperless_patched: false,
      });
    }

    const fieldNameMap = {
      2: "belegart", 3: "belegdatum", 4: "beleg_nr", 5: "lieferant",
      6: "betrag_brutto", 7: "waehrung", 8: "mwst_gesamt", 9: "mwst_aufteilung_json",
      10: "soll_konto", 11: "haben_konto", 12: "buchungstext", 13: "confidence",
      14: "bexio_buchungs_id", 15: "verbuchungs_status", 16: "privat_anteil_chf",
      17: "auftrag_propus", 18: "notiz_ai",
    };

    // 1) DB-Persistenz für Few-Shot-Lerntag — KRITISCH, ohne Zeile kein KI-Training.
    if (!pool) {
      return res.status(503).json({
        error: "DB-Pool nicht verfuegbar — KI-Training-Persistenz ausgefallen",
        persisted: false,
        paperless_patched: false,
      });
    }
    // user_id-Spalte ist UUID — req.user.id kann aber Integer (booking.users) sein.
    // Nur wenn es UUID-Format hat, mit Wert speichern; sonst NULL (Korrektur bleibt
    // gespeichert, nur Attribution geht verloren).
    const rawUid = req.user && req.user.id != null ? String(req.user.id) : null;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const userIdParam = rawUid && UUID_RE.test(rawUid) ? rawUid : null;

    // Per-(User,Doc,Field)-Tageslimit — nur wenn user_id sauber als UUID
    // attributierbar ist. Anonyme Zeilen (userIdParam=null) zaehlen wir
    // bewusst nicht, sonst kann ein Angreifer den Cap durch Auth-Bug
    // umgehen — Burst-Limit oben fangt das ab.
    if (!exempt && userIdParam) {
      try {
        const r = await pool.query(
          `SELECT count(*)::int AS n
             FROM core.bookkeeper_feedback
            WHERE user_id = $1 AND doc_id = $2 AND field_id = $3
              AND created_at >= NOW() - INTERVAL '1 day'`,
          [userIdParam, body.doc_id, fid],
        );
        const recent = r.rows[0] ? r.rows[0].n : 0;
        if (recent >= BOOKKEEPER_FEEDBACK_PER_DOC_FIELD_DAY_LIMIT) {
          return res.status(429).json({
            error: `Tageslimit fuer Korrekturen an Beleg ${body.doc_id} / Feld ${fid} erreicht (${BOOKKEEPER_FEEDBACK_PER_DOC_FIELD_DAY_LIMIT}). Wenn die Korrektur stimmt, sollte sie ankommen — sonst bitte morgen erneut.`,
            persisted: false,
            paperless_patched: false,
          });
        }
      } catch (_e) {
        // Wenn die Count-Abfrage fehlschlaegt, lassen wir die INSERT laufen —
        // Cap ist Defense-in-Depth, nicht Pflicht-Gate. Burst-Limit greift
        // weiterhin.
      }
    }

    let persisted = false;
    let pgError = null;
    try {
      await pool.query(
        `INSERT INTO core.bookkeeper_feedback
           (doc_id, field_id, field_name, original_value, corrected_value, reason, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          body.doc_id, fid, fieldNameMap[fid] || null,
          body.original_value != null ? String(body.original_value) : null,
          body.corrected_value != null ? String(body.corrected_value) : null,
          body.reason || null,
          userIdParam,
        ],
      );
      persisted = true;
    } catch (e) {
      pgError = e.message || String(e);
    }

    // Wenn DB-Schreiben scheiterte, NICHT Paperless patchen — sonst Drift.
    if (!persisted) {
      return res.status(500).json({
        error: `Feedback-DB-Insert fehlgeschlagen: ${pgError}`,
        persisted: false,
        paperless_patched: false,
        pgError,
      });
    }

    // 2) Paperless-Patch — User-Korrektur sofort live
    try {
      if (typeof body.corrected_value !== "undefined") {
        const existing = await plFetch(`/api/documents/${body.doc_id}/`);
        const merged = {};
        for (const cf of existing.custom_fields || []) merged[cf.field] = cf.value;
        merged[fid] = body.corrected_value;
        const custom_fields = Object.entries(merged).map(([k, v]) => ({ field: parseInt(k, 10), value: v }));
        await plFetch(`/api/documents/${body.doc_id}/`, {
          method: "PATCH",
          body: JSON.stringify({ custom_fields }),
        });
      }
      res.json({ ok: true, persisted: true, paperless_patched: true });
    } catch (e) {
      // DB-Zeile ist drin, Paperless-Patch scheiterte — 502 damit User merkt.
      res.status(502).json({
        error: `Paperless-Patch fehlgeschlagen: ${e.message || String(e)}`,
        persisted: true,
        paperless_patched: false,
      });
    }
  });

  // ─── Feedback-Diagnose ─────────────────────────────────────────────────
  // Damit der Training-Tab klar zeigen kann, warum die Liste leer ist:
  // Pool nicht verfuegbar? Migration nicht eingespielt? Tabelle fehlt?
  // Oder schlicht noch keine Korrekturen gemacht.
  app.get("/api/admin/bookkeeper/feedback/debug", requireAdmin, async (_req, res) => {
    const out = {
      database_url_set: Boolean(process.env.DATABASE_URL),
      pool_available: Boolean(pool),
      table_exists: null,
      migration_applied: null,
      row_count: null,
      last_row_at: null,
      error: null,
    };
    if (!pool) return res.json(out);
    try {
      const ex = await pool.query(
        `SELECT to_regclass('core.bookkeeper_feedback') IS NOT NULL AS exists`,
      );
      out.table_exists = Boolean(ex.rows[0] && ex.rows[0].exists);

      try {
        const m = await pool.query(
          `SELECT 1 FROM core.applied_migrations
            WHERE filename = '060_bookkeeper_feedback.sql' LIMIT 1`,
        );
        out.migration_applied = m.rowCount > 0;
      } catch {
        out.migration_applied = null;
      }

      if (out.table_exists) {
        const c = await pool.query(
          `SELECT count(*)::int AS n, max(created_at) AS last_at
             FROM core.bookkeeper_feedback`,
        );
        out.row_count = c.rows[0].n;
        out.last_row_at = c.rows[0].last_at;
      }
      res.json(out);
    } catch (e) {
      out.error = e.message || String(e);
      res.status(500).json(out);
    }
  });

  // ─── Feedback-Liste (für Few-Shot-Generator + Audit) ──────────────────
  app.get("/api/admin/bookkeeper/feedback", requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const onlyUnapplied = req.query.unapplied === "1";
    try {
      const where = onlyUnapplied ? "WHERE applied_to_prompt = FALSE" : "";
      const r = await pool.query(
        `SELECT id, doc_id, field_id, field_name, original_value, corrected_value, reason,
                user_id, created_at, applied_to_prompt
           FROM core.bookkeeper_feedback ${where}
          ORDER BY created_at DESC LIMIT 500`,
      );
      res.json({ count: r.rowCount, results: r.rows });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // ─── Re-Cascade Bulk (nur ausgewählte doc_ids zurück auf pending) ─────
  // Body: { doc_ids: number[] } — taggt nur diese Belege, nicht alle
  // eines Status. Sequentiell um Paperless nicht zu hammern. Sammelt
  // Fehler statt mittendrin abzubrechen.
  app.post("/api/admin/bookkeeper/recascade-bulk", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const raw = req.body && Array.isArray(req.body.doc_ids) ? req.body.doc_ids : null;
    if (!raw) return res.status(400).json({ error: "doc_ids muss ein Array sein" });
    const docIds = Array.from(new Set(raw.map((v) => parseInt(v, 10)).filter((n) => Number.isFinite(n) && n > 0)));
    if (docIds.length === 0) return res.status(400).json({ error: "doc_ids ist leer oder enthaelt keine gueltigen IDs" });
    if (docIds.length > 200) return res.status(400).json({ error: "doc_ids: maximal 200 pro Aufruf" });
    const failed = [];
    let migrated = 0;
    for (const id of docIds) {
      try {
        const doc = await plFetch(`/api/documents/${id}/`);
        const newTags = (doc.tags || []).filter((t) => !STATUS_TAGS.has(t));
        newTags.push(T.pending);
        await plFetch(`/api/documents/${id}/`, {
          method: "PATCH",
          body: JSON.stringify({ tags: newTags }),
        });
        migrated++;
      } catch (e) {
        failed.push({ id, error: e.message || String(e) });
      }
    }
    res.json({ ok: failed.length === 0, migrated, failed });
  });

  // ─── Re-Cascade (alle vorgeschlagenen zurück auf pending) ──────────────
  app.post("/api/admin/bookkeeper/recascade", requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: "Bookkeeper nicht konfiguriert" });
    const status = String((req.body && req.body.status) || "vorgeschlagen");
    const tag = T[status];
    if (!tag || tag === T.pending) {
      return res.status(400).json({ error: `Status nicht re-cascadebar: ${status}` });
    }
    try {
      let migrated = 0;
      let next = `/api/documents/?tags__id__all=${T.buchhaltung},${tag}&page_size=200`;
      while (next) {
        const data = await plFetch(next);
        for (const d of data.results || []) {
          const newTags = (d.tags || []).filter((t) => !STATUS_TAGS.has(t));
          newTags.push(T.pending);
          await plFetch(`/api/documents/${d.id}/`, {
            method: "PATCH",
            body: JSON.stringify({ tags: newTags }),
          });
          migrated++;
        }
        next = data.next ? data.next.replace(/^https?:\/\/[^/]+/, "") : null;
      }
      res.json({ ok: true, migrated });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });
}

module.exports = { registerBookkeeperRoutes };
