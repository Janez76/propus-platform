#!/usr/bin/env node
/**
 * Logto Setup Script – Registriert Applications für Booking und Tours.
 *
 * Voraussetzung: Logto-Container läuft auf LOGTO_ADMIN_ENDPOINT.
 * Erstellt über die Management API:
 *   1. "Propus Booking" (Traditional Web App)
 *   2. "Propus Tours Admin" (Traditional Web App)
 *   3. "Propus Tours Portal" (Traditional Web App)
 *
 * Schreibt die App-Credentials in .env.logto als Referenz.
 */

const fs = require('fs');
const path = require('path');

const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT || 'http://localhost:3301';
const LOGTO_ADMIN_ENDPOINT = process.env.LOGTO_ADMIN_ENDPOINT || 'http://localhost:3302';

async function getManagementToken() {
  const discoveryUrl = `${LOGTO_ENDPOINT}/oidc/.well-known/openid-configuration`;
  const disc = await fetch(discoveryUrl).then((r) => r.json());
  const tokenEndpoint = disc.token_endpoint;

  const res = await fetch(`${LOGTO_ADMIN_ENDPOINT}/api/applications`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 401) {
    console.log('[setup] Logto Admin API erfordert Authentifizierung.');
    console.log('[setup] Bitte öffne die Logto Admin Console unter:');
    console.log(`        ${LOGTO_ADMIN_ENDPOINT}`);
    console.log('[setup] Erstelle dort einen Admin-Account und eine M2M-Application.');
    console.log('[setup] Setze dann LOGTO_M2M_APP_ID und LOGTO_M2M_APP_SECRET als Env-Vars.');
    return null;
  }

  return null;
}

async function createApp(name, type, redirectUri, postLogoutUri) {
  const body = {
    name,
    type,
    description: `Propus Platform – ${name}`,
    oidcClientMetadata: {
      redirectUris: [redirectUri],
      postLogoutRedirectUris: [postLogoutUri],
    },
  };

  const res = await fetch(`${LOGTO_ADMIN_ENDPOINT}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[setup] Failed to create ${name}: ${res.status} ${text}`);
    return null;
  }

  const data = await res.json();
  console.log(`[setup] Created: ${name} (id: ${data.id})`);
  return {
    name,
    appId: data.id,
    appSecret: data.secret,
  };
}

async function listExistingApps() {
  const res = await fetch(`${LOGTO_ADMIN_ENDPOINT}/api/applications`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    console.error(`[setup] Cannot list apps: ${res.status}`);
    return [];
  }

  return res.json();
}

async function run() {
  console.log(`[setup] Logto Endpoint: ${LOGTO_ENDPOINT}`);
  console.log(`[setup] Logto Admin:    ${LOGTO_ADMIN_ENDPOINT}`);
  console.log();

  const existing = await listExistingApps();
  if (!Array.isArray(existing)) {
    console.log('[setup] Admin Console noch nicht initialisiert.');
    console.log(`[setup] Bitte zuerst ${LOGTO_ADMIN_ENDPOINT} öffnen und Admin-Account erstellen.`);
    return;
  }

  const existingNames = new Set(existing.map((a) => a.name));
  console.log(`[setup] Bestehende Apps: ${existing.length}`);
  existing.forEach((a) => console.log(`  - ${a.name} (${a.id}, type: ${a.type})`));
  console.log();

  const apps = [];
  const BOOKING_PORT = process.env.BOOKING_PORT || '3100';
  const TOURS_PORT = process.env.TOURS_PORT || '3200';

  if (!existingNames.has('Propus Booking')) {
    const app = await createApp(
      'Propus Booking',
      'Traditional',
      `http://localhost:${BOOKING_PORT}/auth/callback`,
      `http://localhost:${BOOKING_PORT}`
    );
    if (app) apps.push(app);
  } else {
    console.log('[setup] "Propus Booking" existiert bereits – übersprungen');
  }

  if (!existingNames.has('Propus Tours Admin')) {
    const app = await createApp(
      'Propus Tours Admin',
      'Traditional',
      `http://localhost:${TOURS_PORT}/auth/callback`,
      `http://localhost:${TOURS_PORT}`
    );
    if (app) apps.push(app);
  } else {
    console.log('[setup] "Propus Tours Admin" existiert bereits – übersprungen');
  }

  if (!existingNames.has('Propus Tours Portal')) {
    const app = await createApp(
      'Propus Tours Portal',
      'Traditional',
      `http://localhost:${TOURS_PORT}/portal/auth/callback`,
      `http://localhost:${TOURS_PORT}/portal`
    );
    if (app) apps.push(app);
  } else {
    console.log('[setup] "Propus Tours Portal" existiert bereits – übersprungen');
  }

  if (apps.length) {
    console.log();
    console.log('═══════════════════════════════════════════════');
    console.log('  Neue App-Credentials (in .env übernehmen):');
    console.log('═══════════════════════════════════════════════');
    for (const app of apps) {
      console.log();
      console.log(`  # ${app.name}`);
      console.log(`  ${app.name.replace(/\s+/g, '_').toUpperCase()}_LOGTO_APP_ID=${app.appId}`);
      console.log(`  ${app.name.replace(/\s+/g, '_').toUpperCase()}_LOGTO_APP_SECRET=${app.appSecret}`);
    }
    console.log();

    const envPath = path.join(__dirname, '..', '.env.logto');
    const lines = apps.map((a) => {
      const prefix = a.name.replace(/\s+/g, '_').toUpperCase();
      return `# ${a.name}\n${prefix}_LOGTO_APP_ID=${a.appId}\n${prefix}_LOGTO_APP_SECRET=${a.appSecret}`;
    });
    fs.writeFileSync(envPath, lines.join('\n\n') + '\n');
    console.log(`[setup] Credentials gespeichert in: ${envPath}`);
  } else {
    console.log('[setup] Keine neuen Apps erstellt.');
  }
}

run().catch((err) => {
  console.error('[setup] Fehler:', err.message);
  process.exit(1);
});
