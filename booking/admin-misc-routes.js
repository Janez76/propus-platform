/**
 * Admin-Routen: Reviews, E-Mail-Templates, Bug-Reports, Backups
 * Werden in server.js mit requireAdmin registriert.
 */
const { getSetting } = require("./settings-resolver");
const templateRenderer = require("./template-renderer");

function registerAdminMiscRoutes(app, db, requireAdmin) {
  const pool = db.getPool ? db.getPool() : null;

  // ─── Reviews: Google-Link (öffentlich für Reviews-Seite) ────────────────────
  app.get("/api/reviews/google-link", async (_req, res) => {
    try {
      const setting = await getSetting("google.reviewLink");
      const link = (setting && setting.value != null) ? String(setting.value) : "https://g.page/r/CSQ5RnWmJOumEAE/review";
      res.json({ ok: true, link });
    } catch (err) {
      res.json({ ok: true, link: "https://g.page/r/CSQ5RnWmJOumEAE/review" });
    }
  });

  // ─── Reviews: KPI + Liste (Admin) ───────────────────────────────────────────
  app.get("/api/admin/reviews/kpi", requireAdmin, async (_req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const { rows: kpiRows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE o.done_at IS NOT NULL AND o.review_request_sent_at IS NULL AND (o.review_request_count IS NULL OR o.review_request_count = 0)) AS faellig,
          COUNT(*) FILTER (WHERE o.review_request_sent_at IS NOT NULL) AS gesendet,
          COUNT(*) FILTER (WHERE r.id IS NOT NULL) AS beantwortet,
          COALESCE(AVG(r.rating) FILTER (WHERE r.rating IS NOT NULL), NULL) AS avg_rating
        FROM orders o
        LEFT JOIN order_reviews r ON r.order_no = o.order_no
        WHERE o.status = 'done' AND o.done_at IS NOT NULL
      `);
      const r = kpiRows[0] || {};
      const gesendet = Math.max(0, parseInt(r.gesendet || "0", 10));
      const beantwortet = Math.max(0, parseInt(r.beantwortet || "0", 10));
      const faellig = Math.max(0, parseInt(r.faellig || "0", 10));
      res.json({
        ok: true,
        kpi: {
          faellig,
          gesendet,
          beantwortet,
          responseRate: gesendet > 0 ? Math.round((beantwortet / gesendet) * 100) : 0,
          avgRating: r.avg_rating != null ? parseFloat(Number(r.avg_rating).toFixed(2)) : null,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "KPI konnte nicht geladen werden" });
    }
  });

  app.get("/api/admin/reviews", requireAdmin, async (_req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const { rows } = await pool.query(`
        SELECT
          o.order_no,
          o.billing->>'name' AS customer_name,
          o.billing->>'email' AS customer_email,
          o.done_at,
          o.review_request_sent_at AS review_request_sent_at,
          COALESCE(o.review_request_count, 0)::int AS review_request_count,
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
      const reviews = (rows || []).map((row) => {
        let review_status = "not_due";
        if (row.review_id != null && (row.rating != null || row.submitted_at != null)) review_status = "responded";
        else if (row.review_request_sent_at != null) review_status = "sent";
        else if (row.done_at != null) review_status = "pending";
        return {
          order_no: row.order_no,
          customer_name: row.customer_name || null,
          customer_email: row.customer_email || null,
          done_at: row.done_at ? new Date(row.done_at).toISOString() : null,
          review_request_sent_at: row.review_request_sent_at ? new Date(row.review_request_sent_at).toISOString() : null,
          review_request_count: row.review_request_count || 0,
          review_id: row.review_id,
          rating: row.rating != null ? row.rating : null,
          comment: row.comment || null,
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
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const all = await templateRenderer.listTemplates(pool);
      const byKey = {};
      for (const row of all || []) {
        const key = String(row.key || "");
        if (!key) continue;
        if (!byKey[key] || (String(row.template_language || "de-CH").toLowerCase() === "de-ch")) byKey[key] = row;
      }
      const templates = Object.values(byKey).map((row) => ({
        id: row.id,
        key: row.key,
        label: row.label || row.key,
        subject: row.subject || "",
        body_html: row.body_html || "",
        active: row.active !== false,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : "",
      }));
      res.json({ ok: true, templates, placeholders: templateRenderer.AVAILABLE_PLACEHOLDERS || [] });
    } catch (err) {
      res.status(500).json({ error: err.message || "E-Mail-Templates konnten nicht geladen werden" });
    }
  });

  app.get("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      const history = await templateRenderer.getTemplateHistory(pool, key);
      res.json({
        ok: true,
        history: (history || []).map((h) => ({
          id: h.id,
          subject: h.subject,
          body_html: h.body_html,
          changed_by: h.changed_by,
          changed_at: h.changed_at ? new Date(h.changed_at).toISOString() : "",
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Template-Historie konnte nicht geladen werden" });
    }
  });

  app.put("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
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
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      const { rows } = await pool.query("SELECT active FROM email_templates WHERE key = $1 LIMIT 1", [key]);
      const current = rows[0] ? !!rows[0].active : false;
      const next = !current;
      await pool.query("UPDATE email_templates SET active = $1, updated_at = NOW() WHERE key = $2", [next, key]);
      res.json({ ok: true, key, active: next });
    } catch (err) {
      res.status(400).json({ error: err.message || "Toggle fehlgeschlagen" });
    }
  });

  app.post("/api/admin/email-templates/:key/preview", requireAdmin, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const key = String(req.params.key || "").trim();
      const orderNo = req.body?.orderNo != null ? Number(req.body.orderNo) : null;
      const tmpl = await templateRenderer.loadTemplate(pool, key, "de-CH");
      if (!tmpl) return res.status(404).json({ error: "Template nicht gefunden" });
      let vars = {};
      if (orderNo) {
        const order = await db.getOrderByNo(orderNo);
        if (order) vars = templateRenderer.buildTemplateVars(order, {});
      }
      const subject = templateRenderer.renderTemplate(tmpl.subject, vars);
      const body_html = templateRenderer.renderTemplate(tmpl.body_html, vars);
      res.json({ ok: true, subject, body_html });
    } catch (err) {
      res.status(400).json({ error: err.message || "Preview fehlgeschlagen" });
    }
  });

  app.post("/api/admin/email-templates/:key/test-send", requireAdmin, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const key = String(req.params.key || "").trim();
      const to = String((req.body && req.body.to) || "").trim();
      if (!to) return res.status(400).json({ error: "to (E-Mail) fehlt" });
      const tmpl = await templateRenderer.loadTemplate(pool, key, "de-CH");
      if (!tmpl) return res.status(404).json({ error: "Template nicht gefunden" });
      const vars = {};
      const subject = templateRenderer.renderTemplate(tmpl.subject, vars);
      const body_html = templateRenderer.renderTemplate(tmpl.body_html, vars);
      const mailer = req.app && req.app.locals && req.app.locals.mailer;
      if (mailer) {
        await mailer.sendMail({ from: process.env.MAIL_FROM || "noreply@propus.ch", to, subject, html: body_html });
      }
      res.json({ ok: true, sent: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Test-Versand fehlgeschlagen" });
    }
  });

  app.post("/api/admin/email-templates/:key/restore/:historyId", requireAdmin, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
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
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const key = String(req.params.key || "").trim();
      if (!key) return res.status(400).json({ error: "key fehlt" });
      await pool.query("UPDATE email_templates SET active = FALSE WHERE key = $1", [key]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Deaktivieren fehlgeschlagen" });
    }
  });

  // ─── Bug-Reports (Admin) ────────────────────────────────────────────────────
  app.get("/api/admin/bug-reports", requireAdmin, async (_req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const { rows } = await pool.query(
        "SELECT id, name, text, page, status, created_at FROM bug_reports ORDER BY created_at DESC LIMIT 200"
      );
      const list = (rows || []).map((r) => ({
        id: r.id,
        title: r.name || "",
        status: r.status || "new",
        description: r.text || "",
        created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message || "Bug-Reports konnten nicht geladen werden" });
    }
  });

  app.patch("/api/admin/bug-reports/:id/status", requireAdmin, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const id = parseInt(req.params.id, 10);
      const status = String((req.body && req.body.status) || "new").trim();
      await pool.query("UPDATE bug_reports SET status = $1 WHERE id = $2", [status, id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Status-Update fehlgeschlagen" });
    }
  });

  app.delete("/api/admin/bug-reports/:id", requireAdmin, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const id = parseInt(req.params.id, 10);
      await pool.query("DELETE FROM bug_reports WHERE id = $1", [id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Löschen fehlgeschlagen" });
    }
  });

  app.post("/api/admin/bug-reports/:id/send-email", requireAdmin, async (req, res) => {
    try {
      if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
      const id = parseInt(req.params.id, 10);
      const { rows } = await pool.query("SELECT name, text, page FROM bug_reports WHERE id = $1", [id]);
      if (!rows[0]) return res.status(404).json({ error: "Bug-Report nicht gefunden" });
      const mailer = req.app && req.app.locals && req.app.locals.mailer;
      const to = process.env.MAIL_FROM || process.env.OFFICE_EMAIL || "office@propus.ch";
      if (mailer) {
        await mailer.sendMail({
          from: process.env.MAIL_FROM || "noreply@propus.ch",
          to,
          subject: `[Bug #${id}] ${(rows[0].name || "").slice(0, 80)}`,
          text: (rows[0].text || "") + (rows[0].page ? "\n\nSeite: " + rows[0].page : ""),
        });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "E-Mail-Versand fehlgeschlagen" });
    }
  });

  // ─── Backups (Admin) – Stub: leere Liste, Create/Restore/Delete no-op oder 501 ─
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

module.exports = { registerAdminMiscRoutes };
