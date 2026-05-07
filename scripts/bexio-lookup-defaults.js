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
  // ⚠ /3.0/taxes?scope=ACTIVE&types=sales_tax filtert NICHT nach is_active —
  // wir holen alle und filtern lokal. kb_position_custom akzeptiert nur Taxes mit
  // is_active=true, und je nach Account-Konfiguration:
  //   - Effektivmethode: type='sales_tax' (z.B. id 14 8.1% Normalsatz)
  //   - Saldosteuersatz: type='net_tax'   (z.B. id 31 SSS1/53 oder id 32 SSS2/62)
  //   - Export/steuerfrei: type='not_taxable_turnover' (z.B. id 3 Export 0%)
  console.log("\n── /3.0/taxes (lokal gefiltert: is_active=true) ──────────");
  const taxes = await bx("GET", "/3.0/taxes");
  if (Array.isArray(taxes)) {
    const active = taxes.filter((t) => t.is_active === true);
    const usable = active.filter((t) =>
      ["sales_tax", "net_tax", "not_taxable_turnover"].includes(String(t.type || ""))
    );
    for (const t of usable) {
      console.log(`  id=${String(t.id).padStart(3)}  code="${t.code}"  value=${t.value}  type=${t.type}  display_name="${t.display_name || t.name}"`);
    }
    if (active.length === 0) {
      console.log("  → KEINE Tax ist is_active=true. bexio-Account-Setup unvollstaendig.");
    } else if (usable.length === 0) {
      console.log("  → Keine als Verkaufs-Tax nutzbare Tax aktiv (sales_tax/net_tax/not_taxable_turnover).");
    } else {
      // Erst sales_tax 8.1% (Effektivmethode) suchen, dann net_tax 8.1% (Saldo)
      const eff = usable.find((t) => Number(t.value) === 8.1 && t.type === "sales_tax");
      const sss = usable.find((t) => Number(t.value) === 8.1 && t.type === "net_tax");
      if (eff) console.log(`\n  → Vorschlag Effektivmethode 8.1%: id=${eff.id}  "${eff.code}"`);
      if (sss) console.log(`  → Vorschlag Saldosteuersatz 8.1%:  id=${sss.id}  "${sss.code}"`);
      if (!eff && !sss) console.log(`  → Kein 8.1%-Treffer in Sales/Net. Manuell auswaehlen.`);
    }
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
