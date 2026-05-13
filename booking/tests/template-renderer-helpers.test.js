const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAddressLine,
  buildPhotographerRadiusLabel,
} = require('../template-renderer');

// ─── buildAddressLine ─────────────────────────────────────────────────────────

test('buildAddressLine: order.address mit eigener PLZ → nur order.address (Liegenschaft)', () => {
  const billing = { zipcity: '8052 Zürich' };
  const order = { address: 'Seehaldenstrasse 6A, 9404 Rorschacherberg' };
  assert.equal(buildAddressLine(billing, order), 'Seehaldenstrasse 6A, 9404 Rorschacherberg');
});

test('buildAddressLine: order.address ohne PLZ → kombiniert mit billing.zipcity', () => {
  const billing = { zipcity: '6300 Zug' };
  const order = { address: 'Bahnhofstrasse 5' };
  assert.equal(buildAddressLine(billing, order), '6300 Zug, Bahnhofstrasse 5');
});

test('buildAddressLine: leere order.address → fallback auf billing.zipcity', () => {
  const billing = { zipcity: '6300 Zug' };
  const order = { address: '' };
  assert.equal(buildAddressLine(billing, order), '6300 Zug');
});

test('buildAddressLine: beide leer → leer string', () => {
  assert.equal(buildAddressLine({}, {}), '');
});

test('buildAddressLine: order.address mit PLZ und gleicher billing.zipcity → trotzdem keine Duplikation', () => {
  const billing = { zipcity: '9404 Rorschacherberg' };
  const order = { address: 'Seehaldenstrasse 6A, 9404 Rorschacherberg' };
  assert.equal(buildAddressLine(billing, order), 'Seehaldenstrasse 6A, 9404 Rorschacherberg');
});

// ─── buildPhotographerRadiusLabel ─────────────────────────────────────────────

test('buildPhotographerRadiusLabel: null/undefined/empty → leer (Zeile wird ausgeblendet)', () => {
  assert.equal(buildPhotographerRadiusLabel(null), '');
  assert.equal(buildPhotographerRadiusLabel(undefined), '');
  assert.equal(buildPhotographerRadiusLabel(''), '');
  assert.equal(buildPhotographerRadiusLabel('   '), '');
});

test('buildPhotographerRadiusLabel: 0 oder negativ → leer (unbegrenzt = nicht anzeigen)', () => {
  assert.equal(buildPhotographerRadiusLabel(0), '');
  assert.equal(buildPhotographerRadiusLabel('0'), '');
  assert.equal(buildPhotographerRadiusLabel(-5), '');
});

test('buildPhotographerRadiusLabel: positive Zahl → "X km"', () => {
  assert.equal(buildPhotographerRadiusLabel(30), '30 km');
  assert.equal(buildPhotographerRadiusLabel('45'), '45 km');
  assert.equal(buildPhotographerRadiusLabel(29.6), '30 km');
});

test('buildPhotographerRadiusLabel: nicht-numerischer String → bleibt unverändert (trim)', () => {
  assert.equal(buildPhotographerRadiusLabel('national'), 'national');
});
