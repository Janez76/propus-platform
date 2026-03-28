const test = require('node:test');
const assert = require('node:assert/strict');

const qrBill = require('../lib/qr-bill');

test('buildQrReference erzeugt stabile 27-stellige QR-Referenzen', () => {
  const reference = qrBill.buildQrReference({ invoice_number: '500828' });

  assert.equal(reference, '000000000000000000005008284');
  assert.equal(reference.length, 27);
});

test('buildInvoicePaymentContext nutzt Propus GmbH Defaults', () => {
  const context = qrBill.buildInvoicePaymentContext(
    { id: 500828, invoice_number: '500828', amount_chf: 123.75 },
    { customer_name: 'home2be Immobilien Consulting' }
  );

  assert.equal(context.creditor.name, 'Propus GmbH');
  assert.equal(context.creditorIbanFormatted, 'CH13 3000 5204 1906 0401 W');
  assert.equal(context.qrAmount, '123.75');
  assert.equal(context.qrReferenceFormatted, '00 00000 00000 00000 00050 08284');
  assert.equal(context.qrBillPayload.reference, '000000000000000000005008284');
});
