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

test('matchTransaction markiert Exxas-Treffer als Review mit Import-Hinweis', () => {
  const invoiceIndex = bankImport.buildOpenInvoiceIndex([
    {
      source: 'exxas',
      id: 17,
      tour_id: 42,
      nummer: 'EX-2026-17',
      preis_brutto: 59.0,
      exxas_status: 'offen',
      ref_vertrag: '778899',
      exxas_document_id: 'DOC-17',
    },
  ]);

  const tx = {
    bookingDate: '2026-03-27',
    amount: 59.0,
    currency: 'CHF',
    referenceRaw: 'Vertrag 778899',
  };

  const result = bankImport.matchTransaction(tx, invoiceIndex);
  assert.equal(result.matchStatus, 'review');
  assert.equal(result.invoice.source, 'exxas');
  assert.match(result.reason, /importiert werden/i);
});

test('matchTransaction priorisiert interne Rechnung vor Exxas', () => {
  const renewalNumber = '2026.03.9002';
  const renewalQr = qrBill.formatQrReference(qrBill.buildQrReference({ invoice_number: renewalNumber }));
  const invoiceIndex = bankImport.buildOpenInvoiceIndex([
    {
      id: 9002,
      tour_id: 1,
      invoice_number: renewalNumber,
      amount_chf: 59.0,
      invoice_status: 'sent',
      subscription_end_at: null,
    },
    {
      source: 'exxas',
      id: 19,
      tour_id: 1,
      nummer: 'EX-2026-19',
      preis_brutto: 59.0,
      exxas_status: 'offen',
      ref_vertrag: '123456789012345678901234567',
      exxas_document_id: 'DOC-19',
    },
  ]);

  const tx = {
    bookingDate: '2026-03-27',
    amount: 59.0,
    currency: 'CHF',
    referenceRaw: renewalQr,
  };

  const result = bankImport.matchTransaction(tx, invoiceIndex);
  assert.equal(result.matchStatus, 'exact');
  assert.equal(result.invoice.source, 'renewal');
  assert.equal(result.invoice.id, '9002');
});
