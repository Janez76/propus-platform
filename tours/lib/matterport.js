/**
 * Matterport Model API – Models auflisten, Details, Archivieren/Reaktivieren.
 *
 * API-Referenz:
 *   - https://api.matterport.com/model/docs/reference
 *   - https://api.matterport.com/docs/reference
 *   - GraphQL-Schema: https://static.matterport.com/api-doc/.../reference/graphdoc/model/
 *   - GraphiQL: https://api.matterport.com/model/graphiql
 *
 * Auth: Basic base64(TokenID:TokenSecret)
 *   my.matterport.com → Einstellungen → «Verwaltung von API-Token» (Model API).
 *   Nicht verwechseln mit «SDK-Schlüsseln» für eingebettete Showcase-Ansichten.
 *
 * Env: MATTERPORT_TOKEN_ID, MATTERPORT_TOKEN_SECRET (oder MATTERPORT_API_KEY für Bearer-Fallback).
 * Zusätzlich: Admin → Einstellungen → Matterport API (tour_manager.settings), überschreibt/ergänzt .env.
 *
 * Model-Felder (GraphQL): id, name, state, created, modified, publication { url, address, ... }
 *   created/modified: DateTime (ISO 8601)
 *   state: active | inactive | processing | failed | pending | staging
 */

const { getMatterportApiCredentials } = require('./settings');

const MATTERPORT_BASE = 'https://api.matterport.com/api/models';

// Primärer GraphQL-Endpunkt; als Fallback der neuere /api/graphiql/-Proxy.
// https://api.matterport.com/model/graphiql ist die Browser-UI (kein API-Endpunkt).
const GRAPH_URLS = [
  `${MATTERPORT_BASE}/graph`,
  'https://api.matterport.com/api/graphiql/',
];

/** Kurz, wenn gar kein Authorization-Header gebaut werden kann */
const MSG_MISSING_CREDS =
  'MATTERPORT_TOKEN_ID und MATTERPORT_TOKEN_SECRET setzen (Werte aus «API-Token» in my.matterport.com, nicht der SDK-Schlüssel).';

/** Wenn HTTP 401/403 trotz gesetztem Header (falscher Typ, abgelaufen, nur Secret ohne ID) */
const MSG_AUTH_REJECTED =
  'Matterport lehnt die Anmeldung ab. Token-ID und Secret aus «Verwaltung von API-Token» verwenden (Basic Auth). SDK-Schlüssel für Showcase funktionieren für diese API nicht.';

let credsCache = null;
let credsCacheAt = 0;
const CREDS_TTL_MS = 30_000;

function invalidateMatterportCredentialsCache() {
  credsCache = null;
  credsCacheAt = 0;
}

async function resolveCredentials() {
  const now = Date.now();
  if (credsCache && now - credsCacheAt < CREDS_TTL_MS) {
    return credsCache;
  }
  let stored = { tokenId: '', tokenSecret: '' };
  try {
    stored = await getMatterportApiCredentials();
  } catch (e) {
    console.warn('Matterport resolveCredentials:', e.message);
  }
  const envId = process.env.MATTERPORT_TOKEN_ID || '';
  const envSecret = process.env.MATTERPORT_TOKEN_SECRET || process.env.MATTERPORT_API_KEY || '';
  credsCache = {
    tokenId: String(stored.tokenId || '').trim() || envId,
    tokenSecret: String(stored.tokenSecret || '').trim() || envSecret,
  };
  credsCacheAt = now;
  return credsCache;
}

async function getAuthHeader() {
  const { tokenId, tokenSecret } = await resolveCredentials();
  if (tokenId && tokenSecret) {
    const basic = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');
    return `Basic ${basic}`;
  }
  if (tokenSecret) {
    return `Bearer ${tokenSecret}`;
  }
  return null;
}

function allowsLinkWithoutVerify() {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MATTERPORT_LINK_WITHOUT_VERIFY || '').trim().toLowerCase()
  );
}

async function graphRequest(query, variables = {}) {
  const auth = await getAuthHeader();
  if (!auth) {
    return { data: null, errors: [{ message: MSG_MISSING_CREDS }] };
  }
  const body = JSON.stringify({ query, variables });
  const headers = {
    'Authorization': auth,
    'Content-Type': 'application/json',
  };
  let lastStatus = null;
  let lastBody = null;
  for (const url of GRAPH_URLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      clearTimeout(timeout);
      const raw = await res.text().catch(() => '');
      let data = {};
      try { data = JSON.parse(raw); } catch (_) { /* HTML oder leere Antwort */ }

      if (res.ok && !data.errors) return data;

      if (data.errors) {
        return { data: data.data, errors: data.errors };
      }

      if (res.status === 401 || res.status === 403) {
        return { data: null, errors: [{ message: MSG_AUTH_REJECTED }] };
      }

      // Andere HTTP-Fehler: merken und nächsten URL versuchen
      lastStatus = res.status;
      lastBody = raw.slice(0, 300);
      console.warn(`Matterport graphRequest ${url} → HTTP ${res.status}`, lastBody);
    } catch (e) {
      clearTimeout(timeout);
      lastBody = e.name === 'AbortError' ? 'Timeout nach 15 s' : e.message;
      console.warn('Matterport graphRequest', url, lastBody);
    }
  }
  const detail = lastStatus ? ` (HTTP ${lastStatus}: ${lastBody})` : (lastBody ? ` (${lastBody})` : '');
  return { data: null, errors: [{ message: `GraphQL request failed for all endpoints${detail}` }] };
}

async function listModels() {
  const all = [];
  let offset = null;
  const result = { results: [], totalResults: 0, error: null };
  if (!(await getAuthHeader())) {
    result.error = MSG_MISSING_CREDS;
    return result;
  }
  try {
    do {
      const offsetArg = offset != null ? `, offset: "${offset}"` : '';
      const gql = `query { models(query: "*", pageSize: 100${offsetArg}, include: [inactive], sortBy: [{field: created, order: desc}]) { totalResults results { id name description internalId state created } nextOffset } }`;
      const { data, errors } = await graphRequest(gql);
      if (errors?.length) {
        result.results = all;
        result.totalResults = all.length;
        result.error = errors[0]?.message || 'Unknown error';
        return result;
      }
      const m = data?.models;
      if (!m) {
        result.results = all;
        result.totalResults = all.length;
        return result;
      }
      all.push(...(m.results || []));
      offset = m.nextOffset;
    } while (offset != null);
    result.results = all;
    result.totalResults = all.length;
  } catch (e) {
    console.warn('Matterport listModels', e.message);
    result.results = all;
    result.totalResults = all.length;
    result.error = e.message;
  }
  return result;
}

async function getModel(modelId) {
  if (!(await getAuthHeader())) {
    return { model: null, error: MSG_MISSING_CREDS };
  }
  const gql = `query getModel($modelId: ID!) {
    model(id: $modelId) {
      id
      name
      state
      visibility
      accessVisibility
      description
      created
      modified
      publication {
        description
        summary
        address
        externalUrl
        presentedBy
        published
        url(branding: default)
      }
      options {
        defurnishViewEnabled
        defurnishViewOverride
        dollhouseEnabled
        dollhouseOverride
        floorplanEnabled
        floorplanOverride
        socialSharingEnabled
        socialSharingOverride
        vrEnabled
        vrOverride
        highlightReelEnabled
        highlightReelOverride
        labelsEnabled
        labelsOverride
        tourAutoplayEnabled
        tourAutoplayOverride
        roomBoundsEnabled
      }
      panoLocations {
        id
        label
        variant
        position { x y z }
      }
    }
  }`;
  const { data, errors } = await graphRequest(gql, { modelId });
  if (errors?.length) {
    const msg = errors[0]?.message || 'Unknown error';
    const code = (errors[0]?.extensions?.code || '').toString();

    // model.inactive: Matterport liefert keine publication-Felder für archivierte
    // Modelle, gibt aber die übrigen Modelldaten (state, options, …) zurück.
    // Wenn data.model vorhanden ist, geben wir es trotzdem zurück – publication
    // bleibt null, was im Frontend sauber behandelt wird.
    if (
      (code === 'model.inactive' || /model\.inactive/i.test(msg)) &&
      data?.model
    ) {
      return { model: data.model, error: null, inactiveWarning: true };
    }

    const lockedHint = /model\.locked|Unlock the developer license/i.test(msg) || code === 'model.locked'
      ? ' (Model durch Matterport Developer-Lizenz gesperrt – in my.matterport.com prüfen)'
      : '';
    return { model: null, error: msg + lockedHint };
  }
  return { model: data?.model || null, error: null };
}

async function archiveSpace(spaceId) {
  const auth = await getAuthHeader();
  if (!auth) {
    console.warn('MATTERPORT_TOKEN_ID/SECRET not set, skipping archive', spaceId);
    return { success: false };
  }
  try {
    const res = await fetch(`${MATTERPORT_BASE}/${spaceId}/archive`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) return { success: true };
    const { data } = await graphRequest(
      `mutation($id: ID!, $state: ModelStateChange!) { updateModelState(id: $id, state: $state) { id } }`,
      { id: spaceId, state: 'inactive' }
    );
    return { success: !!data?.updateModelState };
  } catch (e) {
    console.warn('Matterport archiveSpace', spaceId, e.message);
  }
  return { success: false };
}

async function unarchiveSpace(spaceId) {
  const auth = await getAuthHeader();
  if (!auth) {
    console.warn('MATTERPORT_TOKEN_ID/SECRET not set, skipping unarchive', spaceId);
    return { success: false };
  }
  try {
    const res = await fetch(`${MATTERPORT_BASE}/${spaceId}/unarchive`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) return { success: true };
    const { data, errors } = await graphRequest(
      `mutation($id: ID!, $state: ModelStateChange!, $allowActivate: Boolean) {
        updateModelState(id: $id, state: $state, allowActivate: $allowActivate) { id }
      }`,
      { id: spaceId, state: 'active', allowActivate: true }
    );
    return { success: !!data?.updateModelState, error: errors?.[0]?.message };
  } catch (e) {
    console.warn('Matterport unarchiveSpace', spaceId, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Gibt ein Set aller eigenen Matterport-Model-IDs zurück (inkl. archivierter).
 * Besser als getModel() pro Tour, da archivierte Spaces keinen Fehler auslösen.
 */
async function getOwnModelIds() {
  const result = await listModels();
  if (result.error) {
    return { ids: new Set(), error: result.error };
  }
  return { ids: new Set(result.results.map(m => m.id)), error: null };
}

/**
 * Datenschutz-Einstellung einer Tour ändern via updateModelAccessVisibility.
 *
 * ModelAccessVisibility Enum-Werte (Matterport GraphQL, lowercase):
 *   private   – nur Mitarbeiter des Kontos
 *   unlisted  – jeder mit Link (Nicht gelistet)
 *   public    – öffentlich + Suchmaschinen
 *   password  – passwortgeschützt (braucht zusätzlich password-Argument)
 *
 * Portal-Werte (UI) werden intern auf diese Enum-Werte gemappt:
 *   PRIVATE  → private
 *   LINK_ONLY → unlisted
 *   PUBLIC   → public
 *   PASSWORD → password
 */
const VISIBILITY_MAP = {
  PRIVATE:   'private',
  LINK_ONLY: 'unlisted',
  PUBLIC:    'public',
  PASSWORD:  'password',
};

async function setVisibility(spaceId, visibilityKey, password = null) {
  if (!(await getAuthHeader())) return { success: false, error: 'Kein Matterport-Token' };

  const visibility = VISIBILITY_MAP[visibilityKey] || visibilityKey.toLowerCase();

  const mutation = `
    mutation($id: ID!, $vis: ModelAccessVisibility!, $pw: String) {
      updateModelAccessVisibility(id: $id, visibility: $vis, password: $pw) { id visibility }
    }`;

  try {
    const { data, errors } = await graphRequest(mutation, {
      id: spaceId,
      vis: visibility,
      pw: password || null,
    });
    if (data?.updateModelAccessVisibility?.id) {
      return { success: true, visibility: data.updateModelAccessVisibility.visibility };
    }
    const errMsg = errors?.[0]?.message || 'Unknown error';
    return { success: false, error: errMsg };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Modellnamen setzen (erscheint u. a. in der Matterport-Player-Ansicht).
 * GraphQL: patchModel(id, patch: { name }).
 */
async function patchModelName(spaceId, name) {
  if (!(await getAuthHeader())) return { success: false, error: 'Kein Matterport-Token' };
  const trimmed = name != null ? String(name).trim() : '';
  if (!spaceId || !trimmed) return { success: false, error: 'Modell-ID oder Name fehlt' };

  const mutation = `
    mutation($id: ID!, $name: String!) {
      patchModel(id: $id, patch: { name: $name }) {
        id
        name
      }
    }`;

  try {
    const { data, errors } = await graphRequest(mutation, { id: spaceId, name: trimmed });
    if (data?.patchModel?.id) {
      return { success: true, name: data.patchModel.name };
    }
    const errMsg = errors?.[0]?.message || 'Unknown error';
    return { success: false, error: errMsg };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Interne ID in Matterport setzen (Feld "Interne ID" in der Matterport-UI).
 * Format: "#12345" für Bestellnummern, "" zum Leeren.
 * GraphQL: patchModel(id, patch: { internalId }).
 */
async function patchModelInternalId(spaceId, internalId) {
  if (!(await getAuthHeader())) return { success: false, error: 'Kein Matterport-Token' };
  if (!spaceId) return { success: false, error: 'Modell-ID fehlt' };
  const value = internalId != null ? String(internalId) : '';

  const mutation = `
    mutation($id: ID!, $patch: ModelPatch!) {
      patchModel(id: $id, patch: $patch) {
        id
        internalId
      }
    }`;

  try {
    const { data, errors } = await graphRequest(mutation, {
      id: spaceId,
      patch: { internalId: value },
    });
    if (data?.patchModel?.id) {
      return { success: true, internalId: data.patchModel.internalId };
    }
    const errMsg = errors?.[0]?.message || 'Unknown error';
    return { success: false, error: errMsg };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Anzeige-Titel für Portal/DB: manuelle Bezeichnung, sonst Matterport-Adresse, sonst Modellname.
 */
function deriveTourDisplayLabelFromModel(model, formBezeichnung) {
  const manual = String(formBezeichnung || '').trim();
  if (manual) return manual;
  const addr = String(model?.publication?.address || '').trim();
  if (addr) return addr;
  const name = String(model?.name || '').trim();
  return name || null;
}

/**
 * Setzt Showcase-Einstellungen (Options) eines Models via patchModel.
 * options: Teilmenge von ModelOptionsPatch (nur geänderte Felder nötig).
 * Gültige SettingOverride-Werte: 'enabled' | 'disabled' | 'default'
 */
async function patchModelOptions(spaceId, options) {
  if (!(await getAuthHeader())) return { success: false, error: 'Kein Matterport-Token' };
  if (!spaceId) return { success: false, error: 'Modell-ID fehlt' };

  // roomBoundsOverride ist kein gültiges Feld in ModelOptionsPatch der Matterport-API
  // und wird daher aus dem Patch entfernt, bevor er gesendet wird.
  const { roomBoundsOverride: _drop, ...safeOptions } = options;

  const mutation = `
    mutation($id: ID!, $patch: ModelPatch!) {
      patchModel(id: $id, patch: $patch) {
        id
        options {
          defurnishViewEnabled defurnishViewOverride
          dollhouseEnabled dollhouseOverride
          floorplanEnabled floorplanOverride
          socialSharingEnabled socialSharingOverride
          vrEnabled vrOverride
          highlightReelEnabled highlightReelOverride
          labelsEnabled labelsOverride
          tourAutoplayEnabled tourAutoplayOverride
          roomBoundsEnabled
        }
      }
    }`;

  try {
    const { data, errors } = await graphRequest(mutation, { id: spaceId, patch: { options: safeOptions } });
    if (data?.patchModel?.id) {
      return { success: true, options: data.patchModel.options };
    }
    const msg = errors?.[0]?.message || 'Unknown error';
    const code = (errors?.[0]?.extensions?.code || '').toString();
    if (code === 'model.inactive' || /model\.inactive/i.test(msg)) {
      return { success: false, error: 'Archivierter Space – Einstellungen können nur bei aktivem Space geändert werden.' };
    }
    return { success: false, error: msg };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Überträgt einen Matterport-Space per E-Mail-Einladung an einen anderen Account.
 * Nutzt den REST-Endpunkt POST /api/models/:id/transfer (Model Transfer API).
 * Die Übertragung muss vom Empfänger angenommen werden.
 */
async function transferSpace(spaceId, toEmail) {
  const auth = await getAuthHeader();
  if (!auth) return { success: false, error: 'Matterport-API-Credentials nicht konfiguriert' };
  try {
    const res = await fetch(`${MATTERPORT_BASE}/${spaceId}/transfer`, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: toEmail }),
    });
    if (res.ok) return { success: true };
    let errText = '';
    try { const j = await res.json(); errText = j?.message || j?.error || JSON.stringify(j); } catch { /* ignore */ }
    return { success: false, error: errText || `HTTP ${res.status}` };
  } catch (e) {
    console.warn('Matterport transferSpace', spaceId, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = {
  listModels,
  getModel,
  getOwnModelIds,
  archiveSpace,
  unarchiveSpace,
  transferSpace,
  patchModelOptions,
  allowsLinkWithoutVerify,
  setVisibility,
  patchModelName,
  patchModelInternalId,
  deriveTourDisplayLabelFromModel,
  invalidateMatterportCredentialsCache,
};
