'use strict';

/**
 * Tests fuer den ppk_live_-Bearer-Pfad in tours/middleware/auth.js (PRO-73).
 *
 * Wir mocken `pool.query` via require-cache-Injection, damit kein echter DB-
 * Connect noetig ist. Die zwei in der Middleware genutzten Queries sind:
 *   - SELECT … FROM core.api_keys WHERE token_hash = $1 …
 *   - SELECT … FROM admin_users WHERE id = $1 …
 * Beide werden hier deterministisch beantwortet.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const ORIG_LOAD = Module._load;

/**
 * Laedt tours/middleware/auth.js mit einer gemockten ../lib/db. Returns
 * Modul + die Liste der DB-Queries die waehrend des Tests gemacht wurden.
 */
function loadAuthWithMockPool(handler) {
  const queries = [];
  const fakePool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return handler(sql, params) ?? { rows: [] };
    },
  };
  // Reset require-cache fuer auth.js + lib/db damit unser Mock greift.
  const dbPath = require.resolve('../lib/db');
  const authPath = require.resolve('../middleware/auth');
  delete require.cache[dbPath];
  delete require.cache[authPath];
  Module._load = function patched(request, parent, ...rest) {
    if (request === '../lib/db' && parent?.filename?.endsWith('auth.js')) {
      return { pool: fakePool };
    }
    return ORIG_LOAD.call(this, request, parent, ...rest);
  };
  const auth = require('../middleware/auth');
  Module._load = ORIG_LOAD;
  return { auth, queries };
}

function makeReq(headers = {}, session = {}) {
  return {
    headers: { ...headers },
    session,
    originalUrl: '/api/tours/admin/test',
    url: '/api/tours/admin/test',
    method: 'GET',
    ip: '127.0.0.1',
  };
}

test('tryBearerApiKey: kein Authorization-Header -> false, kein DB-Call', async () => {
  const { auth, queries } = loadAuthWithMockPool(() => ({ rows: [] }));
  const req = makeReq();
  const result = await auth.__test__.tryBearerApiKey(req);
  assert.equal(result, false);
  assert.equal(queries.length, 0);
  assert.equal(req.user, undefined);
});

test('tryBearerApiKey: nicht-ppk_live_-Token -> false, kein DB-Call', async () => {
  const { auth, queries } = loadAuthWithMockPool(() => ({ rows: [] }));
  const req = makeReq({ authorization: 'Bearer abc123_other' });
  const result = await auth.__test__.tryBearerApiKey(req);
  assert.equal(result, false);
  assert.equal(queries.length, 0);
});

test('tryBearerApiKey: ppk_live_-Token + valider Key + aktiver Admin -> true + req.user', async () => {
  const { auth, queries } = loadAuthWithMockPool((sql, params) => {
    if (/FROM core\.api_keys/.test(sql)) {
      return { rows: [{ id: 42, label: 'cowork', createdBy: 7 }] };
    }
    if (/FROM admin_users/.test(sql)) {
      assert.equal(params[0], 7);
      return { rows: [{ id: 7, email: 'janez@propus.ch', name: 'Janez S', role: 'admin', active: true }] };
    }
    if (/UPDATE core\.api_keys SET last_used_at/.test(sql)) {
      return { rows: [] };
    }
    return { rows: [] };
  });
  const req = makeReq({ authorization: 'Bearer ppk_live_IOG_abc123xyz' });
  const result = await auth.__test__.tryBearerApiKey(req);
  assert.equal(result, true);
  assert.equal(req.user.id, '7');
  assert.equal(req.user.email, 'janez@propus.ch');
  assert.equal(req.user.role, 'admin');
  assert.equal(req.apiKeyId, 42);
  assert.equal(req.apiKeyLabel, 'cowork');
  // 3 Queries erwartet: api_keys SELECT, admin_users SELECT, api_keys UPDATE last_used_at
  assert.equal(queries.length, 3);
  assert.match(queries[0].sql, /FROM core\.api_keys/);
  assert.match(queries[1].sql, /FROM admin_users/);
  assert.match(queries[2].sql, /UPDATE core\.api_keys SET last_used_at/);
});

test('tryBearerApiKey: revoked Key -> false', async () => {
  const { auth } = loadAuthWithMockPool((sql) => {
    if (/FROM core\.api_keys/.test(sql)) return { rows: [] }; // revoked_at filter greift
    return { rows: [] };
  });
  const req = makeReq({ authorization: 'Bearer ppk_live_revoked' });
  const result = await auth.__test__.tryBearerApiKey(req);
  assert.equal(result, false);
  assert.equal(req.user, undefined);
});

test('tryBearerApiKey: Admin inaktiv -> false', async () => {
  const { auth } = loadAuthWithMockPool((sql) => {
    if (/FROM core\.api_keys/.test(sql)) {
      return { rows: [{ id: 1, label: 'old', createdBy: 99 }] };
    }
    if (/FROM admin_users/.test(sql)) {
      return { rows: [{ id: 99, email: 'old@x.ch', active: false }] };
    }
    return { rows: [] };
  });
  const req = makeReq({ authorization: 'Bearer ppk_live_admin_disabled' });
  const result = await auth.__test__.tryBearerApiKey(req);
  assert.equal(result, false);
  assert.equal(req.user, undefined);
});

test('isAuthenticatedAdmin: erkennt Session UND req.user-Pfad', async () => {
  const { auth } = loadAuthWithMockPool(() => ({ rows: [] }));
  assert.equal(auth.__test__.isAuthenticatedAdmin({ session: { isAdmin: true } }), true);
  assert.equal(auth.__test__.isAuthenticatedAdmin({ user: { role: 'admin' } }), true);
  assert.equal(auth.__test__.isAuthenticatedAdmin({ user: { role: 'editor' } }), false);
  assert.equal(auth.__test__.isAuthenticatedAdmin({ session: { isAdmin: false } }), false);
  assert.equal(auth.__test__.isAuthenticatedAdmin({}), false);
});

test('hashSha256Hex liefert deterministisches 64-char hex', async () => {
  const { auth } = loadAuthWithMockPool(() => ({ rows: [] }));
  const h = auth.__test__.hashSha256Hex('ppk_live_test');
  assert.equal(h.length, 64);
  assert.match(h, /^[a-f0-9]{64}$/);
  // Determinismus
  assert.equal(auth.__test__.hashSha256Hex('ppk_live_test'), h);
});
