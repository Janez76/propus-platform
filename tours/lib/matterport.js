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
 *   Developer Tools → my.matterport.com → Settings → API Token
 *
 * Env: MATTERPORT_TOKEN_ID, MATTERPORT_TOKEN_SECRET (oder MATTERPORT_API_KEY für Bearer-Fallback)
 *
 * Model-Felder (GraphQL): id, name, state, created, modified, publication { url, address, ... }
 *   created/modified: DateTime (ISO 8601)
 *   state: active | inactive | processing | failed | pending | staging
 */

const MATTERPORT_TOKEN_ID = process.env.MATTERPORT_TOKEN_ID || '';
const MATTERPORT_TOKEN_SECRET = process.env.MATTERPORT_TOKEN_SECRET || process.env.MATTERPORT_API_KEY || '';
const MATTERPORT_BASE = 'https://api.matterport.com/api/models';

const GRAPH_URLS = [
  `${MATTERPORT_BASE}/graph`,
  'https://api.matterport.com/model/graphiql',
];

function getAuthHeader() {
  if (MATTERPORT_TOKEN_ID && MATTERPORT_TOKEN_SECRET) {
    const basic = Buffer.from(`${MATTERPORT_TOKEN_ID}:${MATTERPORT_TOKEN_SECRET}`).toString('base64');
    return `Basic ${basic}`;
  }
  if (MATTERPORT_TOKEN_SECRET) {
    return `Bearer ${MATTERPORT_TOKEN_SECRET}`;
  }
  return null;
}

function allowsLinkWithoutVerify() {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MATTERPORT_LINK_WITHOUT_VERIFY || '').trim().toLowerCase()
  );
}

async function graphRequest(query, variables = {}) {
  const auth = getAuthHeader();
  if (!auth) {
    return { data: null, errors: [{ message: 'MATTERPORT_TOKEN_ID und MATTERPORT_TOKEN_SECRET setzen' }] };
  }
  const body = JSON.stringify({ query, variables });
  const headers = {
    'Authorization': auth,
    'Content-Type': 'application/json',
  };
  for (const url of GRAPH_URLS) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body });
      const data = await res.json().catch(() => ({}));
      if (res.ok && !data.errors) return data;
      if (data.errors) {
        return { data: data.data, errors: data.errors };
      }
    } catch (e) {
      console.warn('Matterport graphRequest', url, e.message);
    }
  }
  return { data: null, errors: [{ message: 'GraphQL request failed for all endpoints' }] };
}

async function listModels() {
  const all = [];
  let offset = null;
  const result = { results: [], totalResults: 0, error: null };
  if (!getAuthHeader()) {
    result.error = 'MATTERPORT_TOKEN_ID und MATTERPORT_TOKEN_SECRET setzen';
    return result;
  }
  try {
    do {
      const offsetArg = offset != null ? `, offset: "${offset}"` : '';
      const gql = `query { models(query: "*", pageSize: 100${offsetArg}, include: [inactive], sortBy: [{field: created, order: desc}]) { totalResults results { id name description state created } nextOffset } }`;
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
  if (!getAuthHeader()) {
    return { model: null, error: 'MATTERPORT_TOKEN_ID und MATTERPORT_TOKEN_SECRET setzen' };
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
    }
  }`;
  const { data, errors } = await graphRequest(gql, { modelId });
  if (errors?.length) {
    const msg = errors[0]?.message || 'Unknown error';
    const code = (errors[0]?.extensions?.code || '').toString();
    const lockedHint = /model\.locked|Unlock the developer license/i.test(msg) || code === 'model.locked'
      ? ' (Model durch Matterport Developer-Lizenz gesperrt – in my.matterport.com prüfen)'
      : '';
    return { model: null, error: msg + lockedHint };
  }
  return { model: data?.model || null, error: null };
}

async function archiveSpace(spaceId) {
  const auth = getAuthHeader();
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
  const auth = getAuthHeader();
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
  if (!getAuthHeader()) return { success: false, error: 'Kein Matterport-Token' };

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
  if (!getAuthHeader()) return { success: false, error: 'Kein Matterport-Token' };
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

module.exports = {
  listModels,
  getModel,
  getOwnModelIds,
  archiveSpace,
  unarchiveSpace,
  allowsLinkWithoutVerify,
  setVisibility,
  patchModelName,
  deriveTourDisplayLabelFromModel,
};
