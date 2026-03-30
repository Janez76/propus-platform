/**
 * Logto Management API Client
 * Used at runtime to read/write user roles via the Management API.
 */

const LOGTO_ENDPOINT = process.env.LOGTO_INTERNAL_ENDPOINT || process.env.LOGTO_ENDPOINT || 'http://localhost:3301';
const M2M_APP_ID     = process.env.PROPUS_MANAGEMENT_LOGTO_APP_ID  || '';
const M2M_APP_SECRET = process.env.PROPUS_MANAGEMENT_LOGTO_APP_SECRET || '';
const RESOURCE       = 'https://default.logto.app/api';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getManagementToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  if (!M2M_APP_ID || !M2M_APP_SECRET) {
    throw new Error('Logto M2M credentials not configured (PROPUS_MANAGEMENT_LOGTO_APP_ID / SECRET)');
  }

  const creds = Buffer.from(`${M2M_APP_ID}:${M2M_APP_SECRET}`).toString('base64');
  const res = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&resource=${encodeURIComponent(RESOURCE)}&scope=all`,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Logto token error (${res.status}): ${err}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function mgmtApi(method, path, body) {
  const token = await getManagementToken();
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${LOGTO_ENDPOINT}/api${path}`, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || JSON.stringify(data) || res.statusText;
    const err = new Error(`Logto API ${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let rolesCache = null;
let rolesCacheAt = 0;

function invalidateRolesCache() {
  rolesCache = null;
  rolesCacheAt = 0;
}

async function getRoles() {
  if (rolesCache && Date.now() - rolesCacheAt < 300_000) return rolesCache;
  const roles = await mgmtApi('GET', '/roles?pageSize=100');
  rolesCache = new Map(roles.map(r => [r.name, r.id]));
  rolesCacheAt = Date.now();
  return rolesCache;
}

/** Legt eine globale Rolle an, falls sie fehlt (für Portal-Sync). */
async function ensureGlobalRole(name, description) {
  const n = String(name || '').trim();
  if (!n) return null;
  let map = await getRoles();
  if (map.get(n)) return map.get(n);
  try {
    await mgmtApi('POST', '/roles', {
      name: n,
      description: String(description || n).slice(0, 256),
      type: 'User',
    });
  } catch (e) {
    if (e.status !== 422) throw e;
  }
  invalidateRolesCache();
  map = await getRoles();
  return map.get(n) || null;
}

async function getUserRoles(userId) {
  const roles = await mgmtApi('GET', `/users/${userId}/roles`);
  return roles.map(r => r.name);
}

async function assignRolesToUser(userId, roleNames) {
  const allRoles = await getRoles();
  const roleIds = roleNames.map(n => allRoles.get(n)).filter(Boolean);
  if (!roleIds.length) return;
  await mgmtApi('POST', `/users/${userId}/roles`, { roleIds });
}

async function removeRolesFromUser(userId, roleNames) {
  const allRoles = await getRoles();
  for (const name of roleNames) {
    const roleId = allRoles.get(name);
    if (!roleId) continue;
    try {
      await mgmtApi('DELETE', `/users/${userId}/roles/${roleId}`);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
}

async function findUserByEmail(email) {
  const users = await mgmtApi('GET', `/users?search.primaryEmail=${encodeURIComponent(email)}&pageSize=5`);
  return users?.find(u => u.primaryEmail?.toLowerCase() === email.toLowerCase()) || null;
}

async function getUserById(userId) {
  return mgmtApi('GET', `/users/${userId}`);
}

async function updateUser(userId, patch) {
  return mgmtApi('PATCH', `/users/${userId}`, patch);
}

async function updateUserCustomData(userId, customData) {
  return mgmtApi('PATCH', `/users/${userId}/custom-data`, customData);
}

async function updateUserPassword(userId, password) {
  return mgmtApi('PATCH', `/users/${userId}/password`, { password });
}

/** Normalize Logto list responses (array or { data: [] }) */
function normalizeListResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

async function listOrganizations({ pageSize = 100 } = {}) {
  const data = await mgmtApi('GET', `/organizations?pageSize=${pageSize}`);
  return normalizeListResponse(data);
}

async function createOrganization({ name, description = '', customData = {} }) {
  return mgmtApi('POST', '/organizations', {
    name: String(name || '').trim(),
    description: String(description || ''),
    customData: customData && typeof customData === 'object' ? customData : {},
  });
}

async function updateOrganization(orgId, patch) {
  return mgmtApi('PATCH', `/organizations/${encodeURIComponent(orgId)}`, patch);
}

async function deleteOrganization(orgId) {
  return mgmtApi('DELETE', `/organizations/${encodeURIComponent(orgId)}`);
}

async function addUsersToOrganization(orgId, userIds) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length) return null;
  return mgmtApi('POST', `/organizations/${encodeURIComponent(orgId)}/users`, { userIds: ids });
}

async function removeUserFromOrganization(orgId, userId) {
  if (!userId) return null;
  try {
    return await mgmtApi('DELETE', `/organizations/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function getOrganizationUsers(orgId) {
  const data = await mgmtApi('GET', `/organizations/${encodeURIComponent(orgId)}/users?pageSize=100`);
  return normalizeListResponse(data);
}

let orgRolesCache = null;
let orgRolesCacheAt = 0;

async function listOrganizationRoles({ pageSize = 100 } = {}) {
  if (orgRolesCache && Date.now() - orgRolesCacheAt < 300_000) return orgRolesCache;
  const data = await mgmtApi('GET', `/organization-roles?page_size=${pageSize}`);
  const list = normalizeListResponse(data);
  orgRolesCache = new Map(list.map((r) => [r.name, r.id]));
  orgRolesCacheAt = Date.now();
  return orgRolesCache;
}

function invalidateOrganizationRolesCache() {
  orgRolesCache = null;
  orgRolesCacheAt = 0;
}

async function ensureOrganizationRole(name, description) {
  const n = String(name || '').trim();
  if (!n) return null;
  let map = await listOrganizationRoles({ pageSize: 100 });
  if (map.get(n)) return map.get(n);
  try {
    await mgmtApi('POST', '/organization-roles', {
      name: n,
      description: String(description || n).slice(0, 256),
      type: 'User',
      organizationScopeIds: [],
      resourceScopeIds: [],
    });
  } catch (e) {
    if (e.status !== 422) throw e;
  }
  invalidateOrganizationRolesCache();
  map = await listOrganizationRoles({ pageSize: 100 });
  return map.get(n) || null;
}

async function assignOrganizationRolesToUser(orgId, userId, organizationRoleNames) {
  const names = (organizationRoleNames || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!orgId || !userId || !names.length) return null;
  return mgmtApi('POST', `/organizations/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/roles`, {
    organizationRoleNames: names,
  });
}

async function listUserOrganizationRoles(orgId, userId) {
  if (!orgId || !userId) return [];
  try {
    const data = await mgmtApi(
      'GET',
      `/organizations/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/roles`
    );
    return normalizeListResponse(data);
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

async function removeOrganizationRolesFromUser(orgId, userId, organizationRoleNames) {
  const names = (organizationRoleNames || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!orgId || !userId || !names.length) return;
  const map = await listOrganizationRoles({ pageSize: 100 });
  for (const name of names) {
    const roleId = map.get(name);
    if (!roleId) continue;
    try {
      await mgmtApi(
        'DELETE',
        `/organizations/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`
      );
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
}

function isConfigured() {
  return !!(M2M_APP_ID && M2M_APP_SECRET);
}

module.exports = {
  getManagementToken,
  mgmtApi,
  getRoles,
  invalidateRolesCache,
  ensureGlobalRole,
  getUserRoles,
  assignRolesToUser,
  removeRolesFromUser,
  findUserByEmail,
  getUserById,
  updateUser,
  updateUserCustomData,
  updateUserPassword,
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  addUsersToOrganization,
  removeUserFromOrganization,
  getOrganizationUsers,
  listOrganizationRoles,
  ensureOrganizationRole,
  assignOrganizationRolesToUser,
  listUserOrganizationRoles,
  removeOrganizationRolesFromUser,
  isConfigured,
};
