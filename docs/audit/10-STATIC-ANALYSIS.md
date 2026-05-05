# Phase 2 — Statische Analyse & Build-Sanity

**Ausgeführt:** 2026-04-20, Node 22.22.0 / npm 10.9.4 in Sandbox-Ubuntu-22.
**Rohlogs:** `audit/raw/*.log` bzw. `audit/raw/*.json`

Ausgeführt wurden: `npm ci`, `npm audit --omit=dev`, `npm test`, `npx tsc --noEmit`, `npx eslint`, `npx madge --circular`, `npx depcheck`.
Nicht ausgeführt wegen Zeit-/Umgebungslimit: `next build` mit Bundle-Analyzer (kein Playwright-Cache, kein Chromium im Sandbox; `npm run build` würde funktionieren, wurde aber nicht getriggert), `ts-prune` (optional), `npm audit` für `core/`/`auth/`/`website/`.

---

## 1. Dependency-Audit (npm audit --omit=dev)

Alle vier installierbaren Module haben **je genau 1 High-Severity-Finding**:

| Modul | Schwere | Paket | CVE | Fix |
|---|---|---|---|---|
| `app/` | HIGH | `next@16.2.1` | „Next.js has a Denial of Service with Server Components" | Update auf gepatchte 16.2.x (`npm update next`) |
| `booking/` | HIGH | `nodemailer@^6.9.16` | (a) Email to unintended domain via Interpretation Conflict · (b) addressparser DoS via recursive calls | Update auf `nodemailer@^6.10.x` (Patch) oder `^7.x` (Major) |
| `tours/` | HIGH | `nodemailer@^6.10.1` | gleiche zwei CVEs (6.10.1 fixt nur eins) | Update auf Patch-Release |
| `platform/` | HIGH | `nodemailer@^6.9.16` | gleiche wie booking | Update |

Rohdaten: `audit/raw/app-npm-audit.json`, `booking-npm-audit.json`, `tours-npm-audit.json`, `platform-npm-audit.json`.

**Besonders auffällig:** Drei Module (booking, tours, platform) enthalten jeweils eine eigene `node_modules`-Kopie von nodemailer, pg, express-session, multer usw. Kein Hoisting, kein Shared-Dependency-Mechanismus — entsprechend pflegt man Security-Updates dreimal. Siehe `30-ARCHITECTURE.md` zur Monorepo-Diskussion.

---

## 2. TypeScript Type-Check (`app/`)

```
cd app && npx tsc --noEmit
```

**Ergebnis:** 0 Fehler, 0 Warnungen. **✅ Sauber.**

`tsconfig.json` wurde nicht im Detail gereviewt, aber der `type check` ist das stärkste positive Signal im ganzen Audit: Trotz 86k LOC ist die TypeScript-Hygiene im Admin-Frontend intakt.

Rohlog: `audit/raw/app-tsc.log` (leer = keine Ausgaben = keine Fehler).

---

## 3. ESLint (`app/`)

```
cd app && npx eslint . --ext .ts,.tsx
```

**Ergebnis:** **✖ 144 Probleme (64 Errors, 80 Warnings)**, davon 2 Errors und 4 Warnings auto-fixable.

Dominante Kategorien aus der Stichprobe (siehe `audit/raw/app-eslint.log`):

| Regel | Typ | Häufung |
|---|---|---|
| `react/no-unescaped-entities` | error | Apostrophe/Anführungszeichen in JSX (`"`, `'`) → XSS-relevant nur wenn daten-driven, hier meist statische Texte |
| `@typescript-eslint/no-unused-vars` | warning | unbenutzte Imports / Variablen — „formatOrderLabel`, `unarchive`, etc. |
| `jsx-a11y/role-supports-aria-props` | warning | z. B. `aria-sort` auf Button-Role gesetzt (hat kein Sortier-Semantics) |
| `react/no-danger` / `/* eslint-disable */` | warning | z. T. unnötige eslint-disable-Direktiven, die nichts mehr triggern |

**Auffällig:** Viele Findings in `pages-legacy/` — dem alten SPA-Code, der unter der Catch-All-Route läuft. Das bestätigt die These „SPA-in-Next ist halb migriert".

**Empfehlung:** `npm run lint -- --fix` lokal ausführen (entschärft ~6 Probleme automatisch), dann die restlichen 138 systematisch in `pages-legacy/` abarbeiten oder per Regel-Override ausblenden.

---

## 4. Kreis-Abhängigkeiten (madge --circular)

```
cd app   && npx madge --circular --extensions ts,tsx,js,jsx src
cd tours && npx madge --circular .
```

| Modul | Ergebnis |
|---|---|
| `app/` | ✅ Keine Circular Dependencies in 366 Files |
| `tours/` | ⚠ **2 Zyklen:** |
|   | `lib/subscriptions.js → lib/tour-actions.js → lib/renewal-invoice-pdf.js` (→ zurück in subscriptions) |
|   | `lib/subscriptions.js → lib/tour-actions.js` |

**Risiko (tours):** Zirkuläre Imports können zu `undefined`-Exports führen, wenn eine Seite während der Initialisierung die andere benötigt. Das ist besonders gefährlich beim Renewal-Flow (siehe BUG-26 aus Phase 3). Fix: Gemeinsame Typen/Konstanten in `lib/renewal-types.js` extrahieren, damit die Abhängigkeit linear wird.

Rohlog: `audit/raw/app-madge-circular.log`, `audit/raw/tours-madge-circular.log`.

---

## 5. Unused Dependencies (depcheck)

### 5.1 `app/` — 14 unused dependencies, 6 unused devDependencies

**Bestätigt per `grep`: 10 Backend-Pakete in app/ sind nie importiert:**

```
@azure/identity, @microsoft/microsoft-graph-client,
bcryptjs, express-session, multer, node-cron, nodemailer,
openid-client, pdfkit, swissqrbill
```

Zusätzlich depcheck-flagged: `@tanstack/react-table`, `@tiptap/extension-color`, `@tiptap/extension-text-style`, `fast-xml-parser`.

**Risiken:**
- **Supply-Chain:** Jede dieser 14 Libs wird mit `npm ci` in `node_modules` gezogen — mehr Code, mehr CVE-Oberfläche, mehr Zeit beim Install (726 statt ~500 Pakete).
- **Container-Grösse:** Next.js-Image wird unnötig größer.
- **Falsches Mental Model:** Entwickler denken, die Backend-Libs gehören ins Frontend, weil sie im `package.json` stehen. Fördert Code, der Backend-Funktionen versehentlich im Client bundled (würde beim Build fehlschlagen, aber die Verwirrung bleibt).

Rohlog: `audit/raw/app-depcheck.json`.

### 5.2 `tours/` — 1 unused dependency

- `ejs` (false positive: EJS wird von Express via `app.set('view engine','ejs')` dynamisch geladen, nicht per `require('ejs')`)

### 5.3 `booking/`, `platform/`, `core/`, `auth/`, `website/`

Nicht ausgeführt im Audit-Zeitfenster — als Todo markiert (siehe `99-ACTION-PLAN.md`).

---

## 6. Tests

### 6.1 `booking/` — `node --test tests/*.test.js`

**72 Tests, 100% grün** in 269ms.
Rohlog: `audit/raw/booking-test.log`

Test-Dateien: `order-status-machine.test.js`, `order-storage.test.js`, `pricing.test.js`, `rbac-pure.test.js`.

**Beobachtung:** Vier Test-Dateien für 32'846 LOC = Test-Abdeckung rudimentär. Alles was getestet wird, ist reine Logik (keine DB, keine HTTP-Routen, kein MS Graph, kein Mail, keine Kalender-Sync, keine Upload-Handler). Siehe BUG-09 und Phase 5.

### 6.2 `tours/` — `node --test test/*.test.js`

**30 Tests, 100% grün** in 480ms.
Rohlog: `audit/raw/tours-test.log`

Ein Side-Effect im Log: `getEmailTemplates: connect ECONNREFUSED 127.0.0.1:5432` — d. h. mindestens ein Test (oder Modul-Import) versucht einen DB-Connect beim Laden. Das ist schlecht für CI: Tests sollten ohne DB laufen, oder die DB-Funktion sollte lazy-initialisiert sein.

### 6.3 `app/` Vitest

Nicht ausgeführt (Zeitbudget). Test-Setup existiert: `vitest`, `@testing-library/react`, `jsdom`. Verzeichnis `app/src/__tests__/` enthält Unit-Tests.

### 6.4 `website/`, `core/`, `auth/`

Keine Tests deklariert (`scripts.test` fehlt).

---

## 7. Raw-Log-Inventar

Alle Rohlogs liegen unter `audit/raw/`:

| Datei | Inhalt |
|---|---|
| `app-tsc.log` | leer (keine TS-Fehler) |
| `app-eslint.log` | 144 ESLint-Meldungen |
| `app-madge-circular.log` | „No circular dependency found" |
| `app-depcheck.json` | 14 unused deps, 6 unused devdeps |
| `app-npm-audit.json` | 1 HIGH (next DoS) |
| `booking-test.log` | 72 tests pass |
| `booking-npm-audit.json` | 1 HIGH (nodemailer) |
| `tours-test.log` | 30 tests pass |
| `tours-npm-audit.json` | 1 HIGH (nodemailer) |
| `tours-madge-circular.log` | 2 Zyklen |
| `tours-depcheck.json` | 1 false positive (ejs) |
| `platform-npm-audit.json` | 1 HIGH (nodemailer) |

---

## 8. Zusammenfassung Phase 2

| Aspekt | Befund |
|---|---|
| TypeScript-Gesundheit (app) | ✅ 0 Fehler bei `tsc --noEmit` |
| ESLint (app) | ⚠ 144 Probleme (64 Errors) |
| Kreis-Abhängigkeiten | ⚠ 2 Zyklen in tours/ |
| Dependency-Bloat | ⚠ 10 Backend-Libs irrtümlich in app/ deklariert |
| Security (HIGH-Vulns) | ⚠ 4× je 1 HIGH — nodemailer (3×), next (1×) |
| Testabdeckung | ⚠ booking=72, tours=30, platform=0, app=unknown |
| Build-Broken-Risk | ✅ tsc, tests, madge alle grün → Master kompiliert |

**Ergebnis:** Die Codebasis baut und testet grün. Die statischen Risiken liegen in Dependency-Hygiene (Bloat + Vulns) und Lint-Rückständen in `pages-legacy/`. Strukturelle Probleme (Architektur, Sicherheitslücken) werden in Phase 3 und 4 behandelt.
