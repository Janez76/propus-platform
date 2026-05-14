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

Janez führt einen privaten Obsidian-Vault als zweite Wissensquelle.

### Lokale Sessions (Windows-PC)

Der MCP-Server **`obsidian`** ist in `~/.claude.json` global registriert und
beim Start jeder Claude-Code-Session automatisch verbunden. Er gibt dir Lese-
und Schreibzugriff auf:

`C:\Users\svajc\Documents\Obsidian Vault`

### Cloud-Sessions (web.claude.ai / Container ohne Filesystem-Zugriff)

Wenn `C:\Users\svajc\...` nicht erreichbar ist (typisch: Container ohne
Windows-Filesystem), nutze das **Submodule `.vault/`** in diesem Repo. Es
zeigt auf `Janez76/obsidian-vault` (privates Repo, gleiche Credentials wie
dieses Repo — kein zusätzliches Auth-Setup nötig).

Initialisierung am Anfang der Session, falls `.vault/` noch leer ist:

```bash
git submodule update --init --recursive .vault
```

Danach arbeitest du im Container mit `.vault/` als Vault-Wurzel.

**Mache den `submodule update --init`-Schritt ungefragt zu Beginn jeder
Cloud-Session**, wenn `.vault/` leer ist — es ist Teil von Janez'
Standard-Workflow, nicht optional.

| Inhalt | Zielordner im Vault |
|---|---|
| Recherche zu einer Bibliothek/API (extern) | `40_Resources/research/` |
| Tool/Doku zum Nachschlagen (z.B. psql-Cheatsheet) | `40_Resources/tools/` |
| Konzept-/Entscheidungs-Notiz, atomar | `10_Notes/` |
| Schnelle Idee, später triagieren | `00_Inbox/` |
| Projekt-spezifisches (Roadmap, Meilenstein) | `20_Projects/propus-platform/` |

---

## 9. Ruflo — Agent-Orchestrierung (Swarm v3)

Ruflo ist installiert und aktiv (`.mcp.json`, `.claude/agents/`, `.swarm/`).
Nutze es für Tasks mit 3+ Dateien, Cross-Modul-Änderungen oder paralleler Arbeit.

### Agent Comms (SendMessage-First)

```javascript
// ALLE Agents in EINER Nachricht spawnen
Agent({ prompt: "Recherchiere Codebase. Sende Ergebnisse an 'architect'.",
  subagent_type: "researcher", name: "researcher", run_in_background: true })
Agent({ prompt: "Warte auf 'researcher'. Entwirf Lösung. Sende an 'coder'.",
  subagent_type: "system-architect", name: "architect", run_in_background: true })
Agent({ prompt: "Warte auf 'architect'. Implementiere. Sende an 'tester'.",
  subagent_type: "coder", name: "coder", run_in_background: true })
Agent({ prompt: "Warte auf 'coder'. Schreibe Tests. Sende Ergebnisse an 'reviewer'.",
  subagent_type: "tester", name: "tester", run_in_background: true })

SendMessage({ to: "researcher", summary: "Start", message: "[task context]" })
```

### Wann Swarm nutzen

| Ja | Nein |
|----|------|
| 3+ Dateien, neue Features, API-Änderungen | Single-File-Edits |
| Cross-Modul-Refactoring, Security, Performance | 1–2 Zeilen Fixes |

### Routing für Propus-Tasks

| Task | Agents |
|------|--------|
| Bug Fix | researcher → coder → tester |
| Feature | architect → coder → tester → reviewer |
| DB-Migration | architect → coder → reviewer |
| Security-Audit | security-architect → security-auditor |

### Memory

```bash
# Vor Task: Muster suchen
npx ruflo@latest memory search --query "[keywords]"

# Nach Erfolg: Muster speichern
npx ruflo@latest memory store --namespace patterns --key "[name]" --value "[was funktioniert hat]"
```

### Swarm-Status

```bash
npx ruflo@latest swarm status    # Aktiver Swarm: swarm-1778774844512-le7l90
npx ruflo@latest doctor --fix    # Diagnostik
```

### Daemon (Background-Worker)

```bash
npx ruflo@latest daemon status   # PID + Worker-Status
npx ruflo@latest daemon start    # erste Aktivierung (laeuft schon, PID 6312)
npx ruflo@latest daemon stop
```

### MCP-Server (22 verfuegbar)

`claude mcp list` zeigt den aktuellen Stand. Lokal angebunden: ruflo, memory,
sequential-thinking, exa, magic, obsidian, claude-mem, AIDefence + 6 Cloudflare-MCPs
(docs, dns, audit, graphql, radar, browser). claude.ai-hosted: M365, Gmail, Linear,
MailerLite, Canva, Context7, Supabase, Vercel, Slack, PayPal, Higgfield u.a.

### Orchestration-Playbook (extern, Obsidian)

Alle Routing-Regeln, MCP-Inventar, Agent-Catalog und Setup-Stand in
**`C:\Users\svajc\Documents\Obsidian Vault\PC JANEZ\10-Projekte\VPS-Infrastruktur\00_Orchestration\`**:

- `INDEX.md` — Einstieg
- `PLAYBOOK.md` — wann welches Tool/Agent/MCP
- `MCP-SERVERS.md` — alle 22 Server mit Status + Auth
- `RUFLO-SETUP.md` — Setup-Stand + Cheat-Sheet
- `AGENT-CATALOG.md` — die 98 ruflo-Agents kategorisiert

Credentials/Secrets parallel unter `00_Zugangsdaten/INDEX.md` (gleicher Vault).

---

*Stand: 2026-05-14. Ruflo v3.7.0-alpha.35, agentic-flow v2.0.11, 22 MCPs aktiv.*
*Diese Datei ergänzt — nicht ersetzt — `AGENTS.md`.*
