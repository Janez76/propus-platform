/**
 * JSON-Helfer für Tour-Manager Kundenverwaltung (core.customers) — Spiegel der EJS-Logik in admin.js.
 */

const { pool } = require('./db');
const portalTeam = require('./portal-team');
const exxas = require('./exxas');

async function runExternPortalSync(ownerEmail, memberEmail) {
  const path = require('path');
  try {
    const br = path.join(__dirname, '..', '..', 'booking');
    const portalRbac = require(path.join(br, 'portal-rbac-sync'));
    const logtoRole = require(path.join(br, 'logto-role-sync'));
    await portalRbac.syncPortalTeamMemberAdminRbac(ownerEmail, memberEmail);
    const cnt = await portalRbac.countActivePortalAdminWorkspaces(memberEmail);
    if (cnt > 0) await logtoRole.syncSystemRoleToLogto(memberEmail, 'customer_admin', 'add');
    else await logtoRole.syncSystemRoleToLogto(memberEmail, 'customer_admin', 'remove');
  } catch {
    /* optional booking-modul */
  }
}

async function getCustomersListJson(query) {
  const q = String(query.q || '').trim();
  const source = String(query.source || '').trim();
  const status = String(query.status || '').trim();
  const sortBy = ['name', 'email', 'address', 'created_at', 'tour_count'].includes(query.sort) ? query.sort : 'name';
  const sortDir = query.dir === 'desc' ? 'DESC' : 'ASC';
  const page = Math.max(1, parseInt(String(query.page || ''), 10) || 1);
  const limit = 30;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];
  let pIdx = 1;

  if (q) {
    whereClause += ` AND (
        LOWER(c.name)    LIKE $${pIdx}
        OR LOWER(c.email)   LIKE $${pIdx}
        OR LOWER(c.company) LIKE $${pIdx}
        OR LOWER(c.phone)   LIKE $${pIdx}
        OR LOWER(coalesce(c.street,''))   LIKE $${pIdx}
        OR LOWER(coalesce(c.city,''))     LIKE $${pIdx}
        OR LOWER(coalesce(c.customer_number,'')) LIKE $${pIdx}
      )`;
    params.push(`%${q.toLowerCase()}%`);
    pIdx++;
  }

  if (source === 'tours') {
    whereClause += ` AND EXISTS (SELECT 1 FROM tour_manager.tours t WHERE core.customer_email_matches(t.customer_email, c.email, c.email_aliases))`;
  } else if (source === 'contacts') {
    whereClause += ` AND EXISTS (SELECT 1 FROM core.customer_contacts cc WHERE cc.customer_id = c.id)`;
  }

  if (status === 'aktiv') {
    whereClause += ` AND (c.blocked IS NULL OR c.blocked = FALSE)`;
  } else if (status === 'gesperrt') {
    whereClause += ` AND c.blocked = TRUE`;
  }

  const orderExpr = {
    name: `LOWER(COALESCE(NULLIF(trim(c.name),''), c.company, c.email))`,
    email: `LOWER(c.email)`,
    address: `LOWER(coalesce(c.city,''))`,
    created_at: `c.created_at`,
    tour_count: `tour_count`,
  }[sortBy] || `LOWER(COALESCE(NULLIF(trim(c.name),''), c.company, c.email))`;

  const countResult = await pool.query(`SELECT COUNT(*) AS cnt FROM core.customers c ${whereClause}`, params);
  const totalCount = parseInt(countResult.rows[0].cnt, 10);
  const totalPages = Math.ceil(totalCount / limit);

  const dataResult = await pool.query(
    `SELECT
       c.id,
       CASE WHEN trim(coalesce(c.name,''))='' THEN coalesce(c.company, c.email, '') ELSE c.name END AS name,
       c.email, c.company, c.phone,
       coalesce(c.street,'') AS street,
       coalesce(c.zip,'') AS zip,
       coalesce(c.city,'') AS city,
       c.exxas_contact_id, c.blocked, c.created_at,
       c.customer_number,
       (SELECT COUNT(*) FROM tour_manager.tours t WHERE core.customer_email_matches(t.customer_email, c.email, c.email_aliases)) AS tour_count,
       (SELECT COUNT(*) FROM core.customer_contacts cc WHERE cc.customer_id = c.id) AS contact_count
     FROM core.customers c
     ${whereClause}
     ORDER BY ${orderExpr} ${sortDir}
     LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
    [...params, limit, offset]
  );

  return {
    ok: true,
    customers: dataResult.rows,
    pagination: { page, limit, totalCount, totalPages, hasPrev: page > 1, hasNext: page < totalPages },
    filters: { q, source, status, sortBy, sortDir },
  };
}

async function getExxasCustomerSearchJson(qRaw) {
  const q = String(qRaw || '').trim();
  if (q.length < 2) return { ok: true, results: [] };
  try {
    const r = await exxas.searchCustomers(q);
    const results = (r.customers || []).slice(0, 10).map((c) => ({
      id: c.id || c.nummer,
      exxas_contact_id: String(c.id || c.nummer || ''),
      name: [c.vorname, c.nachname].filter(Boolean).join(' ') || c.firmenname || '',
      email: c.email || '',
      company: c.firmenname || '',
      phone: c.telefon || c.mobile || '',
      street: c.strasse || '',
      zipcity: [c.plz, c.ort].filter(Boolean).join(' ') || '',
    }));
    return { ok: true, results };
  } catch (err) {
    return { ok: true, results: [], error: err.message };
  }
}

async function postCustomerNewJson(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const company = String(body.company || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  const street = String(body.street || '').trim() || null;
  const zipcity = String(body.zipcity || '').trim() || null;
  const notes = String(body.notes || '').trim() || null;
  const exxas_contact_id = String(body.exxas_contact_id || '').trim() || null;

  if (!name || !email) {
    return { ok: false, error: 'Name und E-Mail sind Pflichtfelder.' };
  }

  const existing = await pool.query('SELECT id FROM core.customers WHERE LOWER(email)=$1', [email]);
  if (existing.rows.length > 0) {
    return { ok: false, error: 'Ein Kunde mit dieser E-Mail existiert bereits.', existingId: existing.rows[0].id };
  }

  const result = await pool.query(
    `INSERT INTO core.customers
       (name, email, company, phone, street, zipcity, notes, exxas_contact_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     RETURNING id`,
    [name, email, company, phone, street, zipcity, notes, exxas_contact_id]
  );
  return { ok: true, id: result.rows[0].id };
}

async function getCustomerDetailJson(idRaw) {
  const id = parseInt(String(idRaw || '').trim(), 10);
  if (!Number.isFinite(id) || id < 1) return { ok: false, error: 'invalid_id' };

  await portalTeam.ensurePortalTeamSchema();
  const [custR, contactsR, toursR] = await Promise.all([
    pool.query('SELECT * FROM core.customers WHERE id=$1', [id]),
    pool.query(`SELECT * FROM core.customer_contacts WHERE customer_id=$1 ORDER BY name ASC`, [id]),
    pool.query(
      `SELECT id, bezeichnung, object_label, status, term_end_date
       FROM tour_manager.tours t
       WHERE EXISTS (
         SELECT 1 FROM core.customers c
         WHERE c.id = $1
           AND core.customer_email_matches(t.customer_email, c.email, c.email_aliases)
       )
       ORDER BY created_at DESC LIMIT 10`,
      [id]
    ),
  ]);

  if (!custR.rows.length) return { ok: false, error: 'not_found' };

  const customer = custR.rows[0];
  const ownerEmail = String(customer.email || '').trim().toLowerCase();

  const contactPortalRoles = {};
  if (ownerEmail) {
    try {
      const prR = await pool.query(
        `SELECT LOWER(TRIM(member_email)) AS email, role, status
         FROM tour_manager.portal_team_members
         WHERE LOWER(owner_email) = $1`,
        [ownerEmail]
      );
      for (const row of prR.rows) {
        contactPortalRoles[row.email] = { role: row.role, status: row.status };
      }
    } catch (_) {
      /* ignore */
    }
  }

  return {
    ok: true,
    customer,
    contacts: contactsR.rows,
    tours: toursR.rows,
    contactPortalRoles,
  };
}

async function postCustomerUpdateJson(idRaw, body) {
  const id = parseInt(String(idRaw || '').trim(), 10);
  if (!Number.isFinite(id) || id < 1) return { ok: false, error: 'invalid_id' };

  const company = String(body.company || '').trim();
  const nameInput = String(body.name || '').trim();
  const name = nameInput || company || null;
  const email = String(body.email || '').trim().toLowerCase();
  const salutation = String(body.salutation || '').trim() || null;
  const first_name = String(body.first_name || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  const phone_2 = String(body.phone_2 || '').trim() || null;
  const phone_mobile = String(body.phone_mobile || '').trim() || null;
  const phone_fax = String(body.phone_fax || '').trim() || null;
  const onsite_name = String(body.onsite_name || '').trim() || null;
  const onsite_phone = String(body.onsite_phone || '').trim() || null;
  const website = String(body.website || '').trim() || null;
  const street = String(body.street || '').trim() || null;
  const address_addon_1 = String(body.address_addon_1 || '').trim() || null;
  const address_addon_2 = String(body.address_addon_2 || '').trim() || null;
  const address_addon_3 = String(body.address_addon_3 || '').trim() || null;
  const po_box = String(body.po_box || '').trim() || null;
  const zip = String(body.zip || '').trim() || null;
  const city = String(body.city || '').trim() || null;
  const zipcity =
    (zip || city ? [zip, city].filter(Boolean).join(' ').trim() : String(body.zipcity || '').trim()) || null;
  const country = String(body.country || '').trim() || 'Schweiz';
  const notes = String(body.notes || '').trim() || null;
  const exxas_contact_id = String(body.exxas_contact_id || '').trim() || null;
  const exxas_customer_id = String(body.exxas_customer_id || '').trim() || null;
  const exxas_address_id = String(body.exxas_address_id || '').trim() || null;
  const blocked = body.blocked === true || body.blocked === '1' || body.blocked === 1;

  if (!company || !email) {
    return { ok: false, error: 'Firma/Kunde und E-Mail sind Pflichtfelder.' };
  }

  const conflict = await pool.query('SELECT id FROM core.customers WHERE LOWER(email)=$1 AND id<>$2', [email, id]);
  if (conflict.rows.length > 0) {
    return { ok: false, error: 'Diese E-Mail wird bereits von einem anderen Kunden verwendet.' };
  }

  await pool.query(
    `UPDATE core.customers
     SET name=$1, email=$2, company=$3, phone=$4, street=$5, zipcity=$6,
         notes=$7, exxas_contact_id=$8, blocked=$9, salutation=$10, first_name=$11,
         onsite_name=$12, onsite_phone=$13, address_addon_1=$14, address_addon_2=$15,
         address_addon_3=$16, po_box=$17, zip=$18, city=$19, country=$20, phone_2=$21,
         phone_mobile=$22, phone_fax=$23, website=$24, exxas_customer_id=$25,
         exxas_address_id=$26, updated_at=NOW()
     WHERE id=$27`,
    [
      name,
      email,
      company,
      phone,
      street,
      zipcity,
      notes,
      exxas_contact_id,
      blocked,
      salutation,
      first_name,
      onsite_name,
      onsite_phone,
      address_addon_1,
      address_addon_2,
      address_addon_3,
      po_box,
      zip,
      city,
      country,
      phone_2,
      phone_mobile,
      phone_fax,
      website,
      exxas_customer_id,
      exxas_address_id,
      id,
    ]
  );
  return { ok: true };
}

async function postCustomerDeleteJson(idRaw) {
  const id = parseInt(String(idRaw || '').trim(), 10);
  if (!Number.isFinite(id) || id < 1) return { ok: false, error: 'invalid_id' };
  try {
    await pool.query('DELETE FROM core.customers WHERE id=$1', [id]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function postCustomerContactAddJson(customerIdRaw, body) {
  const customerId = parseInt(String(customerIdRaw || '').trim(), 10);
  if (!Number.isFinite(customerId) || customerId < 1) return { ok: false, error: 'invalid_customer' };

  const salutation = String(body.salutation || '').trim() || null;
  const first_name = String(body.first_name || '').trim() || null;
  const last_name = String(body.last_name || '').trim();
  const fallbackName = String(body.name || '').trim();
  const name = [first_name, last_name].filter(Boolean).join(' ').trim() || fallbackName;
  const role = String(body.role || '').trim() || null;
  const department = String(body.department || '').trim() || null;
  const email = String(body.email || '').trim().toLowerCase() || null;
  const phone = String(body.phone || body.phone_direct || '').trim() || null;
  const phone_mobile = String(body.phone_mobile || '').trim() || null;

  if (!name) return { ok: false, error: 'Name ist ein Pflichtfeld.' };

  await pool.query(
    `INSERT INTO core.customer_contacts (
       customer_id, name, role, email, phone, created_at,
       salutation, first_name, last_name, phone_mobile, department
     )
     VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,$10)`,
    [customerId, name, role, email, phone, salutation, first_name, last_name || null, phone_mobile, department]
  );
  return { ok: true };
}

async function postCustomerContactDeleteJson(customerIdRaw, contactIdRaw) {
  const customerId = parseInt(String(customerIdRaw || '').trim(), 10);
  const contactId = parseInt(String(contactIdRaw || '').trim(), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(contactId)) {
    return { ok: false, error: 'invalid_id' };
  }
  await pool.query('DELETE FROM core.customer_contacts WHERE id=$1 AND customer_id=$2', [contactId, customerId]);
  return { ok: true };
}

async function postCustomerContactPortalRoleJson(customerIdRaw, contactIdRaw, body) {
  const customerId = parseInt(String(customerIdRaw || '').trim(), 10);
  const contactId = parseInt(String(contactIdRaw || '').trim(), 10);
  const newRole = String(body.portal_role || '').trim().toLowerCase();
  const validRoles = ['', 'mitarbeiter', 'admin'];
  if (!validRoles.includes(newRole)) return { ok: false, error: 'Ungültige Rolle.' };

  await portalTeam.ensurePortalTeamSchema();

  const [contR, custR] = await Promise.all([
    pool.query('SELECT * FROM core.customer_contacts WHERE id=$1 AND customer_id=$2', [contactId, customerId]),
    pool.query('SELECT email FROM core.customers WHERE id=$1', [customerId]),
  ]);
  if (!contR.rows.length || !custR.rows.length) {
    return { ok: false, error: 'Kontakt oder Kunde nicht gefunden.' };
  }

  const memberEmail = String(contR.rows[0].email || '').trim().toLowerCase();
  const ownerEmail = String(custR.rows[0].email || '').trim().toLowerCase();
  const displayName = String(contR.rows[0].name || '').trim() || null;

  if (!memberEmail) {
    return { ok: false, error: 'Kontakt hat keine E-Mail – Portal-Rolle kann nicht gesetzt werden.' };
  }

  if (newRole === '') {
    await pool.query(
      `DELETE FROM tour_manager.portal_team_members
       WHERE LOWER(owner_email)=$1 AND LOWER(member_email)=$2`,
      [ownerEmail, memberEmail]
    );
  } else {
    await pool.query(
      `INSERT INTO tour_manager.portal_team_members
         (owner_email, member_email, display_name, role, status, accepted_at, created_at)
       VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
       ON CONFLICT (lower(owner_email), lower(member_email)) DO UPDATE
         SET role = $4,
             status = 'active',
             display_name = COALESCE($3, tour_manager.portal_team_members.display_name),
             accepted_at  = COALESCE(tour_manager.portal_team_members.accepted_at, NOW())`,
      [ownerEmail, memberEmail, displayName, newRole]
    );
  }

  await runExternPortalSync(ownerEmail, memberEmail);
  return { ok: true };
}

module.exports = {
  getCustomersListJson,
  getExxasCustomerSearchJson,
  postCustomerNewJson,
  getCustomerDetailJson,
  postCustomerUpdateJson,
  postCustomerDeleteJson,
  postCustomerContactAddJson,
  postCustomerContactDeleteJson,
  postCustomerContactPortalRoleJson,
};
