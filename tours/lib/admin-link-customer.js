/**
 * Tour ↔ core.customers verknüpfen (EJS link-exxas-customer + JSON-API).
 */

const { pool } = require('./db');
const { normalizeTourRow } = require('./normalize');
const customerLookup = require('./customer-lookup');

async function getLinkExxasCustomerPageJson(tourIdRaw) {
  const tourId = parseInt(String(tourIdRaw || '').trim(), 10);
  if (!Number.isFinite(tourId) || tourId < 1) {
    return { ok: false, error: 'not_found' };
  }
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tourResult.rows[0]) return { ok: false, error: 'not_found' };
  const tour = normalizeTourRow(tourResult.rows[0]);
  return { ok: true, tour };
}

async function getLinkCustomerAutocompleteJson(qRaw) {
  const q = String(qRaw || '').trim();
  if (q.length < 2) return { customers: [] };
  try {
    const local = await customerLookup.searchLocalCustomers(q, 12);
    const customers = await Promise.all(
      local.map(async (c) => {
        const contacts = await customerLookup.getLocalContacts(c.id);
        return {
          id: c.id,
          display_name: c.company || c.name || '',
          email: c.email || '',
          ref: c.customer_number || c.exxas_contact_id || '',
          contacts: contacts.map((ct) => ({
            id: ct.id,
            name: ct.name || '',
            email: ct.email || '',
            role: ct.role || '',
          })),
        };
      })
    );
    return { customers };
  } catch (err) {
    return { customers: [] };
  }
}

async function postLinkExxasCustomerJson(tourIdRaw, body) {
  const tourId = parseInt(String(tourIdRaw || '').trim(), 10);
  if (!Number.isFinite(tourId) || tourId < 1) {
    return { ok: false, error: 'not_found' };
  }
  const { customer_id, customer_name, customer_email, customer_contact } = body || {};

  const name = (customer_name || '').trim() || null;
  const cid = parseInt(String(customer_id || '').trim(), 10);
  if (!name || !Number.isFinite(cid) || cid < 1) {
    return { ok: false, error: 'missing' };
  }

  const tourResult = await pool.query('SELECT id FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tourResult.rows[0]) return { ok: false, error: 'not_found' };

  const customer = await customerLookup.getCustomerById(cid);
  if (!customer) return { ok: false, error: 'missing' };
  const expectedDisplay = String(customer.company || customer.name || '').trim();
  if (expectedDisplay !== name) {
    return { ok: false, error: 'mismatch' };
  }

  const email = (customer_email || '').trim() || null;
  const contact = (customer_contact || '').trim() || null;
  const kundeRef = await customerLookup.ensureCustomerNumber(cid);
  if (!kundeRef) return { ok: false, error: 'missing' };

  await pool.query(
    `UPDATE tour_manager.tours
     SET kunde_ref = $1, customer_name = $2, customer_email = $3, customer_contact = $4,
         customer_id = $5, updated_at = NOW()
     WHERE id = $6`,
    [kundeRef, name, email, contact, cid, tourId]
  );
  return { ok: true };
}

module.exports = {
  getLinkExxasCustomerPageJson,
  getLinkCustomerAutocompleteJson,
  postLinkExxasCustomerJson,
};
