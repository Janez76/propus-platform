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
            c.street, c.zipcity
     FROM core.customers c
     WHERE LOWER(c.name) LIKE LOWER($1)
        OR LOWER(c.company) LIKE LOWER($1)
        OR LOWER(c.email) LIKE LOWER($1)
        OR LOWER(c.phone) LIKE $1
     ORDER BY c.company, c.name
     LIMIT $2`,
    [like, limit]
  );
  return rows;
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
          `UPDATE core.customers SET exxas_contact_id = $1, updated_at = NOW() WHERE id = $2`,
          [ref, byEmail.id]
        );
      }
      return { ...byEmail, exxas_contact_id: ref };
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO core.customers (email, name, company, phone, exxas_contact_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ((LOWER(email))) DO UPDATE SET
       exxas_contact_id = COALESCE(EXCLUDED.exxas_contact_id, core.customers.exxas_contact_id),
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

module.exports = {
  searchLocalCustomers,
  getLocalContacts,
  getCustomerById,
  getCustomerByEmail,
  getCustomerByExxasRef,
  importFromExxas,
  searchCustomersWithExxasFallback,
};
