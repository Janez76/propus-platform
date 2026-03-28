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

async function hashPassword(password) {
  const pw = String(password || "");
  if (pw.length < 8) {
    throw new Error("Passwort muss mindestens 8 Zeichen lang sein");
  }

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
};

