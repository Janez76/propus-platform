# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Pflichtlektüre

`AGENTS.md` (Repo-Root) ist die kanonische Architektur- und Konventions-Doku — bei jeder
nicht-trivialen Änderung zuerst dort nachsehen. `app/CLAUDE.md` referenziert dieses File ebenfalls.

@AGENTS.md

Modulare Detail-Dokumentation liegt in `docs/` (Index: `DATA_FIELDS.md`).
Cursor-Regeln unter `.cursor/rules/*.mdc` (`alwaysApply: true` gelten für alle Files).

## Architektur in einem Satz

Eine Codebasis, eine Postgres-DB (`propus`, Schemas `core` / `booking` / `tour_manager`),
ein primäres Backend (`platform/server.js`) das Booking + Tour Manager auf Port **3100** vereint,
plus ein Next.js-Frontend (`app/`) als alleinige UI für Portal und Admin (seit April 2026 kein
serverseitiges HTML mehr — siehe Verbote unten). Die Firmenhomepage (`website/`, Astro+Supabase)
ist ein separater Stack.

| Modul | Rolle | Stack |
|---|---|---|
| `app/` | Primäres Admin-/Portal-Frontend (SPA) | Next.js 16, React 19, Tailwind v4, TypeScript |
| `platform/` | Zentraler Express-Server (Booking + Tour Manager in einem Prozess) | Node, Express |
| `booking/` | Booking-Backend-Module (API, RBAC, E-Mail, Kalender, Migrationen) | Node, Express |
| `tours/` | Tour-Manager-Routen, gemountet unter `/tour-manager` | Node, Express, EJS *nur* für 3 Customer-Seiten |
| `core/` | Gemeinsame SQL-Migrationen + Migration Runner + Seeds | Node, `pg` |
| `auth/` | Session-Store (Postgres-backed) | Node |
| `website/` | Öffentliche Firmenhomepage | Astro + Supabase |

## Häufige Befehle

### Lokaler Stack (Docker)

```bash
cp .env.example .env                             # Erstmalig
docker compose up -d postgres                    # PostgreSQL auf localhost:5435
docker compose --profile migrate run --rm migrate # Alle SQL-Migrationen
docker compose up -d platform                    # Booking + Tour Manager → http://localhost:3100
docker compose --profile legacy-services up -d booking tours  # optional, separate Container
```

Health: `http://localhost:3100/api/core/health`

### Next.js App (`app/`)

```bash
cd app
npm install
npm run dev          # http://localhost:3000 (Webpack), proxyt API zu platform :3100
npm run build        # Webpack-Build
npm run lint         # ESLint
npm run theme:lint   # Light/Dark-Token-Guard (Baseline-Diff, CI-erzwungen)
npm run test         # Vitest (CI)
npm run test:watch
npm run test:e2e     # Playwright (e2e/)
```

### Backend-Tests

```bash
cd booking && npm test              # node:test, "tests/*.test.js"
cd tours && npm test                # node:test, "test/*.test.js"
node --test booking/tests/foo.test.js   # einzelner Test
```

### Migrationen

```bash
docker compose --profile migrate run --rm migrate   # Empfohlen (im Container)
cd core && node migrate.js                          # Direkt (DATABASE_URL muss gesetzt sein)
```

Booking-spezifische Migrationen liegen unter `booking/migrations/` und laufen beim Express-Boot
über `runMigrations()` in `booking/db.js`. **Ein einziger SQL-Fehler bricht den Server-Start ab**
und Next.js liefert dann `503 auth backend unavailable`.

### Hotfix einer Migration in den laufenden VPS-Container kopieren

```bash
docker cp ./migrations/082_fix.sql propus-platform-platform-1:/app/booking/migrations/082_fix.sql
docker compose -p propus-platform -f docker-compose.vps.yml restart platform
```

### Wartungs-Skripte

```bash
node scripts/find-duplicate-customers.js --export   # Dubletten-Report
cd booking && npm run audit:customer-stammdaten     # Stammdaten vs. Exxas
```

### CI-Guards (auch lokal als Pre-Commit nutzbar)

```bash
scripts/guard-no-ejs.sh         # Blockt neue .ejs / res.render('portal|admin')
scripts/guard-docs.sh           # Erinnert an docs/-Pflege bei Code-Änderungen
scripts/guard-theme-tokens.sh   # Blockt neue hartkodierte Light/Dark-Farben in app/src (siehe docs/ADMIN-FRONTEND-DESIGN.md)
scripts/guard-vps-env.sh
```

## Absolute Regeln (CI-erzwungen oder Cursor-`alwaysApply`)

1. **Kein EJS, kein `res.render()`** für Portal-/Admin-Seiten. UI immer als React in
   `app/src/pages-legacy/` (Portal-Seiten unter `pages-legacy/portal/`), Routen in
   `app/src/components/ClientShell.tsx` registrieren. Express-Routen geben **JSON** zurück
   (`tours/routes/`, `booking/server.js`). Einzige EJS-Ausnahmen:
   `tours/views/customer/{thank-you-yes,thank-you-no,error}.ejs`. Erzwungen durch
   `scripts/guard-no-ejs.sh`.

2. **Zentrale Kunden-/Firmenverwaltung.** Es gibt genau **eine** Kundenliste (`/customers`)
   und **eine** Firmenverwaltung (`/settings/companies`). Modul-spezifische Pfade wie
   `/admin/tours/customers` werden via `<Navigate to="/customers" replace />` umgeleitet. Nie
   modul-eigene Kundenseiten anlegen. Eine Firma = **eine** Zeile in `customers`; weitere
   Personen sind `customer_contacts` (siehe `booking/customer-dedup.js`, Merge nur über
   `/api/admin/customers/merge`).

3. **E-Mail-Lookup nie direkt.** Niemals `WHERE email = $1` oder `WHERE LOWER(email) = $1` auf
   `customers` schreiben — Aliase werden sonst übergangen. Stattdessen:
   - JS/TS: `db.getCustomerByEmail(email)` (booking) bzw. `customerLookup.getCustomerByEmail(email)` (tours)
   - SQL: `core.customer_email_matches($1, email, email_aliases)` (innerhalb `booking`/`tour_manager`-Schema
     ohne `core.`-Prefix dank `search_path`)

4. **Defensive Migrationen.** Jede Migration muss auf einer frischen *und* einer jahrealten
   Produktions-DB laufen. `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, Spalten via
   `information_schema.columns` prüfen. Schema-übergreifende Umbenennungen (`core.*` →
   `booking.*` / `tour_manager.*`) immer in **allen** Schemas in derselben oder direkt
   folgenden Migration nachziehen.

5. **Portal spiegelt Admin-Tour-Panel.** Design- oder Funktionsänderungen an
   `app/src/pages-legacy/tours/admin/TourDetailPage.tsx` (und den darin verwendeten
   Sub-Komponenten) müssen in `app/src/pages-legacy/portal/PortalTourDetailPage.tsx`
   identisch nachgezogen werden. Ausnahmen, die im Portal **nicht** existieren: `Intern`,
   `Aktionsprotokoll`, Admin-only Aktionen (Tour löschen, Space übertragen, Ticket erstellen,
   Matterport-Options-Overrides).

6. **Tour-Manager: kanonische Felder.** Immer die `canonical_*`-Spalten lesen, nicht die
   Legacy-Duplikate.

7. **Synthetische Einladungs-E-Mails** verwenden `@invite.buchungstool.invalid`, nicht
   `@company.local`.

## Frontend-Konventionen (`app/src/`)

- Neue Seiten: `app/src/pages-legacy/[bereich]/` als funktionale Komponente.
- Routing: ausschließlich `app/src/components/ClientShell.tsx`. Portal-Routen `/portal/...`,
  Admin-Routen `/admin/...` oder Top-Level (`/dashboard`, `/login`).
- API-Calls über `app/src/api/` — `portalFetch('/portal/api/...')` (Session-Cookie) für Portal,
  `apiFetch('/api/...')` (Bearer-Token) für Admin. API-Typen leben neben den Funktionen
  (`api/portalTours.ts`, `api/toursAdmin.ts`, `api/customers.ts`, ...).
- Bei API-Erweiterungen ggf. Rewrite in `app/next.config.ts` (`beforeFiles`) ergänzen.

## Doku synchron halten

`docs/` ist nicht optional — `scripts/guard-docs.sh` (Pre-Commit) erinnert. Mapping
Code-Änderung → Doku-Datei steht in `.cursor/rules/data-fields.mdc`. Wichtigste:

| Änderung | Datei |
|---|---|
| SQL-Migration / Spalte | `docs/SCHEMA_FULL.md` (+ Flow) |
| Buchungs-Flow / Formularfeld | `docs/FLOWS_BOOKING.md` |
| Tour-Flow | `docs/FLOWS_TOURS.md` (+ ggf. `docs/WORKFLOW_TOURS.md`) |
| Upload | `docs/FLOWS_UPLOAD.md` |
| Exxas | `docs/FLOWS_EXXAS.md` |
| Rolle / Permission | `docs/ROLES_PERMISSIONS.md` |
| E-Mail-Template | `docs/EMAIL_TEMPLATES.md` |
| Deploy / CI | `docs/DEPLOY-FLOW.md` |

Neue `FLOWS_*.md` aus `docs/FLOWS_TEMPLATE.md` ableiten und in `DATA_FIELDS.md` plus
`.cursor/rules/data-fields.mdc` eintragen.

## CI / Deploy

GitHub-Actions-Workflows in `.github/workflows/`:

- `app-ci.yml` — Type-Check + Build der `app/`
- `booking-ci.yml` — Backend-Tests
- `deploy-vps-and-booking-smoke.yml` — Auto-Deploy bei Push auf `master` (Build → Upload →
  Docker-Build → Migrate → Health-Check → Cloudflare-Purge); Smoke-Tests nur bei manuellem
  Trigger (`run_smoke`)
- `auto-fix-deploy-failure.yml`, `calendar-audit.yml`, `openapi-lint.yml`,
  `assistant-mobile-build.yml`

VPS: `87.106.24.107`, Projektpfad `/opt/propus-platform`, Port `3100`. Vor manuellem Deploy
Build-Nummer in `scripts/bump-deploy-version.ps1` erhöhen. Cloudflare-Hostnames (alle →
`http://127.0.0.1:3100`): `booking.propus.ch`, `admin-booking.propus.ch`, `portal.propus.ch`,
`api-booking.propus.ch` (Details: `docs/VPS-BETRIEB.md`).

## Submodule

Nach frischem Clone:

```bash
git submodule update --init --recursive
```

`third-party/agent-toolkit` (Softaworks Agent-Skills) und weitere Marketplaces sind in
`.claude/settings.json` registriert.
