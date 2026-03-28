#!/usr/bin/env node
/**
 * Setzt das Admin-Passwort zurück.
 * Verwendung: node reset-admin-password.js [neuesPasswort]
 * Standard-Passwort: Biel2503!
 *
 * Das Skript überschreibt /app/admin-account.json (oder lokal admin-account.json)
 * mit einem neuen Hash für das angegebene Passwort.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ADMIN_ACCOUNT_PATH = path.join(__dirname, "admin-account.json");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

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
  if (pw.length < 8) throw new Error("Passwort muss mindestens 8 Zeichen lang sein");
  const salt = crypto.randomBytes(16);
  const derivedKey = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${Buffer.from(derivedKey).toString("base64")}`;
}

async function main() {
  const newPassword = process.argv[2] || "Biel2503!";

  console.log(`[reset-admin] Benutzer: ${ADMIN_USER}`);
  console.log(`[reset-admin] Passwort-Länge: ${newPassword.length} Zeichen`);

  let existing = null;
  try {
    existing = JSON.parse(fs.readFileSync(ADMIN_ACCOUNT_PATH, "utf8"));
    console.log(`[reset-admin] Bestehende Datei gefunden: user=${existing.user}`);
  } catch {
    console.log("[reset-admin] Keine bestehende admin-account.json gefunden – erstelle neu.");
  }

  const passwordHash = await hashPassword(newPassword);
  const account = {
    user: existing?.user || ADMIN_USER,
    email: existing?.email || ADMIN_EMAIL,
    name: existing?.name || "Admin",
    phone: existing?.phone || "",
    language: existing?.language || "de",
    passwordHash,
  };

  fs.writeFileSync(ADMIN_ACCOUNT_PATH, JSON.stringify(account, null, 2), "utf8");
  console.log(`[reset-admin] admin-account.json wurde erfolgreich aktualisiert.`);
  console.log(`[reset-admin] Login: ${account.user} / ${newPassword}`);
}

main().catch((err) => {
  console.error("[reset-admin] Fehler:", err.message);
  process.exit(1);
});
