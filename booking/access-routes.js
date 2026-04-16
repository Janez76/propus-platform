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

  // ─── Role-Presets (Berechtigungen pro Systemrolle) ────────────────────────

  const FIXED_ROLE_KEYS = new Set(["super_admin", "internal_admin"]);

  /** Label in snake_case role_key umwandeln, z.B. "Vertriebs Admin" -> "custom_vertriebs_admin" */
  function labelToRoleKey(label) {
    return "custom_" + label
      .toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" }[c] || c))
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  }

  /** GET /api/admin/access/role-presets – alle Rollen-Permissions + Metadaten aus DB */
  app.get("/api/admin/access/role-presets", requireAdmin, requireRolesManage, async (_req, res) => {
    try {
      await rbac.seedRbacIfNeeded();
      const { rows: permRows } = await deps.db.query(
        `SELECT role_key, array_agg(permission_key ORDER BY permission_key) AS permissions
         FROM system_role_permissions
         GROUP BY role_key`
      );
      const { rows: roleRows } = await deps.db.query(
        `SELECT role_key, label, description, is_custom FROM system_roles`
      );
      const presets = {};
      for (const row of permRows) {
        presets[row.role_key] = row.permissions ?? [];
      }
      // Fallback aus ROLE_PRESETS fuer Rollen ohne DB-Eintraege
      for (const [rk, perms] of Object.entries(rbac.ROLE_PRESETS)) {
        if (!presets[rk]) presets[rk] = Array.isArray(perms) ? [...perms] : [];
      }
      const roles = roleRows.map((r) => ({
        role_key: r.role_key,
        label: r.label,
        description: r.description,
        is_custom: r.is_custom ?? false,
      }));
      res.json({ ok: true, presets, roles });
    } catch (err) {
      if (String(err?.code) === "42P01") {
        const presets = {};
        for (const [rk, perms] of Object.entries(rbac.ROLE_PRESETS)) {
          presets[rk] = Array.isArray(perms) ? [...perms] : [];
        }
        return res.json({ ok: true, presets, roles: [], fallback: true });
      }
      res.status(500).json({ error: err?.message || "Fehler" });
    }
  });

  /** POST /api/admin/access/role-presets – neue custom Rolle erstellen */
  app.post("/api/admin/access/role-presets", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const label = String(req.body?.label || "").trim();
      const description = String(req.body?.description || "").trim();
      if (!label) return res.status(400).json({ error: "label ist erforderlich." });

      await rbac.seedRbacIfNeeded();

      let roleKey = labelToRoleKey(label);
      // Eindeutigkeit sicherstellen
      const { rows: existing } = await deps.db.query(
        `SELECT role_key FROM system_roles WHERE role_key LIKE $1`, [`${roleKey}%`]
      );
      if (existing.length > 0) {
        const existingKeys = new Set(existing.map((r) => r.role_key));
        let candidate = roleKey;
        let suffix = 2;
        while (existingKeys.has(candidate)) {
          candidate = `${roleKey}_${suffix++}`;
        }
        roleKey = candidate;
      }

      await deps.db.query(
        `INSERT INTO system_roles (role_key, label, description, is_custom) VALUES ($1, $2, $3, TRUE)`,
        [roleKey, label, description]
      );
      res.json({ ok: true, role: { role_key: roleKey, label, description, is_custom: true } });
    } catch (err) {
      res.status(500).json({ error: err?.message || "Fehler" });
    }
  });

  /** DELETE /api/admin/access/role-presets/:roleKey – Rolle löschen (alle ausser super_admin/internal_admin) */
  app.delete("/api/admin/access/role-presets/:roleKey", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const roleKey = String(req.params.roleKey || "").trim();
      if (FIXED_ROLE_KEYS.has(roleKey)) {
        return res.status(400).json({ error: "Super-Admin und Admin können nicht gelöscht werden." });
      }
      const { rows } = await deps.db.query(
        `SELECT role_key FROM system_roles WHERE role_key = $1`, [roleKey]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Rolle nicht gefunden." });
      // CASCADE löscht system_role_permissions + access_subject_system_roles automatisch
      await deps.db.query(`DELETE FROM system_roles WHERE role_key = $1`, [roleKey]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err?.message || "Fehler" });
    }
  });

  /** PATCH /api/admin/access/role-presets/:roleKey – Permissions fuer eine editierbare Rolle speichern */
  app.patch("/api/admin/access/role-presets/:roleKey", requireAdmin, requireRolesManage, async (req, res) => {
    try {
      const roleKey = String(req.params.roleKey || "").trim();
      if (FIXED_ROLE_KEYS.has(roleKey)) {
        return res.status(400).json({ error: `Rolle '${roleKey}' ist nicht editierbar (super_admin und internal_admin sind fixe System-Rollen).` });
      }
      const permissions = req.body?.permissions;
      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: "permissions muss ein Array von Permission-Keys sein." });
      }
      const validPerms = permissions.map((p) => String(p).trim()).filter((p) => rbac.ALL_PERMISSION_KEYS.includes(p));

      // Sicherstellen dass DB-Tabellen existieren
      await rbac.seedRbacIfNeeded();

      await deps.db.query(`DELETE FROM system_role_permissions WHERE role_key = $1`, [roleKey]);
      for (const pk of validPerms) {
        await deps.db.query(
          `INSERT INTO system_role_permissions (role_key, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roleKey, pk]
        );
      }
      res.json({ ok: true, roleKey, permissions: validPerms });
    } catch (err) {
      res.status(500).json({ error: err?.message || "Fehler" });
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
