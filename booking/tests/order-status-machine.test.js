const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isTransitionAllowed,
  getAllowedTargets,
  isValidStatus,
  getStatusLabel,
  ORDER_STATUS,
} = require('../order-status');

const {
  getTransitionError,
  getSideEffects,
  calcProvisionalExpiresAt,
  isProvisionalExpired,
} = require('../state-machine');

// ─── isTransitionAllowed ──────────────────────────────────────────────────────

test('isTransitionAllowed: pending → provisional erlaubt', () => {
  assert.equal(isTransitionAllowed('pending', 'provisional'), true);
});

test('isTransitionAllowed: pending → confirmed erlaubt', () => {
  assert.equal(isTransitionAllowed('pending', 'confirmed'), true);
});

test('isTransitionAllowed: provisional → pending NUR via expiry_job', () => {
  assert.equal(isTransitionAllowed('provisional', 'pending'), false);
  assert.equal(isTransitionAllowed('provisional', 'pending', { source: 'expiry_job' }), true);
  assert.equal(isTransitionAllowed('provisional', 'pending', { source: 'api' }), false);
});

test('isTransitionAllowed: archived → pending erlaubt', () => {
  assert.equal(isTransitionAllowed('archived', 'pending'), true);
});

test('isTransitionAllowed: done → provisional nicht erlaubt', () => {
  assert.equal(isTransitionAllowed('done', 'provisional'), false);
});

test('isTransitionAllowed: ungültiger Zielstatus immer false', () => {
  assert.equal(isTransitionAllowed('pending', 'nonexistent'), false);
  assert.equal(isTransitionAllowed('pending', ''), false);
  assert.equal(isTransitionAllowed('pending', null), false);
});

// ─── getAllowedTargets ────────────────────────────────────────────────────────

test('getAllowedTargets: pending hat provisional, confirmed, cancelled', () => {
  const targets = getAllowedTargets('pending');
  assert.ok(targets.includes('provisional'));
  assert.ok(targets.includes('confirmed'));
  assert.ok(targets.includes('cancelled'));
});

test('getAllowedTargets: done hat nur archived', () => {
  assert.deepEqual(getAllowedTargets('done'), ['archived']);
});

test('getAllowedTargets: unbekannter Status → leeres Array', () => {
  assert.deepEqual(getAllowedTargets('nonexistent'), []);
  assert.deepEqual(getAllowedTargets(''), []);
});

// ─── isValidStatus ────────────────────────────────────────────────────────────

test('isValidStatus: alle ORDER_STATUS-Werte sind valide', () => {
  for (const s of Object.values(ORDER_STATUS)) {
    assert.equal(isValidStatus(s), true, `${s} sollte valide sein`);
  }
});

test('isValidStatus: unbekannte Strings sind invalid', () => {
  assert.equal(isValidStatus('unknown'), false);
  assert.equal(isValidStatus(''), false);
  assert.equal(isValidStatus(null), false);
});

// ─── getTransitionError ───────────────────────────────────────────────────────

test('getTransitionError: pending → confirmed mit Fotograf+Termin gibt null', () => {
  const order = { photographer: { key: 'max' }, schedule: { date: '2026-06-01', time: '10:00' } };
  assert.equal(getTransitionError('pending', 'confirmed', order), null);
});

test('getTransitionError: → confirmed ohne Fotografen gibt Fehlermeldung', () => {
  const order = { schedule: { date: '2026-06-01', time: '10:00' } };
  const err = getTransitionError('pending', 'confirmed', order);
  assert.ok(err !== null && typeof err === 'string');
  assert.match(err, /Fotografen/);
});

test('getTransitionError: → provisional ohne Termin gibt Fehlermeldung', () => {
  const order = { photographer: { key: 'max' } };
  const err = getTransitionError('pending', 'provisional', order);
  assert.ok(err !== null);
  assert.match(err, /Termin/);
});

test('getTransitionError: provisional → pending manuell gibt Ablauf-Job-Hinweis', () => {
  const err = getTransitionError('provisional', 'pending', {});
  assert.ok(err !== null);
  assert.match(err, /Ablauf-Job/);
});

test('getTransitionError: nicht erlaubter Übergang gibt Fehlermeldung', () => {
  const err = getTransitionError('done', 'provisional', {});
  assert.ok(err !== null && typeof err === 'string');
});

test('getTransitionError: ungültiger Zielstatus gibt Fehlermeldung', () => {
  const err = getTransitionError('pending', 'nonexistent', {});
  assert.ok(err !== null);
  assert.match(err, /Ungueltiger/);
});

// ─── getSideEffects ───────────────────────────────────────────────────────────

test('getSideEffects: pending → provisional erzeugt calendar.create_provisional', () => {
  const effects = getSideEffects('pending', 'provisional');
  assert.ok(effects.includes('calendar.create_provisional'));
  assert.ok(effects.includes('email.provisional_created'));
});

test('getSideEffects: provisional → confirmed macht calendar.upgrade_to_final', () => {
  const effects = getSideEffects('provisional', 'confirmed');
  assert.ok(effects.includes('calendar.upgrade_to_final'));
  assert.ok(!effects.includes('calendar.create_final'));
  assert.ok(effects.includes('email.confirmed_customer'));
  assert.ok(effects.includes('email.confirmed_photographer'));
});

test('getSideEffects: pending → confirmed macht calendar.create_final (kein upgrade)', () => {
  const effects = getSideEffects('pending', 'confirmed');
  assert.ok(effects.includes('calendar.create_final'));
  assert.ok(!effects.includes('calendar.upgrade_to_final'));
});

test('getSideEffects: → cancelled löscht Kalender und sendet Absage', () => {
  const effects = getSideEffects('confirmed', 'cancelled');
  assert.ok(effects.includes('calendar.delete'));
  assert.ok(effects.includes('email.cancelled_all'));
});

test('getSideEffects: provisional → pending via Ablauf-Job löscht provisional', () => {
  const effects = getSideEffects('provisional', 'pending');
  assert.ok(effects.includes('calendar.delete_provisional'));
  assert.ok(effects.includes('provisional.clear'));
});

test('getSideEffects: → done setzt Timestamps und plant Review', () => {
  const effects = getSideEffects('completed', 'done');
  assert.ok(effects.includes('review.schedule'));
  assert.ok(effects.includes('timestamp.set_done_at'));
});

// ─── calcProvisionalExpiresAt ─────────────────────────────────────────────────

test('calcProvisionalExpiresAt: liegt nach bookedAt, Ablauf ist gültiges Datum', () => {
  const bookedAt = new Date('2026-01-10T14:00:00.000Z'); // Winterzeit
  const expires = calcProvisionalExpiresAt(bookedAt);
  assert.ok(expires instanceof Date);
  assert.ok(!isNaN(expires.getTime()));
  // Muss in der Zukunft des bookedAt-Datums liegen (min. 1 Tag, max. 4 Tage)
  assert.ok(expires > bookedAt, 'expires muss nach bookedAt liegen');
  const diffMs = expires - bookedAt;
  assert.ok(diffMs > 1 * 24 * 60 * 60 * 1000, 'Muss mehr als 1 Tag nach bookedAt sein');
  assert.ok(diffMs < 4 * 24 * 60 * 60 * 1000, 'Muss weniger als 4 Tage nach bookedAt sein');
});

test('calcProvisionalExpiresAt: Ablaufzeit ist 00:00 Zürich-Zeit (Winter = 23:00 UTC)', () => {
  const bookedAt = new Date('2026-01-10T14:00:00.000Z'); // Winterzeit (UTC+1)
  const expires = calcProvisionalExpiresAt(bookedAt);
  // 00:00 CET = 23:00 UTC
  assert.equal(expires.getUTCHours(), 23);
  assert.equal(expires.getUTCMinutes(), 0);
  assert.equal(expires.getUTCSeconds(), 0);
});

test('calcProvisionalExpiresAt: wirft bei ungültigem Datum', () => {
  assert.throws(() => calcProvisionalExpiresAt('not-a-date'), /Ungueltig/);
});

// ─── isProvisionalExpired ─────────────────────────────────────────────────────

test('isProvisionalExpired: vergangenes Datum ist abgelaufen', () => {
  assert.equal(isProvisionalExpired('2020-01-01T00:00:00.000Z'), true);
});

test('isProvisionalExpired: zukünftiges Datum (7 Tage) ist nicht abgelaufen', () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isProvisionalExpired(future), false);
});

test('isProvisionalExpired: ungültiges Datum gibt false (kein Throw)', () => {
  assert.equal(isProvisionalExpired('not-a-date'), false);
});
