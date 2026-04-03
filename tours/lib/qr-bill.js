const RECURSIVE_MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];

const DEFAULT_CREDITOR = {
  name: 'Propus GmbH',
  address: 'Untere Roostmatt',
  buildingNumber: '8',
  zip: '6300',
  city: 'Zug',
  country: 'CH',
  account: 'CH133000520419060401W',
  currency: 'CHF',
  email: 'office@propus.ch',
  phone: '+41445896363',
  website: 'propus.ch',
  vatId: 'CHE-424.310.597',
};

function cleanString(value) {
  return String(value || '').trim();
}

function compactIban(value) {
  return cleanString(value).replace(/\s+/g, '').toUpperCase();
}

function digitsOnly(value) {
  return String(value || '').replace(/\D+/g, '');
}

function formatIban(value) {
  const compact = compactIban(value);
  return compact.replace(/(.{4})/g, '$1 ').trim();
}

function formatQrReference(value) {
  const ref = digitsOnly(value).slice(0, 27).padStart(27, '0');
  return [
    ref.slice(0, 2),
    ref.slice(2, 7),
    ref.slice(7, 12),
    ref.slice(12, 17),
    ref.slice(17, 22),
    ref.slice(22, 27),
  ].join(' ');
}

function mod10RecursiveChecksum(baseDigits) {
  let carry = 0;
  for (const digit of digitsOnly(baseDigits)) {
    carry = RECURSIVE_MOD10_TABLE[(carry + Number(digit)) % 10];
  }
  return String((10 - carry) % 10);
}

function buildQrReference(invoice) {
  const seed = digitsOnly(invoice?.invoice_number || invoice?.id || Date.now()).slice(-26);
  const body = seed.padStart(26, '0');
  return `${body}${mod10RecursiveChecksum(body)}`;
}

function splitStreetAndBuilding(line) {
  const raw = cleanString(line);
  if (!raw) return { address: '', buildingNumber: '' };
  const match = raw.match(/^(.*?)[,\s]+(\d+[a-zA-Z\-\/]*)$/);
  if (!match) return { address: raw, buildingNumber: '' };
  return {
    address: cleanString(match[1]),
    buildingNumber: cleanString(match[2]),
  };
}

function parseAddressCandidate(street, buildingNumber, zip, city, country) {
  const parsedStreet = splitStreetAndBuilding(street);
  const address = cleanString(parsedStreet.address);
  const number = cleanString(buildingNumber || parsedStreet.buildingNumber);
  const postal = cleanString(zip);
  const locality = cleanString(city);
  const nation = cleanString(country || 'CH').toUpperCase();
  if (!address || !postal || !locality || !nation) return null;
  return {
    address,
    buildingNumber: number || undefined,
    zip: postal,
    city: locality,
    country: nation,
  };
}

function buildCreditor(dbCreditor) {
  const db = dbCreditor || {};
  return {
    name: cleanString(db.name) || cleanString(process.env.QR_BILL_CREDITOR_NAME) || DEFAULT_CREDITOR.name,
    address: cleanString(db.street) || cleanString(process.env.QR_BILL_CREDITOR_STREET) || DEFAULT_CREDITOR.address,
    buildingNumber: cleanString(db.buildingNumber) || cleanString(process.env.QR_BILL_CREDITOR_HOUSE_NUMBER) || DEFAULT_CREDITOR.buildingNumber,
    zip: cleanString(db.zip) || cleanString(process.env.QR_BILL_CREDITOR_POSTCODE) || DEFAULT_CREDITOR.zip,
    city: cleanString(db.city) || cleanString(process.env.QR_BILL_CREDITOR_CITY) || DEFAULT_CREDITOR.city,
    country: cleanString(db.country || 'CH').toUpperCase() || cleanString(process.env.QR_BILL_CREDITOR_COUNTRY) || DEFAULT_CREDITOR.country,
    account: compactIban(db.iban) || compactIban(process.env.QR_BILL_IBAN) || DEFAULT_CREDITOR.account,
    currency: 'CHF',
    email: cleanString(db.email) || cleanString(process.env.QR_BILL_CONTACT_EMAIL) || DEFAULT_CREDITOR.email,
    phone: cleanString(db.phone) || cleanString(process.env.QR_BILL_CONTACT_PHONE) || DEFAULT_CREDITOR.phone,
    website: cleanString(db.website) || cleanString(process.env.QR_BILL_WEBSITE) || DEFAULT_CREDITOR.website,
    vatId: cleanString(db.vatId) || cleanString(process.env.QR_BILL_VAT_ID) || DEFAULT_CREDITOR.vatId,
    footerNote: cleanString(db.footerNote) || '',
  };
}

async function buildCreditorFromDb() {
  try {
    const { getInvoiceCreditor } = require('./settings');
    const db = await getInvoiceCreditor();
    return buildCreditor(db);
  } catch {
    return buildCreditor({});
  }
}

function buildInvoicePaymentContextSync(invoice, tour, dbCreditor) {
  const creditor = buildCreditor(dbCreditor || {});
  return _buildContext(invoice, tour, creditor);
}

function buildDebtor(invoice, tour) {
  const name = cleanString(
    invoice?.billing_name ||
    tour?.billing_name ||
    tour?.customer_name ||
    tour?.customer_contact
  );
  if (!name) return null;
  const address = parseAddressCandidate(
    invoice?.billing_street ||
      tour?.billing_street ||
      tour?.customer_street ||
      tour?.street ||
      '',
    invoice?.billing_house_number ||
      tour?.billing_house_number ||
      tour?.customer_house_number ||
      tour?.house_number ||
      '',
    invoice?.billing_postcode ||
      tour?.billing_postcode ||
      tour?.customer_postcode ||
      tour?.zip ||
      '',
    invoice?.billing_city ||
      tour?.billing_city ||
      tour?.customer_city ||
      tour?.city ||
      '',
    invoice?.billing_country ||
      tour?.billing_country ||
      tour?.customer_country ||
      tour?.country ||
      'CH'
  );
  if (!address) return null;
  return { name, ...address };
}

function formatAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function _buildContext(invoice, tour, creditor) {
  const amount = Number(invoice?.amount_chf || invoice?.betrag || invoice?.preis_brutto || 0);
  const normalizedAmount = Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
  const reference = buildQrReference(invoice);
  const debtor = buildDebtor(invoice, tour);
  const debtorLines = debtor
    ? [
        debtor.name,
        [debtor.address, debtor.buildingNumber].filter(Boolean).join(' '),
        `${debtor.zip} ${debtor.city}`,
        debtor.country,
      ]
    : [];
  const creditorLines = [
    creditor.name,
    [creditor.address, creditor.buildingNumber].filter(Boolean).join(' '),
    `${creditor.zip} ${creditor.city}`,
    creditor.country,
  ];
  return {
    creditor,
    creditorLines,
    debtor,
    debtorLines,
    creditorIbanFormatted: formatIban(creditor.account),
    qrReference: reference,
    qrReferenceFormatted: formatQrReference(reference),
    qrAmount: formatAmount(normalizedAmount),
    qrCurrency: creditor.currency,
    qrBillPayload: {
      creditor: {
        account: creditor.account,
        name: creditor.name,
        address: creditor.address,
        buildingNumber: creditor.buildingNumber || undefined,
        zip: creditor.zip,
        city: creditor.city,
        country: creditor.country,
      },
      currency: creditor.currency,
      amount: normalizedAmount,
      reference,
      debtor: debtor
        ? {
            name: debtor.name,
            address: debtor.address,
            buildingNumber: debtor.buildingNumber || undefined,
            zip: debtor.zip,
            city: debtor.city,
            country: debtor.country,
          }
        : undefined,
      additionalInformation: `Rechnung ${cleanString(invoice?.invoice_number || invoice?.id || '')}`.trim(),
    },
  };
}

async function buildInvoicePaymentContext(invoice, tour) {
  const creditor = await buildCreditorFromDb();
  return _buildContext(invoice, tour, creditor);
}

module.exports = {
  buildInvoicePaymentContext,
  buildInvoicePaymentContextSync,
  buildCreditorFromDb,
  buildCreditor,
  buildQrReference,
  formatIban,
  formatQrReference,
};
