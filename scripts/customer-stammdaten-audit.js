#!/usr/bin/env node
/**
 * Stammdaten-Audit: Kunden + Kontakte gegen Exxas abgleichen, Referenz-Links für
 * manuelle Web-/Zefix-Prüfung erzeugen. Keine DB-Schreibvorgänge.
 *
 *   node scripts/customer-stammdaten-audit.js --export
 *   node scripts/customer-stammdaten-audit.js --export -f C:\pfad\.env
 *
 * Ausgabe: booking/analysis-customer-stammdaten/
 *   - exxas_feldabweichungen.csv
 *   - exxas_kontakte_nur_exxas.csv
 *   - exxas_kontakte_nur_lokal.csv
 *   - kunden_ohne_exxas_mit_recherchelinks.csv
 *   - audit.md
 *
 * Hinweis: Kein vollautomatischer Internet-Abgleich (Zefix/Google erfordern
 * menschliche Plausibilisierung). Unsichere Fälle: Spalte "pruefung" = "manuell".
 * Ausnahmen Firmenname vs. Exxas: siehe `EXXAS_COMPANY_NAME_DIFF_IGNORE` (z. B. Kunde 74).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const _pg = path.join(__dirname, "../booking/node_modules/pg");
const { Pool } = require(fs.existsSync(path.join(_pg, "package.json")) ? _pg : "pg");

function tryRequireDotenv() {
  const d = path.join(__dirname, "../booking/node_modules/dotenv");
  try {
    return require(d);
  } catch {
    try {
      return require("dotenv");
    } catch {
      return null;
    }
  }
}

function loadEnv(args) {
  if (String(process.env.DATABASE_URL || "").trim()) {
    return { used: "(DATABASE_URL schon gesetzt)", tried: [] };
  }
  const dotenv = tryRequireDotenv();
  const list = [
    args.envFile ? path.resolve(args.envFile) : null,
    path.join(__dirname, "../booking/.env"),
    path.join(__dirname, "../.env"),
    path.join(__dirname, "../app/.env"),
  ].filter(Boolean);
  const tried = [];
  if (!dotenv) {
    return { used: null, tried: [...list, "dotenv fehlt"] };
  }
  for (const p of list) {
    if (!fs.existsSync(p)) {
      tried.push(`${p} (fehlt)`);
      continue;
    }
    dotenv.config({ path: p, override: true });
    tried.push(p);
    if (String(process.env.DATABASE_URL || "").trim()) {
      return { used: p, tried };
    }
  }
  return { used: null, tried };
}

function asString(v) {
  return v == null ? "" : String(v).trim();
}

function normalizeText(s) {
  return asString(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitZipCity(value) {
  const raw = asString(value);
  if (!raw) return { zip: "", city: "" };
  const m = raw.match(/^([0-9]{4,6})\s+(.+)$/);
  if (!m) return { zip: "", city: raw };
  return { zip: asString(m[1]), city: asString(m[2]) };
}

function normZip(v) {
  return asString(v).replace(/[^0-9]/g, "");
}

/**
 * Kunden, bei denen `company` in Propus fachlich korrekt ist, Exxas aber den
 * Karten-/Hauptnamen anders führt (kein "Firmenname weicht ab" melden).
 * { customerId, reason } – erweitern falls noetig.
 */
const EXXAS_COMPANY_NAME_DIFF_IGNORE = new Map([
  [74, "Propus: Mirai Real Estate AG, Exxas: Tonet = Karten-/Personenkontext (Ok)"],
]);

function normalizeExxasBaseUrl(value) {
  return asString(value).replace(/\/$/, "");
}

/** Wie tours/lib/exxas.js `buildExxasUrl` – Exxas-Base + /api/v2/… */
function buildExxasUrl(baseUrl, endpoint) {
  const base = normalizeExxasBaseUrl(baseUrl || "https://api.exxas.net");
  const path = asString(endpoint);
  if (!path) return base;
  if (base.endsWith("/api/v2") && path === "/api/v2") return base;
  if (base.endsWith("/api/v2") && path.startsWith("/api/v2/")) {
    return `${base}${path.slice("/api/v2".length)}`;
  }
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildExxasHeaders(credentials) {
  const apiKey = asString(credentials?.apiKey);
  const appPassword = asString(credentials?.appPassword);
  const authMode = credentials?.authMode === "bearer" ? "bearer" : "apiKey";
  const authorization = authMode === "bearer" ? `Bearer ${apiKey}` : `ApiKey ${apiKey}`;
  const headers = {
    Authorization: authorization,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (appPassword) headers["X-App-Password"] = appPassword;
  return headers;
}

async function fetchExxasJson(url, headers) {
  const res = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`EXXAS HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function parseExxasArray(payload) {
  if (Array.isArray(payload?.message)) return payload.message;
  if (Array.isArray(payload)) return payload;
  return [];
}

function mapExxasCustomer(raw) {
  return {
    id: asString(raw?.id || raw?.nummer),
    name:
      asString(raw?.firmenname) ||
      asString(raw?.suchname) ||
      [asString(raw?.vorname), asString(raw?.nachname)].filter(Boolean).join(" "),
    email: asString(raw?.email).toLowerCase(),
    phone: asString(raw?.telefon1 || raw?.mobile || raw?.telefon2),
    street: asString(raw?.strasse),
    zip: asString(raw?.plz),
    city: asString(raw?.ort),
    country: asString(raw?.land),
  };
}

function mapExxasContact(raw) {
  return {
    id: asString(raw?.id),
    customerRef: asString(raw?.ref_kunde),
    name: [asString(raw?.kt_vorname), asString(raw?.kt_nachname)].filter(Boolean).join(" ") || asString(raw?.kt_suchname),
    email: asString(raw?.kt_email).toLowerCase(),
    phone: asString(raw?.kt_direkt || raw?.kt_mobile),
    role: asString(raw?.kt_funktion),
  };
}

function googleSearchUrl(q) {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function zefixHintUrl(company) {
  // Kein offizieller Deep-Link; Suche lokalisiert auf Zefix über Google
  return googleSearchUrl(`${asString(company)} site:zefix.ch`);
}

function escapeCsv(cell) {
  const s = cell == null ? "" : String(cell);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, rows) {
  if (rows.length === 0) {
    fs.writeFileSync(filePath, "\uFEFF" + "keine_zeilen\n", "utf8");
    return;
  }
  const keys = Object.keys(rows[0]);
  const line = (obj) => keys.map((k) => escapeCsv(obj[k])).join(";");
  const body = [keys.join(";"), ...rows.map(line)].join("\r\n");
  fs.writeFileSync(filePath, "\uFEFF" + body, "utf8");
}

function localZipCity(c) {
  const z0 = normZip(c.zip);
  if (z0) return { zip: z0, city: asString(c.city) };
  const s = splitZipCity(c.zipcity);
  return { zip: normZip(s.zip), city: asString(s.city) || asString(c.city) };
}

function mainDiffRows(local, ex) {
  const rows = [];
  const lid = local.id;
  const lidNum = Number(lid);
  const locCompany = asString(local.company) || asString(local.name);
  const exName = ex.name;
  if (
    !EXXAS_COMPANY_NAME_DIFF_IGNORE.has(lidNum) &&
    normalizeText(locCompany) &&
    normalizeText(exName) &&
    normalizeText(locCompany) !== normalizeText(exName)
  ) {
    rows.push({
      customer_id: lid,
      feld: "company_vs_exxas_name",
      wert_lokal: locCompany,
      wert_exxas: exName,
      pruefung: "manuell",
      grund: "Firmenbezeichnung weicht ab",
    });
  }
  const le = asString(local.email).toLowerCase();
  if (le && ex.email && le !== ex.email) {
    rows.push({
      customer_id: lid,
      feld: "email",
      wert_lokal: le,
      wert_exxas: ex.email,
      pruefung: "manuell",
      grund: "E-Mail abweichend (Aliase in Propus beachten)",
    });
  }
  if (normalizeText(local.street) && normalizeText(ex.street) && normalizeText(local.street) !== normalizeText(ex.street)) {
    rows.push({
      customer_id: lid,
      feld: "strasse",
      wert_lokal: local.street,
      wert_exxas: ex.street,
      pruefung: "manuell",
      grund: "Strasse abweichend",
    });
  }
  const lz = localZipCity(local);
  if (lz.zip && normZip(ex.zip) && lz.zip !== normZip(ex.zip)) {
    rows.push({
      customer_id: lid,
      feld: "plz",
      wert_lokal: lz.zip,
      wert_exxas: ex.zip,
      pruefung: "manuell",
      grund: "PLZ abweichend",
    });
  }
  if (normalizeText(lz.city) && normalizeText(ex.city) && normalizeText(lz.city) !== normalizeText(ex.city)) {
    rows.push({
      customer_id: lid,
      feld: "ort",
      wert_lokal: lz.city,
      wert_exxas: ex.city,
      pruefung: "manuell",
      grund: "Ort abweichend",
    });
  }
  return rows;
}

function deriveBaseUrlFromEndpoint(endpoint) {
  const raw = asString(endpoint);
  if (!raw) return "";
  const withoutQuery = raw.split("?")[0];
  const marker = withoutQuery.indexOf("/api/v2/");
  if (marker >= 0) {
    return withoutQuery.slice(0, marker + "/api/v2".length);
  }
  return withoutQuery.replace(/\/$/, "");
}

/**
 * Wie tours/lib/exxas.js: zuerst tour_manager.settings (exxas_runtime_config),
 * dann booking.app_settings, dann EXXAS_*-Umgebung.
 */
async function loadExxasConfig(pool) {
  let fromTour = null;
  let fromBooking = null;
  try {
    const r1 = await pool.query(
      "SELECT value FROM tour_manager.settings WHERE key = 'exxas_runtime_config' LIMIT 1",
    );
    const v = r1.rows[0]?.value;
    if (v && typeof v === "object") fromTour = v;
  } catch {
    /* tour_manager fehlt in manchen Setups */
  }
  try {
    const r2 = await pool.query("SELECT value_json FROM app_settings WHERE key = 'integration.exxas.config' LIMIT 1");
    const j = r2.rows[0]?.value_json;
    if (j && typeof j === "object") fromBooking = j;
  } catch {
    /* */
  }
  const stored = fromTour || fromBooking;
  const apiKey = String(
    process.env.EXXAS_API_TOKEN ||
      process.env.EXXAS_API_KEY ||
      process.env.EXXAS_JWT ||
      stored?.apiKey ||
      "",
  ).trim();
  if (!apiKey) return null;
  const baseFromStored = stored?.baseUrl || deriveBaseUrlFromEndpoint(stored?.endpoint) || "";
  const baseUrl = normalizeExxasBaseUrl(
    process.env.EXXAS_BASE_URL || baseFromStored || "https://api.exxas.net",
  );
  return {
    apiKey,
    appPassword: String(process.env.EXXAS_APP_PASSWORD || stored?.appPassword || ""),
    baseUrl,
    authMode: String(process.env.EXXAS_AUTH_MODE || stored?.authMode || "").toLowerCase() === "bearer" ? "bearer" : "apiKey",
  };
}

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { export: false, outDir: null, envFile: null, help: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "-h" || a[i] === "--help") o.help = true;
    else if (a[i] === "-e" || a[i] === "--export") o.export = true;
    else if ((a[i] === "--out-dir" || a[i] === "-o") && a[i + 1]) {
      o.outDir = a[i + 1];
      i += 1;
    } else if ((a[i] === "--env-file" || a[i] === "-f") && a[i + 1]) {
      o.envFile = a[i + 1];
      i += 1;
    }
  }
  return o;
}

function printHelp() {
  console.log(`Stammdaten-Audit (Kunden + Kontakte vs. Exxas, nur lesen)

Nutzung:
  node scripts/customer-stammdaten-audit.js --export
  node scripts/customer-stammdaten-audit.js --export -f PFAD_ZUR_.env
  node scripts/customer-stammdaten-audit.js --export -o mein-ordner

Optionen:
  -e, --export       CSV + Markdown (Default: booking/analysis-customer-stammdaten)
  -o, --out-dir      Ausgabe-Ordner
  -f, --env-file     .env mit DATABASE_URL
  -h, --help
`);
}

async function run() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  loadEnv({ envFile: args.envFile || null });
  if (!String(process.env.DATABASE_URL || "").trim()) {
    console.error("Fehlend: DATABASE_URL (—env-file oder exportieren)");
    process.exit(2);
  }
  if (!args.export) {
    console.log("Hinweis: Nutze --export, um Dateien zu schreiben. Starte trotzdem Lauf…");
  }
  const outDir =
    args.outDir && String(args.outDir).trim() ? path.resolve(String(args.outDir)) : path.join(__dirname, "../booking/analysis-customer-stammdaten");
  if (args.export) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
  await pool.query("SET search_path = booking, core, public");
  const cfg = await loadExxasConfig(pool);
  if (!cfg || !String(cfg.apiKey || "").trim()) {
    await pool.end();
    console.error(
      "Exxas nicht konfiguriert: app_settings integration.exxas.config oder EXXAS_API_TOKEN / EXXAS_BASE_URL setzen.",
    );
    process.exit(3);
  }
  const headers = buildExxasHeaders({
    apiKey: cfg.apiKey,
    appPassword: cfg.appPassword,
    authMode: cfg.authMode === "bearer" ? "bearer" : "apiKey",
  });
  const uCust = buildExxasUrl(cfg.baseUrl, "/api/v2/customers");
  const uCont = buildExxasUrl(cfg.baseUrl, "/api/v2/contacts");
  const [cPayload, pPayload] = await Promise.all([fetchExxasJson(uCust, headers), fetchExxasJson(uCont, headers)]);
  const exCustomers = parseExxasArray(cPayload).map(mapExxasCustomer);
  const exContactsRaw = parseExxasArray(pPayload).map(mapExxasContact);
  const exById = new Map();
  for (const c of exCustomers) {
    exById.set(c.id, c);
    exById.set(String(Number(c.id) || c.id), c);
  }
  const exContactsByCustomer = new Map();
  for (const co of exContactsRaw) {
    if (!co.customerRef) continue;
    if (!exContactsByCustomer.has(co.customerRef)) exContactsByCustomer.set(co.customerRef, []);
    exContactsByCustomer.get(co.customerRef).push(co);
  }
  const { rows: customers } = await pool.query(
    `SELECT id, email, name, company, phone, street, zipcity, zip, city, country,
            exxas_customer_id, exxas_address_id, exxas_contact_id
     FROM customers ORDER BY id`,
  );
  const { rows: lokalContacts } = await pool.query(
    `SELECT id, customer_id, name, email, exxas_contact_id FROM customer_contacts ORDER BY customer_id, id`,
  );
  const kontakteByKunde = new Map();
  for (const r of lokalContacts) {
    if (!kontakteByKunde.has(r.customer_id)) kontakteByKunde.set(r.customer_id, []);
    kontakteByKunde.get(r.customer_id).push(r);
  }
  const feldabweichungen = [];
  const exxasNurExxas = [];
  const lokalNurLokal = [];
  const kundenOhneExxas = [];
  const nichtGefundenInExxas = [];
  for (const loc of customers) {
    const exxId = asString(loc.exxas_customer_id);
    if (!exxId) {
      const comp = asString(loc.company) || asString(loc.name);
      kundenOhneExxas.push({
        customer_id: loc.id,
        company: comp,
        email: asString(loc.email),
        strasse: asString(loc.street),
        plz_ort: asString(loc.zipcity) || [asString(loc.zip), asString(loc.city)].filter(Boolean).join(" "),
        link_zefix_suche: zefixHintUrl(comp),
        link_google: googleSearchUrl(`"${comp}" Adresse ${asString(loc.city) || "Schweiz"}`),
        pruefung: "manuell",
        hinweis: "Kein exxas_customer_id – extern prüfen oder in Exxas anlegen/verknüpfen",
      });
      continue;
    }
    const ex = exById.get(exxId) || exById.get(String(exxId));
    if (!ex) {
      nichtGefundenInExxas.push({
        customer_id: loc.id,
        exxas_customer_id: exxId,
        company: asString(loc.company) || asString(loc.name),
        pruefung: "manuell",
        grund: "Kunde nicht in Exxas-API-Export gefunden (ID/Archiv/anderes Mandat?)",
      });
      continue;
    }
    feldabweichungen.push(...mainDiffRows(loc, ex));
    const exList = exContactsByCustomer.get(exxId) || exContactsByCustomer.get(String(exxId)) || [];
    const localList = kontakteByKunde.get(loc.id) || [];
    const localByExx = new Set(localList.map((c) => asString(c.exxas_contact_id)).filter(Boolean));
    for (const eco of exList) {
      if (eco.id && !localByExx.has(eco.id)) {
        exxasNurExxas.push({
          customer_id: loc.id,
          exxas_kunden_id: exxId,
          exxas_kontakt_id: eco.id,
          exxas_name: eco.name,
          exxas_email: eco.email,
          exxas_tel: eco.phone,
          exxas_rolle: eco.role,
          pruefung: "lokal_ergaenzen",
          grund: "Kontakt in Exxas, in Propus noch kein exxas_contact_id",
        });
      }
    }
    const exIds = new Set(exList.map((c) => c.id));
    for (const lco of localList) {
      if (lco.exxas_contact_id && lco.exxas_contact_id.trim() && !exIds.has(asString(lco.exxas_contact_id))) {
        lokalNurLokal.push({
          customer_id: loc.id,
          lokal_kontakt_id: lco.id,
          lokal_name: lco.name,
          lokal_email: lco.email,
          exxas_contact_id_in_propus: lco.exxas_contact_id,
          pruefung: "manuell",
          grund: "exxas_contact_id in Propus, in aktueller Exxas-Exportliste fehlend/anderes Konto",
        });
      }
    }
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  if (args.export) {
    writeCsv(path.join(outDir, "exxas_feldabweichungen.csv"), feldabweichungen);
    writeCsv(path.join(outDir, "exxas_kontakte_nur_exxas.csv"), exxasNurExxas);
    writeCsv(path.join(outDir, "exxas_kontakte_nur_lokal.csv"), lokalNurLokal);
    writeCsv(path.join(outDir, "kunden_ohne_exxas_mit_recherchelinks.csv"), kundenOhneExxas);
    writeCsv(path.join(outDir, "kunden_exxas_id_nicht_in_export.csv"), nichtGefundenInExxas);
    const md = [
      `# Stammdaten-Audit (${ts})`,
      "",
      "Quellen: **Propus-DB (customers, customer_contacts)**, **Exxas API** `/api/v2/customers` und `/api/v2/contacts` (Voll-Export in einem Lauf).",
      "",
      "## Ablage",
      "",
      "| Datei | Inhalt |",
      "|--------|--------|",
      "| exxas_feldabweichungen.csv | Abweichungen Name/Adresse/E-Mail lokal vs. Exxas (gleiche exxas_customer_id) |",
      "| exxas_kontakte_nur_exxas.csv | Kontakt in Exxas, in Propus noch kein exxas_contact_id |",
      "| exxas_kontakte_nur_lokal.csv | exxas_contact_id in Propus, in Export nicht (Prüfung) |",
      "| kunden_ohne_exxas_mit_recherchelinks.csv | Kein exxas_customer_id – Links Zefix/Google, **manuell** prüfen |",
      "| kunden_exxas_id_nicht_in_export.csv | exxas_customer_id in DB, nicht im API-Response |",
      "",
      "## Internet-Abgleich",
      "",
      "Es gibt keinen sinnvollen **vollautomatischen** firmenweiten Abgleich gegen das offene Web ohne API-Schlüssel, Rate-Limits und Fehlertoleranz. Die CSV-Spalten `link_zefix_suche` und `link_google` sind **Startpunkte**; Entscheidungen (Merge, Anpassung) bleiben in der Plattform.",
      "",
      "Bei Unsicherheit: Spalte **pruefung = manuell**.",
      "",
      "## Ausnahmen (Firmenname lokal vs. Exxas)",
      "",
      "Folgende Kunden erzeugen **keine** Zeile `company_vs_exxas_name` (bewusst abweichendes fachliches Modell):",
      "",
      ...[...EXXAS_COMPANY_NAME_DIFF_IGNORE.entries()].map(([id, r]) => `- **#${id}** — ${r}`),
      "",
      `Statistik: Kunden ${customers.length}, Feldabweichungen ${feldabweichungen.length}, Kontakte nur Exxas ${exxasNurExxas.length}, nur lokal/inkonsistent ${lokalNurLokal.length}, ohne Exxas-ID ${kundenOhneExxas.length}, Exxas-ID fehlt im Export ${nichtGefundenInExxas.length}.`,
    ].join("\n");
    fs.writeFileSync(path.join(outDir, "audit.md"), md, "utf8");
    fs.writeFileSync(path.join(outDir, "audit-latest.txt"), path.join(outDir, "audit.md"), "utf8");
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: args.export ? outDir : null,
        exxasCustomers: exCustomers.length,
        exxasContacts: exContactsRaw.length,
        feldabweichungen: feldabweichungen.length,
        kontakteNurExxas: exxasNurExxas.length,
        kontakteNurLokal: lokalNurLokal.length,
        kundenOhneExxas: kundenOhneExxas.length,
        exxasIdNichtImExport: nichtGefundenInExxas.length,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

void run();
