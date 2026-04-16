const test = require('node:test');
const assert = require('node:assert/strict');

const bankImport = require('../lib/bank-import');
const qrBill = require('../lib/qr-bill');

test('parseCamt054 parst Standard-XML korrekt', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.04">
  <BkToCstmrDbtCdtNtfctn>
    <Ntfctn>
      <Ntry>
        <Amt Ccy="CHF">59.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-04-14</Dt></BookgDt>
        <ValDt><Dt>2026-04-14</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <RltdPties><Dbtr><Nm>Test AG</Nm></Dbtr></RltdPties>
            <RmtInf>
              <Strd><CdtrRefInf><Ref>00 00000 00000 00000 00050 08284</Ref></CdtrRefInf></Strd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>`;
  const rows = bankImport.parseCamt054(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 59);
  assert.equal(rows[0].currency, 'CHF');
  assert.equal(rows[0].debtorName, 'Test AG');
  assert.match(rows[0].referenceRaw, /00050 08284/);
});

test('parseCamt054 parst XML mit Namespace-Prefix (ns2:) korrekt', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ns2:Document xmlns:ns2="urn:iso:std:iso:20022:tech:xsd:camt.054.001.04">
  <ns2:BkToCstmrDbtCdtNtfctn>
    <ns2:Ntfctn>
      <ns2:Ntry>
        <ns2:Amt Ccy="CHF">189.00</ns2:Amt>
        <ns2:CdtDbtInd>CRDT</ns2:CdtDbtInd>
        <ns2:BookgDt><ns2:Dt>2026-04-14</ns2:Dt></ns2:BookgDt>
        <ns2:NtryDtls>
          <ns2:TxDtls>
            <ns2:RltdPties><ns2:Dbtr><ns2:Nm>Meier GmbH</ns2:Nm></ns2:Dbtr></ns2:RltdPties>
            <ns2:RmtInf>
              <ns2:Strd><ns2:CdtrRefInf><ns2:Ref>210000000003139471430009017</ns2:Ref></ns2:CdtrRefInf></ns2:Strd>
            </ns2:RmtInf>
          </ns2:TxDtls>
        </ns2:NtryDtls>
      </ns2:Ntry>
    </ns2:Ntfctn>
  </ns2:BkToCstmrDbtCdtNtfctn>
</ns2:Document>`;
  const rows = bankImport.parseCamt054(xml);
  assert.equal(rows.length, 1, 'Namespace-Prefix darf Parsing nicht verhindern');
  assert.equal(rows[0].amount, 189);
  assert.equal(rows[0].debtorName, 'Meier GmbH');
});

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
