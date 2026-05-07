"use strict";

// bexio kb_order (Auftragsbestätigung) Helper
//
// Spiegel-Pendant zu exxas-service-order.js — dort wird ein Exxas-
// Dienstleistungsauftrag aus einem Propus-Auftrag erzeugt; hier wird
// stattdessen ein bexio Sales Order (kb_order) erzeugt.
//
// Konfiguration kommt aus app_settings Key 'integration.bexio.config'
// (Fallback auf Env BEXIO_DEFAULT_*). Pflichtfelder, die in der bexio-
// Instanz fest hinterlegt sind: paymentTypeId, bankAccountId, vatTaxId.
// Fehlt eines davon, lehnt die Route den Aufruf mit 503 ab.
//
// Positionen werden als KbPositionCustom (Freitext) angelegt — kein
// Artikel-Mapping, dafür funktioniert es ohne SKU-Datenbasis.

const DEFAULT_CONFIG = {
  userId: 1,
  ownerId: 1,
  currencyId: 1,        // CHF in Standard-CH-Account
  languageId: 1,        // DE in Standard-CH-Account
  mwstType: 0,          // 0 = exklusiv (MWST kommt obendrauf)
  mwstIsNet: true,      // Netto-Beträge in Positionen
  paymentTypeId: null,  // Pflicht, aus Config
  bankAccountId: null,  // Pflicht, aus Config
  vatTaxId: null,       // Pflicht, aus Config (z.B. tax_id für 8.1% Normal)
  headerTemplate: "{{address}} #{{orderNo}}",
  footerTemplate: "",
};

const REQUIRED_KEYS = ["paymentTypeId", "bankAccountId", "vatTaxId"];

function asTrimmedString(value) {
  return String(value == null ? "" : value).trim();
}

function asPositiveInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function readEnvDefault(suffix) {
  const raw = process.env[`BEXIO_DEFAULT_${suffix}`];
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function loadBexioConfig(stored) {
  const merged = { ...DEFAULT_CONFIG };
  if (stored && typeof stored === "object") {
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (stored[key] != null) merged[key] = stored[key];
    }
  }
  // Env-Fallback nur wenn nicht in Config gesetzt
  if (merged.paymentTypeId == null) merged.paymentTypeId = readEnvDefault("PAYMENT_TYPE_ID");
  if (merged.bankAccountId == null) merged.bankAccountId = readEnvDefault("BANK_ACCOUNT_ID");
  if (merged.vatTaxId == null) merged.vatTaxId = readEnvDefault("VAT_TAX_ID");
  if (merged.userId == null) merged.userId = readEnvDefault("USER_ID") || 1;
  if (merged.ownerId == null) merged.ownerId = readEnvDefault("OWNER_ID") || 1;
  return merged;
}

function validateBexioConfig(config) {
  const missing = REQUIRED_KEYS.filter((k) => !asPositiveInteger(config[k]));
  if (missing.length === 0) return null;
  return (
    `bexio-Konfiguration unvollstaendig (fehlt: ${missing.join(", ")}). ` +
    `Bitte unter app_settings Key 'integration.bexio.config' eintragen ` +
    `oder als Env BEXIO_DEFAULT_${missing[0].replace(/[A-Z]/g, "_$&").toUpperCase()} setzen.`
  );
}

// ─── Contact-ID-Resolver ─────────────────────────────────────────────────────
// Reihenfolge:
//   1. customers.bexio_contact_id (Cache)
//   2. Suche in bexio per EXXAS-ID-Marker (bexio-import-exxas-contacts.js Konvention)
//   3. Suche per E-Mail in bexio
// Kein Fund → klare Fehlermeldung.

async function searchBexioContactByExxasId(bexioBase, bexioToken, exxasCustomerId) {
  const id = asTrimmedString(exxasCustomerId);
  if (!id) return null;
  const marker = `EXXAS-ID:${id}`;
  // bexio /2.0/contact/search akzeptiert "remarks" nicht als Such-Feld (HTTP 400
  // "search parameters could not have been applied: remarks"). Wir versuchen die
  // POST-Search trotzdem (falls sich die API mal ändert), behandeln Fehler aber
  // als "nicht gefunden" und lassen den Resolver zur E-Mail-Suche durchfallen.
  const url = `${bexioBase}/2.0/contact/search`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bexioToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ field: "remarks", value: marker, criteria: "like" }]),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn(`[bexio-sales-order] EXXAS-Marker-Suche Netz-/Timeout-Fehler: ${e.message}`);
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[bexio-sales-order] EXXAS-Marker-Suche bexio ${res.status} (kein Hard-Fail, faellt zu E-Mail-Suche durch): ${text.slice(0, 200)}`);
    return null;
  }
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  for (const row of rows) {
    if (String(row?.remarks || "").includes(marker)) return Number(row.id);
  }
  return null;
}

async function searchBexioContactByEmail(bexioBase, bexioToken, email) {
  const norm = asTrimmedString(email).toLowerCase();
  if (!norm) return null;
  const url = `${bexioBase}/2.0/contact/search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bexioToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ field: "mail", value: norm, criteria: "=" }]),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`bexio contact/search ${res.status}: ${text.slice(0, 200)}`);
  }
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  // Bevorzuge Firma (contact_type_id=1), sonst ersten Treffer
  const firm = rows.find((r) => Number(r?.contact_type_id) === 1);
  return Number((firm || rows[0]).id);
}

async function resolveBexioContactId({ order, db, bexioBase, bexioToken }) {
  // 1. Cache auf order/customer
  const direct = asTrimmedString(order?.bexioContactId || order?.bexio_contact_id);
  if (direct) return { value: Number(direct), source: "order" };

  if (db && typeof db.getCustomerById === "function" && order?.customerId) {
    const customer = await db.getCustomerById(order.customerId).catch(() => null);
    const cached = asTrimmedString(customer?.bexio_contact_id || customer?.bexioContactId);
    if (cached) return { value: Number(cached), source: "customer-cache", customerId: customer.id };
  }

  // 2. EXXAS-Marker (Brücke über bexio-import-exxas-contacts.js)
  const exxasCustomerId = asTrimmedString(order?.exxasCustomerId);
  if (exxasCustomerId) {
    const found = await searchBexioContactByExxasId(bexioBase, bexioToken, exxasCustomerId);
    if (found) return { value: found, source: "exxas-marker", exxasCustomerId };
  }

  // 3. E-Mail-Suche
  const candidates = [
    order?.billing?.email,
    order?.customerEmail,
    order?.customerContactEmail,
  ]
    .map(asTrimmedString)
    .filter(Boolean);
  for (const mail of candidates) {
    const found = await searchBexioContactByEmail(bexioBase, bexioToken, mail);
    if (found) return { value: found, source: "email", email: mail };
  }

  return {
    value: null,
    source: "missing",
    error:
      "bexio-Kontakt nicht gefunden. Lege den Kunden zuerst in bexio an oder setze " +
      "customers.bexio_contact_id manuell in der DB.",
  };
}

// ─── Body-Builder ────────────────────────────────────────────────────────────

function renderTemplate(template, vars) {
  return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

function buildBexioOrderBody({ order, contactId, config }) {
  const headerVars = {
    address: asTrimmedString(order?.address) || asTrimmedString(order?.billing?.street) || "Ohne Adresse",
    orderNo: asTrimmedString(order?.orderNo),
  };
  const header = renderTemplate(config.headerTemplate || DEFAULT_CONFIG.headerTemplate, headerVars).slice(0, 250);
  const footer = renderTemplate(config.footerTemplate || "", headerVars);

  const today = new Date().toISOString().slice(0, 10);

  return {
    title: header,
    contact_id: Number(contactId),
    user_id: Number(config.userId) || 1,
    // owner_id wird vom bexio /2.0/kb_order Endpunkt nicht akzeptiert
    // ("Unexpected extra form field named owner_id"). config.ownerId bleibt
    // im Settings-Schema fuer kuenftige Endpunkte, aber nicht im Body.
    currency_id: Number(config.currencyId) || 1,
    language_id: Number(config.languageId) || 1,
    payment_type_id: Number(config.paymentTypeId),
    bank_account_id: Number(config.bankAccountId),
    mwst_type: Number(config.mwstType ?? 0),
    mwst_is_net: Boolean(config.mwstIsNet),
    is_valid_from: today,
    api_reference: `propus-${headerVars.orderNo}`,
    header: footer ? `${header}\n\n${footer}` : header,
  };
}

// ─── Positions-Builder ───────────────────────────────────────────────────────
// Erzeugt eine Liste von KbPositionCustom-Bodies aus Propus services + pricing.
// Diese werden NACH der Order-Anlage einzeln gepostet (bexio-Konvention).

function buildBexioPositions({ order, config }) {
  const services = order?.services || {};
  const positions = [];
  const taxId = Number(config.vatTaxId);

  function addCustomLine({ text, amount, quantity = 1 }) {
    if (!text) return;
    positions.push({
      type: "KbPositionCustom",
      amount: String(Number(amount || 0).toFixed(2)),
      unit_price: String(Number(amount || 0).toFixed(2)),
      text: String(text).slice(0, 1000),
      quantity: String(Number(quantity || 1).toFixed(2)),
      tax_id: taxId,
      discount_in_percent: "0",
    });
  }

  // Package
  if (services.package) {
    const label = asTrimmedString(services.package.label) || asTrimmedString(services.package.key) || "Service";
    addCustomLine({ text: label, amount: services.package.price });
  }

  // Addons
  const addons = Array.isArray(services.addons) ? services.addons : [];
  for (const addon of addons) {
    const label = asTrimmedString(addon.label) || asTrimmedString(addon.id) || "Addon";
    addCustomLine({ text: label, amount: addon.price });
  }

  // Discount (als negative Sondermenge, falls vorhanden)
  const discount = Number(order?.pricing?.discount || 0);
  if (discount > 0) {
    addCustomLine({ text: "Rabatt", amount: -Math.abs(discount) });
  }

  return positions;
}

// ─── HTTP-Helper ─────────────────────────────────────────────────────────────

async function postBexio({ bexioBase, bexioToken, path, body, timeoutMs = 20_000 }) {
  const res = await fetch(`${bexioBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bexioToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const snippet = typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300);
    const err = new Error(`bexio POST ${path} → ${res.status}: ${snippet}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

module.exports = {
  DEFAULT_CONFIG,
  loadBexioConfig,
  validateBexioConfig,
  resolveBexioContactId,
  buildBexioOrderBody,
  buildBexioPositions,
  postBexio,
};
