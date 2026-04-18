const test = require('node:test');
const assert = require('node:assert/strict');

const {
  legacyFallbackPermissions,
  mapAdminDbRoleToSystemRole,
  ALL_PERMISSION_KEYS,
  ROLE_PRESETS,
} = require('../access-rbac');

// ─── mapAdminDbRoleToSystemRole ───────────────────────────────────────────────

test('mapAdminDbRoleToSystemRole: super_admin → super_admin', () => {
  assert.equal(mapAdminDbRoleToSystemRole('super_admin'), 'super_admin');
});

test('mapAdminDbRoleToSystemRole: admin → internal_admin', () => {
  assert.equal(mapAdminDbRoleToSystemRole('admin'), 'internal_admin');
});

test('mapAdminDbRoleToSystemRole: employee → internal_admin', () => {
  assert.equal(mapAdminDbRoleToSystemRole('employee'), 'internal_admin');
});

test('mapAdminDbRoleToSystemRole: unbekannte Rolle → internal_admin (Fallback)', () => {
  assert.equal(mapAdminDbRoleToSystemRole('unknown'), 'internal_admin');
  assert.equal(mapAdminDbRoleToSystemRole(''), 'internal_admin');
  assert.equal(mapAdminDbRoleToSystemRole(null), 'internal_admin');
});

// ─── legacyFallbackPermissions ────────────────────────────────────────────────

test('legacyFallbackPermissions: super_admin hat alle Permissions', () => {
  const perms = legacyFallbackPermissions('super_admin');
  assert.ok(perms instanceof Set);
  for (const key of ALL_PERMISSION_KEYS) {
    assert.ok(perms.has(key), `super_admin sollte ${key} haben`);
  }
});

test('legacyFallbackPermissions: admin hat alle Permissions', () => {
  const perms = legacyFallbackPermissions('admin');
  assert.ok(perms instanceof Set);
  assert.equal(perms.size, ALL_PERMISSION_KEYS.length);
});

test('legacyFallbackPermissions: employee hat alle Permissions', () => {
  const perms = legacyFallbackPermissions('employee');
  assert.ok(perms instanceof Set);
  assert.equal(perms.size, ALL_PERMISSION_KEYS.length);
});

test('legacyFallbackPermissions: tour_manager hat ROLE_PRESETS.tour_manager-Permissions', () => {
  const perms = legacyFallbackPermissions('tour_manager');
  assert.ok(perms instanceof Set);
  for (const key of ROLE_PRESETS.tour_manager) {
    assert.ok(perms.has(key), `tour_manager sollte ${key} haben`);
  }
  // tour_manager hat nicht alle Permissions (echte Einschränkung)
  assert.ok(perms.size < ALL_PERMISSION_KEYS.length);
});

test('legacyFallbackPermissions: photographer hat ROLE_PRESETS.photographer-Permissions', () => {
  const perms = legacyFallbackPermissions('photographer');
  assert.ok(perms instanceof Set);
  for (const key of ROLE_PRESETS.photographer) {
    assert.ok(perms.has(key), `photographer sollte ${key} haben`);
  }
});

test('legacyFallbackPermissions: unbekannte Rolle gibt leeres Set zurück', () => {
  const perms = legacyFallbackPermissions('nonexistent');
  assert.ok(perms instanceof Set);
  assert.equal(perms.size, 0);
});

test('legacyFallbackPermissions: null/undefined gibt leeres Set zurück', () => {
  assert.equal(legacyFallbackPermissions(null).size, 0);
  assert.equal(legacyFallbackPermissions(undefined).size, 0);
  assert.equal(legacyFallbackPermissions('').size, 0);
});

// ─── ROLE_PRESETS Struktur ────────────────────────────────────────────────────

test('ROLE_PRESETS: alle Presets sind Arrays von Strings', () => {
  for (const [role, perms] of Object.entries(ROLE_PRESETS)) {
    assert.ok(Array.isArray(perms), `${role} sollte Array sein`);
    for (const perm of perms) {
      assert.equal(typeof perm, 'string', `${role}.${perm} sollte String sein`);
    }
  }
});

test('ROLE_PRESETS: super_admin-Preset hat alle Permissions', () => {
  assert.ok(Array.isArray(ROLE_PRESETS.super_admin));
  assert.equal(ROLE_PRESETS.super_admin.length, ALL_PERMISSION_KEYS.length);
});

test('ROLE_PRESETS: kein unbekannter Permission-Key in Presets', () => {
  const validKeys = new Set(ALL_PERMISSION_KEYS);
  for (const [role, perms] of Object.entries(ROLE_PRESETS)) {
    for (const perm of perms) {
      assert.ok(validKeys.has(perm), `${role} enthält unbekannten Key: ${perm}`);
    }
  }
});
