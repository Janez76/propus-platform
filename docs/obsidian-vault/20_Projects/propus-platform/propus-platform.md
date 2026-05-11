---
title: "Propus Platform — Monorepo"
created: 2026-05-11
tags: [propus, project, architecture]
status: active
repo: "propus-platform"
---

# Propus Platform

Monorepo von Janez Smirmaul. Buchungs-/Tour-Plattform mit Next-Frontend
und zwei Express-Backends. Regelwerk: `CLAUDE.md` (Repo-Root) + `AGENTS.md`.

> Diese Notiz wurde aus einer Cloud-Session erzeugt, die keinen Zugriff auf
> den Vault hatte. In den Vault verschieben unter
> `20_Projects/propus-platform/propus-platform.md` und diese Datei danach
> aus dem Repo entfernen.

## Stack

| Bereich | Stack |
|---|---|
| Frontend SPA | Next.js 16 (App-Router + `pages-legacy/`), React 19, Tailwind 4, TS 5 |
| Editor-UI | TipTap, FullCalendar, dnd-kit, leaflet, sonner |
| State / Forms | zustand, react-hook-form, zod, dexie (IndexedDB) |
| Backend Booking | Node + Express 4 (`booking/`), Passport (OIDC), PG-Pool |
| Backend Tours | Node + Express 4 (`tours/`), wenige EJS-Views (nur `customer/`) |
| DB | PostgreSQL — Migrationen in `core/migrations/` und `booking/migrations/` |
| Auth | Logto (OIDC) für Admin/Portal, Sessions in PG |
| Tests | vitest (`app/`), `node --test` (booking/tours), Playwright (`app/e2e/`) |
| Build/Deploy | Docker (`docker-compose*.yml`), VPS via `scripts/deploy-vps.cmd` |
| Linting | eslint (`app/`), `scripts/guard-no-ejs.sh` |

## Verzeichnis-Karte

- `app/` — Next.js SPA (Haupt-Frontend)
  - `src/app/` App-Router (admin, auth, api, webhook)
  - `src/pages-legacy/` Legacy-React-Seiten (Tours, Selekto, Listing, …)
  - `src/components/` UI-Bausteine (orders, tours, customers, …)
  - `src/lib/` repos, validators, mail, orderWorkflow, selekto
  - `src/api/` API-Clients gegen `tours/`, `booking/`
  - `e2e/` Playwright-Tests
- `booking/` — Express Buchungsportal; `customer-dedup.js`, `customer-merge.js`,
  `db.js` (`getCustomerByEmail()` — immer nutzen)
- `tours/` — Express Tour-Manager (Admin + Customer-Portal);
  `lib/customer-lookup.js`, `routes/` (nur JSON), `views/customer/` (3 EJS-Reste)
- `auth/` — Session-Store-Helpers
- `core/` — DB-Schema, Migrationen, Seeds
- `docs/openapi/` — OpenAPI-Spec
- `scripts/` — find-duplicate-customers, deploy-vps, install-hooks, …
- `infra/` — Cloudflare-Worker
- `platform/` — Docker-Container-Definitionen
- `.vault/` — Submodule → `Janez76/obsidian-vault` (dieser Vault)

## Harte Regeln (Kurzfassung — Details in AGENTS.md)

- **EJS:** keine neuen `.ejs` außer `tours/views/customer/`; kein `res.render()`
  für Portal/Admin → neue Features in React.
- **Kunden-E-Mail-Lookup:** JS/TS immer `getCustomerByEmail()`
  (`booking/db.js` / `tours/lib/customer-lookup.js`); SQL immer
  `core.customer_email_matches($1, c.email, c.email_aliases)` — nie `email = $1`.
- **Portal spiegelt Admin-Tour-Panel** (außer Sektionen `Intern`,
  `Aktionsprotokoll`, Admin-only Aktionen).
- **Rechnungsmodul:** `/admin/invoices` → `AdminInvoicesPage.tsx`;
  Legacy `/admin/tours/invoices` → Redirect;
  API `/api/tours/admin/invoices-central?type=renewal|exxas`;
  View `tour_manager.invoices_central_v`.
- **Ticket-System:** Tabelle `tour_manager.tickets`, UI `/admin/tickets`;
  Pflichtfelder `module`, `reference_type`, `subject`;
  Status `open/in_progress/done/rejected`.
- Keine direkten Master-Commits; Branches `feat/`, `fix/`, `chore/`.
  Conventional Commits; Code/Identifier/Commits auf Englisch.

## Befehle

```bash
cd app && npm run dev          # Frontend dev
cd app && npm test             # vitest
cd app && npm run test:e2e     # playwright
cd booking && npm test         # node --test
cd tours && npm test           # node --test
cd app && npm run build        # build
cd app && npm run lint         # eslint
bash scripts/guard-no-ejs.sh   # CI-Guard
cd app && npm run theme:lint   # Theme-Tokens
cd booking && npm run analyze-duplicate-customers
cd booking && npm run audit:customer-stammdaten
```

## Links

- Repo-Regelwerk: `CLAUDE.md`, `AGENTS.md`
- Obsidian ↔ Claude Code Setup: `docs/OBSIDIAN-CLAUDE-CODE.md`
- Vault-Submodule-Pointer wird im Repo mit-committed (`chore: bump vault submodule`)
