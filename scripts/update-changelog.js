#!/usr/bin/env node
/**
 * update-changelog.js
 *
 * Liest alle Commits seit dem letzten "[skip ci]"-Bump,
 * bestimmt den Typ (feat/fix/improvement/breaking/security)
 * und fuegt einen neuen Eintrag oben in changelogData.ts ein.
 *
 * Aufruf:
 *   node scripts/update-changelog.js --version v2.3.390 --date 2026-04-03
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── CLI-Argumente ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
};

const versionRaw = getArg("--version") || "";
const version = versionRaw.replace(/^v/, "");
const date = getArg("--date") || new Date().toISOString().slice(0, 10);

if (!version) {
  console.error("Fehler: --version fehlt (z.B. --version v2.3.390)");
  process.exit(1);
}

// ── Commits seit letztem [skip ci] Commit sammeln ────────────────────────────
let commits = [];
try {
  const lastBumpHash = execSync(
    "git log --format=%H --grep=\"\\[skip ci\\]\" -1",
    { encoding: "utf8" }
  ).trim();

  const range = lastBumpHash ? `${lastBumpHash}..HEAD` : "HEAD~80..HEAD";

  const rawLog = execSync(
    `git log --no-merges --format="%s" ${range}`,
    { encoding: "utf8" }
  ).trim();

  commits = rawLog
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith("chore(version)"))
    .filter((s) => !s.startsWith("chore(changelog)"))
    .filter((s) => !s.startsWith("chore: Deploy"))
    .filter((s) => !s.startsWith("chore: sync all changes"));
} catch (e) {
  console.warn("Warnung: Konnte Commits nicht lesen:", e.message);
}

// ── Typ aus Conventional-Commit-Prefix erkennen ──────────────────────────────
function detectType(subject) {
  const s = subject.toLowerCase();
  if (s.startsWith("fix") || s.startsWith("hotfix")) return "fix";
  if (s.startsWith("security") || s.startsWith("sec:")) return "security";
  if (s.includes("breaking change") || s.startsWith("breaking:")) return "breaking";
  if (s.startsWith("feat") || s.startsWith("feature")) return "feature";
  return "improvement";
}

// Conventional-Commit-Prefix entfernen: "feat(portal): Text" -> "Text"
function cleanSubject(subject) {
  return subject
    .replace(/^[a-z]+(\([^)]+\))?!?:\s*/i, "")
    .trim();
}

// ── Titel aus erstem bedeutungsvollem Commit ──────────────────────────────────
function buildTitle(commits) {
  if (commits.length === 0) return `Deploy v${version}`;
  const main =
    commits.find((c) => /^(feat|fix)/i.test(c)) || commits[0];
  return cleanSubject(main);
}

const changes =
  commits.length > 0
    ? commits.map((s) => ({
        type: detectType(s),
        text: cleanSubject(s),
      }))
    : [{ type: "improvement", text: `Deploy v${version}` }];

const title = buildTitle(commits);

// ── Neuen Eintrag als TypeScript-Code-Block ───────────────────────────────────
const changesLines = changes
  .map((c) => `      { type: "${c.type}", text: ${JSON.stringify(c.text)} },`)
  .join("\n");

const newEntry = `  {
    version: "${version}",
    date: "${date}",
    title: ${JSON.stringify(title)},
    changes: [
${changesLines}
    ],
  },`;

// ── changelogData.ts aktualisieren ────────────────────────────────────────────
const targets = [
  path.join(__dirname, "../app/src/data/changelogData.ts"),
];

const MARKER = "export const CHANGELOG: ChangelogVersion[] = [";

let updated = 0;
for (const filePath of targets) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Datei nicht gefunden, uebersprungen: ${filePath}`);
    continue;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const idx = content.indexOf(MARKER);

  if (idx === -1) {
    console.warn(`Marker '${MARKER}' nicht gefunden in: ${filePath}`);
    continue;
  }

  const insertAt = idx + MARKER.length;
  const newContent =
    content.slice(0, insertAt) +
    "\n" +
    newEntry +
    content.slice(insertAt);

  fs.writeFileSync(filePath, newContent, "utf8");
  console.log(`Changelog aktualisiert: ${path.relative(process.cwd(), filePath)}`);
  updated++;
}

console.log(`\nVersion : v${version}`);
console.log(`Datum   : ${date}`);
console.log(`Titel   : ${title}`);
console.log(`Eintraege: ${changes.length}`);
if (commits.length > 0) {
  console.log("Commits:");
  commits.forEach((c) => console.log(`  - ${c}`));
}

if (updated === 0) {
  console.error("FEHLER: Keine Datei wurde aktualisiert.");
  process.exit(1);
}
