#!/usr/bin/env node
const http = require('http');

const HOST = 'localhost';
const PORT = 3002;
const M2M_ID = 'm-admin';
const M2M_SECRET = 'RIUL9hh4WD9KF9C2dFFYHr1bUDKNadBV';
const RESOURCE = 'https://admin.logto.app/api';
const BOOKING_PORT = '3100';
const TOURS_PORT = '3200';

function httpReq(opts, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');
    const headers = { ...(opts.headers || {}) };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = http.request({ host: HOST, port: PORT, ...opts, headers }, res => {
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

async function run() {
  const creds = Buffer.from(`${M2M_ID}:${M2M_SECRET}`).toString('base64');
  const tokenBody = `grant_type=client_credentials&resource=${encodeURIComponent(RESOURCE)}`;

  console.log('[setup] Token holen...');
  const tokenRes = await httpReq({
    path: '/oidc/token',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  }, tokenBody);

  if (!tokenRes.body.access_token) {
    console.error('Token Fehler:', JSON.stringify(tokenRes.body));
    process.exit(1);
  }
  const token = tokenRes.body.access_token;
  console.log('[setup] Token OK');

  const listRes = await httpReq({ path: '/api/applications?pageSize=50', headers: { 'Authorization': `Bearer ${token}` } });
  if (listRes.status !== 200) {
    console.error('List Fehler:', listRes.status, JSON.stringify(listRes.body));
    process.exit(1);
  }
  const existing = listRes.body;
  const existingNames = new Set(existing.map(a => a.name));
  console.log(`[setup] ${existing.length} Apps vorhanden:`);
  existing.forEach(a => console.log(`  - ${a.name} [${a.type}]`));

  const appsToCreate = [
    { name: 'Propus Booking', type: 'Traditional', r: [`http://localhost:${BOOKING_PORT}/auth/callback`], pl: [`http://localhost:${BOOKING_PORT}`] },
    { name: 'Propus Tours Admin', type: 'Traditional', r: [`http://localhost:${TOURS_PORT}/auth/callback`], pl: [`http://localhost:${TOURS_PORT}`] },
    { name: 'Propus Tours Portal', type: 'Traditional', r: [`http://localhost:${TOURS_PORT}/portal/auth/callback`], pl: [`http://localhost:${TOURS_PORT}/portal`] },
    { name: 'Propus Management', type: 'MachineToMachine', r: [], pl: [] },
  ];

  const results = {};

  for (const app of appsToCreate) {
    if (existingNames.has(app.name)) {
      const ex = existing.find(a => a.name === app.name);
      results[app.name] = ex;
      console.log(`[setup] "${app.name}" – bereits vorhanden`);
      continue;
    }
    const body = { name: app.name, type: app.type, oidcClientMetadata: { redirectUris: app.r, postLogoutRedirectUris: app.pl } };
    const res = await httpReq({ path: '/api/applications', method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }, body);
    if (res.status === 200 || res.status === 201) {
      results[app.name] = res.body;
      console.log(`[setup] "${app.name}" erstellt – id=${res.body.id}`);
    } else {
      console.error(`[setup] Fehler "${app.name}":`, res.status, JSON.stringify(res.body));
    }
  }

  console.log('\n══════════════════════════════════════════');
  for (const [name, app] of Object.entries(results)) {
    const key = name.toUpperCase().replace(/\s+/g, '_');
    console.log(`${key}_LOGTO_APP_ID=${app.id}`);
    console.log(`${key}_LOGTO_APP_SECRET=${app.secret}`);
  }
  console.log('\n[setup] Fertig.');
}

run().catch(e => { console.error(e); process.exit(1); });
