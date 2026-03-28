/**
 * Admin-API fuer RBAC: Gruppen, Kunden-Zugriff, Permission-Katalog.
 */
function registerAccessRoutes(app, deps) {
  const { requireAdmin, ensureCustomerInRequestCompany, rbac } = deps;

  app.get("/api/admin/access/permissions", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await deps.db.query(
        `SELECT permission_key, description, module_tag FROM permission_definitions ORDER BY permission_key ASC`
      );
      res.json({ ok: true, permissions: rows });
    } catch (err) {
      if (String(err?.code) === "42P01") {
        return res.json({ ok: true, permissions: rbac.ALL_PERMISSION_KEYS.map((k) => ({ permission_key: k, description: k, module_tag: "" })) });
      }
      res.status(500).json({ error: err.message || "Fehler" });
    }
  });

  app.get("/api/admin/access/groups", requireAdmin, async (req, res) => {
    try {
      const scopeType = String(req.query.scope_type || "").trim();
      const companyId = req.query.scope_company_id != null ? Number(req.query.scope_company_id) : null;
      const customerId = req.query.scope_customer_id != null ? Number(req.query.scope_customer_id) : null;
      const params = [];
      let where = "WHERE 1=1";
      if (scopeType && ["system", "company", "customer"].includes(scopeType)) {
        params.push(scopeType);
        where += ` AND pg.scope_type = $${params.length}`;
      }
      if (Number.isFinite(companyId)) {
        params.push(companyId);
        where += ` AND pg.scope_company_id = $${params.length}`;
      }
      if (Number.isFinite(customerId)) {
        params.push(customerId);
        where += ` AND pg.scope_customer_id = $${params.length}`;
      }
      const { rows } = await deps.db.query(
        `SELECT pg.id, pg.name, pg.scope_type, pg.scope_company_id, pg.scope_customer_id, pg.created_at,
                COALESCE(
                  (SELECT json_agg(pgp.permission_key ORDER BY pgp.permission_key)
                   FROM permission_group_permissions pgp WHERE pgp.group_id = pg.id),
                  '[]'::json
                ) AS permission_keys
         FROM permission_groups pg
         ${where}
         ORDER BY pg.scope_type ASC, pg.name ASC`,
        params
      );
      res.json({ ok: true, groups: rows });
    } catch (err) {
      res.status(500).json({ error: err.message || "Fehler" });
    }
  });

  const requireRolesManage = rbac.requirePermission("roles.manage");

  app.post("/api/admin/access/groups", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const scope_type = String(req.body?.scope_type || "system").trim();
      const scope_company_id = req.body?.scope_company_id != null ? Number(req.body.scope_company_id) : null;
      const scope_customer_id = req.body?.scope_customer_id != null ? Number(req.body.scope_customer_id) : null;
      if (!name) return res.status(400).json({ error: "name erforderlich" });
      if (!["system", "company", "customer"].includes(scope_type)) return res.status(400).json({ error: "Ungueltiger scope_type" });
      if (scope_type === "company" && !Number.isFinite(scope_company_id)) {
        return res.status(400).json({ error: "scope_company_id erforderlich" });
      }
      if (scope_type === "customer" && !Number.isFinite(scope_customer_id)) {
        return res.status(400).json({ error: "scope_customer_id erforderlich" });
      }
      const { rows } = await deps.db.query(
        `INSERT INTO permission_groups (name, scope_type, scope_company_id, scope_customer_id)
         VALUES ($1,$2,$3,$4)
         RETURNING id, name, scope_type, scope_company_id, scope_customer_id, created_at`,
        [
          name,
          scope_type,
          scope_type === "company" ? scope_company_id : null,
          scope_type === "customer" ? scope_customer_id : null,
        ]
      );
      const g = rows[0];
      const keys = Array.isArray(req.body?.permission_keys) ? req.body.permission_keys.map((k) => String(k)) : [];
      for (const pk of keys) {
        await deps.db.query(`INSERT INTO permission_group_permissions (group_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
          g.id,
          pk,
        ]);
      }
      res.status(201).json({ ok: true, group: { ...g, permission_keys: keys } });
    } catch (err) {
      res.status(400).json({ error: err.message || "Fehler" });
    }
  });

  app.patch("/api/admin/access/groups/:id", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const gid = Number(req.params.id);
      if (!Number.isFinite(gid)) return res.status(400).json({ error: "Ungueltige ID" });
      const name = req.body?.name != null ? String(req.body.name).trim() : null;
      if (name !== null && name !== "") {
        await deps.db.query(`UPDATE permission_groups SET name = $1, updated_at = NOW() WHERE id = $2`, [name, gid]);
      }
      if (Array.isArray(req.body?.permission_keys)) {
        await deps.db.query(`DELETE FROM permission_group_permissions WHERE group_id = $1`, [gid]);
        for (const pk of req.body.permission_keys) {
          await deps.db.query(`INSERT INTO permission_group_permissions (group_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
            gid,
            String(pk),
          ]);
        }
      }
      const { rows } = await deps.db.query(`SELECT id, name, scope_type, scope_company_id, scope_customer_id FROM permission_groups WHERE id = $1`, [gid]);
      if (!rows[0]) return res.status(404).json({ error: "Gruppe nicht gefunden" });
      const { rows: pkRows } = await deps.db.query(`SELECT permission_key FROM permission_group_permissions WHERE group_id = $1 ORDER BY permission_key`, [gid]);
      res.json({ ok: true, group: { ...rows[0], permission_keys: pkRows.map((r) => r.permission_key) } });
    } catch (err) {
      res.status(400).json({ error: err.message || "Fehler" });
    }
  });

  app.delete("/api/admin/access/groups/:id", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const gid = Number(req.params.id);
      if (!Number.isFinite(gid)) return res.status(400).json({ error: "Ungueltige ID" });
      await deps.db.query(`DELETE FROM permission_groups WHERE id = $1`, [gid]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Fehler" });
    }
  });

  app.post("/api/admin/access/groups/:id/members", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const gid = Number(req.params.id);
      const subjectId = Number(req.body?.subject_id);
      if (!Number.isFinite(gid) || !Number.isFinite(subjectId)) return res.status(400).json({ error: "group_id und subject_id erforderlich" });
      const { rows: gRows } = await deps.db.query(`SELECT scope_type, scope_company_id, scope_customer_id FROM permission_groups WHERE id = $1`, [gid]);
      const g = gRows[0];
      if (!g) return res.status(404).json({ error: "Gruppe nicht gefunden" });
      const { rows: sRows } = await deps.db.query(
        `SELECT id, subject_type, customer_id, customer_contact_id FROM access_subjects WHERE id = $1`,
        [subjectId]
      );
      const sub = sRows[0];
      if (!sub) return res.status(404).json({ error: "Subject nicht gefunden" });
      if (g.scope_type === "customer") {
        const cid = Number(g.scope_customer_id);
        if (sub.subject_type === "customer_contact") {
          const { rows: cc } = await deps.db.query(`SELECT customer_id FROM customer_contacts WHERE id = $1`, [sub.customer_contact_id]);
          if (Number(cc[0]?.customer_id) !== cid) return res.status(400).json({ error: "Kontakt gehoert nicht zu diesem Kunden" });
        } else if (sub.subject_type === "customer") {
          if (Number(sub.customer_id) !== cid) return res.status(400).json({ error: "Kunde passt nicht zur Gruppe" });
        } else {
          return res.status(400).json({ error: "Nur Kunden- oder Kontakt-Subjects erlaubt" });
        }
      }
      await deps.db.query(`INSERT INTO permission_group_members (group_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [gid, subjectId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Fehler" });
    }
  });

  app.delete("/api/admin/access/groups/:id/members/:subjectId", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const gid = Number(req.params.id);
      const sid = Number(req.params.subjectId);
      if (!Number.isFinite(gid) || !Number.isFinite(sid)) return res.status(400).json({ error: "Ungueltige IDs" });
      await deps.db.query(`DELETE FROM permission_group_members WHERE group_id = $1 AND subject_id = $2`, [gid, sid]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Fehler" });
    }
  });

  app.get("/api/admin/customers/:id/access", requireAdmin, async (req, res) => {
    try {
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
      if (!(await ensureCustomerInRequestCompany(req, String(customerId)))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const { rows: groups } = await deps.db.query(
        `SELECT pg.id, pg.name, pg.scope_type, pg.scope_customer_id,
                COALESCE(
                  (SELECT json_agg(pgp.permission_key ORDER BY pgp.permission_key)
                   FROM permission_group_permissions pgp WHERE pgp.group_id = pg.id),
                  '[]'::json
                ) AS permission_keys
         FROM permission_groups pg
         WHERE pg.scope_type = 'customer' AND pg.scope_customer_id = $1
         ORDER BY pg.name ASC`,
        [customerId]
      );
      const { rows: contacts } = await deps.db.query(
        `SELECT cc.id, cc.name, cc.email, cc.role,
                (SELECT s.id FROM access_subjects s WHERE s.customer_contact_id = cc.id LIMIT 1) AS subject_id
         FROM customer_contacts cc
         WHERE cc.customer_id = $1
         ORDER BY cc.sort_order ASC, cc.id ASC`,
        [customerId]
      );
      const custSubject = await rbac.ensureCustomerSubject(customerId);
      res.json({
        ok: true,
        customer_id: customerId,
        customer_subject_id: custSubject,
        groups,
        contacts: contacts.map((c) => ({
          ...c,
          subject_id: c.subject_id != null ? Number(c.subject_id) : null,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Fehler" });
    }
  });

  app.post("/api/admin/customers/:id/access/contacts/:contactId/ensure-subject", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const customerId = Number(req.params.id);
      const contactId = Number(req.params.contactId);
      if (!Number.isFinite(customerId) || !Number.isFinite(contactId)) return res.status(400).json({ error: "Ungueltige ID" });
      if (!(await ensureCustomerInRequestCompany(req, String(customerId)))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const { rows } = await deps.db.query(`SELECT id FROM customer_contacts WHERE id = $1 AND customer_id = $2`, [contactId, customerId]);
      if (!rows[0]) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      const sid = await rbac.ensureCustomerContactSubject(contactId);
      res.json({ ok: true, subject_id: sid });
    } catch (err) {
      res.status(400).json({ error: err.message || "Fehler" });
    }
  });

  app.post("/api/admin/customers/:id/access/groups", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
      if (!(await ensureCustomerInRequestCompany(req, String(customerId)))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "name erforderlich" });
      const { rows } = await deps.db.query(
        `INSERT INTO permission_groups (name, scope_type, scope_company_id, scope_customer_id)
         VALUES ($1, 'customer', NULL, $2)
         RETURNING id, name, scope_type, scope_company_id, scope_customer_id, created_at`,
        [name, customerId]
      );
      const g = rows[0];
      const keys = Array.isArray(req.body?.permission_keys) ? req.body.permission_keys.map((k) => String(k)) : [];
      for (const pk of keys) {
        await deps.db.query(`INSERT INTO permission_group_permissions (group_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
          g.id,
          pk,
        ]);
      }
      res.status(201).json({ ok: true, group: { ...g, permission_keys: keys } });
    } catch (err) {
      res.status(400).json({ error: err.message || "Fehler" });
    }
  });
}

module.exports = { registerAccessRoutes };
