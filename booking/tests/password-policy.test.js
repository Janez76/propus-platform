const test = require("node:test");
const assert = require("node:assert/strict");

const { validatePasswordPolicy } = require("../customer-auth");

test("validatePasswordPolicy: lehnt Passwoerter unter 8 Zeichen ab", () => {
  assert.throws(() => validatePasswordPolicy("Abc1!"), /mindestens 8 Zeichen/);
  assert.throws(() => validatePasswordPolicy("Abc1!df"), /mindestens 8 Zeichen/); // 7
});

test("validatePasswordPolicy: akzeptiert 8+ mit zwei Klassen", () => {
  validatePasswordPolicy("Abcdefg1");          // upper + lower + digit (3)
  validatePasswordPolicy("abcdefgA");          // lower + upper (2)
  validatePasswordPolicy("abcdefg1");          // lower + digit (2)
  validatePasswordPolicy("abcdefg!");          // lower + symbol (2)
  validatePasswordPolicy("ABCDEFG1");          // upper + digit (2)
});

test("validatePasswordPolicy: lehnt 8+ aus nur einer Klasse ab", () => {
  assert.throws(() => validatePasswordPolicy("aaaaaaaa"), /Zeichen-Klassen/);
  assert.throws(() => validatePasswordPolicy("AAAAAAAA"), /Zeichen-Klassen/);
  assert.throws(() => validatePasswordPolicy("11111111"), /Zeichen-Klassen/);
});

test("validatePasswordPolicy: behandelt null/undefined sauber", () => {
  assert.throws(() => validatePasswordPolicy(null), /mindestens 8 Zeichen/);
  assert.throws(() => validatePasswordPolicy(undefined), /mindestens 8 Zeichen/);
  assert.throws(() => validatePasswordPolicy(""), /mindestens 8 Zeichen/);
});

test("validatePasswordPolicy: setzt err.code='PASSWORD_POLICY' (Codex P2 #272)", () => {
  // Routes verlassen sich auf den Code um 4xx vs 5xx zu unterscheiden.
  try { validatePasswordPolicy("short"); assert.fail("expected throw"); }
  catch (e) { assert.equal(e.code, "PASSWORD_POLICY"); }
  try { validatePasswordPolicy("aaaaaaaa"); assert.fail("expected throw"); }
  catch (e) { assert.equal(e.code, "PASSWORD_POLICY"); }
});
