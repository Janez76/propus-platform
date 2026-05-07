#!/usr/bin/env node
// Throwaway: loescht angegebene leere kb_orders in bexio.
// Nutzung: node scripts/bexio-cleanup-orphan-orders.js 1 2
const path = require("path");
const fs = require("fs");
function loadEnv(p) { if (!fs.existsSync(p)) return; for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m || process.env[m[1]] !== undefined) continue; let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[m[1]] = v; } }
loadEnv(path.resolve(__dirname, "..", "bexio.env.txt"));
const TOKEN = process.env.BEXIO_API_TOKEN;
const BASE = (process.env.BEXIO_API_BASE || "https://api.bexio.com").replace(/\/$/, "");
if (!TOKEN) { console.error("kein Token"); process.exit(1); }
const ids = process.argv.slice(2);
if (ids.length === 0) { console.error("Usage: cleanup <id> [id ...]"); process.exit(1); }
(async () => {
  for (const id of ids) {
    const res = await fetch(`${BASE}/2.0/kb_order/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    });
    const text = await res.text();
    console.log(`DELETE kb_order/${id} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
})();
