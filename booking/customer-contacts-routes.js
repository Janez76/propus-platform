/**
 * Routes für GET/POST/PUT/DELETE /api/admin/customers/:id/contacts
 * Wird in server.js nach den customer-Routen eingebunden.
 */
const logtoOrgSync = require("./logto-org-sync");
const rbac = require("./access-rbac");

function registerCustomerContactsRoutes(app, db, requireAdmin, ensureCustomerInRequestCompany) {
  async function ensureCompanyForContactSync(p, customerId) {
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return null;
    const { rows } = await p.query(`SELECT id, company FROM customers WHERE id = $1 LIMIT 1`, [cid]);
    const cust = rows[0];
    if (!cust) return null;
    const companyName = String(cust.company || "").trim();
    if (!companyName) return null;
    let company = await db.ensureCompanyByName(companyName, { billingCustomerId: cid });
    if (!company) return null;
    if (company.billing_customer_id == null) {
      try {
        await db.query(
          `UPDATE companies SET billing_customer_id = $2, updated_at = NOW() WHERE id = $1 AND billing_customer_id IS NULL`,
          [Number(company.id), cid]
        );
        company = await db.getCompanyById(Number(company.id));
      } catch (_e) {}
    }
    return company;
  }

  async function disableCustomerContactCompanyMember(p, customerId, contactRow) {
    const email = String(contactRow?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return;
    const { rows } = await p.query(`SELECT id, company FROM customers WHERE id = $1 LIMIT 1`, [cid]);
    const cust = rows[0];
    if (!cust) return;
    const companyName = String(cust.company || "").trim();
    if (!companyName) return;
    const company = await db.findCompanyByName(companyName);
    if (!company?.id) return;
    const member = await db.findCompanyMemberByCompanyAndEmail(Number(company.id), email);
    if (!member?.id) return;
    try {
      await logtoOrgSync.removeCompanyMemberFromLogtoOrg(Number(company.id), member);
    } catch (_e) {}
    try {
      await db.updateCompanyMemberStatus(Number(member.id), "disabled");
    } catch (_e) {}
  }

  async function syncCustomerContactToCompanyMember(p, customerId, contactRow) {
    const email = String(contactRow?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return null;
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return null;
    const company = await ensureCompanyForContactSync(p, cid);
    if (!company?.id) return null;
    // portal_role hat Vorrang; Fallback auf heuristische Ableitung aus dem Freitext-role-Feld
    const VALID_COMPANY_ROLES = new Set(["company_owner", "company_admin", "company_employee"]);
    const portalRole = String(contactRow?.portal_role || "").trim();
    const role = VALID_COMPANY_ROLES.has(portalRole)
      ? portalRole
      : db.mapCustomerContactRoleToCompanyMemberRole(contactRow?.role);
    let member;
    try {
      member = await db.upsertCompanyMember({
        companyId: Number(company.id),
        customerId: cid,
        email,
        role,
        status: "active",
      });
    } catch (_e) {
      return null;
    }
    try {
      await logtoOrgSync.ensureOrganizationForCompany(company);
      if (member) await logtoOrgSync.addCompanyMemberToLogtoOrg(Number(company.id), member);
    } catch (_e) {}
    try {
      if (member?.id) await rbac.syncCompanyMemberRolesFromDb(Number(member.id));
    } catch (_e) {}
    return member;
  }
  // Globale Kontakt-Suche (z. B. Autocomplete)
  app.get("/api/admin/contacts", requireAdmin, async (req, res) => {
    try {
      const p = db.getPool ? db.getPool() : null;
      if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
      const q = String(req.query.q || "").trim();
      // limit=0 oder limit=all → keine Begrenzung (für Admin-Übersichten)
      const rawLimit = req.query.limit;
      const limit = rawLimit === "0" || rawLimit === "all"
        ? null
        : Math.min(5000, Math.max(1, Number(rawLimit) || 5000));
      const like = q ? `%${q.replace(/%/g, "").replace(/_/g, "")}%` : "%";
      const { rows } = await p.query(
        `SELECT cc.id, cc.customer_id, cc.name, cc.role, cc.portal_role, cc.phone, cc.email, cc.sort_order,
                cc.phone_direct, cc.salutation, cc.first_name, cc.last_name, cc.phone_mobile, cc.department, cc.exxas_contact_id,
                cc.created_at,
                c.name AS customer_name, c.company AS customer_company
         FROM core.customer_contacts cc
         JOIN core.customers c ON c.id = cc.customer_id
         WHERE ($1::text = '%' OR cc.name ILIKE $1 OR cc.first_name ILIKE $1 OR cc.last_name ILIKE $1
                OR cc.email ILIKE $1 OR c.name ILIKE $1 OR c.company ILIKE $1)
         ORDER BY COALESCE(NULLIF(TRIM(cc.last_name), ''), cc.name) ASC NULLS LAST, cc.first_name ASC NULLS LAST
         ${limit !== null ? `LIMIT ${limit}` : ""}`,
        [like]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Hilfsfunktion: Kontaktzeile per ID (für globale Routen) */
  async function loadContactRow(p, contactId) {
    const { rows } = await p.query(
      `SELECT id, customer_id, name, role, portal_role, phone, email, sort_order, created_at,
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
      const VALID_PORTAL_ROLES = ["company_owner", "company_admin", "company_employee", "customer_admin", "customer_user"];
      const portalRoleIn = VALID_PORTAL_ROLES.includes(v("portal_role", "")) ? v("portal_role", "") : "company_employee";
      const { rows } = await p.query(
        `INSERT INTO customer_contacts (customer_id, name, role, phone, email, sort_order, salutation, first_name, last_name, phone_mobile, department, portal_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, customer_id, name, role, portal_role, phone, phone AS phone_direct, email, sort_order, created_at, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id`,
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
          portalRoleIn,
        ]
      );
      const created = rows[0];
      try {
        await syncCustomerContactToCompanyMember(p, customerId, created);
      } catch (_e) {}
      res.status(201).json({ ok: true, contact: created });
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
      const prevEmail = String(cur.email || "").trim().toLowerCase();
      const nextEmail = String(email || "").trim().toLowerCase();
      const prevCust = Number(cur.customer_id);
      const nextCust = Number(targetCustomerId);
      if (prevEmail && prevEmail.includes("@") && (prevCust !== nextCust || prevEmail !== nextEmail || !nextEmail)) {
        try {
          await disableCustomerContactCompanyMember(p, prevCust, { email: cur.email });
        } catch (_e) {}
      }
      const VALID_PORTAL_ROLES_UPD = ["company_owner", "company_admin", "company_employee", "customer_admin", "customer_user"];
      const portalRoleUpd = Object.prototype.hasOwnProperty.call(b, "portal_role") && VALID_PORTAL_ROLES_UPD.includes(b.portal_role)
        ? b.portal_role
        : (cur.portal_role || "company_employee");
      const { rowCount, rows } = await p.query(
        `UPDATE customer_contacts SET customer_id=$1, name=$2, role=$3, phone=$4, email=$5, sort_order=$6,
            salutation=$7, first_name=$8, last_name=$9, phone_mobile=$10, department=$11, portal_role=$12
         WHERE id = $13 RETURNING id, customer_id, name, role, portal_role, phone, phone AS phone_direct, email, sort_order, created_at, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id`,
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
          portalRoleUpd,
          contactId,
        ]
      );
      if (!rowCount || !rows[0]) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      const updated = rows[0];
      try {
        await syncCustomerContactToCompanyMember(p, Number(updated.customer_id), updated);
      } catch (_e) {}
      res.json({ ok: true, contact: updated });
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
      try {
        await disableCustomerContactCompanyMember(p, Number(cur.customer_id), cur);
      } catch (_e) {}
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
        `SELECT id, customer_id, name, role, portal_role, phone, email, sort_order, created_at,
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
      const VALID_PR2 = ["company_owner", "company_admin", "company_employee", "customer_admin", "customer_user"];
      const portalRole2 = VALID_PR2.includes(v("portal_role", "")) ? v("portal_role", "") : "company_employee";
      const { rows } = await p.query(
        `INSERT INTO customer_contacts (customer_id, name, role, phone, email, sort_order, salutation, first_name, last_name, phone_mobile, department, portal_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, customer_id, name, role, portal_role, phone, phone AS phone_direct, email, sort_order, created_at, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id`,
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
          portalRole2,
        ]
      );
      const created = rows[0];
      try {
        await syncCustomerContactToCompanyMember(p, customerId, created);
      } catch (_e) {}
      res.status(201).json({ ok: true, contact: created });
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
      const cur = await loadContactRow(p, contactId);
      if (!cur || Number(cur.customer_id) !== customerId) {
        return res.status(404).json({ error: "Kontakt nicht gefunden" });
      }
      const b = req.body || {};
      const name = pickField(b, "name", cur.name);
      const firstName = pickField(b, "first_name", cur.first_name);
      const lastName = pickField(b, "last_name", cur.last_name);
      const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || name;
      const email = pickField(b, "email", cur.email);
      try {
        await assertNoDuplicateContact(p, customerId, email, displayName, contactId);
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
        : Object.prototype.hasOwnProperty.call(b, "phone")
          ? phone
          : cur.phone_direct || cur.phone;
      const sortOrder = Object.prototype.hasOwnProperty.call(b, "sort_order")
        ? Number(b.sort_order) || 0
        : Number(cur.sort_order) || 0;
      const salutation = pickField(b, "salutation", cur.salutation);
      const phoneMobile = pickField(b, "phone_mobile", cur.phone_mobile);
      const department = pickField(b, "department", cur.department);
      const prevEmail = String(cur.email || "").trim().toLowerCase();
      const nextEmail = String(email || "").trim().toLowerCase();
      if (prevEmail && prevEmail.includes("@") && (prevEmail !== nextEmail || !nextEmail)) {
        try {
          await disableCustomerContactCompanyMember(p, customerId, { email: cur.email });
        } catch (_e) {}
      }
      const VALID_PR3 = ["company_owner", "company_admin", "company_employee", "customer_admin", "customer_user"];
      const portalRole3 = Object.prototype.hasOwnProperty.call(b, "portal_role") && VALID_PR3.includes(b.portal_role)
        ? b.portal_role
        : (cur.portal_role || "company_employee");
      const { rowCount, rows } = await p.query(
        `UPDATE customer_contacts SET name=$1, role=$2, phone=$3, email=$4, sort_order=$5, salutation=$6, first_name=$7, last_name=$8, phone_mobile=$9, department=$10, portal_role=$11
         WHERE id = $12 AND customer_id = $13 RETURNING id, customer_id, name, role, portal_role, phone, phone AS phone_direct, email, sort_order, created_at, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id`,
        [
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
          portalRole3,
          contactId,
          customerId,
        ]
      );
      if (!rowCount || !rows[0]) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      const updated = rows[0];
      try {
        await syncCustomerContactToCompanyMember(p, customerId, updated);
      } catch (_e) {}
      res.json({ ok: true, contact: updated });
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
      const cur = await loadContactRow(p, contactId);
      if (!cur || Number(cur.customer_id) !== customerId) {
        return res.status(404).json({ error: "Kontakt nicht gefunden" });
      }
      const { rowCount } = await p.query("DELETE FROM customer_contacts WHERE id = $1 AND customer_id = $2", [contactId, customerId]);
      if (!rowCount) return res.status(404).json({ error: "Kontakt nicht gefunden" });
      try {
        await disableCustomerContactCompanyMember(p, customerId, cur);
      } catch (_e) {}
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerCustomerContactsRoutes };
