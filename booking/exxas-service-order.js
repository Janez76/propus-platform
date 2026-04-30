"use strict";

function asTrimmedString(value) {
  return String(value || "").trim();
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = asTrimmedString(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function getExxasCustomerIdFromRecord(record) {
  return asTrimmedString(record?.exxasCustomerId || record?.exxas_customer_id || "");
}

function getLookupEmailsForOrder(order) {
  return uniqueNonEmpty([
    order?.billing?.email,
    order?.customerContactEmail,
    order?.customer_email,
    order?.customerEmail,
    order?.object?.email,
  ]);
}

async function resolveExxasCustomerIdForOrder(order, db) {
  const direct = getExxasCustomerIdFromRecord(order);
  if (direct) return { value: direct, source: "order" };

  if (db && typeof db.getCustomerByEmail === "function") {
    for (const email of getLookupEmailsForOrder(order)) {
      const customer = await db.getCustomerByEmail(email);
      const fromCustomer = getExxasCustomerIdFromRecord(customer);
      if (fromCustomer) {
        return { value: fromCustomer, source: "email", email, customerId: customer?.id || null };
      }
    }
  }

  return {
    value: "",
    source: "missing",
    error:
      "Exxas-Kunden-ID fehlt: Bitte den Kunden zuerst mit Exxas verknuepfen, damit ref_kunde gesetzt werden kann.",
  };
}

function buildExxasServiceOrderBody({ bezeichnung, exxasCustomerId, refKontakt, termin }) {
  const refKunde = asTrimmedString(exxasCustomerId);
  if (!refKunde) {
    throw new Error("Exxas-Kunden-ID fehlt: ref_kunde ist fuer Dienstleistungsauftraege erforderlich.");
  }
  return {
    bezeichnung,
    typ: "s",
    ref_kunde: refKunde,
    ...(asTrimmedString(refKontakt) ? { ref_kontakt: asTrimmedString(refKontakt) } : {}),
    ...(asTrimmedString(termin) ? { termin: asTrimmedString(termin) } : {}),
  };
}

module.exports = {
  buildExxasServiceOrderBody,
  resolveExxasCustomerIdForOrder,
};
