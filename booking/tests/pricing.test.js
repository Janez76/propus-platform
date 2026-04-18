const test = require('node:test');
const assert = require('node:assert/strict');

const {
  roundCHF,
  computeTourPrice,
  computeTourDuration,
  isRuleWithinDate,
} = require('../pricing');

const {
  validateDiscountCode,
  calculateDiscount,
  DISCOUNT_CODES,
} = require('../discount-codes');

// ─── roundCHF ─────────────────────────────────────────────────────────────────

test('roundCHF: rundet auf 0.05 CHF-Schritte', () => {
  assert.equal(roundCHF(10.03), 10.05);  // 10.03 / 0.05 = 200.6 → 201 × 0.05 = 10.05
  assert.equal(roundCHF(10.02), 10.00);  // 10.02 / 0.05 = 200.4 → 200 × 0.05 = 10.00
  assert.equal(roundCHF(10.08), 10.10);  // klar über Midpoint
  assert.equal(roundCHF(0), 0);
});

test('roundCHF: benutzerdefinierter Schritt', () => {
  assert.equal(roundCHF(10.30, 0.10), 10.30);
  assert.equal(roundCHF(10.36, 0.10), 10.40); // 10.36 klar über Midpoint 10.35
  assert.equal(roundCHF(100, 1), 100);
});

test('roundCHF: NaN und Infinity geben 0 zurück', () => {
  assert.equal(roundCHF(NaN), 0);
  assert.equal(roundCHF(Infinity), 0);
  assert.equal(roundCHF(-Infinity), 0);
});

test('roundCHF: ungültiger Schritt gibt den Wert unverändert zurück', () => {
  assert.equal(roundCHF(10.33, 0), 10.33);
  assert.equal(roundCHF(10.33, -1), 10.33);
  assert.equal(roundCHF(10.33, NaN), 10.33);
});

// ─── computeTourPrice ─────────────────────────────────────────────────────────

test('computeTourPrice: Staffelpreis aus tiers', () => {
  const config = {
    tiers: [
      { maxArea: 50, price: 199 },
      { maxArea: 100, price: 299 },
    ],
    basePrice: 399,
    incrementArea: 50,
    incrementPrice: 50,
  };
  assert.equal(computeTourPrice(40, config), 199);
  assert.equal(computeTourPrice(50, config), 199);
  assert.equal(computeTourPrice(80, config), 299);
  assert.equal(computeTourPrice(100, config), 299);
});

test('computeTourPrice: Überlauf-Preis wenn kein passender Tier', () => {
  const config = {
    tiers: [{ maxArea: 100, price: 299 }],
    basePrice: 399,
    incrementArea: 50,
    incrementPrice: 50,
  };
  // 150m²: 50m² über maxTier (100), 1 Schritt = 399 + 50 = 449
  assert.equal(computeTourPrice(150, config), 449);
  // 200m²: 2 Schritte = 399 + 100 = 499
  assert.equal(computeTourPrice(200, config), 499);
});

test('computeTourPrice: 0 oder negative Fläche gibt null', () => {
  const config = { tiers: [], basePrice: 299 };
  assert.equal(computeTourPrice(0, config), null);
  assert.equal(computeTourPrice(-10, config), null);
  assert.equal(computeTourPrice('abc', config), null);
});

test('computeTourPrice: kein basePrice gibt null', () => {
  const config = { tiers: [], basePrice: 0 };
  assert.equal(computeTourPrice(100, config), null);
});

// ─── computeTourDuration ──────────────────────────────────────────────────────

test('computeTourDuration: Dauer aus tiers', () => {
  const config = {
    tiers: [
      { maxArea: 50, durationMinutes: 60 },
      { maxArea: 100, durationMinutes: 90 },
    ],
    baseDuration: 120,
    incrementArea: 50,
    incrementDuration: 15,
  };
  assert.equal(computeTourDuration(40, config), 60);
  assert.equal(computeTourDuration(80, config), 90);
});

test('computeTourDuration: Überlauf-Dauer wenn kein Tier passt', () => {
  const config = {
    tiers: [{ maxArea: 100, durationMinutes: 90 }],
    baseDuration: 120,
    incrementArea: 50,
    incrementDuration: 15,
  };
  // 150m²: 1 Schritt über maxTier → 120 + 15 = 135
  assert.equal(computeTourDuration(150, config), 135);
});

test('computeTourDuration: 0 oder ungültige Fläche gibt null', () => {
  const config = { tiers: [], baseDuration: 90 };
  assert.equal(computeTourDuration(0, config), null);
  assert.equal(computeTourDuration(-5, config), null);
});

// ─── isRuleWithinDate ─────────────────────────────────────────────────────────

test('isRuleWithinDate: Regel ohne Datum-Einschränkung gilt immer', () => {
  assert.equal(isRuleWithinDate({}), true);
  assert.equal(isRuleWithinDate({ valid_from: null, valid_to: null }), true);
});

test('isRuleWithinDate: Regel mit valid_from in der Zukunft gilt nicht', () => {
  const rule = { valid_from: '2099-01-01' };
  assert.equal(isRuleWithinDate(rule, new Date('2026-01-01')), false);
});

test('isRuleWithinDate: Regel mit valid_to in der Vergangenheit gilt nicht', () => {
  const rule = { valid_to: '2020-12-31' };
  assert.equal(isRuleWithinDate(rule, new Date('2026-01-01')), false);
});

test('isRuleWithinDate: Regel innerhalb valid_from..valid_to gilt', () => {
  const rule = { valid_from: '2026-01-01', valid_to: '2026-12-31' };
  assert.equal(isRuleWithinDate(rule, new Date('2026-06-15')), true);
});

// ─── validateDiscountCode ─────────────────────────────────────────────────────

test('validateDiscountCode: bekannter Code gibt Prozentsatz zurück', () => {
  const percent = validateDiscountCode('TEST');
  assert.equal(typeof percent, 'number');
  assert.ok(percent > 0 && percent <= 100);
});

test('validateDiscountCode: Code ist case-insensitive (normiert zu uppercase)', () => {
  const upper = validateDiscountCode('TEST');
  const lower = validateDiscountCode('test');
  assert.equal(upper, lower);
});

test('validateDiscountCode: unbekannter Code gibt null', () => {
  assert.equal(validateDiscountCode('INVALID_CODE_XYZ'), null);
  assert.equal(validateDiscountCode(''), null);
  assert.equal(validateDiscountCode(null), null);
});

// ─── calculateDiscount ────────────────────────────────────────────────────────

test('calculateDiscount: gibt percent und amount zurück', () => {
  const result = calculateDiscount('TEST', 100);
  assert.ok(result !== null);
  assert.equal(typeof result.percent, 'number');
  assert.equal(typeof result.amount, 'number');
  assert.ok(result.amount > 0);
  assert.equal(result.amount, result.percent);
});

test('calculateDiscount: ungültiger Code gibt null', () => {
  assert.equal(calculateDiscount('INVALID_XYZ', 100), null);
});

test('calculateDiscount: subtotal <= 0 gibt null', () => {
  assert.equal(calculateDiscount('TEST', 0), null);
  assert.equal(calculateDiscount('TEST', -50), null);
});

test('calculateDiscount: Betrag ist korrekt (Subtotal * Prozent/100)', () => {
  // TEST = 10%
  const result = calculateDiscount('TEST', 200);
  assert.ok(result !== null);
  assert.equal(result.percent, DISCOUNT_CODES['TEST']);
  assert.equal(result.amount, 200 * (DISCOUNT_CODES['TEST'] / 100));
});
