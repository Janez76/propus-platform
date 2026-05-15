const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isTransitionAllowed,
  isValidStatus,
  ORDER_STATUS,
} = require('../order-status');

const {
  getTransitionError,
  getSideEffects,
} = require('../state-machine');

// ─── disposition_offen Status ─────────────────────────────────────────────────

test('isValidStatus: disposition_offen ist gültiger Status', () => {
  assert.equal(isValidStatus('disposition_offen'), true);
  assert.equal(ORDER_STATUS.DISPOSITION_OFFEN, 'disposition_offen');
});

test('isTransitionAllowed: pending → disposition_offen erlaubt', () => {
  assert.equal(isTransitionAllowed('pending', 'disposition_offen'), true);
});

test('isTransitionAllowed: disposition_offen → confirmed erlaubt', () => {
  assert.equal(isTransitionAllowed('disposition_offen', 'confirmed'), true);
});

test('isTransitionAllowed: disposition_offen → cancelled erlaubt', () => {
  assert.equal(isTransitionAllowed('disposition_offen', 'cancelled'), true);
});

test('isTransitionAllowed: disposition_offen → paused erlaubt', () => {
  assert.equal(isTransitionAllowed('disposition_offen', 'paused'), true);
});

test('isTransitionAllowed: disposition_offen → done direkt erlaubt (Admin-Kurzschluss)', () => {
  // Frueher verboten — jetzt Teil der liberalen Admin-Matrix, damit ein
  // Drag aus "Ausstehend" direkt nach "Abgeschlossen" im Kanban ohne
  // Zwischenschritt funktioniert.
  assert.equal(isTransitionAllowed('disposition_offen', 'done'), true);
});

test('isTransitionAllowed: paused → disposition_offen erlaubt (re-disponieren)', () => {
  assert.equal(isTransitionAllowed('paused', 'disposition_offen'), true);
});

// ─── Side-Effects: Mail-Trigger für Flex-Buchung ──────────────────────────────

test('getSideEffects: pending → disposition_offen triggert flex_booking_confirmation', () => {
  const effects = getSideEffects('pending', 'disposition_offen');
  assert.ok(effects.includes('email.flex_booking_confirmation'),
    `expected email.flex_booking_confirmation in ${effects}`);
});

test('getSideEffects: disposition_offen → confirmed triggert flex_booking_disposition (nicht confirmed_customer)', () => {
  const effects = getSideEffects('disposition_offen', 'confirmed');
  assert.ok(effects.includes('email.flex_booking_disposition'),
    `expected email.flex_booking_disposition in ${effects}`);
  assert.ok(!effects.includes('email.confirmed_customer'),
    'flex flow should NOT trigger standard confirmed_customer mail');
  assert.ok(effects.includes('email.confirmed_office'),
    'office should still be informed');
  assert.ok(effects.includes('email.confirmed_photographer'),
    'photographer should still be informed');
});

test('getSideEffects: pending → confirmed triggert weiterhin standard confirmed_customer (nicht flex)', () => {
  const effects = getSideEffects('pending', 'confirmed');
  assert.ok(effects.includes('email.confirmed_customer'),
    'standard flow should trigger confirmed_customer');
  assert.ok(!effects.includes('email.flex_booking_disposition'),
    'standard flow should NOT trigger flex disposition mail');
});

// ─── Transition-Error: confirmed erfordert Photographer + Termin ──────────────

test('getTransitionError: disposition_offen → confirmed ohne Photographer schlägt fehl', () => {
  const err = getTransitionError('disposition_offen', 'confirmed', { schedule: { date: '2026-12-01', time: '10:00' } });
  assert.ok(err && /Fotograf/i.test(err), `expected Fotograf-Fehler, got: ${err}`);
});

test('getTransitionError: disposition_offen → confirmed ohne Termin schlägt fehl', () => {
  const err = getTransitionError('disposition_offen', 'confirmed', { photographer: { key: 'foo' } });
  assert.ok(err && /Termin/i.test(err), `expected Termin-Fehler, got: ${err}`);
});

test('getTransitionError: disposition_offen → confirmed mit allem OK', () => {
  const err = getTransitionError('disposition_offen', 'confirmed', {
    photographer: { key: 'foo' },
    schedule: { date: '2026-12-01', time: '10:00' },
  });
  assert.equal(err, null);
});
