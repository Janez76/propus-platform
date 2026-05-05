# Propus-Platform — Audit (April 2026)

**Repo:** https://github.com/Janez76/propus-platform
**Auditdatum:** 20. April 2026
**Umfang:** 6 Phasen — Inventar, statische Analyse, Bug-Hunt, Architektur, DX, Action-Plan
**Methode:** Autonome statische Analyse in Sandbox-Umgebung (Node 22.22.0, Ubuntu 22). Kein Refactoring, keine Commits.

---

## Executive Summary (1 Seite)

Die Propus-Platform ist eine funktionierende, täglich laufende Monorepo-Anwendung (Buchungsportal, Tour-Manager, Content-Website, Admin-Panel) mit **~151'862 LOC** über **7 Module** und **128 Datenbank-Migrationen**. **TypeScript kompiliert sauber (0 Fehler)**, **alle 102 Backend-Tests sind grün**, die Haupt-Build-Chain funktioniert.

**Die Codebasis hat drei Risikoklassen:**

Erstens: **akute Sicherheitsprobleme**, die sofort adressiert werden müssen. Konkret sind das sieben **Critical-Findings** — darunter ein Cron-Endpoint ohne Timing-Safe-Secret-Check, ein hartcodiertes Passwort im PowerShell-Deployment-Script, ein Admin-Account-Hash in Git-History, ein Payrexx-Webhook-Handler mit Secret-Fallback, zwei Race-Conditions (Double-Booking, Doppel-Rechnung) und doppelte Migrations-Prefixe, die den idempotenten Replay brechen. Jedes dieser Findings ist offline in der History auffindbar und teilweise in Produktion ausnutzbar.

Zweitens: **strukturelle Altlasten**, die den Betrieb nicht akut gefährden, aber Geschwindigkeit und Qualität dauerhaft bremsen. Drei separate Session-Mechanismen in `platform/server.js` werden per `bridgeBookingAdminSession`-Middleware zusammengeklebt; `app/` ist eine halb-migrierte SPA-in-Next über eine Catch-All-Route; Tour-Manager und Booking halten je eigene `node_modules`-Kopien mit identischen Paketen (u.a. nodemailer, pg, express-session); das Booking-Backend liegt als 13'195-Zeilen-Monolith in einer einzigen `server.js`; Architektur-Entscheidungen werden nicht durch ADRs dokumentiert.

Drittens: **fehlende Gates im Developer-Workflow**. Weder Husky noch lint-staged sind aktiv, **144 ESLint-Findings** in `app/` wurden nie geblockt, es gibt kein PR-Template, keine CODEOWNERS-Datei, kein dokumentiertes Branch-Protection-Regime und keinen verbindlichen Lint-/Test-/Audit-Job als Required-Check in CI. Vier HIGH-Severity-Dependencies (Next.js DoS, Nodemailer × 3 in drei getrennten `node_modules`) sind unfixed.

**Gesamtbewertung:** Das Produkt ist **funktional solide**, aber **operational fragil**. Es fehlt ein geschlossener Prüfungszyklus zwischen Commit und Produktion — heute ist jeder Commit gegen main ein Deploy-Kandidat, der durch vier Workflow-Guards läuft, nicht aber durch Lint/Test/Audit. Die Codebasis hat gleichzeitig **gute Tugenden** (saubere TypeScript-Typen, transaktionaler SQL-Migrator, Feature-Flag-Traces in Workflows, klares Modul-Mapping in `platform/server.js`), auf denen sich die empfohlenen Verbesserungen gut aufbauen lassen.

**Empfehlung:** Die in `99-ACTION-PLAN.md` spezifizierten **5 Top-Sofortmassnahmen** (Cron-Secret härten, Passwort-History bereinigen, Payrexx-Webhook-Fallback schliessen, Security-Updates einspielen, Husky/lint-staged aktivieren) benötigen **zusammen ca. 3 Arbeitstage** und eliminieren die höchstpriorisierten Risiken. Die strukturellen Fixes (Monorepo-Konsolidierung, Auth-Unifizierung, Frontend-Migration) sind in einem 8–12-Wochen-„Next"-Bucket realistisch. Die grosse Architektur-Investition (Logto-Only-Auth, Blue/Green-Deploy, Event-Bus) gehört in den 6–12-Monats-Horizont.

**Zahlen auf einen Blick:**

| Metrik | Wert |
|---|---|
| Module | 7 (app, booking, tours, website, platform, core, auth) |
| LOC total | ~151'862 |
| Grösste Datei | `booking/server.js` — 13'195 LOC |
| Migrationen (core + booking) | 41 + 87, davon 6 mit duplizierten Prefixes |
| Tests | app=?, booking=72 ✅, tours=30 ✅, andere: keine |
| TS-Fehler (`tsc --noEmit`) | 0 |
| ESLint-Probleme (app/) | 144 (64 Errors, 80 Warnings) |
| Circular Dependencies | 0 (app), 2 (tours) |
| Unused Dependencies (app) | 14 (10 Backend-Libs falsch deklariert) |
| npm-audit HIGH | 4 (next × 1, nodemailer × 3) |
| Audit-Findings total | 60 — davon 7 Critical, 23 High, 25 Medium, 5 Low |
| Positive Observations | 10 |

---

## Inhaltsverzeichnis

Die Audit-Dokumentation ist in sechs aufeinander aufbauende Phasen gegliedert. Jede Datei ist für sich lesbar; querverweise zwischen den Files nutzen `BUG-XX`-IDs.

1. **[00-INVENTORY.md](./00-INVENTORY.md)** — Phase 1: Bestandsaufnahme
   Modulstruktur, LOC-Verteilung, alle 7 `package.json` im Detail, 128 Migrationen mit Duplikaten-Liste, CI/CD-Pipelines, Docker-Compose-Varianten, 6 offene Annahmen/Fragen zur Architektur.

2. **[10-STATIC-ANALYSIS.md](./10-STATIC-ANALYSIS.md)** — Phase 2: Statische Analyse
   `npm audit`, `tsc --noEmit`, `npx eslint`, `npx madge --circular`, `npx depcheck`, `node --test`. Rohdaten in `raw/`. Ergebnis: grüne Kern-Signale, aber Dependency-Bloat und Lint-Rückstand in `pages-legacy/`.

3. **[20-FINDINGS.md](./20-FINDINGS.md)** — Phase 3: Bug-Hunt
   **60 Einzel-Findings** mit jeweils: `file:line`, Problem, Risiko, konkreter Fix (Code-Snippet), Aufwandschätzung (S/M/L). Klassifiziert nach Critical/High/Medium/Low. Abschluss mit 10 positiven Beobachtungen.

4. **[30-ARCHITECTURE.md](./30-ARCHITECTURE.md)** — Phase 4: Architektur-Review
   Zwei Mermaid-Diagramme (Ist-Architektur + vorgeschlagener Blue/Green-Deploy-Pfad). Diskussion: Monorepo-Konsolidierung mit pnpm+Turborepo, Auth-Unifizierung auf Logto, BFF vs. API-Gateway, Daten-Layer-Evolution, Frontend-Migration SPA→Next-native, Observability-Stack, Testing-Backlog, Backup/DR mit RTO/RPO.

5. **[40-DX-WORKFLOW.md](./40-DX-WORKFLOW.md)** — Phase 5: Developer Experience
   Konkrete, copy-paste-fähige Snippets für: Husky + lint-staged + commitlint, PR-Template, CODEOWNERS, Branch-Protection (inkl. `gh api`-Aufruf), `ci.yml` mit 5 Required-Jobs, Dependabot-Config, `Makefile` mit One-Command-Setup, `.env.example` (komplett), `docs/ONBOARDING.md` (< 30 min bis lokal laufend).

6. **[99-ACTION-PLAN.md](./99-ACTION-PLAN.md)** — Phase 6: Massnahmenplan
   Top-5-Sofortmassnahmen (diese Woche, ~3 Tage), Bucket „Now" (14 Tage), „Next" (Quartal), „Later" (6–12 Monate). Komplette BUG→Bucket-Matrix. Messbare Erfolgskriterien pro Bucket. Explizite Nicht-Ziele.

**Rohdaten-Verzeichnis:** [`raw/`](./raw/) — 12 Logs/JSON-Files aus den automatisierten Prüfungen (ESLint-Report, npm-audit-JSONs, madge-Output, depcheck-JSONs, Test-Runner-Logs). Alle reproduzierbar mit den in `10-STATIC-ANALYSIS.md` dokumentierten Befehlen.

---

## Wie dieses Audit zu lesen ist

- **Für Entscheider:** Executive Summary oben + `99-ACTION-PLAN.md` §1 (Top-5) und §6 (Erfolgskriterien). ~15 Minuten Lesezeit.
- **Für Tech-Lead:** Zusätzlich `30-ARCHITECTURE.md` und `40-DX-WORKFLOW.md` komplett. ~45 Minuten.
- **Für Entwickler am Code:** `20-FINDINGS.md` als Issue-Backlog. Jedes BUG-XX wird zu einem GitHub-Issue mit Label `audit-2026-04`.
- **Für Security-Review:** `20-FINDINGS.md` §Critical/§High + `99-ACTION-PLAN.md` §1/§2 + §7 (Risiko-Kommunikation).

## Annahmen & Grenzen

Das Audit wurde ohne Zugriff auf Produktionssystem, Staging, DB-Daten, Log-Archive oder Monitoring-Dashboards durchgeführt. Alle Findings basieren auf **statischer Analyse des Quellcodes** (Stand: `main`-Branch, April 2026) und automatisierten Tools. Folgende Prüfungen konnten im Sandbox-Zeitfenster **nicht** ausgeführt werden und sind als Todos im Action-Plan markiert:

- `next build` mit Bundle-Analyzer (fehlendes Playwright-Cache)
- `npm audit` in `core/`, `auth/`, `website/` (nur 4 der 7 Module geprüft)
- Vitest-Lauf in `app/` (Zeitbudget)
- Lasttest / Performance-Profil
- Penetration-Test

Einzelne Findings (z. B. BUG-18 „65 Components missing `use client`") basieren auf einer Sample von 20 Files; der exakte Anteil kann variieren. Im Zweifel ist der Fix-Aufwand jeweils konservativ (eher zu hoch) geschätzt.

---

*Audit erstellt durch autonome Prüfung in Cowork-Sandbox. Alle Empfehlungen sind Vorschläge, keine Direktiven — Umsetzung, Priorisierung und Budget entscheidet das Team.*
