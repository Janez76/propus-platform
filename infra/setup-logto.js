#!/usr/bin/env node
/**
 * Logto Setup Script – erstellt Applications, Rollen und den Admin-User
 * Wird innerhalb des Logto-Containers oder vom Host aus aufgerufen.
 */
const http = require('http');

const LOGTO_HOST = process.env.LOGTO_HOST || 'localhost';
const ADMIN_PORT = parseInt(process.env.LOGTO_ADMIN_PORT || '3302', 10);
const API_PORT   = parseInt(process.env.LOGTO_API_PORT || '3301', 10);
const M2M_ID     = process.env.M2M_ID || 'xp7smk9yr99x9isgu9xi5';
const M2M_SECRET = process.env.M2M_SECRET || 'AAucw4PSvK6uKUG2V1NFuXI0NonuLQyn';
const RESOURCE   = 'https://default.logto.app/api';

const PLATFORM_PORT = process.env.PLATFORM_PORT || '3100';
const BASE_URL = `http://localhost:${PLATFORM_PORT}`;

function httpReq(opts, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');
    const headers = { ...(opts.headers || {}) };
    if (bodyStr && !headers['Content-Length']) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const port = opts.port || API_PORT;
    const req = http.request({ host: LOGTO_HOST, port, ...opts, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getToken() {
  const creds = Buffer.from(`${M2M_ID}:${M2M_SECRET}`).toString('base64');
  const res = await httpReq({
    port: API_PORT,
    path: '/oidc/token',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  }, `grant_type=client_credentials&resource=${encodeURIComponent(RESOURCE)}&scope=all`);

  if (!res.body || !res.body.access_token) {
    console.error('[setup] Token-Fehler:', res.status, JSON.stringify(res.body));
    process.exit(1);
  }
  console.log('[setup] Management-API Token erhalten');
  return res.body.access_token;
}

async function api(token, method, path, body) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  return httpReq({ path, method, headers }, body);
}

async function findOrCreateApp(token, name, type, redirectUris, postLogoutUris) {
  const listRes = await api(token, 'GET', `/api/applications?pageSize=100`);
  const apps = Array.isArray(listRes.body) ? listRes.body : [];
  if (!Array.isArray(listRes.body)) {
    console.log(`[setup] /api/applications Antwort (${listRes.status}):`, JSON.stringify(listRes.body).substring(0, 200));
  }
  const existing = apps.find(a => a.name === name);
  if (existing) {
    console.log(`[setup] App "${name}" existiert bereits: ${existing.id}`);
    return existing;
  }

  const createRes = await api(token, 'POST', '/api/applications', {
    name,
    type,
    oidcClientMetadata: {
      redirectUris: redirectUris || [],
      postLogoutRedirectUris: postLogoutUris || [],
    }
  });

  if (createRes.status === 200 || createRes.status === 201) {
    console.log(`[setup] App "${name}" erstellt: ${createRes.body.id}`);
    return createRes.body;
  }
  console.error(`[setup] Fehler beim Erstellen von "${name}":`, createRes.status, JSON.stringify(createRes.body));
  return null;
}

async function findOrCreateRole(token, name, description, type) {
  const listRes = await api(token, 'GET', '/api/roles?pageSize=100');
  const rolesArr = Array.isArray(listRes.body) ? listRes.body : [];
  if (!Array.isArray(listRes.body)) {
    console.log(`[setup] /api/roles Antwort (${listRes.status}):`, JSON.stringify(listRes.body).substring(0, 200));
  }
  const existing = rolesArr.find(r => r.name === name);
  if (existing) {
    console.log(`[setup] Rolle "${name}" existiert bereits: ${existing.id}`);
    return existing;
  }

  const createRes = await api(token, 'POST', '/api/roles', {
    name,
    description: description || name,
    type: type || 'User',
  });

  if (createRes.status === 200 || createRes.status === 201) {
    console.log(`[setup] Rolle "${name}" erstellt: ${createRes.body.id}`);
    return createRes.body;
  }
  console.error(`[setup] Fehler beim Erstellen der Rolle "${name}":`, createRes.status, JSON.stringify(createRes.body));
  return null;
}

async function findOrCreateUser(token, { username, password, name, primaryEmail }) {
  const searchRes = await api(token, 'GET', `/api/users?search.primaryEmail=${encodeURIComponent(primaryEmail)}&pageSize=20`);
  const usersArr = Array.isArray(searchRes.body) ? searchRes.body : [];
  const existing = usersArr.find(u => u.primaryEmail === primaryEmail);
  if (existing) {
    console.log(`[setup] User "${primaryEmail}" existiert bereits: ${existing.id}`);
    return existing;
  }

  const createRes = await api(token, 'POST', '/api/users', {
    username,
    password,
    name,
    primaryEmail,
  });

  if (createRes.status === 200 || createRes.status === 201) {
    console.log(`[setup] User "${primaryEmail}" erstellt: ${createRes.body.id}`);
    return createRes.body;
  }
  console.error(`[setup] Fehler beim Erstellen von User "${primaryEmail}":`, createRes.status, JSON.stringify(createRes.body));
  return null;
}

async function assignRoleToUser(token, userId, roleId) {
  const res = await api(token, 'POST', `/api/roles/${roleId}/users`, {
    userIds: [userId],
  });
  if (res.status === 200 || res.status === 201) {
    console.log(`[setup] Rolle ${roleId} an User ${userId} zugewiesen`);
  } else if (res.status === 422) {
    console.log(`[setup] Rolle bereits zugewiesen (422)`);
  } else {
    console.error(`[setup] Rollenzuweisung Fehler:`, res.status, JSON.stringify(res.body));
  }
}

async function run() {
  console.log(`[setup] Verbinde mit Logto @ ${LOGTO_HOST} (Admin: ${ADMIN_PORT}, API: ${API_PORT})`);
  const token = await getToken();

  // 1. Applications erstellen
  console.log('\n=== Applications ===');
  const bookingApp = await findOrCreateApp(token,
    'Propus Booking', 'Traditional',
    [`${BASE_URL}/auth/logto/callback`],
    [BASE_URL]
  );

  const toursAdminApp = await findOrCreateApp(token,
    'Propus Tours Admin', 'Traditional',
    [`${BASE_URL}/tour-manager/auth/callback`],
    [`${BASE_URL}/tour-manager`]
  );

  const toursPortalApp = await findOrCreateApp(token,
    'Propus Tours Portal', 'Traditional',
    [`${BASE_URL}/tour-manager/portal/auth/callback`],
    [`${BASE_URL}/tour-manager/portal`]
  );

  const mgmtApp = await findOrCreateApp(token,
    'Propus Management', 'MachineToMachine',
    [], []
  );

  // 2. Rollen erstellen
  console.log('\n=== Rollen ===');
  const roles = {};
  for (const roleName of [
    'admin',
    'super_admin',
    'company_owner',
    'company_admin',
    'company_employee',
    'photographer',
    'customer',
    'tour_manager',
    'customer_admin',
  ]) {
    roles[roleName] = await findOrCreateRole(token, roleName, `Propus Platform Rolle: ${roleName}`);
  }

  // 3. Users erstellen
  console.log('\n=== Users ===');

  const USERS = [
    {
      username: 'jsmirmaul',
      password: 'Zuerich8038!',
      name: 'Janez Smirmaul',
      primaryEmail: 'js@propus.ch',
      assignRoles: ['admin', 'super_admin', 'photographer'],
    },
    {
      username: 'imijajlovic',
      password: 'Natasa1978!',
      name: 'Ivan Mijajlovic',
      primaryEmail: 'ivan.mijajlovic@propus.ch',
      assignRoles: ['admin', 'super_admin', 'photographer'],
    },
    {
      username: 'mazizi',
      password: 'Propus2026!',
      name: 'Maher Azizi',
      primaryEmail: 'ma@propus.ch',
      assignRoles: ['photographer'],
    },
  ];

  // 4. Users anlegen & Rollen zuweisen
  for (const u of USERS) {
    const user = await findOrCreateUser(token, u);
    if (!user) continue;
    for (const roleName of u.assignRoles) {
      if (roles[roleName]) {
        await assignRoleToUser(token, user.id, roles[roleName].id);
      }
    }
  }

  // 5. Credentials ausgeben (nur IDs, Secrets bleiben in .env.logto)
  console.log('\n=== App IDs ===');
  if (bookingApp) console.log(`PROPUS_BOOKING_LOGTO_APP_ID=${bookingApp.id}`);
  if (toursAdminApp) console.log(`PROPUS_TOURS_ADMIN_LOGTO_APP_ID=${toursAdminApp.id}`);
  if (toursPortalApp) console.log(`PROPUS_TOURS_PORTAL_LOGTO_APP_ID=${toursPortalApp.id}`);
  if (mgmtApp) console.log(`PROPUS_MANAGEMENT_LOGTO_APP_ID=${mgmtApp.id}`);

  console.log('\n[setup] Fertig!');
}

run().catch(err => {
  console.error('[setup] Fataler Fehler:', err);
  process.exit(1);
});
