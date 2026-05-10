#!/usr/bin/env node
/*
 * Theme-Token-Lint.
 *
 * Verbietet hartkodierte Farb-Utility-Klassen (bg-white, bg-zinc-900, text-gray-500, ...)
 * in app/src ohne dark:-Pendant in derselben className. Erlaubt sind Theme-Tokens
 * (bg-bg, bg-surface, bg-card, text-text, text-muted, border-border, ...).
 *
 * Modus:
 *   --check           (default) bricht bei NEUEN Verstoessen relativ zur Baseline
 *   --update-baseline schreibt die aktuellen Verstoesse in die Baseline
 *   --report          listet alle aktuellen Verstoesse, ohne zu bauchen / brechen
 *
 * Baseline: scripts/theme-tokens-baseline.json (relativ zum app/-Ordner).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(APP_ROOT, "src");
const BASELINE_PATH = path.join(APP_ROOT, "scripts", "theme-tokens-baseline.json");

const FORBIDDEN = /(?<![\w-])(bg|text|border|ring|divide|placeholder|fill|stroke|from|via|to|outline|caret|accent)-(white|black|(?:gray|zinc|slate|neutral|stone)-\d{2,3})(?![\w-])/g;
const DARK_PAIRED = /\bdark:[a-z][\w:/\[\]\-.]*/;

const FILE_EXT = new Set([".tsx", ".jsx", ".ts", ".js"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "build", "test-results", "playwright-report"]);
const SKIP_FILE_PATTERNS = [
  /\.test\.(t|j)sx?$/,
  /\.spec\.(t|j)sx?$/,
  /__tests__/,
  /\/scripts\//,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      const full = path.join(dir, entry.name);
      const ext = path.extname(entry.name);
      if (!FILE_EXT.has(ext)) continue;
      if (SKIP_FILE_PATTERNS.some((rx) => rx.test(full))) continue;
      out.push(full);
    }
  }
  return out;
}

function findViolations() {
  const files = walk(SRC_ROOT);
  const violations = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (err) {
      // SMB / Windows kann transient EPERM/EBUSY werfen, wenn der Dev-Server die Datei gerade haelt.
      if (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES") {
        console.warn(`theme-tokens: ueberspringe ${path.relative(APP_ROOT, file)} (${err.code})`);
        continue;
      }
      throw err;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      FORBIDDEN.lastIndex = 0;
      while ((m = FORBIDDEN.exec(line)) !== null) {
        const windowText = lines.slice(Math.max(0, i - 1), i + 2).join("\n");
        if (DARK_PAIRED.test(windowText)) continue;
        violations.push({
          file: path.relative(APP_ROOT, file).replace(/\\/g, "/"),
          line: i + 1,
          token: m[0],
        });
      }
    }
  }
  return violations;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return new Set();
  const data = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  return new Set((data.violations ?? []).map(keyOf));
}

function keyOf(v) {
  return `${v.file}::${v.token}`;
}

function writeBaseline(violations) {
  const sorted = [...violations].sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  );
  const grouped = sorted.map(({ file, token, line }) => ({ file, token, line }));
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        note: "Auto-generated. New violations relative to this snapshot fail CI. Run `npm run theme:lint:update` after intentional cleanups.",
        generatedAt: new Date().toISOString(),
        count: grouped.length,
        violations: grouped,
      },
      null,
      2,
    ) + "\n",
  );
}

const mode = process.argv.includes("--update-baseline")
  ? "update"
  : process.argv.includes("--report")
    ? "report"
    : "check";

const violations = findViolations();

if (mode === "update") {
  writeBaseline(violations);
  console.log(`theme-tokens: baseline geschrieben (${violations.length} Eintraege) -> ${path.relative(APP_ROOT, BASELINE_PATH)}`);
  process.exit(0);
}

if (mode === "report") {
  console.log(`theme-tokens: ${violations.length} hartkodierte Farben gefunden`);
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}  ${v.token}`);
  }
  process.exit(0);
}

const baseline = loadBaseline();
const fresh = violations.filter((v) => !baseline.has(keyOf(v)));

if (fresh.length === 0) {
  const removed = baseline.size + fresh.length - violations.length;
  console.log(
    `theme-tokens: OK (${violations.length} bekannte Verstoesse, ${Math.max(0, removed)} bereinigt seit Baseline)`,
  );
  process.exit(0);
}

console.error(`theme-tokens: ${fresh.length} NEUE hartkodierte Farb-Klassen ohne dark:-Pendant`);
console.error("");
for (const v of fresh.slice(0, 80)) {
  console.error(`  ${v.file}:${v.line}  ${v.token}`);
}
if (fresh.length > 80) {
  console.error(`  ... (+${fresh.length - 80} weitere)`);
}
console.error("");
console.error("Nutze Theme-Tokens statt Roh-Farben:");
console.error("  bg-bg | bg-surface | bg-card | bg-bg-input");
console.error("  text-text | text-muted | text-subtle | text-on-primary");
console.error("  border-border | border-border-strong | ring-accent");
console.error("");
console.error("Wenn ein hartkodierter Farbton wirklich noetig ist, paire ihn mit dark:-Variante:");
console.error('  className="bg-white dark:bg-zinc-900 text-black dark:text-white"');
console.error("");
console.error("Nach absichtlichem Refactor: `npm run theme:lint:update` aktualisiert die Baseline.");
process.exit(1);
