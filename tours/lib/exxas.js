/**
 * Exxas API – Rechnung erstellen, senden, Status abfragen, Abo verlängern.
 * Pfade: /api/v2/contracts (bekannt), Rechnungen/Invoices – Exxas-Doku erforderlich.
 */

const EXXAS_BASE = (process.env.EXXAS_BASE_URL || 'https://api.exxas.net').replace(/\/$/, '');
const EXXAS_TOKEN = process.env.EXXAS_API_TOKEN || '';
const { getExxasContractId, getTourObjectLabel } = require('./normalize');

function getHeaders() {
  return {
    'Authorization': `ApiKey ${EXXAS_TOKEN}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

async function exxasRequest(endpoint, options = {}) {
  const { method = 'GET', body = null, timeoutMs = 10000 } = options;
  const res = await fetch(`${EXXAS_BASE}${endpoint}`, {
    method,
    headers: getHeaders(),
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function tryExxasActions(actionLabel, attempts) {
  const errors = [];
  for (const attempt of attempts) {
    try {
      const result = await exxasRequest(attempt.endpoint, {
        method: attempt.method,
        body: attempt.body,
        timeoutMs: attempt.timeoutMs || 10000,
      });
      if (result.ok) {
        return {
          success: true,
          endpoint: attempt.endpoint,
          method: attempt.method,
          raw: result.data,
        };
      }
      errors.push(`${attempt.method} ${attempt.endpoint}: HTTP ${result.status}`);
    } catch (e) {
      if (e.name === 'TimeoutError') {
        errors.push(`${attempt.method} ${attempt.endpoint}: Timeout`);
      } else {
        errors.push(`${attempt.method} ${attempt.endpoint}: ${e.message}`);
      }
    }
  }
  return {
    success: false,
    error: `${actionLabel} in Exxas fehlgeschlagen. Bitte API-Pfad prüfen oder manuell in Exxas erledigen.`,
    attempts: errors,
  };
}

function extractInvoiceReference(data, fallbackId = null) {
  const payload = (data && typeof data === 'object' && data.message && typeof data.message === 'object')
    ? data.message
    : data;
  const idValue = payload?.id ?? data?.id ?? fallbackId ?? null;
  const numberValue = payload?.nummer
    ?? payload?.rechnungsnummer
    ?? payload?.invoiceNumber
    ?? data?.nummer
    ?? data?.rechnungsnummer
    ?? data?.invoiceNumber
    ?? null;

  return {
    id: idValue != null ? String(idValue) : null,
    number: numberValue != null ? String(numberValue) : null,
  };
}

async function createInvoice(tour, amount, periodStart, periodEnd) {
  try {
    const body = {
      aboId: getExxasContractId(tour),
      bezeichnung: getTourObjectLabel(tour),
      periodStart: periodStart?.toISOString?.()?.slice(0, 10),
      periodEnd: periodEnd?.toISOString?.()?.slice(0, 10),
      betrag: amount,
    };
    const { ok, data } = await exxasRequest('/api/v2/rechnungen', {
      method: 'POST',
      body,
    });
    const invoiceRef = extractInvoiceReference(data);
    if (ok && invoiceRef.id) {
      return { id: invoiceRef.id, number: invoiceRef.number, success: true };
    }
  } catch (e) {
    console.warn('Exxas createInvoice:', e.message);
  }
  return { id: null, success: false, error: 'Exxas invoice API – Pfad prüfen' };
}

async function sendInvoice(exxasInvoiceId) {
  try {
    const { ok } = await exxasRequest(`/api/v2/rechnungen/${exxasInvoiceId}/send`, {
      method: 'POST',
    });
    if (ok) return { success: true };
  } catch (e) {
    console.warn('Exxas sendInvoice:', e.message);
  }
  return { success: false };
}

async function getInvoiceStatus(exxasInvoiceId) {
  try {
    const { ok, data } = await exxasRequest(`/api/v2/rechnungen/${exxasInvoiceId}`);
    if (ok && data?.status) return { status: data.status };
    if (ok && data?.bezahlt) return { status: data.bezahlt ? 'paid' : 'open' };
  } catch (e) {
    console.warn('Exxas getInvoiceStatus:', e.message);
  }
  return { status: 'unknown' };
}

async function getInvoiceDetails(exxasInvoiceId) {
  try {
    const { ok, data } = await exxasRequest(`/api/v2/rechnungen/${exxasInvoiceId}`);
    const invoiceRef = extractInvoiceReference(data, exxasInvoiceId);
    const payload = (data && typeof data === 'object' && data.message && typeof data.message === 'object')
      ? data.message
      : data;
    if (ok) {
      return {
        success: true,
        id: invoiceRef.id,
        number: invoiceRef.number,
        status: payload?.status || (payload?.bezahlt ? 'paid' : 'open') || 'unknown',
        raw: data,
      };
    }
  } catch (e) {
    console.warn('Exxas getInvoiceDetails:', e.message);
  }
  return { success: false, id: exxasInvoiceId ? String(exxasInvoiceId) : null, number: null, status: 'unknown' };
}

async function extendSubscription(exxasSubscriptionId, months = 6) {
  try {
    const { ok } = await exxasRequest(`/api/v2/contracts/${exxasSubscriptionId}/extend`, {
      method: 'POST',
      body: { months },
    });
    if (ok) return { success: true };
  } catch (e) {
    console.warn('Exxas extendSubscription:', e.message);
  }
  return { success: false };
}

async function cancelSubscription(exxasSubscriptionId) {
  if (!EXXAS_TOKEN) {
    return { success: false, error: 'EXXAS_API_TOKEN nicht gesetzt' };
  }
  if (!exxasSubscriptionId) {
    return { success: false, error: 'Exxas-Abo/Vertrag fehlt' };
  }
  return tryExxasActions('Abo-Deaktivierung', [
    { method: 'DELETE', endpoint: `/api/v2/contracts/${encodeURIComponent(exxasSubscriptionId)}` },
    { method: 'POST', endpoint: `/api/v2/contracts/${encodeURIComponent(exxasSubscriptionId)}/cancel`, body: {} },
    { method: 'POST', endpoint: `/api/v2/contracts/${encodeURIComponent(exxasSubscriptionId)}/deactivate`, body: {} },
    { method: 'PATCH', endpoint: `/api/v2/contracts/${encodeURIComponent(exxasSubscriptionId)}`, body: { status: 'inactive' } },
    { method: 'PATCH', endpoint: `/api/v2/contracts/${encodeURIComponent(exxasSubscriptionId)}`, body: { active: false } },
  ]);
}

async function cancelInvoice(exxasInvoiceId) {
  if (!EXXAS_TOKEN) {
    return { success: false, error: 'EXXAS_API_TOKEN nicht gesetzt' };
  }
  if (!exxasInvoiceId) {
    return { success: false, error: 'Exxas-Rechnung fehlt' };
  }
  return tryExxasActions('Rechnungsstorno', [
    { method: 'POST', endpoint: `/api/v2/rechnungen/${encodeURIComponent(exxasInvoiceId)}/storno`, body: {} },
    { method: 'POST', endpoint: `/api/v2/rechnungen/${encodeURIComponent(exxasInvoiceId)}/cancel`, body: {} },
    { method: 'PATCH', endpoint: `/api/v2/rechnungen/${encodeURIComponent(exxasInvoiceId)}`, body: { status: 'cancelled' } },
    { method: 'PATCH', endpoint: `/api/v2/rechnungen/${encodeURIComponent(exxasInvoiceId)}`, body: { storniert: true } },
  ]);
}

async function deactivateCustomer(exxasCustomerId) {
  if (!EXXAS_TOKEN) {
    return { success: false, error: 'EXXAS_API_TOKEN nicht gesetzt' };
  }
  if (!exxasCustomerId) {
    return { success: false, error: 'Exxas-Kunde fehlt' };
  }
  return tryExxasActions('Kunden-Deaktivierung', [
    { method: 'DELETE', endpoint: `/api/v2/customers/${encodeURIComponent(exxasCustomerId)}` },
    { method: 'POST', endpoint: `/api/v2/customers/${encodeURIComponent(exxasCustomerId)}/deactivate`, body: {} },
    { method: 'PATCH', endpoint: `/api/v2/customers/${encodeURIComponent(exxasCustomerId)}`, body: { aktiv: '0' } },
    { method: 'PATCH', endpoint: `/api/v2/customers/${encodeURIComponent(exxasCustomerId)}`, body: { active: false } },
  ]);
}

/**
 * Sucht Kunden live in Exxas nach Name oder Kundennummer.
 * Gibt ein Array von Kunden-Objekten zurück: { id, firmenname, suchname, nummer, email }
 * Mindestlänge der Suchanfrage: 2 Zeichen.
 */
async function searchCustomers(query) {
  if (!EXXAS_TOKEN) return { customers: [], error: 'EXXAS_API_TOKEN nicht gesetzt' };
  const q = (query || '').trim();
  if (q.length < 2) return { customers: [], error: 'Suchanfrage zu kurz (min. 2 Zeichen)' };

  try {
    const res = await fetch(`${EXXAS_BASE}/api/v2/customers`, {
      headers: { Authorization: `ApiKey ${EXXAS_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { customers: [], error: `Exxas API: HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    const all = Array.isArray(data?.message) ? data.message : [];

    const ql = q.toLowerCase();
    const matches = all.filter((c) => {
      const name = ((c.firmenname || '') + ' ' + (c.suchname || '') + ' ' + (c.vorname || '') + ' ' + (c.nachname || '')).toLowerCase();
      const nummer = String(c.nummer || c.id || '').toLowerCase();
      return name.includes(ql) || nummer.includes(ql);
    });

    const customers = matches.slice(0, 30).map((c) => ({
      id: String(c.id || ''),
      nummer: String(c.nummer || c.id || ''),
      firmenname: (c.firmenname || c.suchname || '').trim() || (((c.vorname || '') + ' ' + (c.nachname || '')).trim()),
      email: (c.email || '').trim() || null,
    }));

    return { customers };
  } catch (e) {
    if (e.name === 'TimeoutError') return { customers: [], error: 'Exxas API Timeout' };
    console.warn('Exxas searchCustomers:', e.message);
    return { customers: [], error: e.message };
  }
}

/** API liefert die gesamte Kontaktliste; zwischengespeichert, damit Portal-Zugriff nicht bei jedem Request neu lädt. */
const EXXAS_CONTACTS_CACHE_MS = 5 * 60 * 1000;
let exxasContactsListCache = { at: 0, rows: null, error: null };

async function fetchExxasContactsRawList() {
  const now = Date.now();
  if (exxasContactsListCache.rows && now - exxasContactsListCache.at < EXXAS_CONTACTS_CACHE_MS) {
    return { ok: true, rows: exxasContactsListCache.rows, error: exxasContactsListCache.error };
  }
  if (!EXXAS_TOKEN) {
    exxasContactsListCache = { at: now, rows: [], error: 'EXXAS_API_TOKEN nicht gesetzt' };
    return { ok: false, rows: [], error: exxasContactsListCache.error };
  }
  try {
    const res = await fetch(`${EXXAS_BASE}/api/v2/contacts`, {
      headers: { Authorization: `ApiKey ${EXXAS_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = `Exxas API: HTTP ${res.status}`;
      exxasContactsListCache = { at: now, rows: [], error: err };
      return { ok: false, rows: [], error: err };
    }
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.message) ? data.message : [];
    exxasContactsListCache = { at: now, rows, error: null };
    return { ok: true, rows, error: null };
  } catch (e) {
    const err = e.name === 'TimeoutError' ? 'Exxas API Timeout' : e.message;
    console.warn('Exxas fetchExxasContactsRawList:', err);
    exxasContactsListCache = { at: now, rows: [], error: err };
    return { ok: false, rows: [], error: err };
  }
}

/**
 * Lädt alle Kontakte eines Exxas-Kunden per ref_kunde.
 * Gibt { contacts: [{ name, email, tel }], error } zurück.
 */
async function getContactsForCustomer(customerId) {
  const { rows, error } = await fetchExxasContactsRawList();
  if (error && !rows?.length) return { contacts: [], error };
  const id = String(customerId);
  const contacts = (rows || [])
    .filter((ct) => String(ct.ref_kunde || '') === id)
    .map((ct) => ({
      name: ((ct.kt_vorname || '') + ' ' + (ct.kt_nachname || '')).trim() || null,
      email: (ct.kt_email || '').trim() || null,
      tel: (ct.kt_mobile || ct.kt_direkt || '').trim() || null,
    }))
    .filter((ct) => ct.name || ct.email);
  return { contacts, error: error || null };
}

const EXXAS_CUSTOMER_CACHE_MS = 5 * 60 * 1000;
const exxasCustomerCache = new Map();

/**
 * Lädt einen einzelnen Exxas-Kunden per ID.
 * Gibt { customer, error } zurück.
 */
async function getCustomer(customerId) {
  if (!EXXAS_TOKEN) return { customer: null, error: 'EXXAS_API_TOKEN nicht gesetzt' };
  const key = String(customerId || '').trim();
  if (!key) return { customer: null, error: 'Keine Kunden-ID' };
  const hit = exxasCustomerCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < EXXAS_CUSTOMER_CACHE_MS) {
    return { customer: hit.customer, error: hit.error };
  }
  try {
    const res = await fetch(`${EXXAS_BASE}/api/v2/customers/${encodeURIComponent(key)}`, {
      headers: { Authorization: `ApiKey ${EXXAS_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = `Exxas API: HTTP ${res.status}`;
      exxasCustomerCache.set(key, { at: now, customer: null, error: err });
      return { customer: null, error: err };
    }
    const data = await res.json().catch(() => ({}));
    const c = data?.message || data;
    if (!c || !c.id) {
      exxasCustomerCache.set(key, { at: now, customer: null, error: 'Kein Kunde gefunden' });
      return { customer: null, error: 'Kein Kunde gefunden' };
    }
    const customer = {
      id: String(c.id),
      nummer: String(c.nummer || c.id),
      firmenname: (c.firmenname || c.suchname || '').trim() || (((c.vorname || '') + ' ' + (c.nachname || '')).trim()),
      email: (c.email || '').trim() || null,
      active: String(c.aktiv ?? c.active ?? '1') !== '0',
      raw: c,
    };
    exxasCustomerCache.set(key, { at: now, customer, error: null });
    return { customer, error: null };
  } catch (e) {
    const err = e.name === 'TimeoutError' ? 'Exxas API Timeout' : e.message;
    exxasCustomerCache.set(key, { at: now, customer: null, error: err });
    return { customer: null, error: err };
  }
}

async function resolveCustomerIdentity(customerRef, options = {}) {
  const ref = String(customerRef || '').trim();
  const customerEmail = String(options.customerEmail || '').trim().toLowerCase();
  const customerName = String(options.customerName || '').trim();
  if (!ref && !customerEmail && !customerName) {
    return { customer: null, error: 'Kein Exxas-Kundenhinweis vorhanden' };
  }

  if (ref) {
    const direct = await getCustomer(ref).catch(() => ({ customer: null, error: null }));
    if (direct?.customer?.id) return direct;

    const byRef = await searchCustomers(ref).catch(() => ({ customers: [] }));
    const exactRef = (byRef.customers || []).find((customer) => (
      String(customer.id || '').trim() === ref || String(customer.nummer || '').trim() === ref
    ));
    if (exactRef?.id) {
      const full = await getCustomer(exactRef.id).catch(() => ({ customer: null, error: null }));
      if (full?.customer?.id) return full;
      return {
        customer: {
          id: String(exactRef.id),
          nummer: String(exactRef.nummer || exactRef.id),
          firmenname: exactRef.firmenname || null,
          email: exactRef.email || null,
          active: true,
          raw: exactRef,
        },
      };
    }
  }

  if (customerName) {
    const byName = await searchCustomers(customerName).catch(() => ({ customers: [] }));
    const exactName = (byName.customers || []).find((customer) => {
      const sameEmail = customerEmail && String(customer.email || '').trim().toLowerCase() === customerEmail;
      const sameName = String(customer.firmenname || '').trim().toLowerCase() === customerName.toLowerCase();
      return sameEmail || sameName;
    });
    if (exactName?.id) {
      return getCustomer(exactName.id).catch(() => ({ customer: null, error: null }));
    }
  }

  return { customer: null, error: 'Exxas-Kunde konnte nicht sicher aufgelöst werden' };
}

module.exports = {
  createInvoice,
  sendInvoice,
  getInvoiceStatus,
  getInvoiceDetails,
  extendSubscription,
  cancelSubscription,
  cancelInvoice,
  deactivateCustomer,
  searchCustomers,
  getCustomer,
  resolveCustomerIdentity,
  getContactsForCustomer,
};
