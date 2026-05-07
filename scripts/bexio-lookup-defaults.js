#!/usr/bin/env node
// Read-only Lookup: holt payment_type, bank_accounts, taxes aus bexio
// und filtert nach Vorgaben (14 Tage netto, UBS Konto 1021, MWST 8.1%).
// Kein Schreibzugriff.

const path = require("path");
const fs = require("fs");

function loadEnv(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!override && process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, "..", ".env"));
loadEnv(path.resolve(__dirname, "..", ".env.vps"));
loadEnv(path.resolve(__dirname, "..", ".env.vps.secrets"));
loadEnv(path.resolve(__dirname, "..", "bexio.env.txt"));

const TOKEN = process.env.BEXIO_API_TOKEN;
const BASE = (process.env.BEXIO_API_BASE || process.env.BEXIO_API_URL || "https://api.bexio.com").replace(/\/$/, "");
if (!TOKEN) { console.error("FEHLER: BEXIO_API_TOKEN fehlt."); process.exit(1); }

async function bx(method, p) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    console.error(`bexio ${method} ${p} → ${res.status}`);
    console.error(typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data, null, 2).slice(0, 500));
    return null;
  }
  return data;
}

(async () => {
  console.log(`bexio Lookup gegen ${BASE}\n`);

  // ─── payment_type (Zahlungskonditionen) ──────────────────────────────────
  console.log("── /2.0/payment_type ──────────────────────────────────────");
  const payments = await bx("GET", "/2.0/payment_type");
  if (Array.isArray(payments)) {
    for (const p of payments) {
      console.log(`  id=${String(p.id).padStart(3)}  name="${p.name}"  is_active=${p.is_active ?? "?"}`);
    }
    const match14 = payments.find(p => /14/.test(String(p.name || "")) && /tag|jour|day/i.test(String(p.name || "")));
    if (match14) console.log(`\n  → Match "14 Tage": id=${match14.id}  "${match14.name}"`);
    else console.log(`\n  → Kein "14 Tage" in name gefunden — bitte manuell auswählen.`);
  }

  // ─── bank_account ─────────────────────────────────────────────────────────
  console.log("\n── /3.0/banking/accounts ──────────────────────────────────");
  let banks = await bx("GET", "/3.0/banking/accounts");
  if (!Array.isArray(banks)) {
    console.log("  (3.0 banking/accounts nicht verfügbar — versuche 2.0)");
    banks = await bx("GET", "/2.0/bank_account");
  }
  if (Array.isArray(banks)) {
    for (const b of banks) {
      const accNo = b.account_no || b.bank_account_no || b.iban || "?";
      const bankName = b.name || b.bank_name || "?";
      console.log(`  id=${String(b.id).padStart(3)}  bank="${bankName}"  account_no=${accNo}  iban=${b.iban || "—"}`);
    }
    const ubs = banks.find(b => /ubs/i.test(String(b.name || b.bank_name || "")) || String(b.account_no || "").includes("1021"));
    if (ubs) console.log(`\n  → Match UBS/1021: id=${ubs.id}  "${ubs.name || ubs.bank_name}"  ${ubs.iban || ""}`);
    else console.log(`\n  → Kein UBS/1021-Treffer — bitte manuell auswählen.`);
  }

  // ─── taxes (MWST) ─────────────────────────────────────────────────────────
  console.log("\n── /3.0/taxes (Filter: aktiv) ─────────────────────────────");
  const taxes = await bx("GET", "/3.0/taxes?scope=ACTIVE");
  if (Array.isArray(taxes)) {
    for (const t of taxes) {
      console.log(`  id=${String(t.id).padStart(3)}  code="${t.code}"  value=${t.value}  type=${t.type}  net_tax_type=${t.net_tax_type}  display_name="${t.display_name || t.name}"`);
    }
    const m81 = taxes.find(t =>
      Number(t.value) === 8.1 &&
      String(t.type || "").toLowerCase() === "sales" &&
      String(t.net_tax_type || "").toLowerCase().includes("net") === false
    ) || taxes.find(t => Number(t.value) === 8.1);
    if (m81) console.log(`\n  → Match 8.1% Sales: id=${m81.id}  "${m81.display_name || m81.name}"  net_tax_type=${m81.net_tax_type}`);
    else console.log(`\n  → Kein 8.1%-Treffer — bitte manuell auswählen.`);
  }

  // ─── units (Mengeneinheiten) ─────────────────────────────────────────────
  console.log("\n── /2.0/unit ──────────────────────────────────────────────");
  const units = await bx("GET", "/2.0/unit");
  if (Array.isArray(units)) {
    for (const u of units) {
      console.log(`  id=${String(u.id).padStart(3)}  name="${u.name}"`);
    }
    const stk = units.find(u => /^(stk|stueck|st\.|piece|pcs|each)/i.test(String(u.name || "")));
    if (stk) console.log(`\n  → Match "Stk/Stück": id=${stk.id}  "${stk.name}"`);
    else console.log(`\n  → Kein Stk-Treffer — bitte manuell auswählen.`);
  }

  // ─── accounts (Kontenrahmen) ─────────────────────────────────────────────
  console.log("\n── /2.0/accounts (Filter: Ertrag, KMU-typisch 3xxx) ──────");
  const accounts = await bx("GET", "/2.0/accounts");
  if (Array.isArray(accounts)) {
    const ertrag = accounts.filter(a =>
      String(a.account_type || "").toLowerCase().includes("revenue") ||
      String(a.account_type || "").toLowerCase().includes("ertrag") ||
      /^3\d{3}$/.test(String(a.account_no || ""))
    ).slice(0, 30);
    for (const a of ertrag) {
      console.log(`  id=${String(a.id).padStart(3)}  no=${a.account_no}  name="${a.name}"  type=${a.account_type || "?"}  active=${a.is_active ?? "?"}`);
    }
    const dienst = accounts.find(a => /3200|3400|dienstleist/i.test(`${a.account_no} ${a.name}`));
    if (dienst) console.log(`\n  → Vorschlag Dienstleistungs-Ertrag: id=${dienst.id}  no=${dienst.account_no}  "${dienst.name}"`);
    else console.log(`\n  → Kein Dienstleistungs-Konto eindeutig — manuell auswählen.`);
  }
})().catch((e) => { console.error("ABBRUCH:", e.message); process.exit(1); });
