/**
 * Exxas API – Rechnung erstellen, senden, Status abfragen, Abo verlängern.
 * Pfade: /api/v2/contracts (bekannt), Rechnungen/Invoices – Exxas-Doku erforderlich.
 */

const { pool } = require('./db');
const DEFAULT_EXXAS_BASE = 'https://api.exxas.net';
const EXXAS_SETTINGS_KEY = 'integration.exxas.config';
const EXXAS_RUNTIME_CACHE_MS = 60 * 1000;
const EXXAS_SYSTEM_ID = process.env.EXXAS_SYSTEM_ID || 'AEB09398B50466ED58A95AF1730D1C2D';
const EXXAS_INVENTORY_PAGE_SIZE = 100;
let exxasRuntimeConfigCache = { at: 0, config: null };
const { getExxasContractId, getTourObjectLabel } = require('./normalize');

function normalizeExxasBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function deriveBaseUrlFromEndpoint(endpoint) {
  const raw = String(endpoint || '').trim();
  if (!raw) return '';
  const withoutQuery = raw.split('?')[0];
  const marker = withoutQuery.indexOf('/api/v2/');
  if (marker >= 0) {
    return withoutQuery.slice(0, marker + '/api/v2'.length);
  }
  return withoutQuery.replace(/\/$/, '');
}

function buildExxasCloudUrl(config, endpoint) {
  const systemId = EXXAS_SYSTEM_ID;
  const path = String(endpoint || '').trim();
  return `https://api.exxas.net/cloud/${systemId}/api/v2${path.startsWith('/') ? path : `/${path}`}`;
}

function buildExxasUrl(baseUrl, endpoint) {
  const base = normalizeExxasBaseUrl(baseUrl || DEFAULT_EXXAS_BASE);
  const path = String(endpoint || '').trim();
  if (!path) return base;
  if (base.endsWith('/api/v2') && path === '/api/v2') return base;
  if (base.endsWith('/api/v2') && path.startsWith('/api/v2/')) {
    return `${base}${path.slice('/api/v2'.length)}`;
  }
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function loadStoredExxasConfig() {
  const sources = [
    {
      label: 'tour_manager.settings',
      query: `SELECT value FROM tour_manager.settings WHERE key = 'exxas_runtime_config' LIMIT 1`,
      valueField: 'value',
      params: [],
    },
    {
      label: 'booking.app_settings',
      query: `SELECT value_json FROM booking.app_settings WHERE key = $1 LIMIT 1`,
      valueField: 'value_json',
      params: [EXXAS_SETTINGS_KEY],
    },
  ];
  for (const source of sources) {
    try {
      const result = await pool.query(source.query, source.params);
      const value = result.rows[0]?.[source.valueField];
      if (value && typeof value === 'object') return value;
    } catch (e) {
      console.warn(`Exxas loadStoredExxasConfig (${source.label}):`, e.message);
    }
  }
  return null;
}

function invalidateRuntimeConfigCache() {
  exxasRuntimeConfigCache = { at: 0, config: null };
}

async function getExxasRuntimeConfig(force = false) {
  if (force) invalidateRuntimeConfigCache();
  const now = Date.now();
  if (!force && exxasRuntimeConfigCache.config && now - exxasRuntimeConfigCache.at < EXXAS_RUNTIME_CACHE_MS) {
    return exxasRuntimeConfigCache.config;
  }
  const stored = await loadStoredExxasConfig();
  const envApiKey = String(process.env.EXXAS_API_TOKEN || process.env.EXXAS_API_KEY || process.env.EXXAS_JWT || '').trim();
  const envBaseUrl = String(process.env.EXXAS_BASE_URL || '').trim();
  const envAppPassword = String(process.env.EXXAS_APP_PASSWORD || '').trim();
  const envAuthMode = String(process.env.EXXAS_AUTH_MODE || '').trim().toLowerCase() === 'bearer' ? 'bearer' : 'apiKey';
  const config = {
    apiKey: envApiKey || String(stored?.apiKey || '').trim(),
    appPassword: envAppPassword || String(stored?.appPassword || '').trim(),
    authMode: envApiKey || envAppPassword || envBaseUrl
      ? envAuthMode
      : (String(stored?.authMode || '').trim().toLowerCase() === 'bearer' ? 'bearer' : 'apiKey'),
    baseUrl: normalizeExxasBaseUrl(
      envBaseUrl
      || deriveBaseUrlFromEndpoint(stored?.endpoint)
      || DEFAULT_EXXAS_BASE
    ),
  };
  exxasRuntimeConfigCache = { at: now, config };
  return config;
}

function hasExxasApiKey(config) {
  return !!String(config?.apiKey || '').trim();
}

function getMissingExxasTokenError() {
  return 'EXXAS_API_TOKEN nicht gesetzt';
}

function getHeaders(config, options = {}) {
  const { includeContentType = true } = options;
  const headers = {
    'Accept': 'application/json',
  };
  if (includeContentType) headers['Content-Type'] = 'application/json';
  if (hasExxasApiKey(config)) {
    headers.Authorization = config.authMode === 'bearer'
      ? `Bearer ${config.apiKey}`
      : `ApiKey ${config.apiKey}`;
  }
  if (config?.appPassword) headers['X-App-Password'] = config.appPassword;
  return headers;
}

async function exxasRequest(endpoint, options = {}) {
  const { method = 'GET', body = null, timeoutMs = 10000 } = options;
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) {
    return { ok: false, status: 0, data: { error: getMissingExxasTokenError() } };
  }
  const res = await fetch(buildExxasUrl(config.baseUrl, endpoint), {
    method,
    headers: getHeaders(config),
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

function firstFilled(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function normalizeExxasDate(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const swissMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (swissMatch) {
    const [, day, month, year] = swissMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function normalizeExxasAmount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  let normalized = raw.replace(/\s+/g, '').replace(/CHF/ig, '');
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function extractArrayPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.message)) return data.message;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function mapInvoicePayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = (raw.message && typeof raw.message === 'object' && !Array.isArray(raw.message))
    ? raw.message
    : raw;
  const invoiceRef = extractInvoiceReference(payload, payload?.id ?? raw?.id ?? null);
  const customer = payload.customer && typeof payload.customer === 'object' ? payload.customer : null;
  const debtor = payload.debtor && typeof payload.debtor === 'object' ? payload.debtor : null;
  const customerName = firstFilled(
    payload.kunde_name,
    payload.kundeName,
    payload.customer_name,
    payload.customerName,
    payload.ad_firmenname,
    payload.ad_vorname,
    payload.firmenname,
    payload.suchname,
    customer?.name,
    customer?.firmenname,
    debtor?.name,
    [payload.vorname, payload.nachname].filter(Boolean).join(' ').trim(),
    [customer?.vorname, customer?.nachname].filter(Boolean).join(' ').trim(),
  );
  const invoiceNumber = firstFilled(
    invoiceRef.number,
    payload.nummer,
    payload.rechnungsnummer,
    payload.invoiceNumber,
    payload.invoice_no,
  );
  const externalId = firstFilled(invoiceRef.id, payload.exxas_document_id, payload.documentId, invoiceNumber);
  return {
    id: externalId != null ? String(externalId) : null,
    exxas_document_id: externalId != null ? String(externalId) : null,
    typ: firstFilled(payload.typ, payload.type),
    nummer: invoiceNumber != null ? String(invoiceNumber) : null,
    kunde_name: customerName != null ? String(customerName) : null,
    bezeichnung: firstFilled(
      payload.bezeichnung,
      payload.betreff,
      payload.description,
      payload.beschreibung,
      payload.title,
      payload.name,
    ),
    ref_kunde: firstFilled(
      payload.ref_kunde,
      payload.kunde_id,
      payload.customer_id,
      payload.customerId,
      payload.debtor_id,
      customer?.id,
      customer?.nummer,
    ),
    ref_vertrag: firstFilled(
      payload.ref_vertrag,
      payload.ref_abo,
      payload.aboId,
      payload.subscriptionId,
      payload.contractId,
      payload.contract_id,
    ),
    exxas_status: firstFilled(payload.status, payload.exxas_status, payload.invoiceStatus, payload.invoice_status),
    sv_status: firstFilled(payload.sv_status, payload.svStatus),
    zahlungstermin: normalizeExxasDate(
      firstFilled(payload.zahlungstermin, payload.faelligkeit, payload.faellig_am, payload.dueDate, payload.due_at)
    ),
    dok_datum: normalizeExxasDate(
      firstFilled(payload.dok_datum, payload.rechnungsdatum, payload.invoiceDate, payload.created_at, payload.datum)
    ),
    preis_brutto: normalizeExxasAmount(
      firstFilled(payload.preis_brutto, payload.preisBrutto, payload.brutto, payload.betrag, payload.totalGross, payload.amount)
    ),
    raw: payload,
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
    const { ok, data } = await exxasRequest(`/api/v2/documents/${exxasInvoiceId}`);
    if (ok && data?.status) return { status: data.status };
    if (ok && data?.bezahlt) return { status: data.bezahlt ? 'paid' : 'open' };
  } catch (e) {
    console.warn('Exxas getInvoiceStatus:', e.message);
  }
  return { status: 'unknown' };
}

async function getInvoiceDetails(exxasInvoiceId) {
  try {
    const { ok, data } = await exxasRequest(`/api/v2/documents/${exxasInvoiceId}`);
    const invoiceRef = extractInvoiceReference(data, exxasInvoiceId);
    const payload = (data && typeof data === 'object' && data.message && typeof data.message === 'object')
      ? data.message
      : data;
    const invoice = mapInvoicePayload(data);
    if (ok) {
      return {
        success: true,
        id: invoiceRef.id,
        number: invoiceRef.number,
        status: payload?.status || (payload?.bezahlt ? 'paid' : 'open') || 'unknown',
        invoice,
        raw: data,
      };
    }
  } catch (e) {
    console.warn('Exxas getInvoiceDetails:', e.message);
  }
  return {
    success: false,
    id: exxasInvoiceId ? String(exxasInvoiceId) : null,
    number: null,
    status: 'unknown',
    invoice: null,
  };
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
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) {
    return { success: false, error: getMissingExxasTokenError() };
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
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) {
    return { success: false, error: getMissingExxasTokenError() };
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
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) {
    return { success: false, error: getMissingExxasTokenError() };
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
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) return { customers: [], error: getMissingExxasTokenError() };
  const q = (query || '').trim();
  if (q.length < 2) return { customers: [], error: 'Suchanfrage zu kurz (min. 2 Zeichen)' };

  try {
    const res = await fetch(buildExxasUrl(config.baseUrl, '/api/v2/customers'), {
      headers: getHeaders(config, { includeContentType: false }),
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

const EXXAS_INVOICE_CACHE_MS = 60 * 1000;
const EXXAS_INVOICE_PAGE_SIZE = 1000;
let exxasInvoiceListCache = { at: 0, rows: null, error: null };

async function fetchExxasInvoicesRawList() {
  const now = Date.now();
  if (exxasInvoiceListCache.rows && now - exxasInvoiceListCache.at < EXXAS_INVOICE_CACHE_MS) {
    return { ok: true, rows: exxasInvoiceListCache.rows, error: exxasInvoiceListCache.error };
  }
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) {
    exxasInvoiceListCache = { at: now, rows: [], error: getMissingExxasTokenError() };
    return { ok: false, rows: [], error: exxasInvoiceListCache.error };
  }
  try {
    const allRows = [];
    let offset = 0;
    let lastError = null;
    // Alle Seiten laden (API gibt max. 1000 Dokumente pro Request zurück)
    for (let page = 0; page < 10; page++) {
      const url = buildExxasUrl(config.baseUrl, `/api/v2/documents?limit=${EXXAS_INVOICE_PAGE_SIZE}&offset=${offset}`);
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, {
        headers: getHeaders(config, { includeContentType: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        lastError = `Exxas API: HTTP ${res.status}`;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      const data = await res.json().catch(() => ({}));
      const rows = extractArrayPayload(data);
      if (!rows || rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < EXXAS_INVOICE_PAGE_SIZE) break;
      offset += EXXAS_INVOICE_PAGE_SIZE;
    }
    if (allRows.length === 0 && lastError) {
      exxasInvoiceListCache = { at: now, rows: [], error: lastError };
      return { ok: false, rows: [], error: lastError };
    }
    exxasInvoiceListCache = { at: now, rows: allRows, error: null };
    return { ok: true, rows: allRows, error: null };
  } catch (e) {
    const err = e.name === 'TimeoutError' ? 'Exxas API Timeout' : e.message;
    console.warn('Exxas fetchExxasInvoicesRawList:', err);
    exxasInvoiceListCache = { at: now, rows: [], error: err };
    return { ok: false, rows: [], error: err };
  }
}

async function searchInvoices(query, options = {}) {
  const { limit = 30, openOnly = false } = options;
  const { rows, error } = await fetchExxasInvoicesRawList();
  if (error && !rows?.length) return { invoices: [], error };
  const q = String(query || '').trim().toLowerCase();
  let invoices = (rows || [])
    .map((row) => mapInvoicePayload(row))
    .filter((row) => row?.id || row?.nummer)
    .filter((row) => String(row?.typ || '').trim().toLowerCase() === 'r');
  if (openOnly) {
    invoices = invoices.filter((row) => {
      const status = String(row.exxas_status || '').trim().toLowerCase();
      return !['bz', 'bezahlt', 'paid'].includes(status);
    });
  }
  if (q) {
    invoices = invoices.filter((row) => ([
      row.id,
      row.exxas_document_id,
      row.nummer,
      row.kunde_name,
      row.bezeichnung,
      row.ref_kunde,
      row.ref_vertrag,
    ].some((value) => String(value || '').toLowerCase().includes(q))));
  }
  invoices = invoices
    .sort((a, b) => {
      const aDate = new Date(a.zahlungstermin || a.dok_datum || '1970-01-01').getTime();
      const bDate = new Date(b.zahlungstermin || b.dok_datum || '1970-01-01').getTime();
      if (aDate !== bDate) return bDate - aDate;
      return String(b.nummer || b.id || '').localeCompare(String(a.nummer || a.id || ''));
    })
    .slice(0, Math.max(1, limit));
  return { invoices, error: error || null };
}

/** API liefert die gesamte Kontaktliste; zwischengespeichert, damit Portal-Zugriff nicht bei jedem Request neu lädt. */
const EXXAS_CONTACTS_CACHE_MS = 5 * 60 * 1000;
let exxasContactsListCache = { at: 0, rows: null, error: null };

async function fetchExxasContactsRawList() {
  const now = Date.now();
  if (exxasContactsListCache.rows && now - exxasContactsListCache.at < EXXAS_CONTACTS_CACHE_MS) {
    return { ok: true, rows: exxasContactsListCache.rows, error: exxasContactsListCache.error };
  }
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) {
    exxasContactsListCache = { at: now, rows: [], error: getMissingExxasTokenError() };
    return { ok: false, rows: [], error: exxasContactsListCache.error };
  }
  try {
    const res = await fetch(buildExxasUrl(config.baseUrl, '/api/v2/contacts'), {
      headers: getHeaders(config, { includeContentType: false }),
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
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) return { customer: null, error: getMissingExxasTokenError() };
  const key = String(customerId || '').trim();
  if (!key) return { customer: null, error: 'Keine Kunden-ID' };
  const hit = exxasCustomerCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < EXXAS_CUSTOMER_CACHE_MS) {
    return { customer: hit.customer, error: hit.error };
  }
  try {
    const res = await fetch(buildExxasUrl(config.baseUrl, `/api/v2/customers/${encodeURIComponent(key)}`), {
      headers: getHeaders(config, { includeContentType: false }),
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

/**
 * Lädt alle Exxas-Kundenanlagen (Inventory) paginiert und sucht jene,
 * deren optional1 die gegebene Matterport Space-ID enthält.
 * Gibt { inventory, error } zurück; inventory ist null falls nicht gefunden.
 */
async function getInventoryByMatterportId(spaceId) {
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) {
    return { inventory: null, error: getMissingExxasTokenError() };
  }
  if (!spaceId) return { inventory: null, error: 'Keine Matterport Space-ID angegeben' };
  try {
    let offset = 0;
    for (let page = 0; page < 20; page++) {
      const url = buildExxasCloudUrl(config, `/inventory?limit=${EXXAS_INVENTORY_PAGE_SIZE}&offset=${offset}`);
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, {
        headers: getHeaders(config, { includeContentType: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { inventory: null, error: `Exxas Inventory API: HTTP ${res.status}` };
      }
      // eslint-disable-next-line no-await-in-loop
      const data = await res.json().catch(() => ({}));
      const rows = extractArrayPayload(data);
      if (!rows || rows.length === 0) break;
      const match = rows.find((row) => {
        const link = String(row.optional1 || '').trim();
        return link && link.includes(spaceId);
      });
      if (match) return { inventory: match, error: null };
      if (rows.length < EXXAS_INVENTORY_PAGE_SIZE) break;
      offset += EXXAS_INVENTORY_PAGE_SIZE;
    }
    return { inventory: null, error: null };
  } catch (e) {
    const err = e.name === 'TimeoutError' ? 'Exxas Inventory API Timeout' : e.message;
    console.warn('Exxas getInventoryByMatterportId:', err);
    return { inventory: null, error: err };
  }
}

/**
 * Lädt alle Exxas-Kundenanlagen (Inventory) eines Kunden per ref_kunde.
 * Gibt { inventories, error } zurück.
 */
async function getInventoryByCustomer(exxasCustomerId) {
  const config = await getExxasRuntimeConfig();
  if (!hasExxasApiKey(config)) {
    return { inventories: [], error: getMissingExxasTokenError() };
  }
  if (!exxasCustomerId) return { inventories: [], error: 'Keine Exxas-Kunden-ID angegeben' };
  try {
    const all = [];
    let offset = 0;
    for (let page = 0; page < 20; page++) {
      const url = buildExxasCloudUrl(
        config,
        `/inventory?limit=${EXXAS_INVENTORY_PAGE_SIZE}&offset=${offset}&ref_kunde=${encodeURIComponent(exxasCustomerId)}`
      );
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, {
        headers: getHeaders(config, { includeContentType: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { inventories: all, error: `Exxas Inventory API: HTTP ${res.status}` };
      }
      // eslint-disable-next-line no-await-in-loop
      const data = await res.json().catch(() => ({}));
      const rows = extractArrayPayload(data);
      if (!rows || rows.length === 0) break;
      all.push(...rows);
      if (rows.length < EXXAS_INVENTORY_PAGE_SIZE) break;
      offset += EXXAS_INVENTORY_PAGE_SIZE;
    }
    return { inventories: all, error: null };
  } catch (e) {
    const err = e.name === 'TimeoutError' ? 'Exxas Inventory API Timeout' : e.message;
    console.warn('Exxas getInventoryByCustomer:', err);
    return { inventories: [], error: err };
  }
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
  searchInvoices,
  searchCustomers,
  getCustomer,
  resolveCustomerIdentity,
  getContactsForCustomer,
  invalidateRuntimeConfigCache,
  fetchExxasInvoicesRawList,
  mapInvoicePayload,
  getInventoryByMatterportId,
  getInventoryByCustomer,
};
