/**
 * Routes für GET/POST/PUT/DELETE /api/admin/customers/:id/contacts
 * Wird in server.js nach den customer-Routen eingebunden.
 */
function registerCustomerContactsRoutes(app, db, requireAdmin, ensureCustomerInRequestCompany) {
  // Globale Kontakt-Suche (z. B. Autocomplete)
  app.get("/api/admin/contacts", requireAdmin, async (req, res) => {
    try {
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const q = String(req.query.q || "").trim();
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const like = q ? `%${q.replace(/%/g, "").replace(/_/g, "")}%` : "%";
      const { rows } = await p.query(
        `SELECT cc.id, cc.customer_id, cc.name, cc.role, cc.phone, cc.email, cc.sort_order,
                cc.phone AS phone_direct, cc.salutation, cc.first_name, cc.last_name, cc.phone_mobile, cc.department, cc.exxas_contact_id,
                c.name AS customer_name, c.company AS customer_company
         FROM customer_contacts cc
         JOIN customers c ON c.id = cc.customer_id
         WHERE ($1::text = '%' OR cc.name ILIKE $1 OR cc.email ILIKE $1 OR c.name ILIKE $1 OR c.company ILIKE $1)
         ORDER BY cc.name ASC NULLS LAST
         LIMIT $2`,
        [like, limit]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Hilfsfunktion: Kontaktzeile per ID (für globale Routen) */
  async function loadContactRow(p, contactId) {
    const { rows } = await p.query(
      `SELECT id, customer_id, name, role, phone, email, sort_order, created_at,
              phone AS phone_direct, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id
       FROM customer_contacts WHERE id = $1 LIMIT 1`,
      [contactId]
    );
    return rows[0] || null;
  }

  function pickField(b, key, existingVal, def = "") {
    if (Object.prototype.hasOwnProperty.call(b, key)) {
      return b[key] != null ? String(b[key]).trim() : def;
    }
    return existingVal != null ? String(existingVal) : def;
  }

  async function assertNoDuplicateContact(p, targetCustomerId, email, displayName, excludeContactId) {
    const ex = Number.isFinite(excludeContactId) ? excludeContactId : null;
    if (email) {
      const { rows: emailCheck } = await p.query(
        `SELECT id, name FROM customer_contacts
         WHERE customer_id = $1 AND email ILIKE $2 AND ($3::int IS NULL OR id <> $3) LIMIT 1`,
        [targetCustomerId, email, ex]
      );
      if (emailCheck.length > 0) {
        const err = new Error("DUPLICATE_EMAIL");
        err.code = "DUPLICATE_EMAIL";
        err.existing = emailCheck[0];
        throw err;
      }
    }
    if (displayName) {
      const { rows: nameCheck } = await p.query(
        `SELECT id, name FROM customer_contacts
         WHERE customer_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND ($3::int IS NULL OR id <> $3) LIMIT 1`,
        [targetCustomerId, displayName, ex]
      );
      if (nameCheck.length > 0) {
        const err = new Error("DUPLICATE_NAME");
        err.code = "DUPLICATE_NAME";
        err.existing = nameCheck[0];
        throw err;
      }
    }
  }

  // Global: Kontakt anlegen (z. B. Duplikat → als Kontakt verknüpfen)
  app.post("/api/admin/contacts", requireAdmin, async (req, res) => {
    try {
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const b = req.body || {};
      const customerId = Number(b.customer_id);
      if (!Number.isFinite(customerId)) {
        return res.status(400).json({ error: "customer_id erforderlich" });
      }
      if (!(await ensureCustomerInRequestCompany(req, String(customerId)))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const v = (key, def) => (b[key] != null ? String(b[key]).trim() : (def != null ? def : ""));
      const newEmail = v("email", "");
      const newName = [v("first_name", ""), v("last_name", "")].filter(Boolean).join(" ").trim() || v("name", "");
      try {
        await assertNoDuplicateContact(p, customerId, newEmail, newName, null);
      } catch (e) {
        if (e.code === "DUPLICATE_EMAIL") {
          return res.status(409).json({
            error: `Ein Kontakt mit dieser E-Mail-Adresse existiert bereits: ${e.existing.name || "(unbekannt)"}`,
            code: "DUPLICATE_EMAIL",
            existingId: e.existing.id,
          });
        }
        if (e.code === "DUPLICATE_NAME") {
          return res.status(409).json({
            error: `Ein Kontakt mit diesem Namen existiert bereits: ${e.existing.name}`,
            code: "DUPLICATE_NAME",
            existingId: e.existing.id,
          });
        }
        throw e;
      }
      const { rows } = await p.query(
        `INSERT INTO customer_contacts (customer_id, name, role, phone, email, sort_order, salutation, first_name, last_name, phone_mobile, department)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, customer_id, name, role, phone, phone AS phone_direct, email, sort_order, created_at, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id`,
        [
          customerId,
          v("name", ""),
          v("role", ""),
          v("phone_direct", v("phone", "")),
          v("email", ""),
          Number(b.sort_order) || 0,
          v("salutation", ""),
          v("first_name", ""),
          v("last_name", ""),
          v("phone_mobile", ""),
          v("department", ""),
        ]
      );
      res.status(201).json({ ok: true, contact: rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global: Kontakt aktualisieren / anderem Kunden zuordnen (customer_id)
  app.put("/api/admin/contacts/:contactId", requireAdmin, async (req, res) => {
    try {
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const contactId = Number(req.params.contactId);
      if (!Number.isFinite(contactId)) return res.status(400).json({ error: "Ungueltige Kontakt-ID" });
      const cur = await loadContactRow(p, contactId);
      if (!cur) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      if (!(await ensureCustomerInRequestCompany(req, String(cur.customer_id)))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const b = req.body || {};
      let targetCustomerId = cur.customer_id;
      if (Object.prototype.hasOwnProperty.call(b, "customer_id")) {
        const raw = b.customer_id;
        if (raw === null || raw === "") {
          return res.status(400).json({
            error: "Kontakt muss einem Kunden zugeordnet bleiben. Zum Entfernen bitte l\u00f6schen.",
          });
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return res.status(400).json({ error: "Ungueltige customer_id" });
        targetCustomerId = n;
      }
      if (!(await ensureCustomerInRequestCompany(req, String(targetCustomerId)))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const name = pickField(b, "name", cur.name);
      const firstName = pickField(b, "first_name", cur.first_name);
      const lastName = pickField(b, "last_name", cur.last_name);
      const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || name;
      const email = pickField(b, "email", cur.email);
      try {
        await assertNoDuplicateContact(p, targetCustomerId, email, displayName, contactId);
      } catch (e) {
        if (e.code === "DUPLICATE_EMAIL") {
          return res.status(409).json({
            error: `Ein Kontakt mit dieser E-Mail-Adresse existiert bereits: ${e.existing.name || "(unbekannt)"}`,
            code: "DUPLICATE_EMAIL",
            existingId: e.existing.id,
          });
        }
        if (e.code === "DUPLICATE_NAME") {
          return res.status(409).json({
            error: `Ein Kontakt mit diesem Namen existiert bereits: ${e.existing.name}`,
            code: "DUPLICATE_NAME",
            existingId: e.existing.id,
          });
        }
        throw e;
      }
      const role = pickField(b, "role", cur.role);
      const phone = pickField(b, "phone", cur.phone);
      const phoneDirect = Object.prototype.hasOwnProperty.call(b, "phone_direct")
        ? pickField(b, "phone_direct", cur.phone_direct || cur.phone)
        : (Object.prototype.hasOwnProperty.call(b, "phone") ? phone : (cur.phone_direct || cur.phone));
      const sortOrder = Object.prototype.hasOwnProperty.call(b, "sort_order")
        ? Number(b.sort_order) || 0
        : Number(cur.sort_order) || 0;
      const salutation = pickField(b, "salutation", cur.salutation);
      const phoneMobile = pickField(b, "phone_mobile", cur.phone_mobile);
      const department = pickField(b, "department", cur.department);
      const { rowCount, rows } = await p.query(
        `UPDATE customer_contacts SET customer_id=$1, name=$2, role=$3, phone=$4, email=$5, sort_order=$6,
            salutation=$7, first_name=$8, last_name=$9, phone_mobile=$10, department=$11
         WHERE id = $12 RETURNING id, customer_id, name, role, phone, phone AS phone_direct, email, sort_order, created_at, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id`,
        [
          targetCustomerId,
          displayName || name,
          role,
          phoneDirect,
          email,
          sortOrder,
          salutation,
          firstName,
          lastName,
          phoneMobile,
          department,
          contactId,
        ]
      );
      if (!rowCount || !rows[0]) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      res.json({ ok: true, contact: rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/contacts/:contactId", requireAdmin, async (req, res) => {
    try {
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const contactId = Number(req.params.contactId);
      if (!Number.isFinite(contactId)) return res.status(400).json({ error: "Ungueltige Kontakt-ID" });
      const cur = await loadContactRow(p, contactId);
      if (!cur) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      if (!(await ensureCustomerInRequestCompany(req, String(cur.customer_id)))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const { rowCount } = await p.query("DELETE FROM customer_contacts WHERE id = $1", [contactId]);
      if (!rowCount) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/customers/:id/contacts", requireAdmin, async (req, res) => {
    try {
      if (!(await ensureCustomerInRequestCompany(req, req.params.id))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
      const { rows } = await p.query(
        `SELECT id, customer_id, name, role, phone, email, sort_order, created_at,
                phone AS phone_direct, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id
         FROM customer_contacts WHERE customer_id = $1 ORDER BY sort_order ASC, id ASC`,
        [customerId]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/customers/:id/contacts", requireAdmin, async (req, res) => {
    try {
      if (!(await ensureCustomerInRequestCompany(req, req.params.id))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
      const b = req.body || {};
      const v = (key, def) => (b[key] != null ? String(b[key]).trim() : (def != null ? def : ""));
      const newEmail = v("email", "");
      const newName = [v("first_name", ""), v("last_name", "")].filter(Boolean).join(" ").trim() || v("name", "");
      if (newEmail) {
        const { rows: emailCheck } = await p.query(
          `SELECT id, name FROM customer_contacts WHERE customer_id = $1 AND email ILIKE $2 LIMIT 1`,
          [customerId, newEmail]
        );
        if (emailCheck.length > 0) {
          return res.status(409).json({
            error: `Ein Kontakt mit dieser E-Mail-Adresse existiert bereits: ${emailCheck[0].name || "(unbekannt)"}`,
            code: "DUPLICATE_EMAIL",
            existingId: emailCheck[0].id,
          });
        }
      }
      if (newName) {
        const { rows: nameCheck } = await p.query(
          `SELECT id, name FROM customer_contacts WHERE customer_id = $1 AND LOWER(TRIM(name)) = LOWER($2) LIMIT 1`,
          [customerId, newName]
        );
        if (nameCheck.length > 0) {
          return res.status(409).json({
            error: `Ein Kontakt mit diesem Namen existiert bereits: ${nameCheck[0].name}`,
            code: "DUPLICATE_NAME",
            existingId: nameCheck[0].id,
          });
        }
      }
      const { rows } = await p.query(
        `INSERT INTO customer_contacts (customer_id, name, role, phone, email, sort_order, salutation, first_name, last_name, phone_mobile, department)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, customer_id, name, role, phone, phone AS phone_direct, email, sort_order, created_at, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id`,
        [
          customerId,
          v("name", ""),
          v("role", ""),
          v("phone_direct", v("phone", "")),
          v("email", ""),
          Number(b.sort_order) || 0,
          v("salutation", ""),
          v("first_name", ""),
          v("last_name", ""),
          v("phone_mobile", ""),
          v("department", ""),
        ]
      );
      res.status(201).json({ ok: true, contact: rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/admin/customers/:id/contacts/:contactId", requireAdmin, async (req, res) => {
    try {
      if (!(await ensureCustomerInRequestCompany(req, req.params.id))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const customerId = Number(req.params.id);
      const contactId = Number(req.params.contactId);
      if (!Number.isFinite(customerId) || !Number.isFinite(contactId)) return res.status(400).json({ error: "Ungueltige ID" });
      const b = req.body || {};
      const v = (key, def) => (b[key] != null ? String(b[key]).trim() : (def != null ? def : ""));
      const { rowCount, rows } = await p.query(
        `UPDATE customer_contacts SET name=$1, role=$2, phone=$3, email=$4, sort_order=$5, salutation=$6, first_name=$7, last_name=$8, phone_mobile=$9, department=$10
         WHERE id = $11 AND customer_id = $12 RETURNING id, customer_id, name, role, phone, phone AS phone_direct, email, sort_order, created_at, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id`,
        [
          v("name", ""),
          v("role", ""),
          v("phone_direct", v("phone", "")),
          v("email", ""),
          Number(b.sort_order) || 0,
          v("salutation", ""),
          v("first_name", ""),
          v("last_name", ""),
          v("phone_mobile", ""),
          v("department", ""),
          contactId,
          customerId,
        ]
      );
      if (!rowCount || !rows[0]) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      res.json({ ok: true, contact: rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/customers/:id/contacts/:contactId", requireAdmin, async (req, res) => {
    try {
      if (!(await ensureCustomerInRequestCompany(req, req.params.id))) {
        return res.status(404).json({ error: "Nicht gefunden" });
      }
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const customerId = Number(req.params.id);
      const contactId = Number(req.params.contactId);
      if (!Number.isFinite(customerId) || !Number.isFinite(contactId)) return res.status(400).json({ error: "Ungueltige ID" });
      const { rowCount } = await p.query("DELETE FROM customer_contacts WHERE id = $1 AND customer_id = $2", [contactId, customerId]);
      if (!rowCount) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerCustomerContactsRoutes };
