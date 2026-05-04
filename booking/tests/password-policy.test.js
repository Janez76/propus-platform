const test = require("node:test");
const assert = require("node:assert/strict");

const { validatePasswordPolicy } = require("../customer-auth");

test("validatePasswordPolicy: lehnt Passwoerter unter 12 Zeichen ab", () => {
  assert.throws(() => validatePasswordPolicy("Abc1!"), /mindestens 12 Zeichen/);
  assert.throws(() => validatePasswordPolicy("Abc1!def#hi"), /mindestens 12 Zeichen/); // 11
});

test("validatePasswordPolicy: akzeptiert 12+ mit zwei Klassen", () => {
  validatePasswordPolicy("Abcdefghijk1");          // upper + lower + digit (3)
  validatePasswordPolicy("abcdefghijkA");          // lower + upper (2)
  validatePasswordPolicy("abcdefghijk1");          // lower + digit (2)
  validatePasswordPolicy("abcdefghijk!");          // lower + symbol (2)
  validatePasswordPolicy("ABCDEFGHIJK1");          // upper + digit (2)
});

test("validatePasswordPolicy: lehnt 12+ aus nur einer Klasse ab", () => {
  assert.throws(() => validatePasswordPolicy("aaaaaaaaaaaa"), /Zeichen-Klassen/);
  assert.throws(() => validatePasswordPolicy("AAAAAAAAAAAA"), /Zeichen-Klassen/);
  assert.throws(() => validatePasswordPolicy("111111111111"), /Zeichen-Klassen/);
});

test("validatePasswordPolicy: behandelt null/undefined sauber", () => {
  assert.throws(() => validatePasswordPolicy(null), /mindestens 12 Zeichen/);
  assert.throws(() => validatePasswordPolicy(undefined), /mindestens 12 Zeichen/);
  assert.throws(() => validatePasswordPolicy(""), /mindestens 12 Zeichen/);
});
