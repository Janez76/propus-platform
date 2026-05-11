# CLAUDE.md — Anweisungen für Claude in diesem Repo

Dies ist das **Propus Platform Monorepo** (Janez Smirmaul). Diese Datei ist
das Regelwerk für Claude Code beim Arbeiten in diesem Verzeichnis.
Detaillierte Architektur-Regeln stehen in **`AGENTS.md`** — lies sie zuerst,
wenn die Aufgabe Module oder Datenmodell berührt.

---

## 1. Nutzer & Sprache

- **Janez** ist Entwickler/Inhaber.
- **Sprache:** Antworte auf **Deutsch**. Code, Identifier, Commit-Messages,
  PR-Titel bleiben auf **Englisch** (Konvention im Repo).
- **Stil:** Kurz, direkt, technisch. Keine Floskeln, keine
  „Hier ist eine Lösung …"-Eröffnungen.

## 2. Stack — was du anfasst

| Bereich | Stack |
|---|---|
| Frontend SPA | Next.js 16 (App-Router + `pages-legacy/`), React 19, Tailwind 4, TypeScript 5 |
| Frontend-Editor | TipTap, FullCalendar, dnd-kit, leaflet, sonner |
| State / Forms | zustand, react-hook-form, zod, dexie (IndexedDB) |
| Backend Booking | Node + Express 4 (`booking/`), Passport (OIDC), PG-Pool |
| Backend Tours | Node + Express 4 (`tours/`), wenige EJS-Views (nur `customer/`) |
| DB | PostgreSQL, Migrationen in `core/migrations/` und `booking/migrations/` |
| Auth | Logto (OIDC) für Admin/Portal, Sessions in PG |
| Tests | vitest (`app/`), `node --test` (booking/tours), Playwright (E2E in `app/e2e/`) |
| Build/Deploy | Docker (`docker-compose.yml`, `docker-compose.vps.yml`), VPS via `scripts/deploy-vps.cmd` |
| Linting | eslint (`app/`), `scripts/guard-no-ejs.sh` |

## 3. Verzeichnis-Karte (nur das, was häufig angefasst wird)

```
app/                  Next.js SPA (das Hauptfrontend)
  src/app/            App-Router (admin, auth, api, webhook)
  src/pages-legacy/   Legacy-React-Seiten (Tours, Selekto, Listing, …)
  src/components/     UI-Bausteine (orders, tours, customers, …)
  src/lib/            repos, validators, mail, orderWorkflow, selekto
  src/api/            API-Clients (gegen tours/, booking/)
  e2e/                Playwright-Tests
  scripts/            theme-check, eval-assistant, seed-memories
booking/              Express Backend Buchungsportal
  customer-dedup.js   Dubletten-Logik (siehe AGENTS.md)
  customer-merge.js
  db.js               getCustomerByEmail() — IMMER nutzen
  migrations/
tours/                Express Tour-Manager (Admin + Customer-Portal)
  lib/                customer-lookup.js (getCustomerByEmail), admin-phase3.js
  routes/             API-Endpunkte (NUR JSON)
  views/customer/     Erlaubte EJS-Reste (3 Dateien)
auth/                 Auth-Helpers (Session-Store)
core/                 DB-Schema, Migrationen, Seeds
  migrations/         022_customer_email_aliases.sql, 026_invoices_central_view.sql, …
docs/openapi/         OpenAPI-Spec
scripts/              find-duplicate-customers, deploy-vps, install-hooks, …
infra/                Cloudflare-Worker
platform/             Docker-Container-Definitionen
```

## 4. Häufige Befehle

Aus dem Repo-Root (`y:/propus-platform/propus-platform`):

```bash
# Frontend dev (app/)
cd app && npm run dev

# Tests
cd app && npm test            # vitest
cd app && npm run test:e2e    # playwright
cd booking && npm test        # node --test
cd tours && npm test          # node --test

# Build
cd app && npm run build

# Linting
cd app && npm run lint
bash scripts/guard-no-ejs.sh  # CI-Guard

# Theme-Tokens prüfen
cd app && npm run theme:lint

# Kundendubletten analysieren
cd booking && npm run analyze-duplicate-customers
cd booking && npm run audit:customer-stammdaten
```

Git-Worktree-Pattern wird benutzt — Branches landen oft in
`y:/propus-platform/tmp-*` (siehe `.claude/settings.json`).

## 5. Harte Regeln (aus AGENTS.md — kurz)

Lies bei jeder neuen Aufgabe `AGENTS.md` für Details. Die wichtigsten
Verbote/Gebote:

### EJS / HTML-Rendering
- **Keine neuen `.ejs`-Dateien** außer in `tours/views/customer/`.
- **Kein `res.render()`** in Express-Routen für Portal/Admin-Seiten.
- Neue Features → React (Next.js).

### Kunden-E-Mail-Lookups (Aliases!)
- **JS/TS:** IMMER `getCustomerByEmail()` aus `booking/db.js` bzw.
  `tours/lib/customer-lookup.js` nutzen. NIE selbst `WHERE email = $1`.
- **SQL:** IMMER `core.customer_email_matches($1, c.email, c.email_aliases)`
  verwenden. NIE nur `LOWER(c.email) = $1`.

### Portal spiegelt Admin-Tour-Panel
Jede Design- oder Funktionsänderung am Admin-Tour-Panel auch im
Kunden-Portal umsetzen. Liste der Komponenten-Paare siehe AGENTS.md.
Sektionen `Intern`, `Aktionsprotokoll`, Admin-only Aktionen NICHT
im Portal.

### Zentrales Rechnungsmodul
- Routing: `/admin/invoices` → `AdminInvoicesPage.tsx`
- Legacy-URL `/admin/tours/invoices` → Redirect
- API: `/api/tours/admin/invoices-central?type=renewal|exxas`
- View: `tour_manager.invoices_central_v`

### Ticket-System
Tabelle `tour_manager.tickets`, UI unter `/admin/tickets`. Pflichtfelder:
`module`, `reference_type`, `subject`. Status: `open/in_progress/done/rejected`.

## 6. Verhaltens-Regeln für Claude

### Do
- **Erst `AGENTS.md` und `CLAUDE.md` lesen**, dann ans Werk.
- **Existierende Helpers nutzen** statt parallele Implementierungen.
- **Tests schreiben/anpassen**, wenn du Geschäftslogik berührst.
- **Commit-Messages** auf Englisch, im Conventional-Commit-Stil
  (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).
- **Migration nötig?** Neue Datei in `core/migrations/` mit
  fortlaufender Nummer; vorher fragen, ob es eine bestehende Migration
  zum Erweitern gibt.

### Don't
- **Kein `git push --force`** ohne Rückfrage.
- **Keine Massen-Renames** über >5 Dateien ohne Rückfrage.
- **Keine `.env*`-Dateien einchecken** (steht in `.gitignore`, aber
  doppelt geprüft schadet nicht).
- **Keine direkten Master-Commits.** Branches: `feat/`, `fix/`, `chore/`.
- **Kein Anlegen neuer Top-Level-Ordner** ohne Rückfrage — das Monorepo
  ist gewachsen, neue Strukturen brauchen Zustimmung.
- **Nichts in `tours/views/customer/` löschen** — die drei EJS-Dateien
  bleiben Legacy-Erlaubnis.

## 7. Wenn du unsicher bist

- Bei Datenmodell-Fragen: `core/migrations/` lesen und/oder die DB
  via psql prüfen (Befehl in `.env`/`.env.vps`).
- Bei Architekturfragen: `AGENTS.md` ist die Wahrheit.
- Wenn `AGENTS.md` und Code sich widersprechen: nachfragen, nicht raten.

## 8. Obsidian-Vault als Wissensspeicher

Der MCP-Server **`obsidian`** ist in `~/.claude.json` global registriert und
beim Start jeder Claude-Code-Session automatisch verbunden. Er gibt dir Lese-
und Schreibzugriff auf:

`C:\Users\svajc\Documents\Obsidian Vault`

Das Regelwerk dort (`CLAUDE.md` im Vault-Root) gilt für alle Vault-Schreibe.
Die wichtigsten Ordner für Repo-bezogene Inhalte:

| Inhalt | Zielordner im Vault |
|---|---|
| Recherche zu einer Bibliothek/API (extern) | `40_Resources/research/` |
| Tool/Doku zum Nachschlagen (z.B. psql-Cheatsheet) | `40_Resources/tools/` |
| Konzept-/Entscheidungs-Notiz, atomar | `10_Notes/` |
| Schnelle Idee, später triagieren | `00_Inbox/` |
| Projekt-spezifisches (Roadmap, Meilenstein) | `20_Projects/propus-platform/` |

### Wann notieren

- **Architektur-Entscheidungen** (warum X statt Y): kurzer Eintrag in
  `10_Notes/` mit `tags: [propus, architecture, decision]` und Link
  zum betroffenen PR/Commit.
- **Recherche-Ergebnisse** (z.B. „wie funktioniert Logto Token Refresh"):
  `40_Resources/research/<thema>-<YYYY-MM-DD>.md` mit Quellen-Fußnoten.
- **Wiederkehrende Befehle/Setups** (psql-Verbindungsstring, Deploy-Quirks):
  `40_Resources/tools/`.
- **Bug-Hunt-Erkenntnisse** mit zukünftigem Wert: `10_Notes/` mit Link zum
  Fix-Commit.

### Wann NICHT notieren

- Trivialer Commit-Inhalt → `git log` reicht.
- Halbfertige Hypothesen mitten in einer Debug-Session → erst klären,
  dann notieren.
- Sensible Daten (Secrets, Customer-Daten) → niemals.

### Frontmatter-Konvention für Repo-bezogene Notizen

```yaml
---
title: "Aussagekräftiger Titel"
created: 2026-05-11
tags: [propus, <kategorie>]
status: active
repo: "propus-platform"
commit: "<sha-falls-relevant>"
---
```

`tags: propus` ist Pflicht, damit du in Obsidian per Dataview alle
Code-bezogenen Notizen abfragen kannst.

### Bei Unsicherheit

Bevor du eine größere Notiz schreibst, kurz nachfragen, ob es das Thema
schon im Vault gibt — der MCP-Server kann suchen. Duplikate vermeiden.

---

*Stand: 2026-05-11. Diese Datei ergänzt — nicht ersetzt — `AGENTS.md`.*
