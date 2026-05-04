const crypto = require("crypto");

function normalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function hashSha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

async function scryptAsync(password, salt, keylen) {
  return await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

/**
 * Pruefung gegen die Passwort-Policy. Wirft mit aussagekraeftiger
 * Fehlermeldung wenn das Passwort zu schwach ist (Bug-Hunt T03 MEDIUM).
 *
 * Mindestlaenge 12 + mindestens 2 Zeichenklassen (Lowercase/Uppercase/
 * Digit/Symbol). 8 Zeichen waren NIST-Empfehlung von 2017 — heute
 * Brute-Force-fest erst ab 12+ mit Klassen.
 *
 * Wirft mit `err.code = 'PASSWORD_POLICY'` damit Routes den Fall vom
 * generischen Internal-Error unterscheiden und 400 statt 500 antworten
 * koennen (Codex P2 #272).
 */
function validatePasswordPolicy(password) {
  const pw = String(password || "");
  if (pw.length < 12) {
    const err = new Error("Passwort muss mindestens 12 Zeichen lang sein");
    err.code = "PASSWORD_POLICY";
    throw err;
  }
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/\d/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  if (classes < 2) {
    const err = new Error("Passwort muss mindestens zwei Zeichen-Klassen enthalten (Gross/Klein, Ziffer, Sonderzeichen)");
    err.code = "PASSWORD_POLICY";
    throw err;
  }
}

async function hashPassword(password) {
  const pw = String(password || "");
  validatePasswordPolicy(pw);

  const salt = crypto.randomBytes(16);
  const derivedKey = await scryptAsync(pw, salt, 64);
  // Format: scrypt$saltB64$hashB64
  return `scrypt$${salt.toString("base64")}$${Buffer.from(derivedKey).toString("base64")}`;
}

async function verifyPassword(password, storedHash) {
  const pw = String(password || "");
  const stored = String(storedHash || "");
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  if (parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  const derivedKey = await scryptAsync(pw, salt, expected.length);

  // timing safe compare
  if (derivedKey.length !== expected.length) return false;
  return crypto.timingSafeEqual(derivedKey, expected);
}

function createSessionToken() {
  // 256-bit random; base64url is URL-safe without extra encoding
  return crypto.randomBytes(32).toString("base64url");
}

module.exports = {
  normalizeEmail,
  hashSha256Hex,
  hashPassword,
  verifyPassword,
  createSessionToken,
  validatePasswordPolicy,
};

