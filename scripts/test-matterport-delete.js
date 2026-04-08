/**
 * Lokaler Test: Matterport Space via GraphQL deleteModel löschen
 * Aufruf: node scripts/test-matterport-delete.js <SPACE_ID> <TOKEN_ID> <TOKEN_SECRET>
 *
 * TOKEN_ID und TOKEN_SECRET findest du in:
 *   Admin → Einstellungen → Matterport API
 *   oder: my.matterport.com → Einstellungen → API-Token-Verwaltung
 */

'use strict';

const GRAPH_URLS = [
  'https://api.matterport.com/api/models/graph',
  'https://api.matterport.com/api/graphiql/',
];

async function graphRequest(auth, query, variables = {}) {
  const body = JSON.stringify({ query, variables });
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };

  for (const url of GRAPH_URLS) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body });
      const raw = await res.text();
      let data = {};
      try { data = JSON.parse(raw); } catch (_) { /* ignore */ }

      console.log(`  [${url}] HTTP ${res.status}`);
      if (res.ok && !data.errors) return data;
      if (data.errors) {
        console.log('  Errors:', JSON.stringify(data.errors));
        return { data: data.data, errors: data.errors };
      }
      if (res.status === 401 || res.status === 403) {
        console.error('  Auth abgelehnt. Token-ID/Secret korrekt?');
        return { data: null, errors: [{ message: 'AUTH_REJECTED' }] };
      }
    } catch (e) {
      console.warn(`  Fetch-Fehler bei ${url}:`, e.message);
    }
  }
  return { data: null, errors: [{ message: 'Alle Endpunkte fehlgeschlagen' }] };
}

async function main() {
  const [, , spaceId, tokenId, tokenSecret] = process.argv;

  if (!spaceId) {
    console.error('Aufruf: node scripts/test-matterport-delete.js <SPACE_ID> [TOKEN_ID] [TOKEN_SECRET]');
    process.exit(1);
  }

  // Credentials aus Umgebung oder Argumenten
  const id = tokenId || process.env.MATTERPORT_TOKEN_ID || '';
  const secret = tokenSecret || process.env.MATTERPORT_TOKEN_SECRET || process.env.MATTERPORT_API_KEY || '';

  if (!id || !secret) {
    console.error('Keine Matterport-Credentials. Übergib TOKEN_ID und TOKEN_SECRET als Argument oder setze MATTERPORT_TOKEN_ID + MATTERPORT_TOKEN_SECRET als Umgebungsvariable.');
    process.exit(1);
  }

  const auth = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  console.log(`\nTeste deleteModel für Space: ${spaceId}`);
  console.log(`Auth: Basic ${Buffer.from(`${id}:${secret}`).toString('base64').slice(0, 8)}…\n`);

  // 1. Space zuerst abrufen (prüfen ob er existiert)
  console.log('=== 1. Space abrufen ===');
  const getResult = await graphRequest(auth,
    `query GetModel($id: ID!) { model(id: $id) { id name state } }`,
    { id: spaceId }
  );
  if (getResult.errors?.length && !getResult.data?.model) {
    console.log('Space nicht gefunden oder kein Zugriff:', getResult.errors[0]?.message);
  } else {
    console.log('Space gefunden:', JSON.stringify(getResult.data?.model || getResult.data));
  }

  // 2. deleteModel ausführen
  console.log('\n=== 2. deleteModel ausführen ===');
  const delResult = await graphRequest(auth,
    `mutation DeleteModel($modelId: ID!) { deleteModel(modelId: $modelId) }`,
    { modelId: spaceId }
  );

  if (delResult.data?.deleteModel === true) {
    console.log('✓ Space erfolgreich gelöscht!');
  } else if (delResult.errors?.length) {
    console.error('✗ Löschen fehlgeschlagen:', delResult.errors[0]?.message);
  } else {
    console.log('Antwort:', JSON.stringify(delResult));
  }

  // 3. Zur Kontrolle nochmals abrufen
  console.log('\n=== 3. Kontrolle: Space noch vorhanden? ===');
  const checkResult = await graphRequest(auth,
    `query GetModel($id: ID!) { model(id: $id) { id name state } }`,
    { id: spaceId }
  );
  if (checkResult.errors?.length) {
    console.log('✓ Space nicht mehr gefunden (erwartet nach Löschung):', checkResult.errors[0]?.message);
  } else {
    console.log('⚠ Space noch vorhanden:', JSON.stringify(checkResult.data?.model));
  }
}

main().catch(console.error);
