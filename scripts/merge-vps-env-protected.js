#!/usr/bin/env node
/**
 * Ergänzt /tmp/propus-platform.env.vps (aus GitHub Secret VPS_ENV_FILE) um
 * PAYREXX_*-Werte aus der aktuell auf dem VPS liegenden .env.vps, falls das
 * Secret diese Keys leer lässt oder weglässt.
 *
 * So schlägt guard-vps-env.sh nicht mehr fehl, wenn das Secret veraltet ist,
 * ohne Payrexx-Konfiguration zu löschen.
 *
 * Usage: node scripts/merge-vps-env-protected.js <incoming-path> <current-live-path>
 */
const fs = require("fs");

const PROTECTED_KEYS = ["PAYREXX_INSTANCE", "PAYREXX_API_SECRET", "PAYREXX_WEBHOOK_SECRET"];

function parseEnv(filePath) {
  const values = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex < 1) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }
  return values;
}

const incomingPath = process.argv[2];
const currentPath = process.argv[3];

if (!incomingPath || !currentPath) {
  console.error("Usage: merge-vps-env-protected.js <incoming-env> <current-live-env>");
  process.exit(2);
}

if (!fs.existsSync(currentPath)) {
  console.log("[merge-vps-env-protected] Keine Live-.env.vps (Datei fehlt), Merge übersprungen.");
  process.exit(0);
}

const incoming = parseEnv(incomingPath);
const current = parseEnv(currentPath);
const raw = fs.readFileSync(incomingPath, "utf8");
const lines = raw.split(/\r?\n/);
const seenProtected = new Set();
const out = [];

for (const rawLine of lines) {
  const lineTrim = rawLine.trim();
  if (!lineTrim || lineTrim.startsWith("#")) {
    out.push(rawLine);
    continue;
  }
  const eqIndex = rawLine.indexOf("=");
  if (eqIndex < 1) {
    out.push(rawLine);
    continue;
  }
  const key = rawLine.slice(0, eqIndex).trim();
  if (!PROTECTED_KEYS.includes(key)) {
    out.push(rawLine);
    continue;
  }
  seenProtected.add(key);
  let value = rawLine.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");
  const curVal = String(current[key] ?? "").trim();
  if (!String(value).trim() && curVal) {
    value = current[key];
    console.log(`[merge-vps-env-protected] ${key} aus Live-.env.vps übernommen (Secret leer).`);
    out.push(`${key}=${value}`);
  } else {
    out.push(rawLine);
  }
}

for (const key of PROTECTED_KEYS) {
  if (seenProtected.has(key)) continue;
  const curVal = String(current[key] ?? "").trim();
  const incVal = String(incoming[key] ?? "").trim();
  if (!incVal && curVal) {
    console.log(`[merge-vps-env-protected] ${key} angehängt aus Live-.env.vps (im Secret fehlend).`);
    out.push(`${key}=${current[key]}`);
  }
}

const trailing = raw.endsWith("\n") ? "\n" : "";
fs.writeFileSync(incomingPath, out.join("\n") + trailing);
console.log("[merge-vps-env-protected] Fertig.");
