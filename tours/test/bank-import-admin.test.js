const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../lib/db');
const actions = require('../lib/actions');

test('importExxasInvoiceToRenewal legt interne Rechnung fuer Exxas an', async () => {
  const originalQuery = pool.query;
  const originalLogAction = actions.logAction;
  let loggedAction = null;

  try {
    actions.logAction = async (...args) => {
      loggedAction = args;
    };

    pool.query = async (query, params = []) => {
      const sql = String(query);
      if (sql.includes('ADD COLUMN IF NOT EXISTS exxas_invoice_id')) {
        return { rows: [] };
      }
      if (sql.includes('CREATE INDEX IF NOT EXISTS idx_renewal_invoices_exxas_invoice_id')) {
        return { rows: [] };
      }
      if (sql.includes('FROM tour_manager.exxas_invoices')) {
        return {
          rows: [
            {
              id: 17,
              tour_id: 42,
              exxas_status: 'offen',
              zahlungstermin: '2099-04-15',
              dok_datum: '2099-03-01',
              preis_brutto: 59.0,
              nummer: 'EX-2026-17',
              exxas_document_id: 'DOC-17',
            },
          ],
        };
      }
      if (sql.includes('FROM tour_manager.renewal_invoices') && sql.includes('exxas_invoice_id = $2')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO tour_manager.renewal_invoices')) {
        assert.equal(params[0], 42);
        assert.equal(params[1], 'DOC-17');
        assert.equal(params[2], 'EX-2026-17');
        assert.equal(params[3], 'sent');
        assert.equal(params[4], 59);
        assert.equal(params[5], '2099-04-15');
        assert.equal(params[6], '2099-03-01');
        assert.equal(params[8], 'exxas_import');
        return { rows: [{ id: 801 }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    };

    delete require.cache[require.resolve('../lib/bank-import-admin')];
    const { importExxasInvoiceToRenewal } = require('../lib/bank-import-admin');

    const result = await importExxasInvoiceToRenewal(17, 'admin@example.com');
    assert.deepEqual(result, {
      ok: true,
      created: true,
      invoiceId: 801,
      tourId: 42,
      exxasInvoiceId: 'DOC-17',
    });
    assert.ok(loggedAction);
    assert.equal(loggedAction[0], 42);
    assert.equal(loggedAction[3], 'EXXAS_INVOICE_IMPORTED_TO_INTERNAL');
  } finally {
    pool.query = originalQuery;
    actions.logAction = originalLogAction;
    delete require.cache[require.resolve('../lib/bank-import-admin')];
  }
});
