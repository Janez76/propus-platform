/**
 * Lokaler Kunden-Lookup – Sucht zuerst in core.customers,
 * bietet Exxas-Import als Fallback an.
 */

const { pool } = require('./db');
const exxas = require('./exxas');

async function searchLocalCustomers(needle, limit = 10) {
  if (!needle || needle.length < 2) return [];
  const like = `%${needle}%`;
  const { rows } = await pool.query(
    `SELECT c.id, c.email, c.name, c.company, c.phone, c.exxas_contact_id,
            c.customer_number, c.street, c.zipcity
     FROM core.customers c
     WHERE LOWER(c.name) LIKE LOWER($1)
        OR LOWER(COALESCE(c.company, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(c.email, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(c.phone, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(c.street, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(c.zipcity, '')) LIKE LOWER($1)
        OR (c.exxas_contact_id IS NOT NULL AND CAST(c.exxas_contact_id AS TEXT) ILIKE $1)
        OR (c.customer_number IS NOT NULL AND CAST(c.customer_number AS TEXT) ILIKE $1)
     ORDER BY c.company, c.name
     LIMIT $2`,
    [like, limit]
  );
  return rows;
}

/**
 * Stellt sicher, dass core.customers.customer_number gesetzt ist:
 * bereits vorhanden → zurückgeben, sonst nächste reine Zahl ab 10001.
 */
async function ensureCustomerNumber(customerId) {
  if (!customerId) return null;
  const id = parseInt(String(customerId), 10);
  if (!Number.isFinite(id) || id < 1) return null;

  const { rows } = await pool.query(
    'SELECT customer_number FROM core.customers WHERE id = $1',
    [id]
  );
  if (!rows[0]) return null;
  if (rows[0].customer_number) return rows[0].customer_number;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { rows: maxRows } = await pool.query(
      `SELECT MAX(CAST(customer_number AS INTEGER)) AS max
       FROM core.customers
       WHERE customer_number ~ '^[0-9]+$'`
    );
    const next = String((maxRows[0]?.max != null ? maxRows[0].max : 10000) + 1);

    try {
      const { rows: updated } = await pool.query(
        `UPDATE core.customers SET customer_number = $1, updated_at = NOW()
         WHERE id = $2 AND customer_number IS NULL
         RETURNING customer_number`,
        [next, id]
      );
      if (updated[0]) return updated[0].customer_number;
    } catch (e) {
      if (e && e.code === '23505') continue;
      throw e;
    }

    const { rows: refetch } = await pool.query(
      'SELECT customer_number FROM core.customers WHERE id = $1',
      [id]
    );
    if (refetch[0]?.customer_number) return refetch[0].customer_number;
  }
  return null;
}

async function getLocalContacts(customerId) {
  const { rows } = await pool.query(
    `SELECT id, name, role, phone, email, sort_order
     FROM core.customer_contacts
     WHERE customer_id = $1
     ORDER BY sort_order, id`,
    [customerId]
  );
  return rows;
}

/** Kontakte (Ansprechpartner) suchen, inkl. zugehöriger Firma – nur lokale DB. */
async function searchLocalContactMatches(needle, limit = 10) {
  if (!needle || needle.length < 2) return [];
  const like = `%${needle}%`;
  const { rows } = await pool.query(
    `SELECT cc.id AS contact_id,
            cc.name AS contact_name,
            cc.email AS contact_email,
            cc.phone AS contact_phone,
            c.id AS customer_id,
            c.company,
            c.name AS customer_name,
            c.email AS customer_email,
            c.exxas_contact_id
     FROM core.customer_contacts cc
     INNER JOIN core.customers c ON c.id = cc.customer_id
     WHERE LOWER(COALESCE(cc.name, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(cc.email, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(cc.phone, '')) LIKE LOWER($1)
     ORDER BY c.company NULLS LAST, c.name, cc.sort_order NULLS LAST, cc.id
     LIMIT $2`,
    [like, limit]
  );
  return rows;
}

async function getCustomerById(customerId) {
  const { rows } = await pool.query(
    `SELECT * FROM core.customers WHERE id = $1 LIMIT 1`,
    [customerId]
  );
  return rows[0] || null;
}

async function getCustomerByEmail(email) {
  if (!email) return null;
  const { rows } = await pool.query(
    `SELECT * FROM core.customers WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email.trim()]
  );
  return rows[0] || null;
}

async function getCustomerByExxasRef(exxasRef) {
  if (!exxasRef) return null;
  const ref = String(exxasRef).trim();
  const { rows } = await pool.query(
    `SELECT * FROM core.customers WHERE exxas_contact_id = $1 LIMIT 1`,
    [ref]
  );
  return rows[0] || null;
}

/**
 * Importiert einen Kunden aus Exxas in core.customers, falls nicht vorhanden.
 * Gibt den lokalen Kunden-Datensatz zurück.
 */
async function importFromExxas(exxasCustomerId) {
  if (!exxasCustomerId) return null;
  const ref = String(exxasCustomerId).trim();

  const existing = await getCustomerByExxasRef(ref);
  if (existing) return existing;

  const custRes = await exxas.getCustomer(ref).catch(() => ({ customer: null }));
  const customer = custRes?.customer;
  if (!customer) return null;

  const email = (customer.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = await getCustomerByEmail(email);
    if (byEmail) {
      if (!byEmail.exxas_contact_id) {
        await pool.query(
          `UPDATE core.customers
           SET exxas_contact_id = $1,
               customer_number = COALESCE(customer_number, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [ref, byEmail.id]
        );
      }
      return { ...byEmail, exxas_contact_id: ref };
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO core.customers (email, name, company, phone, exxas_contact_id, customer_number)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT ((LOWER(email))) DO UPDATE SET
       exxas_contact_id = COALESCE(EXCLUDED.exxas_contact_id, core.customers.exxas_contact_id),
       customer_number = COALESCE(core.customers.customer_number, EXCLUDED.customer_number),
       updated_at = NOW()
     RETURNING *`,
    [
      email || `exxas-${ref}@import.local`,
      customer.firmenname || customer.name || '',
      customer.firmenname || '',
      customer.tel || '',
      ref,
    ]
  );
  const inserted = rows[0];

  const { contacts } = await exxas.getContactsForCustomer(ref).catch(() => ({ contacts: [] }));
  if (contacts?.length && inserted) {
    for (const contact of contacts) {
      await pool.query(
        `INSERT INTO core.customer_contacts (customer_id, name, email, phone, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [inserted.id, contact.name || '', contact.email || '', contact.tel || '', '']
      ).catch(() => {});
    }
  }

  return inserted;
}

/**
 * Kombinierte Suche: lokal + Exxas-Treffer (Import-Vorschläge)
 */
async function searchCustomersWithExxasFallback(needle, opts = {}) {
  const { limit = 10, includeExxas = true } = opts;
  const localResults = await searchLocalCustomers(needle, limit);

  let exxasResults = [];
  if (includeExxas && localResults.length < limit) {
    try {
      const exxasRes = await exxas.searchCustomers(needle);
      const found = (exxasRes.customers || []).slice(0, limit - localResults.length);
      const localExxasIds = new Set(
        localResults.filter((r) => r.exxas_contact_id).map((r) => String(r.exxas_contact_id))
      );
      exxasResults = found
        .filter((c) => !localExxasIds.has(String(c.id || '')))
        .map((c) => ({
          source: 'exxas',
          exxas_id: c.id,
          nummer: c.nummer,
          name: c.firmenname || c.name || '',
          email: c.email || '',
          phone: c.tel || '',
        }));
    } catch {
      // Exxas offline – nur lokale Ergebnisse
    }
  }

  return {
    local: localResults.map((r) => ({ ...r, source: 'local' })),
    exxas_import: exxasResults,
  };
}

/** JSON-Shape für Matterport-Verknüpfen – immer aus core.customers + core.customer_contacts abgeleitet. */
function toLinkModalCustomer(customerRow, contactRows) {
  if (!customerRow?.id) return null;
  const contacts = Array.isArray(contactRows) ? contactRows : [];
  return {
    id: String(customerRow.id),
    nummer: customerRow.customer_number || '',
    firmenname: customerRow.company || customerRow.name || '',
    email: customerRow.email || null,
    label: `${customerRow.company || customerRow.name || customerRow.id}${
      customerRow.customer_number || customerRow.exxas_contact_id
        ? ` (Nr. ${customerRow.customer_number || customerRow.exxas_contact_id})`
        : ''
    }`,
    source: 'local',
    contacts: contacts.map((ct) => ({ name: ct.name, email: ct.email, tel: ct.phone })),
  };
}

module.exports = {
  searchLocalCustomers,
  searchLocalContactMatches,
  getLocalContacts,
  getCustomerById,
  toLinkModalCustomer,
  getCustomerByEmail,
  getCustomerByExxasRef,
  importFromExxas,
  searchCustomersWithExxasFallback,
  ensureCustomerNumber,
};
