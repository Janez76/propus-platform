# Phase 1 — Inventur

**Audit-Datum:** 2026-04-20
**Repository:** `Janez76/propus-platform` @ master (lokal geklont, Tiefe 1)
**Auditor:** Senior Full-Stack Reviewer
**Branch:** `master`

---

## 1. Modulkarte

```
propus-platform/
├── app/              Next.js 16.2.1 + React 19.2.4 + Tailwind 4 (TypeScript)
│                     Primäres Admin-Frontend — 86'585 LOC in .ts/.tsx/.js
│                     Struktur: SPA-Shell (ClientShellLoader via [[...slug]]/page.tsx)
│                     + API-Routen + pages-legacy/ mit alten SPA-Pages
├── platform/         Zentraler Express-Gateway (server.js, 155 LOC)
│                     Mountet booking + tours hinter Port 3100, pino-Logging
├── booking/          Express-Backend für Buchungen — 32'846 LOC
│                     server.js allein: 13'195 LOC (Monolith)
│                     84 SQL-Migrationen in booking/migrations/
│                     Komponenten: RBAC, Kalender-Sync (MS Graph), Slot-Engine,
│                     Preis-Engine, E-Mail-Templates, Cron-Jobs
├── tours/            Tour Manager (Express + EJS) — 32'431 LOC
│                     Modularisiert: routes/ + lib/ + middleware/ + test/
│                     Payrexx-Webhook, Bank-Import CAMT.053, Matterport-API,
│                     Renewal-Invoices, Cleanup-Jobs, AI/Suggestions
├── core/             Migrations-Runner + 40 gemeinsame Schema-Migrationen
│                     969 LOC — core/migrate.js (98 LOC)
├── auth/             Session-Store + Logto-Bootstrap — 153 LOC
│                     Einziger Datei: postgres-session-store.js
├── website/          Astro 6 + Supabase öffentliche Website — 17'968 LOC
├── infra/            Cloudflare-Worker Error-Page — 131 LOC
├── scripts/          Deploy-/Backup-/Utility-Skripte — 1'571 LOC
├── docs/             21 Markdown-Dokumente + openapi/
└── .github/workflows 4 Workflows (deploy, app-ci, staging-nas, openapi-lint)
```

**Beobachtung Phase 1:** Platform/server.js ist sehr schlank (155 LOC, reiner Mount-Aggregator). Die gesamte Geschäftslogik sitzt in `booking/server.js` (13'195 LOC, monolithisch) und `tours/` (modularisiert nach routes/lib/middleware — deutlich sauberer aufgebaut als booking). Siehe `30-ARCHITECTURE.md` für Konsequenzen.

---

## 2. Dependencies pro Modul

### 2.1 `app/` — Next.js Admin-Frontend

**Runtime:** Node ≥ (nicht explizit via `engines` gesetzt — siehe Finding)
**Kern-Stack:**
- next@16.2.1, react@19.2.4, react-dom@19.2.4
- tailwindcss@^4 (CSS-first Tailwind 4 via @tailwindcss/postcss)
- typescript@^5, eslint@^9, eslint-config-next@16.2.1

**Frontend-Libraries:**
- @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities (Drag&Drop)
- @fullcalendar/* (Kalender-Widget)
- @tanstack/react-table@^8.21.3
- @tiptap/* (Rich-Text-Editor)
- framer-motion@^12.38
- lucide-react@^1.7.0 (Achtung — das ist Beta-Version, stable ist 0.5xx)
- react-router-dom@^7.13.2 (SPA-Routing innerhalb des Catch-All)
- zustand@^5.0.12 (State)
- react-easy-crop, sharp@^0.34.5 (Bildverarbeitung)
- pdfjs-dist@^5.6.205, pdfkit@^0.18.0, swissqrbill@^4.3.0
- fast-deep-equal, tailwind-merge, clsx, nanoid, dexie

**Backend-Pakete im Frontend deklariert (depcheck bestätigt ungenutzt, siehe `10-STATIC-ANALYSIS.md`):**
- @azure/identity, @microsoft/microsoft-graph-client
- bcryptjs, express-session, multer, node-cron, nodemailer
- openid-client, pdfkit, swissqrbill

**DevDependencies:**
- @playwright/test@^1.58.2, vitest (über @testing-library/…)
- jsdom@^26.1.0

### 2.2 `booking/` — Express-Backend

- express@^4.21.0, body-parser@^1.20.4, compression@^1.7.4, cors@^2.8.6, helmet@^8.1.0
- express-session@^1.19.0, express-rate-limit@^7.5.1
- passport@^0.7.0, passport-openidconnect@^0.1.2
- pg@^8.13.3, dotenv@^17.2.3
- nodemailer@^6.9.16 *(CVE — HIGH, siehe Phase 2)*
- @azure/identity@^4.13.0, @microsoft/microsoft-graph-client@^3.0.7, isomorphic-fetch
- multer@^1.4.5-lts.1 *(multer@1 ist veraltet, aktuell ist 2.x)*
- sharp@^0.34.5, winston@^3.19.0, node-cron@^4.2.1
- pdf-to-png-converter@^3.14.0

**Scripts:** `start` (node server.js), `test` (node --test)

### 2.3 `tours/` — Tour Manager

- express@^4.18.2 *(veraltet, booking hat 4.21)*, express-session@^1.17.3 *(veraltet)*
- bcryptjs@^2.4.3 *(veraltet — booking und app nutzen 3.x)*
- ejs@^3.1.9, pg@^8.11.3 *(veraltet gegenüber booking)*
- nodemailer@^6.10.1 *(CVE HIGH)*
- swissqrbill@^4.3.0, pdfkit@^0.17.2, archiver@^7.0.1
- multer@^1.4.5-lts.1, fast-xml-parser@^5.5.9, dotenv@^16.3.1

### 2.4 `platform/` — Gateway

- express@^4.21.0, express-session@^1.19.0, express-rate-limit@^7.5.1
- pino@^10.3.1, pino-http@^11.0.0, pino-roll@^4.0.0 *(modernes Logging — gut)*
- compression, cors, dotenv, pg, nodemailer *(CVE HIGH)*, bcryptjs@^2.4.3, sharp
- ejs@^3.1.9, swissqrbill, pdfkit, multer@^1.4.5-lts.1
- @azure/identity, @microsoft/microsoft-graph-client

### 2.5 `core/`

- pg@^8.13.3, bcryptjs@^3.0.3
- Nur `migrate`-Script

### 2.6 `auth/`

- Nur express@^4.21.0

### 2.7 `website/`

- astro@^6.1.1, @astrojs/node@^10.0.4
- @supabase/supabase-js@^2.101.0 *(ältere Minor-Version der 2.x-Reihe)*
- compression@^1.8.1

**engines:** `node >= 22.12.0` (nur hier gesetzt — Inkonsistenz)
**version:** `2.3.407-deploy.511.1.b23b9d6` (Deploy-ephemere Version als Git-committed Wert — sollte per CI gesetzt werden, liegt aber im Repo)

---

## 3. Datenbank-Migrationen (Schema-Stand)

### 3.1 `core/migrations/` — 41 Dateien (000 … 040)

Keine Prefix-Duplikate. Numerisch sortiert, Präfixe zero-padded dreistellig:

- 000 Schema-Init, 001 core, 002 booking, 003 tour_manager
- 004/005 Booking-Fields in core.customers/contacts
- 006 Portal-User-Link, 007 Session-Store, 008 Rename Keycloak → Auth
- 009-011 Photographer-Erweiterungen (bookable_photo_url, active, settings)
- 012 Exxas-Subscription-ID, 013 customer.number
- 014 tours.start_sweep, 015-017 Portal-Staff / Workspace Index
- 018-019 Normalisierung admin_users / sessions
- 020 tours.last_email_sent_at, 021 tours.booking_order_no
- 022 customer_email_aliases, 023 tickets
- 024 contact_portal_role, 025 floorplan_pricing_seed
- 026 invoices_central_view, 027 tours.workflow_fields
- 028 listing_galleries, 029 routing_fields, 030 exxas_invoices.archived_at
- 031 gallery_links, 032 gallery_nas_sources, 033 remove_logto_cutover
- 034 bank_import_invoice_sources, 035 fix_bank_import_sequences
- **036 renewal_invoices_payment_fields** (`paid_at_date`, `payment_channel`, `skonto_chf`, `writeoff`, `writeoff_reason`) — explizit in README vermerkt
- 037 renewal_invoices_freeform, 038 gallery_friendly_slug
- 039 api_keys, 040 admin_users_legacy_to_view

### 3.2 `booking/migrations/` — 87 Dateien (001 … 084)

**KRITISCH: Sechs doppelt vergebene Präfixe**

| Prefix | Dateien |
|--------|---------|
| 020 | `020_employee_workhours_and_drone_split.sql`, `020_merge_acanta_83_into_64.sql` |
| 043 | `043_photographer_phone_mobile_whatsapp.sql`, `043_product_kind_extra.sql` |
| 044 | `044_service_categories_show_in_frontpanel.sql`, `044_template_strings_photographer_contact.sql` |
| 047 | `047_admin_user_profile_sync.sql`, `047_rbac_new_permission_keys.sql` |
| 051 | `051_companies_standort_notiz.sql`, `051_company_admin_users.sql`, `051_company_profile_fields.sql` (DREI Dateien!) |
| 071 | `071_gbp_oauth_tokens.sql`, `071_travel_zone_products.sql` |

**Konsequenz:** Der Runner sortiert alphabetisch. Bei gleichen Präfixen hängt die Reihenfolge vom Suffix ab. Wenn zwei Deployments mit inkonsistenten Zwischenständen laufen (z. B. einer applied bereits 043a, nicht 043b), wird der Tracking-Eintrag in `core.applied_migrations` pro Datei geführt, aber die Semantik „gleiche Versionsnummer“ ist verletzt. Bei jeder künftigen manuellen Analyse wird das für Verwirrung sorgen. Siehe Finding BUG-01.

Zusätzlich problematisch: **Data-Fix-Migrationen** in Schema-Ordnern:
- `019_fix_order_100058_address_swap.sql` — hardkodiert auf Order-ID
- `020_merge_acanta_83_into_64.sql` — Kundenfusion per Migration
- `038_merge_customer_contacts_69_89.sql` / `039_merge_customer_contacts_keep_89.sql`
- `063_merge_nextkey_75_into_csl_70.sql`
- `040_fix_product_name_encoding.sql` / `041_normalize_product_names_ascii.sql`

Das sind Einmal-Data-Repairs, keine Schema-Migrationen. Sie gehören in ein separates `seeds/`- oder `data-fixes/`-Verzeichnis mit Idempotenz-Guards.

### 3.3 Migrations-Runner (`core/migrate.js`)

- Transactional pro Datei (BEGIN/COMMIT/ROLLBACK) ✅
- Alphabetische Sortierung via `sort()` — kein natürlich-numerisches Sortieren ✅ (durch Zero-Padding OK, außer bei Duplikaten)
- Tracking in `core.applied_migrations` mit `ON CONFLICT DO NOTHING`
- **Fehlend:**
  - Kein Check auf doppelte Präfixe
  - Keine Checksumme/Hash → geänderte Migration wird nicht erkannt
  - Keine Query-Timeout
  - Keine Dry-Run-Option
  - Keine Unterstützung für `booking/migrations/` (nur `core/migrations/`!) — laut README läuft booking/ „separat“

---

## 4. Docker-Compose-Dateien

| Datei | Zweck | Zeilen | Charakter |
|---|---|---|---|
| `docker-compose.yml` | Lokale Entwicklung | 162 | Exponiert PG-Port auf `0.0.0.0`, `change_me_local`-Defaults |
| `docker-compose.vps.yml` | Produktion auf VPS `87.106.24.107` | 196 | Binding auf `127.0.0.1`, alpine-Image, 30 Healthcheck-Retries, `env_file` mit `.env.vps` + optional `.env.vps.secrets` |
| `docker-compose.staging.nas.yml` | Staging auf UGREEN NAS | 48 | Overlay-Snippet, nur Overrides für NAS |
| `compose.yaml` | Symlink → `docker-compose.vps.yml` | — | Damit `docker compose up` auf VPS ohne `-f` funktioniert |

**Drift-Befunde (Details in `30-ARCHITECTURE.md`):**
- PG-Image: `postgres:16` (dev) vs `postgres:16-alpine` (vps)
- Port-Binding: `0.0.0.0` (dev) vs `127.0.0.1` (vps)
- Healthcheck-Retries: 5 (dev) vs 30 (vps)
- SESSION_COOKIE_SECURE: nicht gesetzt (dev, → false) vs `"true"` (vps)
- VPS hat 40+ zusätzliche Env-Variablen für Payrexx, Matterport, Nextcloud, Exxas, MS Graph

**Empfehlung:** Einheitliche Basis `docker-compose.yml` + `docker-compose.override.yml` (Dev) + `docker-compose.vps.yml` (Prod-Overrides) statt drei parallele Wahrheiten.

---

## 5. CI/CD (`.github/workflows/`)

### 5.1 `deploy-vps-and-booking-smoke.yml` — Primary Deploy

- **Trigger:** push auf master + `workflow_dispatch` mit optionalen Inputs `run_deploy`, `run_smoke`
- **Jobs:**
  1. `architecture-guard` — `scripts/guard-no-ejs.sh` (verbietet neuen EJS-Code in app/ — interessant, da tours/ noch EJS nutzt)
  2. `documentation-guard` — `scripts/guard-docs.sh --ci`, `continue-on-error: true` (non-blocking)
  3. `build-nextjs` — type-check + `npm run build` (nur bei workflow_dispatch+run_smoke!)
  4. `deploy` — SSH zum VPS, Upload, Rebuild, Migrate, Health-Check, Cloudflare-Purge
  5. Smoke-Tests (Playwright) nur manuell
- **Probleme (siehe 20-FINDINGS.md + 40-DX-WORKFLOW.md):**
  - Deploy-Job läuft bei push ohne vorherigen Next-Build → kaputter TSC kann trotzdem deployen
  - `actions/checkout@v6` und `actions/setup-node@v6` sind floating tags (nicht SHA-gepinnt)
  - Kein separater Test-Step (booking/tours Node-Tests werden nicht ausgeführt)
  - Deploy-Version wird ephemer gesetzt (`runNumber.runAttempt.shortSha`) — gut

### 5.2 `app-ci.yml`, `deploy-nas-staging.yml`, `openapi-lint.yml`

Nicht vollständig analysiert — separate CI-Pfade für SPA-Dev, NAS-Staging, API-Doku-Lint.

---

## 6. Versionen-Snapshot (Stand Audit)

| Modul | node_modules | Status |
|---|---|---|
| app/ | 726 Pakete | installiert, tsc grün, eslint: 144 Probleme (64 err, 80 warn) |
| booking/ | 210 Pakete | installiert, `npm test` 72/72 grün |
| tours/ | — | installiert, `npm test` 30/30 grün (ein `getEmailTemplates: ECONNREFUSED` als Side-Effect — kein Fehlschlag) |
| platform/ | 227 Pakete | installiert |
| core/, auth/, website/ | — | nicht installiert (Zeitbudget) |

**`npm audit --omit=dev`:**
- app/: 1 HIGH (`next`: DoS with Server Components)
- booking/: 1 HIGH (`nodemailer`: addressparser DoS + Interpretation Conflict)
- tours/: 1 HIGH (`nodemailer`: gleiche zwei CVEs)
- platform/: 1 HIGH (`nodemailer`: gleiche)

Details und Fix-Versionen in `10-STATIC-ANALYSIS.md`.

---

## 7. Offene Fragen / Annahmen

1. **`website/` ↔ `booking/`**: README sagt „eine PostgreSQL-Datenbank“, aber `website/` nutzt `@supabase/supabase-js`. Annahme basierend auf Code: Die Website hat ihre eigene Supabase-Instanz für CMS-Inhalte (Produktkatalog, Uploads), während Buchungsdaten weiter in der Haupt-PG landen und via `PUBLIC_BOOKING_CATALOG_URL` als JSON-API abgefragt werden. *Nicht verifiziert* — dokumentierter Sync-Pfad zwischen beiden DBs nicht gefunden. Siehe BUG-63.

2. **`platform/frontend/`**: README nennt eine Vite/React-SPA unter `platform/frontend/`. Im geklonten Repo existiert dieser Ordner nicht — nur `platform/modules/` und `platform/lib/` (beide leer laut GitHub-API). Annahme: Die SPA lebt nicht mehr hier, ist vermutlich in `app/src/pages-legacy/` migriert, oder wurde gelöscht und README nicht aktualisiert. Siehe BUG-66.

3. **`PropusDashboard.jsx` im Repo-Root** (795 LOC): nirgends in `app/src/` referenziert. Annahme: Altlast oder Design-Mockup, das ins Root abgelegt wurde. Siehe BUG-41.

4. **Booking-Migrations-Runner**: `core/migrate.js` liest nur `core/migrations/`. `booking/migrations/` wird laut README „separat“ abgearbeitet, aber ich habe keinen zweiten Runner gefunden. Annahme: `booking/migrate.js` existiert als parallele Implementierung. *Zu verifizieren.*

5. **`platform/server.js` als API-Gateway**: Kompiliert die `booking.app` und `tours.app` beide in denselben Prozess (`main.use(booking.app)`), d. h. zwei Express-Apps im gleichen Event-Loop. Keine Prozess-Trennung, keine unabhängige Skalierung möglich.

6. **Ports**: Container intern hört Platform auf 3100 (laut README), aber `docker-compose.vps.yml:54` mappt `3100:3001`. Das Dockerfile baut also mit internem Port 3001, nicht 3100. Doppelte Konfiguration, potenziell verwirrend.

---

## 8. Phase-1-Fazit

Das Repo ist **ein gut dokumentiertes Monorepo mit drei Hauptcodepfaden** (app, booking+tours via platform, website) und einem soliden Migrations- und CI-Fundament. Auffällig sind:
- **Monolithisches `booking/server.js`** (13k LOC in einer Datei),
- **Doppelte Migrations-Präfixe** in booking/ — strukturelles Risiko,
- **Deklarierte aber ungenutzte Backend-Pakete in app/** (10 Stück) — Bundle-/Sicherheits-Oberfläche,
- **Inkonsistente Dependency-Versionen** zwischen booking und tours für dieselben Libs (express 4.21 vs 4.18, bcryptjs 3 vs 2.4, pg 8.13 vs 8.11).

Die weiteren Phasen vertiefen.
