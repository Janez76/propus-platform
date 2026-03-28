const test = require('node:test');
const assert = require('node:assert/strict');

const bankImport = require('../lib/bank-import');
const qrBill = require('../lib/qr-bill');

test('parseCsv liest einfache Buchungen', () => {
  const csv = [
    'date;amount;currency;reference;debtor',
    '2026-03-27;59.00;CHF;00 00000 00000 00000 00050 08284;Test Kunde',
  ].join('\n');
  const rows = bankImport.parseCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 59.0);
  assert.equal(rows[0].currency, 'CHF');
  assert.match(rows[0].referenceRaw, /00050 08284/);
});

test('matchTransaction erkennt exakten Referenz- und Betragstreffer', () => {
  const invoiceIndex = bankImport.buildOpenInvoiceIndex([
    {
      id: 'a79051d6-1444-40db-bda2-e3d49b90a24d',
      tour_id: 1,
      invoice_number: '2026.03.9001',
      amount_chf: 59.0,
      invoice_status: 'sent',
      subscription_end_at: null,
    },
  ]);

  const tx = {
    bookingDate: '2026-03-27',
    amount: 59.0,
    currency: 'CHF',
    referenceRaw: qrBill.formatQrReference(qrBill.buildQrReference({ invoice_number: '2026.03.9001' })),
  };

  const result = bankImport.matchTransaction(tx, invoiceIndex);
  assert.equal(result.matchStatus, 'exact');
  assert.equal(result.invoice.id, 'a79051d6-1444-40db-bda2-e3d49b90a24d');
});
