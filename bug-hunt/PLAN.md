# Propus Platform – Full-Repo Bug Hunt

**Start:** 2026-05-03
**Branch:** `claude/full-repo-bug-hunt-R4JNY`
**Commit:** `cfdbe0aef7b9fb954dcb49ec52b00b9a146c6396`
**Modus:** Lese-/Berichts-Modus (keine Code-Änderungen)

---

## Stack-Drift (Phase 0.1)

Der angenommene Stack des Prompts weicht erheblich vom realen Repo ab.
Die folgenden Annahmen müssen für den Scan korrigiert werden:

| Annahme im Prompt | Reality | Konsequenz für Scan |
|-------------------|---------|---------------------|
| Next.js 15 | **Next 16.2.1** | RSC-Patterns prüfen, aber API-Stand 16.x |
| React 18 (impliziert) | **React 19.2.4** | `use()`, neue Hooks, ref-as-prop |
| Single Next-App | **Mono-Repo mit 10 Sub-Apps** | Tranchen pro Sub-App definieren |
| Keine ORMs / nur raw SQL | **Bestätigt** (`pg` direkt, keine Drizzle/Prisma/Supabase) | SQL-Injection-Checks bleiben relevant |
| Kein shadcn/ui | **Bestätigt** (eigene `components/ui/`) | Keine shadcn-Patterns erwartet |
| Tailwind v4 | **Bestätigt** | `@tailwindcss/postcss`, neue config |
| (impliziert) reines Next.js | **Mehrere Express-Backends** (booking, tours, platform) | Express-spezifische Bugs (Auth, Middleware-Reihenfolge, Rate-Limiting) zusätzlich |
| Server Actions = Hauptweg | **Mix aus Server Actions + Express-JSON-APIs** | Beide Pfade prüfen, nicht nur Actions |
| Single locale de-CH | **Bestätigt** (Schweizer Hochdeutsch, CHF, MwSt 8.1 %) | i18n-Drift prüfen (alte 7.7 %?) |
| Keine pages router | **App Router + `pages-legacy/`** (React-Komponenten via React-Router-DOM in SPA-Hülle `ClientShell.tsx`) | Hybrid – sowohl App-Router-Routen als auch legacy SPA prüfen |
| Keine EJS | **EJS noch vorhanden** in `tours/views/customer/` (3 Dateien Legacy + Marketing) und `platform/` | EJS-Dateien als Legacy markieren, nicht ignorieren |
| Keine Astro | **Astro für `website/`** | Eigene Tranche, eigene Bug-Klassen (SSR vs SSG, .astro-Komponenten) |
| Webpack vs Turbopack | **Webpack** (`next dev --webpack`, `next build --webpack`) | Bundle-Bloat-Checks ggf. anders |

**Wichtige zusätzliche Tech (im Prompt nicht antizipiert):**
- `@anthropic-ai/sdk` (Assistant-Feature)
- `@microsoft/microsoft-graph-client` + `@azure/identity` (Outlook/Mail-Sync)
- `passport-openidconnect` + `express-session` (Express-Auth, parallel zu Next-Auth-Logik)
- `node-cron` (Background-Jobs)
- `zustand` (Client-State)
- `react-hook-form` + `zod` (Forms)
- `dexie` (IndexedDB im Client)
- `pdfkit` + `swissqrbill` (Schweizer QR-Rechnungen)
- `nodemailer` (Mail-Versand)
- `multer` (File-Uploads, sicherheitskritisch)
- `bcryptjs` für Passwörter
- `winston` / `pino` Logger (im jeweiligen Sub-Projekt unterschiedlich)
- `framer-motion`, `@dnd-kit`, `@fullcalendar`, `leaflet`, `tiptap`

---

## Repo-Map (Phase 0.2)

**Total tracked files (git ls-files):** 1332

| Top-Level | Files | Beschreibung |
|-----------|-------|--------------|
| `app/`    | 639   | Next.js 16 App + `pages-legacy/` SPA + Server Actions + `app/src/app/api` Route Handlers |
| `booking/`| 218   | Express Backend (Buchungstool) + EJS Views (Legacy) |
| `website/`| 138   | Astro Marketing-Website (mit Supabase) |
| `tours/`  | 83    | Express Backend (Tour-Manager APIs) + Customer-EJS-Views (3 Files) |
| `core/`   | 60    | DB-Migrationen (`core/migrations/*.sql`, 54 Files), Shared Lib |
| `scripts/`| 57    | Node-Skripte (Audits, Backfills, Maintenance) |
| `website-propus-codestudio/` | 31 | Zweite Marketing-Website |
| `docs/`   | 26    | Dokumentation |
| `apps/`   | 22    | `propus-assistant-mobile/` (Expo/EAS) |
| `platform/` | 10  | Container-Setup (Express + Next zusammen) |

**Auch im Root:** `PropusDashboard.jsx` (lose JSX-Datei, 27k LOC), Screenshots (PNGs), README, COMPATIBILITY_AUDIT.md, FIXES_APPLIED.md, AGENTS.md (zentrales Architektur-Doc).

**Ungewöhnlich:** Datei `'key'` im Root (leer, 0 Bytes – evtl. versehentlich committed?)

---

## Tranchen-Tabelle (Phase 0.4)

| ID  | Scope (Sub-App / Pfad-Glob)                                                                                            | Geschätzte Dateien | Status   | Findings |
|-----|------------------------------------------------------------------------------------------------------------------------|--------------------|----------|----------|
| T01 | **Auth & Session** – `app/src/middleware.ts`, `app/src/app/(auth)/**`, `app/src/app/api/auth/**`, `auth/**`, `tours/middleware/**`, `booking/middleware/**`, `app/src/lib/auth/**` | ~25                | TODO     | –        |
| T02 | **Server Actions (Next App)** – alle Dateien mit `"use server"` (gefunden: 11 in `app/src/app/(admin)/orders/[id]/`, ggf. mehr) | ~15                | TODO     | –        |
| T03 | **Next API Route Handlers** – `app/src/app/api/**/route.ts`, `app/src/app/webhook/**/route.ts` (37 Dateien) | 37                 | TODO     | –        |
| T04 | **DB Layer (Next App)** – `app/src/lib/db/**`, `app/src/lib/queries/**`, alles mit `pool.query`/`client.query` in `app/src/` | ~30                | TODO     | –        |
| T05 | **Admin-Routes mit Mutations** – `app/src/app/(admin)/**` (alle pages + Components, Mutationen via Server Actions oder Form-POST) | ~80                | TODO     | –        |
| T06 | **Public Routes & Forms** – `app/src/app/(public)/**` (falls vorhanden), `app/src/app/[[...slug]]/**` (Catch-All-Slug → SPA-Mount?), `app/src/pages-legacy/portal/**` | ~40                | TODO     | –        |
| T07 | **Shared Libraries** – `app/src/lib/**`, `app/src/utils/**`, `app/src/hooks/**`, `app/src/store/**`, `core/lib/**` | ~120               | TODO     | –        |
| T08 | **Client Components mit State** – alle Dateien mit `"use client"` (41 in `app/src/`), zustand-stores | ~50                | TODO     | –        |
| T09 | **Background Jobs / Cron / Webhooks** – `app/src/app/api/cron/**`, `app/src/app/webhook/**`, `tours/cron-trigger-renewals.js`, `booking/jobs/**`, `node-cron`-Aufrufer | ~20                | TODO     | –        |
| T10 | **Config, Env, Build** – `app/next.config.ts`, `tailwind.config.*`, `app/eslint.config.mjs`, `app/playwright.config.ts`, `app/vitest.config.ts`, alle `Dockerfile`, `compose.yaml`, `.env.example`, `.github/workflows/**`, `tsconfig.json` | ~15                | TODO     | –        |
| T11 | **Tests** – `app/src/__tests__/**`, `app/e2e/**`, `*.test.ts(x)`, `*.spec.ts(x)`, `tours/test/**`, `booking/tests/**` | ~30                | TODO     | –        |
| T12 | **Migrations & Seeds** – `core/migrations/**` (54 SQL-Dateien), `scripts/seed*.ts/.js` | ~60                | TODO     | –        |
| T13 | **Express Backend Tours** – `tours/server.js` (?), `tours/routes/**` (16 JS-Dateien), `tours/lib/**`, `tours/middleware/**` | ~50                | TODO     | –        |
| T14 | **Express Backend Booking** – `booking/server.js`, `booking/routes/**`, `booking/lib/**`, `booking/jobs/**`, `booking/customer-*.js` | ~80                | TODO     | –        |
| T15 | **Astro Website** – `website/src/**`, `website/server.mjs`, Migrations zu Supabase | ~80                | TODO     | –        |
| T16 | **Mobile App (Expo)** – `apps/propus-assistant-mobile/**` | ~20                | TODO     | –        |
| T17 | **Root-Skripte** – `scripts/**`, `tools/**`, `PropusDashboard.jsx` (Root), `infra/**` | ~60                | TODO     | –        |

**Zusatz-Tranchen, falls relevant:**
- T18 **EJS-Views & Legacy** – `tours/views/**`, `platform/views/**` (sollten kaum aktiv sein laut AGENTS.md, Drift checken)
- T19 **Zweite Marketing-Website** – `website-propus-codestudio/**`

**Stack-Drift im Prompt:** Tranche T13–T17 waren nicht im ursprünglichen Plan, ergeben sich aber zwingend aus dem Mono-Repo.

---

## Pilot-Status (Phase 0.5)

- [x] Pilot-Datei gewählt: `app/src/app/(admin)/orders/[id]/actions.ts`
- [x] Pilot-Review durchgeführt → siehe `bug-hunt/PILOT.md`
- [ ] User-Bestätigung erhalten (`/continue` oder `/adjust …`)

---

## Resume / Status

**Letzter Stand:** Phase 0 abgeschlossen, Pilot ausgeliefert, **STOP** für User-Review.
**Nächster Schritt:** Auf `/continue` oder `/adjust …` warten.
