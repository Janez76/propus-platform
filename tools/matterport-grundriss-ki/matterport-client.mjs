/**
 * Matterport Model API (GraphQL) – Basic Auth wie Propus tours/lib/matterport.js
 */

const MATTERPORT_BASE = 'https://api.matterport.com/api/models';
const GRAPH_URLS = [`${MATTERPORT_BASE}/graph`, 'https://api.matterport.com/api/graphiql/'];

function getAuthHeader() {
  const tokenId = String(process.env.MATTERPORT_TOKEN_ID || '').trim();
  const tokenSecret = String(
    process.env.MATTERPORT_TOKEN_SECRET || process.env.MATTERPORT_API_KEY || ''
  ).trim();
  if (tokenId && tokenSecret) {
    const basic = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');
    return `Basic ${basic}`;
  }
  if (tokenSecret) return `Bearer ${tokenSecret}`;
  return null;
}

export async function graphRequest(query, variables = {}) {
  const auth = getAuthHeader();
  if (!auth) {
    return { data: null, errors: [{ message: 'MATTERPORT_TOKEN_ID und MATTERPORT_TOKEN_SECRET setzen.' }] };
  }
  const body = JSON.stringify({ query, variables });
  const headers = {
    Authorization: auth,
    'Content-Type': 'application/json',
  };
  let lastErr = '';
  for (const url of GRAPH_URLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      clearTimeout(timeout);
      const raw = await res.text().catch(() => '');
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      if (res.ok && !data.errors) return data;
      if (data.errors) {
        const isHardError = data.errors.some((e) => {
          const c = e?.extensions?.classification;
          return c === 'ValidationError' || c === 'ExecutionAborted' || /Syntax|Validation|Unauthorized/i.test(e?.message || '');
        });
        if (data.data && !isHardError) {
          return { data: data.data, errors: data.errors, partial: true };
        }
        return { data: data.data, errors: data.errors };
      }
      if (res.status === 401 || res.status === 403) {
        return { data: null, errors: [{ message: 'Matterport: Anmeldung abgelehnt (Token prüfen).' }] };
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      clearTimeout(timeout);
      lastErr = e.name === 'AbortError' ? 'Timeout' : e.message;
    }
  }
  return { data: null, errors: [{ message: `GraphQL fehlgeschlagen: ${lastErr}` }] };
}

export async function listModels() {
  const all = [];
  let offset = null;
  const result = { results: [], error: null };
  if (!getAuthHeader()) {
    result.error = 'Matterport-Credentials fehlen.';
    return result;
  }
  try {
    do {
      const offsetArg = offset != null ? `, offset: "${offset}"` : '';
      const gql = `query { models(query: "*", pageSize: 100${offsetArg}, include: [inactive], sortBy: [{field: created, order: desc}]) { totalResults results { id name description internalId state created } nextOffset } }`;
      const { data, errors } = await graphRequest(gql);
      if (errors?.length) {
        result.error = errors[0]?.message || 'Unbekannter Fehler';
        result.results = all;
        return result;
      }
      const m = data?.models;
      if (!m) break;
      all.push(...(m.results || []));
      offset = m.nextOffset;
    } while (offset != null);
    result.results = all;
  } catch (e) {
    result.error = e.message;
    result.results = all;
  }
  return result;
}

const MODEL_QUERY_FULL = `query getModel($modelId: ID!) {
  model(id: $modelId) {
    id
    name
    state
    description
    created
    modified
    publication { url(branding: default) summary address description }
    floors { id label }
    labels { id label enabled floor { id label } position { x y z } }
    panoLocations { id label variant position { x y z } }
    rooms {
      id
      dimensions { width depth height areaFloor areaFloorIndoor units }
      panoLocations { id label }
      floor { id label }
    }
    mattertags {
      id label description enabled position { x y z } floor { id label }
    }
    measurements {
      id label distance startPosition { x y z } endPosition { x y z }
      floor { id label } room { id }
    }
  }
}`;

const MODEL_QUERY_MEDIUM = `query getModel($modelId: ID!) {
  model(id: $modelId) {
    id
    name
    state
    description
    created
    modified
    publication { url(branding: default) summary address description }
    floors { id label }
    labels { id label enabled floor { id label } position { x y z } }
    panoLocations { id label variant position { x y z } }
    rooms {
      id
      dimensions { width depth areaFloor units }
      panoLocations { id label }
      floor { id label }
    }
  }
}`;

const MODEL_QUERY_BASIC = `query getModel($modelId: ID!) {
  model(id: $modelId) {
    id
    name
    state
    description
    created
    modified
    publication { url(branding: default) summary address }
    floors { id label }
    panoLocations { id label variant position { x y z } }
  }
}`;

function isOnlyPolicyDisabled(errors) {
  if (!errors?.length) return false;
  return errors.every(
    (e) => (e?.extensions?.code || '') === 'organization.policy.disabled'
  );
}

export async function getModelDetail(modelId) {
  let res = await graphRequest(MODEL_QUERY_FULL, { modelId });
  if (res.errors?.length && !res.data?.model && !isOnlyPolicyDisabled(res.errors)) {
    res = await graphRequest(MODEL_QUERY_MEDIUM, { modelId });
  }
  if (res.errors?.length && !res.data?.model && !isOnlyPolicyDisabled(res.errors)) {
    res = await graphRequest(MODEL_QUERY_BASIC, { modelId });
  }
  if (!res.data?.model) {
    return { model: null, error: res.errors?.[0]?.message || 'getModel fehlgeschlagen' };
  }
  return { model: res.data.model, error: null, partialErrors: res.errors || null };
}
