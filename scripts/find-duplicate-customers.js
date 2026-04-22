#!/usr/bin/env node
/**
 * Dubletten-Analyse für customers (nur Lesen, keine DB-Änderung).
 *
 *   DATABASE_URL=... node scripts/find-duplicate-customers.js
 *   DATABASE_URL=... node scripts/find-duplicate-customers.js --json
 *   DATABASE_URL=... node scripts/find-duplicate-customers.js --export
 *   DATABASE_URL=... node scripts/find-duplicate-customers.js --export --out-dir ./meine-reports
 *   node scripts/find-duplicate-customers.js --env-file C:\\pfad\\.env --export
 *
 * Aus dem booking-Ordner:
 *   cd booking && npm run analyze-duplicate-customers
 *
 * .env wird in dieser Reihenfolge probiert (erste Datei mit DATABASE_URL gewinnt):
 *   --env-file, booking/.env, Repo-Root/.env, app/.env
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const {
  runDuplicateReport,
  suggestKeepId,
  toRowsFromJson,
  countUniqueIds,
  DB_SEARCH_PATH,
} = require("./lib/duplicate-customers-report");
// pg: typisch in booking/node_modules
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

/**
 * @param {{ envFile: string | null }} args
 * @returns {{ used: string | null, tried: string[] }}
 */
function loadEnv(args) {
  if (String(process.env.DATABASE_URL || "").trim()) {
    return { used: "(bereits in der Umgebung: DATABASE_URL)", tried: [] };
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
    return { used: null, tried: [...list, "dotenv-Modul fehlt (npm install in booking)"] };
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

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { json: false, export: false, outDir: null, envFile: null, help: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "-h" || a[i] === "--help") o.help = true;
    else if (a[i] === "-j" || a[i] === "--json") o.json = true;
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
  console.log(`Dubletten-Analyse (Kunden) – Lesen, keine DB-Änderung.

Nutzung:
  node scripts/find-duplicate-customers.js [Optionen]

Optionen:
  -e, --export        Markdown + CSV schreiben (Default-Ordner: booking/analysis-duplicate-customers)
  -o, --out-dir PFAD  Ausgabe-Ordner
  -f, --env-file PFAD .env mit DATABASE_URL
  -j, --json          JSON auf stdout
  -h, --help          Diese Hilfe

Umgebung:
  DATABASE_URL        postgres://… (Pflicht, außer schon in der Shell gesetzt)
  DATABASE_SSL=true   optional

Beispiel:
  cd booking && npm run analyze-duplicate-customers
  node scripts/find-duplicate-customers.js --export
`);
}

function escapeCsv(cell) {
  const s = cell == null ? "" : String(cell);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Eine flache Zeile pro Kunde in jeder Gruppe (Excel/Pivot-tauglich).
 * Spalten: priority, category, group_key, customer_id, company, email, address, orders, suggest_keep_id, is_suggested_keep
 */
function buildFlatRows(report) {
  const lines = [];
  const p = 1;
  for (const g of report.byCompanyAndAddress) {
    const raws = toRowsFromJson(g.rows);
    const keep = suggestKeepId(
      raws.map((x) => ({ id: x.id, n: x.n })),
    );
    const gk = `C|${g.comp_key}||${g.addr_key}`.slice(0, 400);
    for (const r of raws) {
      lines.push({
        priority: p,
        category: "C",
        group_key: gk,
        customer_id: r.id,
        company: r.company || "",
        email: r.email || "",
        address: r.addr || "",
        orders: r.n,
        suggest_keep_id: keep,
        is_suggested_keep: r.id === keep ? "ja" : "nein",
      });
    }
  }
  // A: p2
  for (const g of report.byExactEmail) {
    const raws = toRowsFromJson(g.rows);
    const keep = suggestKeepId(
      raws.map((x) => ({ id: x.id, n: x.n })),
    );
    const gk = `A|${g.key_email}`;
    for (const r of raws) {
      lines.push({
        priority: 2,
        category: "A",
        group_key: gk,
        customer_id: r.id,
        company: r.company || "",
        email: g.key_email || r.email,
        address: "",
        orders: r.n,
        suggest_keep_id: keep,
        is_suggested_keep: r.id === keep ? "ja" : "nein",
      });
    }
  }
  for (const g of report.byCompanyName) {
    const raws = toRowsFromJson(g.rows);
    const keep = suggestKeepId(
      raws.map((x) => ({ id: x.id, n: x.n })),
    );
    const gk = `B|${g.comp_key}`.slice(0, 400);
    for (const r of raws) {
      const addr = [r.street, r.zip, r.city, r.zipcity]
        .filter((x) => (x && String(x).trim()) || "")
        .map((x) => String(x).trim())
        .filter(Boolean)
        .join(" | ");
      lines.push({
        priority: 3,
        category: "B",
        group_key: gk,
        customer_id: r.id,
        company: r.company || "",
        email: r.email || "",
        address: addr,
        orders: r.n,
        suggest_keep_id: keep,
        is_suggested_keep: r.id === keep ? "ja" : "nein",
      });
    }
  }
  for (const g of report.byCompanyAndEmailBase) {
    const raws = g.rows || [];
    const keep = suggestKeepId(
      raws.map((x) => ({ id: x.id, n: x.n })),
    );
    const gk = `D|${g.compKey}|${g.emailBase}`.slice(0, 400);
    for (const r of raws) {
      const addr = [r.street, r.zip, r.city, r.zipcity]
        .filter((x) => (x && String(x).trim()) || "")
        .map((x) => String(x).trim())
        .filter(Boolean)
        .join(" | ");
      lines.push({
        priority: 4,
        category: "D",
        group_key: gk,
        customer_id: r.id,
        company: r.company || "",
        email: r.email || "",
        address: addr,
        orders: r.n,
        suggest_keep_id: keep,
        is_suggested_keep: r.id === keep ? "ja" : "nein",
      });
    }
  }
  return lines;
}

function writeCsv(filePath, flat) {
  const head = [
    "priority",
    "category",
    "group_key",
    "customer_id",
    "company",
    "email",
    "address",
    "orders",
    "suggest_keep_id",
    "is_suggested_keep",
  ];
  const rows = [head.map(escapeCsv).join(",")].concat(
    flat.map((l) => head.map((h) => escapeCsv(l[h])).join(",")),
  );
  fs.writeFileSync(filePath, rows.join("\n"), "utf8");
}

function buildMarkdownReport(report) {
  const nC = report.byCompanyAndAddress.length;
  const nA = report.byExactEmail.length;
  const nB = report.byCompanyName.length;
  const nD = report.byCompanyAndEmailBase.length;
  const nGroups = nA + nB + nC + nD;
  const unique = countUniqueIds(report);

  let md = `# Dubletten-Analyse (customers)

**Erstellt:** ${report.generatedAt} (UTC)  
**Hinweis:** Nur Metadaten aus der Datenbank, keine Kundenstammdaten verändert.

## Kennzahlen

| Größe | Wert |
|--------|------|
| Gruppen gesamt (A+B+C+D, kann sich überschneiden) | ${nGroups} |
| unterschiedliche Kunden-IDs in mindestens einer Gruppe | ${unique} |
| C – gleiche Firma + gleiche Adresse | ${nC} Gruppen |
| A – gleiche E-Mail | ${nA} Gruppen |
| B – gleicher Firmenname (Whitespace normiert) | ${nB} Gruppen |
| D – gleiche Firma + E-Mail-„Basis“ (+alias) | ${nD} Gruppen |

### Vorgehen

1. Zuerst **C** abarbeiten (höchste Treffsicherheit), dann A, ggf. B/D prüfen (B kann auch legitime Mehrfach-Standorte sein).  
2. Vorschlag **„behalten“:** pro Gruppe die ID mit den **meisten zugeordneten Bestellungen**; bei gleicher Zahl die **niedrigere** ID. Spalte \`is_suggested_keep\` in der CSV.  
3. Zusammenführen nur über die vorhandene Funktion *Kunden zusammenführen* im System.

---

## C – gleiche Firma + gleiche Adresse (${nC})

${nC === 0 ? "_(keine)_\n" : ""}
${report.byCompanyAndAddress
  .map((g) => {
    const raws = toRowsFromJson(g.rows);
    const k = suggestKeepId(
      raws.map((x) => ({ id: x.id, n: x.n })),
    );
    return `### ${(raws[0] && raws[0].company) || g.comp_key}\n\n- **IDs:** ${(g.ids || []).join(", ")}  \n- **Behalten (Vorschlag):** ID **${k}**  \n- **Adresse:** \`${(raws[0] && raws[0].addr) || g.addr_key}\`  \n- Orders: ${raws.map((x) => `id ${x.id}: ${x.n}`).join(" · ")}\n\n`;
  })
  .join("")}

## A – gleiche E-Mail (${nA})

${nA === 0 ? "_(keine)_\n" : ""}
${report.byExactEmail
  .map((g) => {
    const raws = toRowsFromJson(g.rows);
    const k = suggestKeepId(
      raws.map((x) => ({ id: x.id, n: x.n })),
    );
    return `- **${g.key_email}** – IDs: ${(g.ids || []).join(", ")} – Vorschlag behalten: **${k}**\n`;
  })
  .join("")}

## B – gleicher Firmenname (${nB}) – ggf. verschiedene Standorte

${nB === 0 ? "_(keine)_\n" : ""}
${report.byCompanyName
  .map((g) => {
    const raws = toRowsFromJson(g.rows);
    const k = suggestKeepId(
      raws.map((x) => ({ id: x.id, n: x.n })),
    );
    return `### ${(raws[0] && raws[0].company) || g.comp_key}\n- IDs: ${(g.ids || []).join(", ")} – Vorschlag: **${k}**\n\n`;
  })
  .join("")}

## D – E-Mail-Basis (ohne +) (${nD})

${nD === 0 ? "_(keine)_\n" : ""}
${report.byCompanyAndEmailBase
  .map(
    (g) =>
      `- **${g.rows[0] && g.rows[0].company}** / ${g.emailBase} – IDs: ${(g.ids || []).join(", ")} – Vorschlag: **${suggestKeepId(
        (g.rows || []).map((x) => ({ id: x.id, n: x.n })),
      )}**\n`,
  )
  .join("")}
`;
  return md;
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const envInfo = loadEnv(args);
  if (!String(process.env.DATABASE_URL || "").trim()) {
    console.error("DATABASE_URL fehlt. Setze die Variable in der Shell oder in einer .env-Datei.\n");
    if (envInfo.tried && envInfo.tried.length) {
      console.error("Geprüft:\n  " + envInfo.tried.join("\n  "));
    }
    console.error("\nHilfe: node scripts/find-duplicate-customers.js --help");
    process.exit(1);
  }
  if (envInfo.used && !envInfo.used.startsWith("(")) {
    console.log(`[Analyse] DATABASE_URL aus: ${envInfo.used}`);
  } else if (envInfo.used) {
    console.log(`[Analyse] ${envInfo.used}`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    options: `-c search_path=${DB_SEARCH_PATH}`,
  });

  const report = await runDuplicateReport(pool);

  await pool.end();

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (args.export) {
    const outDir = args.outDir
      ? path.resolve(args.outDir)
      : path.join(__dirname, "../booking/analysis-duplicate-customers");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const mdPath = path.join(outDir, `DUPLICATE-ANALYSIS-${stamp}.md`);
    const csvPath = path.join(outDir, `DUPLICATE-ANALYSIS-${stamp}.csv`);
    const flat = buildFlatRows(report);
    fs.writeFileSync(mdPath, buildMarkdownReport(report), "utf8");
    writeCsv(csvPath, flat);
    const mdUrl = pathToFileURL(path.resolve(mdPath)).href;
    const dirUrl = pathToFileURL(path.resolve(outDir) + path.sep).href;
    console.log(`[Analyse] Report: ${mdPath}`);
    console.log(`[Analyse] CSV:   ${csvPath}`);
    console.log(`[Analyse] Flache Zeilen: ${flat.length} (1 Zeile pro Kunde pro Gruppe)`);
    console.log(`[Analyse] Link Markdown (Browser/Editor): ${mdUrl}`);
    console.log(`[Analyse] Link Ordner: ${dirUrl}`);
  }

  const printBlock = (title, rows, formatter) => {
    console.log(`\n${"=".repeat(60)}\n${title} (${rows.length} Gruppen)\n${"=".repeat(60)}`);
    if (rows.length === 0) {
      console.log("  (keine)");
      return;
    }
    for (const row of rows) {
      console.log(formatter(row));
    }
  };

  printBlock("A) Gleiche E-Mail (mehrere Kunden-IDs)", report.byExactEmail, (r) => `  E-Mail: ${r.key_email}\n  IDs:    ${(r.ids || []).join(", ")}`);

  printBlock("B) Gleicher Firmenname (normalisiert)", report.byCompanyName, (r) => {
    const raws = toRowsFromJson(r.rows);
    const first = raws[0] || {};
    return `  Name:  "${first.company || r.comp_key}"\n  IDs:   ${(r.ids || []).join(", ")}` +
      `\n  ` + raws.map((x) => `id ${x.id}: orders=${x.n} email=${x.email || "∅"}`).join(" | ");
  });

  printBlock("C) Gleiche Firma + gleiche Adresse (Priorität 1 fürs Prüfen)", report.byCompanyAndAddress, (r) => {
    const raws = toRowsFromJson(r.rows);
    const first = raws[0] || {};
    return `  Firma:   "${first.company || r.comp_key}"\n` +
      `  Adresse: ${raws.map((x) => x.addr).filter(Boolean)[0] || r.addr_key}\n` +
      `  IDs:     ${(r.ids || []).join(", ")}` + "\n  " + raws.map((x) => `id ${x.id} orders=${x.n}`).join(" | ");
  });

  printBlock("D) Gleiche Firma + E-Mail-Basis (ohne +…)", report.byCompanyAndEmailBase, (g) => {
    return `  Firma:   "${g.rows[0] && g.rows[0].company}"\n  E-Mail: ${g.emailBase}\n  IDs:  ${(g.ids || []).join(", ")}` + "\n  " + (g.rows || []).map((x) => `id ${x.id} orders=${x.n}`).join(" | ");
  });

  const nGroups = report.byExactEmail.length + report.byCompanyName.length + report.byCompanyAndAddress.length + report.byCompanyAndEmailBase.length;
  console.log(`\n${"-".repeat(60)}`);
  console.log(`Kennzahl: ${nGroups} Gruppen (A+B+C+D, Überschneidungen möglich)`);
  console.log(`Kennzahl: ${countUniqueIds(report)} unterschiedliche Kunden-IDs in mindestens einer Gruppe`);
  if (!args.export) {
    console.log(`\nHinweis: Mit --export werden Markdown + CSV unter booking/analysis-duplicate-customers/ geschrieben.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
