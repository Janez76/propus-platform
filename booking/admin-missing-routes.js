/**
 * Admin-Routen, die vom Frontend (Reviews, E-Mail-Templates, Bug-Reports, Backups) erwartet werden.
 * Werden in server.js nach den bestehenden Admin-Routen registriert.
 */
const { getSetting } = require("./settings-resolver");
const templateRenderer = require("./template-renderer");
const calendarTpl = require("./templates/calendar");

const CALENDAR_SYSTEM_KEYS = new Set(["customer_event", "photographer_event"]);

function buildCalendarPlaceholderDocs() {
  const seen = new Set();
  const out = [];
  const extras = [
    { key: "address", desc: "Kurz-Ort für Betreff (PLZ/Ort oder Adresssegment)" },
    { key: "addressLine", desc: "PLZ/Ort + Objektadresse" },
    { key: "objectSummary", desc: "Objekttyp, Fläche, Zimmer, Etagen (kompakt)" },
    { key: "customerBlock", desc: "Kundenkontakt mehrzeilig" },
    { key: "onsiteBlock", desc: "Vor-Ort-Kontakt (ein Block, leer wenn nichts)" },
    { key: "notesBlock", desc: "Kundenhinweise (leer wenn keine)" },
    { key: "keyPickupBlock", desc: "Schlüsselabholung (leer wenn keine)" },
    { key: "photographerBlock", desc: "Fotografenblock inkl. Initialen, Mobile, WhatsApp und Radius" },
    { key: "photographerEmail", desc: "E-Mail Fotograf/in" },
    { key: "photographerContactSummary", desc: "Kompakte Fotografen-Kontaktzeile" },
    { key: "photographerRadiusLabel", desc: "Fotografen-Radius formatiert (0 = unbegrenzt)" },
    { key: "adminLink", desc: "Link zum Auftrag im Admin-Frontend" },
  ];
  for (const p of extras) {
    if (!seen.has(p.key)) {
      seen.add(p.key);
      out.push(p);
    }
  }
  for (const p of templateRenderer.AVAILABLE_PLACEHOLDERS || []) {
    if (!seen.has(p.key)) {
      seen.add(p.key);
      out.push(p);
    }
  }
  return out;
}

function mapCalendarTemplateRow(r) {
  return {
    id: r.id,
    key: r.key,
    label: r.label || "",
    subject: r.subject || "",
    body: r.body || "",
    active: Boolean(r.active),
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : "",
  };
}

function sampleOrderForCalendarPreview() {
  return {
    orderNo: 12345,
    status: "confirmed",
    address: "Musterstrasse 1, 8000 Zürich",
    billing: {
      name: "Max Mustermann",
      email: "max@example.com",
      phone: "+41 79 000 00 00",
      zipcity: "8000 Zürich",
      notes: "Beispielhinweis",
      onsiteName: "Hauswart",
      onsitePhone: "+41 44 000 00 00",
    },
    schedule: { date: "2026-06-15", time: "14:00", durationMin: 90 },
    services: { package: { label: "Premium-Paket" }, addons: [{ label: "Drohnen-Flug" }] },
    object: { type: "apartment", area: 120, rooms: 4, floors: 2 },
    photographer: {
      key: "foto1",
      name: "Fotograf/in",
      email: "foto@example.com",
      phone: "+41 79 111 22 33",
      phone_mobile: "+41 79 111 22 33",
      whatsapp: "https://wa.me/41791112233",
      initials: "FP",
      max_radius_km: 0,
    },
    keyPickup: { address: "Schlüsseldepot Zürich", info: "Code 1234" },
  };
}

function registerAdminMissingRoutes(app, db, requireAdmin, mailer) {
  const getPool = () => db.getPool && db.getPool();

  // ─── Reviews: Google-Link (öffentlich für Reviews-Seite) ───────────────────
  app.get("/api/reviews/google-link", async (_req, res) => {
    try {
      const setting = await getSetting("google.reviewLink");
      const link = (setting && setting.value != null) ? String(setting.value) : "https://g.page/r/CSQ5RnWmJOumEAE/review";
      res.json({ ok: true, link });
    } catch (err) {
      res.status(500).json({ error: err.message || "Link konnte nicht geladen werden" });
    }
  });

  // ─── Reviews: KPI + Liste (Admin) ──────────────────────────────────────────
  app.get("/api/admin/reviews/kpi", requireAdmin, async (_req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const base = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE o.done_at IS NOT NULL AND o.review_request_sent_at IS NOT NULL AND o.review_request_count > 0) AS faellig,
          COUNT(*) FILTER (WHERE o.review_request_sent_at IS NOT NULL) AS gesendet,
          COUNT(*) FILTER (WHERE r.submitted_at IS NOT NULL) AS beantwortet,
          COALESCE(AVG(r.rating) FILTER (WHERE r.rating IS NOT NULL), 0) AS avg_rating
        FROM orders o
        LEFT JOIN order_reviews r ON r.order_no = o.order_no
        WHERE o.status = 'done' AND o.done_at IS NOT NULL
      `);
      const row = base.rows[0] || {};
      const gesendet = parseInt(row.gesendet || "0", 10);
      const beantwortet = parseInt(row.beantwortet || "0", 10);
      res.json({
        ok: true,
        kpi: {
          faellig: parseInt(row.faellig || "0", 10),
          gesendet,
          beantwortet,
          responseRate: gesendet > 0 ? Math.round((beantwortet / gesendet) * 100) : 0,
          avgRating: row.avg_rating != null ? parseFloat(row.avg_rating) : null,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "KPI konnte nicht geladen werden" });
    }
  });

  app.get("/api/admin/reviews", requireAdmin, async (_req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const { rows } = await pool.query(`
        SELECT
          o.order_no,
          o.billing,
          o.done_at,
          o.review_request_sent_at,
          COALESCE(o.review_request_count, 0) AS review_request_count,
          r.id AS review_id,
          r.rating,
          r.comment,
          r.submitted_at
        FROM orders o
        LEFT JOIN order_reviews r ON r.order_no = o.order_no
        WHERE o.status = 'done' AND o.done_at IS NOT NULL
        ORDER BY o.done_at DESC
        LIMIT 500
      `);
      const reviews = rows.map((row) => {
        const billing = row.billing && typeof row.billing === "object" ? row.billing : {};
        let review_status = "not_due";
        if (row.submitted_at != null) review_status = "responded";
        else if (row.review_request_sent_at != null && (row.review_request_count || 0) > 0) review_status = "sent";
        else if (row.done_at != null) review_status = "pending";
        return {
          order_no: row.order_no,
          customer_name: billing.name || null,
          customer_email: billing.email || null,
          done_at: row.done_at ? new Date(row.done_at).toISOString() : null,
          review_request_sent_at: row.review_request_sent_at ? new Date(row.review_request_sent_at).toISOString() : null,
          review_request_count: parseInt(row.review_request_count || "0", 10),
          review_id: row.review_id,
          rating: row.rating,
          comment: row.comment,
          submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
          review_status,
        };
      });
      res.json({ ok: true, reviews });
    } catch (err) {
      res.status(500).json({ error: err.message || "Reviews konnten nicht geladen werden" });
    }
  });

  // ─── E-Mail-Templates (Admin) ───────────────────────────────────────────────
  app.get("/api/admin/email-templates", requireAdmin, async (_req, res) => {
    try {
      const pool = getPool();
      const list = pool ? await templateRenderer.listTemplates(pool) : [];
      const byKey = {};
      for (const row of list) {
        const key = row.key;
        if (!byKey[key] || (row.template_language || "").toLowerCase() === "de-ch") {
          byKey[key] = row;
        }
      }
      const templates = Object.values(byKey).map((row) => ({
        id: row.id,
        key: row.key,
        label: row.label || row.key,
        subject: row.subject || "",
        body_html: row.body_html || "",
        active: Boolean(row.active),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : "",
      }));
      res.json({ ok: true, templates, placeholders: templateRenderer.AVAILABLE_PLACEHOLDERS || [] });
    } catch (err) {
      res.status(500).json({ error: err.message || "Templates konnten nicht geladen werden" });
    }
  });

  app.get("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      const history = pool ? await templateRenderer.getTemplateHistory(pool, key) : [];
      res.json({
        ok: true,
        history: history.map((h) => ({
          id: h.id,
          subject: h.subject,
          body_html: h.body_html,
          changed_by: h.changed_by,
          changed_at: h.changed_at ? new Date(h.changed_at).toISOString() : "",
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "History konnte nicht geladen werden" });
    }
  });

  app.put("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      const { subject, body_html, label, active } = req.body || {};
      await templateRenderer.saveTemplate(pool, key, {
        subject: subject != null ? String(subject) : undefined,
        body_html: body_html != null ? String(body_html) : undefined,
        label: label != null ? String(label) : undefined,
        changed_by: "admin",
      });
      if (active === false) {
        await pool.query("UPDATE email_templates SET active = FALSE WHERE key = $1", [key]);
      } else if (active === true) {
        await pool.query("UPDATE email_templates SET active = TRUE WHERE key = $1", [key]);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Template konnte nicht gespeichert werden" });
    }
  });

  app.patch("/api/admin/email-templates/:key/toggle", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      const { rows } = await pool.query("SELECT active FROM email_templates WHERE key = $1 LIMIT 1", [key]);
      const current = rows[0] ? Boolean(rows[0].active) : true;
      const next = !current;
      await pool.query("UPDATE email_templates SET active = $1, updated_at = NOW() WHERE key = $2", [next, key]);
      res.json({ ok: true, key, active: next });
    } catch (err) {
      res.status(400).json({ error: err.message || "Toggle fehlgeschlagen" });
    }
  });

  app.post("/api/admin/email-templates/:key/preview", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      const key = String(req.params.key || "").trim();
      const orderNo = req.body?.orderNo;
      let vars = {};
      if (pool && orderNo) {
        const order = await db.getOrderByNo(parseInt(orderNo, 10));
        if (order) vars = templateRenderer.buildTemplateVars(order, {});
      }
      await templateRenderer.enrichPhotographerVars(pool, vars);
      const tmpl = pool ? await templateRenderer.loadTemplate(pool, key, "de-CH") : null;
      if (!tmpl) return res.status(404).json({ error: "Template nicht gefunden" });
      const subject = templateRenderer.renderTemplate(tmpl.subject, vars);
      const body_html = templateRenderer.renderTemplate(tmpl.body_html, vars);
      res.json({ ok: true, subject, body_html });
    } catch (err) {
      res.status(400).json({ error: err.message || "Preview fehlgeschlagen" });
    }
  });

  app.post("/api/admin/email-templates/:key/test-send", requireAdmin, async (req, res) => {
    try {
      const to = String((req.body && req.body.to) || "").trim();
      if (!to) return res.status(400).json({ error: "to (E-Mail) fehlt" });
      const pool = getPool();
      const key = String(req.params.key || "").trim();
      const tmpl = pool ? await templateRenderer.loadTemplate(pool, key, "de-CH") : null;
      if (!tmpl) return res.status(404).json({ error: "Template nicht gefunden" });
      const mailer = req.app && req.app.locals && req.app.locals.mailer;
      if (!mailer) return res.status(503).json({ error: "Mailer nicht konfiguriert" });
      const sampleOrder = sampleOrderForCalendarPreview();
      const vars = templateRenderer.buildTemplateVars(sampleOrder, {
        confirmationLink: "https://admin-booking.propus.ch/confirm?token=test-token",
        confirmUrl: "https://admin-booking.propus.ch/confirm?token=test-token",
        reviewLink: "https://admin-booking.propus.ch/review/test-token",
      });
      await templateRenderer.enrichPhotographerVars(pool, vars);
      const subject = templateRenderer.renderTemplate(tmpl.subject, vars);
      const body_html = templateRenderer.renderTemplate(tmpl.body_html, vars);
      await mailer.sendMail({ from: process.env.MAIL_FROM || "noreply@example.com", to, subject, html: body_html });
      res.json({ ok: true, sent: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Test-Versand fehlgeschlagen" });
    }
  });

  app.post("/api/admin/email-templates/:key/restore/:historyId", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const historyId = parseInt(req.params.historyId, 10);
      if (!Number.isFinite(historyId)) return res.status(400).json({ error: "historyId ungültig" });
      await templateRenderer.restoreTemplateVersion(pool, historyId, "admin");
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Restore fehlgeschlagen" });
    }
  });

  app.delete("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      await pool.query("DELETE FROM email_templates WHERE key = $1", [key]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Löschen fehlgeschlagen" });
    }
  });

  // ─── Kalender-Vorlagen / ICS (Admin) ───────────────────────────────────────
  app.get("/api/admin/calendar-templates", requireAdmin, async (_req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const { rows } = await pool.query(
        "SELECT id, key, label, subject, body, active, updated_at FROM calendar_templates ORDER BY key ASC"
      );
      res.json({
        ok: true,
        templates: rows.map(mapCalendarTemplateRow),
        placeholders: buildCalendarPlaceholderDocs(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Kalender-Vorlagen konnten nicht geladen werden" });
    }
  });

  app.get("/api/admin/calendar-templates/:key", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      const { rows } = await pool.query(
        "SELECT id, key, label, subject, body, active, updated_at FROM calendar_templates WHERE key = $1 LIMIT 1",
        [key]
      );
      if (!rows[0]) return res.status(404).json({ error: "Vorlage nicht gefunden" });
      res.json({ ok: true, template: mapCalendarTemplateRow(rows[0]) });
    } catch (err) {
      res.status(500).json({ error: err.message || "Vorlage konnte nicht geladen werden" });
    }
  });

  app.put("/api/admin/calendar-templates/:key", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      const { subject, body, label, active } = req.body || {};
      const labelVal = label != null ? String(label) : key;
      const subjectVal = subject != null ? String(subject) : "";
      const bodyVal = body != null ? String(body) : "";
      const activeVal = active === false ? false : true;
      await pool.query(
        `INSERT INTO calendar_templates (key, label, subject, body, active, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (key) DO UPDATE SET
           label = EXCLUDED.label,
           subject = EXCLUDED.subject,
           body = EXCLUDED.body,
           active = EXCLUDED.active,
           updated_at = NOW()`,
        [key, labelVal, subjectVal, bodyVal, activeVal]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Speichern fehlgeschlagen" });
    }
  });

  app.patch("/api/admin/calendar-templates/:key/toggle", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      const { rows } = await pool.query("SELECT active FROM calendar_templates WHERE key = $1 LIMIT 1", [key]);
      if (!rows[0]) return res.status(404).json({ error: "Vorlage nicht gefunden" });
      const next = !Boolean(rows[0].active);
      await pool.query("UPDATE calendar_templates SET active = $1, updated_at = NOW() WHERE key = $2", [next, key]);
      res.json({ ok: true, key, active: next });
    } catch (err) {
      res.status(400).json({ error: err.message || "Toggle fehlgeschlagen" });
    }
  });

  app.post("/api/admin/calendar-templates/:key/preview", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const key = String(req.params.key || "").trim();
      const orderNoRaw = req.body && req.body.orderNo;
      let order = sampleOrderForCalendarPreview();
      if (orderNoRaw != null && orderNoRaw !== "") {
        const n = Number(orderNoRaw);
        if (Number.isFinite(n) && db.getOrderByNo) {
          const loaded = await db.getOrderByNo(n);
          if (loaded) order = loaded;
        }
      }
      const photogPhone =
        (order.photographer && order.photographer.phone) || "+41 79 111 22 33";
      const evType = String(order.status || "").toLowerCase() === "confirmed" ? "confirmed" : undefined;
      const rendered = await calendarTpl.renderStoredCalendarTemplate(pool, key, order, {
        photogPhone,
        eventType: evType,
      });
      res.json({ ok: true, subject: rendered.subject, body: rendered.body });
    } catch (err) {
      res.status(400).json({ error: err.message || "Vorschau fehlgeschlagen" });
    }
  });

  app.delete("/api/admin/calendar-templates/:key", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      if (CALENDAR_SYSTEM_KEYS.has(key)) {
        return res.status(400).json({ error: "System-Vorlage kann nicht gelöscht werden" });
      }
      await pool.query("DELETE FROM calendar_templates WHERE key = $1", [key]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Löschen fehlgeschlagen" });
    }
  });

  // ─── Bug Reports (Admin) ────────────────────────────────────────────────────
  app.get("/api/admin/bug-reports", requireAdmin, async (_req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const { rows } = await pool.query(
        "SELECT id, name, text, status, created_at FROM bug_reports ORDER BY created_at DESC LIMIT 200"
      );
      res.json(rows.map((r) => ({
        id: r.id,
        title: r.name || "",
        status: r.status || "new",
        description: r.text,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      })));
    } catch (err) {
      res.status(500).json({ error: err.message || "Bug-Reports konnten nicht geladen werden" });
    }
  });

  app.patch("/api/admin/bug-reports/:id/status", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const id = parseInt(req.params.id, 10);
      const status = String((req.body && req.body.status) || "").trim() || "new";
      await pool.query("UPDATE bug_reports SET status = $1 WHERE id = $2", [status, id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Status-Update fehlgeschlagen" });
    }
  });

  app.delete("/api/admin/bug-reports/:id", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const id = parseInt(req.params.id, 10);
      await pool.query("DELETE FROM bug_reports WHERE id = $1", [id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Löschen fehlgeschlagen" });
    }
  });

  app.post("/api/admin/bug-reports/:id/send-email", requireAdmin, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "DB nicht verfügbar" });
      const id = parseInt(req.params.id, 10);
      const { rows } = await pool.query("SELECT name, text FROM bug_reports WHERE id = $1", [id]);
      if (!rows[0]) return res.status(404).json({ error: "Bug-Report nicht gefunden" });
      if (!mailer) return res.status(503).json({ error: "Mailer nicht konfiguriert" });
      const to = process.env.MAIL_FROM || process.env.ADMIN_EMAIL || "office@propus.ch";
      await mailer.sendMail({
        from: process.env.MAIL_FROM || "noreply@example.com",
        to,
        subject: `[Bug-Report #${id}] ${(rows[0].name || "").slice(0, 80)}`,
        text: rows[0].text || "",
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "E-Mail fehlgeschlagen" });
    }
  });

  // ─── Backups (Admin) – Stub: leere Liste, Create/Delete/Restore 501 ─────────
  app.get("/api/admin/backups", requireAdmin, async (_req, res) => {
    try {
      res.json({ ok: true, backups: [] });
    } catch (err) {
      res.status(500).json({ error: err.message || "Backups konnten nicht geladen werden" });
    }
  });

  app.post("/api/admin/backups/create", requireAdmin, async (_req, res) => {
    res.status(501).json({ error: "Backup-Erstellung noch nicht implementiert" });
  });

  app.delete("/api/admin/backups/:name", requireAdmin, async (_req, res) => {
    res.status(501).json({ error: "Backup-Löschen noch nicht implementiert" });
  });

  app.post("/api/admin/backups/:name/restore", requireAdmin, async (_req, res) => {
    res.status(501).json({ error: "Backup-Wiederherstellung noch nicht implementiert" });
  });
}

module.exports = { registerAdminMissingRoutes };
