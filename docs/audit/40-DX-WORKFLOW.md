# Phase 5 — Developer-Experience & Workflow

**Ziel:** Ein neuer Entwickler soll in **< 30 Minuten** vom frischen Checkout zu einem lokal laufenden Stack kommen, und Fehler (Lint, Typcheck, Test, Security) sollen **früh** im Lifecycle abfangen — idealerweise vor dem Commit, spätestens im CI.

Aktuell fehlen: pre-commit-Hooks, verbindliche Commit-Message-Konvention, PR-Template, CODEOWNERS, Branch-Protection-Regeln, einheitlicher Bootstrap-Befehl, Onboarding-Dokument. Dieses Kapitel liefert konkrete Snippets und Diffs, die 1:1 eingefügt werden können.

---

## 1. Husky + lint-staged (Pre-Commit-Gate)

**Problem heute:** Es gibt keine Git-Hooks. Jeder Commit kann ungelinteten Code, Test-Brüche oder `console.log`-Leichen enthalten. Beispielsweise zeigt Phase 2 **144 ESLint-Probleme in `app/`**, die nie geblockt wurden.

**Lösung:** `husky` (lightweight Git-Hook-Runner) + `lint-staged` (führt Linter nur auf geänderten Dateien aus, bleibt dadurch schnell < 5 s).

### 1.1 Installation (einmalig, Root-Ebene)

```bash
# Im Monorepo-Root (nicht in app/)
npm install -D husky lint-staged
npx husky init
```

`npx husky init` erstellt `.husky/pre-commit` mit `npm test` als Default. Den Inhalt wie folgt überschreiben:

### 1.2 `.husky/pre-commit`

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### 1.3 `package.json` (Root) — neuer Abschnitt

```json
{
  "lint-staged": {
    "app/**/*.{ts,tsx}": [
      "cd app && npx eslint --fix --max-warnings=0",
      "cd app && npx prettier --write"
    ],
    "app/**/*.{js,json,md}": [
      "cd app && npx prettier --write"
    ],
    "booking/**/*.js": [
      "cd booking && npx eslint --fix"
    ],
    "tours/**/*.js": [
      "cd tours && npx eslint --fix"
    ],
    "*.{md,yml,yaml,json}": [
      "npx prettier --write"
    ]
  },
  "scripts": {
    "prepare": "husky"
  }
}
```

`"prepare": "husky"` sorgt dafür, dass Husky nach `npm install` automatisch aktiviert wird — kein manueller Schritt für Neuentwickler.

### 1.4 `.husky/commit-msg` (Conventional Commits)

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx --no -- commitlint --edit "$1"
```

Zusammen mit `@commitlint/config-conventional`:

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
```

`commitlint.config.js`:

```js
module.exports = { extends: ["@commitlint/config-conventional"] };
```

**Effekt:** Commit `fix: race condition in tour renewal invoice (BUG-26)` wird akzeptiert; `"fixed stuff"` wird abgelehnt.

---

## 2. Conventional Commits + Changelog

Einheitliches Commit-Format ist die Grundlage für automatisch generierte Changelogs und semantische Versionssprünge. Das Repo nutzt heute **freie Nachrichtenformate** (siehe `git log` der letzten 20 Commits: Mix aus Imperativ, Vergangenheitsform, mit/ohne Scope).

**Verbindliches Format** (nach conventionalcommits.org):

```
<type>(<scope>): <short imperative summary>

[optional body]

[optional footer: BREAKING CHANGE:, Refs: BUG-XX, Closes #123]
```

**Erlaubte types** (aus `@commitlint/config-conventional`): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

**Scopes** (Empfehlung für dieses Repo): `app`, `booking`, `tours`, `platform`, `core`, `auth`, `website`, `infra`, `ci`, `db` (für Migrationen).

**Beispiele:**

```
feat(booking): add server-side order-number generator with UNIQUE constraint

Refs: BUG-13
```

```
fix(tours): remove Payrexx webhook-secret fallback, require env var

BREAKING CHANGE: PAYREXX_WEBHOOK_SECRET is now required. Deployments without
it will fail on boot instead of silently accepting unsigned payloads.

Refs: BUG-07
```

### 2.1 Changelog-Automation (optional, später)

Mit `release-please` (Google, CI-native) kann aus Conventional Commits automatisch `CHANGELOG.md` gepflegt werden. Integration in `.github/workflows/release.yml`, triggert Release-PRs. Aufwand **S**, Nutzen erst ab höherem Release-Takt interessant — für jetzt „Later".

---

## 3. Pull-Request-Template

**Problem heute:** Repo hat **keine** PR-Vorlage (`.github/pull_request_template.md` fehlt). PRs enthalten Inhalte zwischen „fixing xyz" und ausführlichen Beschreibungen — kein Muster.

**Lösung:** Standardisiertes Template unter `.github/pull_request_template.md`:

```markdown
## Zusammenfassung

<!-- Was ändert dieser PR? 1–3 Sätze. Warum? Link zum Issue/BUG-ID. -->

Refs: BUG-XX / Closes #YY

## Art der Änderung

- [ ] Bug-Fix (nicht-breaking)
- [ ] Feature (nicht-breaking)
- [ ] Breaking Change (API, DB-Schema, Umgebungsvariablen)
- [ ] Docs / Infra / Build only
- [ ] DB-Migration enthalten (Prefix: `core/migrations/` bzw. `booking/migrations/`)

## Checkliste

- [ ] `npm run lint` und `npm run test` sind lokal grün
- [ ] Neue Umgebungsvariablen sind in `.env.example` dokumentiert
- [ ] Schema-Änderungen: Migration + Rollback getestet in Staging
- [ ] Security-relevante Änderungen (Auth, Webhook, Input): Review durch 2. Person erforderlich
- [ ] Feature-Flag gesetzt, wenn Rollout schrittweise erfolgen soll
- [ ] Logs/Metriken dokumentieren das neue Verhalten (kein `console.log` im Produktionspfad)

## Test-Plan

<!-- Wie wurde manuell verifiziert? Welche E2E-/Unit-Tests sind neu? -->

## Screenshots / Beispiel-Requests

<!-- Bei UI-Änderungen oder API-Diffs: Vorher/Nachher. -->

## Rollback-Plan

<!-- Wie macht man diese Änderung rückgängig, wenn sie in Prod schiefgeht? -->
```

---

## 4. CODEOWNERS

**Problem heute:** Reviews werden ad-hoc zugewiesen. Bei Änderungen an sensiblen Bereichen (Payrexx-Webhook, Auth, DB-Migrationen) kann es passieren, dass niemand mit Domain-Wissen sieht.

**Lösung:** `.github/CODEOWNERS` — GitHub weist automatisch Reviewer zu.

```text
# Default: Maintainer
*                                  @Janez76

# Sicherheits-/Auth-relevant: immer ein zweites Augenpaar
/auth/                             @Janez76 @<security-reviewer>
/booking/routes/auth.js            @Janez76 @<security-reviewer>
/tours/routes/payrexx-webhook.js   @Janez76 @<security-reviewer>
/tours/middleware/auth.js          @Janez76 @<security-reviewer>
/platform/server.js                @Janez76 @<security-reviewer>

# Datenbank-Migrationen: Review durch DBA-Verantwortlichen
/core/migrations/                  @Janez76 @<db-owner>
/booking/migrations/               @Janez76 @<db-owner>

# Frontend
/app/                              @Janez76 @<frontend-owner>
/website/                          @Janez76 @<frontend-owner>

# Infra/Deploy
/.github/workflows/                @Janez76 @<devops-owner>
/docker-compose*.yml               @Janez76 @<devops-owner>
/scripts/                          @Janez76 @<devops-owner>
```

Die `<placeholder>`-Zeilen sind durch echte GitHub-Handles zu ersetzen, sobald ein Team existiert. Solange das Projekt Ein-Personen-Betrieb ist, reicht `* @Janez76`, aber das explizite Markieren der sensiblen Bereiche hilft, wenn später jemand hinzukommt.

---

## 5. Branch-Protection (GitHub)

**Problem heute:** Der Main-Branch ist wahrscheinlich ungeschützt (direkt-push möglich). Der CI-Workflow `deploy-vps-and-booking-smoke.yml` läuft auf `push` gegen main — ein fehlerhafter Commit deployt direkt auf die VPS.

**Lösung:** Branch-Protection-Regeln in GitHub-Settings für `main`:

| Regel | Wert |
|---|---|
| Require a pull request before merging | ✅ |
| Required approvals | **1** (Solo-Betrieb) oder **2** (ab Team) |
| Dismiss stale approvals when new commits are pushed | ✅ |
| Require review from Code Owners | ✅ |
| Require status checks to pass | ✅ |
| Required status checks | `architecture-guard`, `documentation-guard`, `build-nextjs`, `lint`, `test`, `audit` |
| Require branches to be up to date before merging | ✅ |
| Require conversation resolution before merging | ✅ |
| Require signed commits | optional, empfohlen |
| Require linear history | ✅ (keine Merge-Commits, nur Squash/Rebase) |
| Include administrators | ✅ (auch der Maintainer darf nicht direkt pushen) |
| Allow force pushes | ❌ |
| Allow deletions | ❌ |

**Konfiguration via `gh` CLI** (reproducible, kein Klicken im UI):

```bash
gh api -X PUT "repos/Janez76/propus-platform/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["architecture-guard", "documentation-guard", "build-nextjs", "lint", "test", "audit"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
```

---

## 6. CI-Erweiterungen

Aktuelle CI-Workflows (`.github/workflows/*.yml`): `architecture-guard`, `documentation-guard`, `build-nextjs` (nur `workflow_dispatch`), `deploy-vps-and-booking-smoke`. Es **fehlen** Lint-, Test-, Audit-, Typecheck-Jobs als Required-Checks.

### 6.1 Neuer Workflow: `.github/workflows/ci.yml`

```yaml
name: ci

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: "22", cache: "npm" }
      - name: Install (app)
        run: cd app && npm ci
      - name: Lint (app)
        run: cd app && npx eslint . --ext .ts,.tsx --max-warnings=0
      - name: Typecheck (app)
        run: cd app && npx tsc --noEmit

  test:
    runs-on: ubuntu-24.04
    strategy:
      matrix:
        module: [booking, tours]
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: "22", cache: "npm" }
      - run: cd ${{ matrix.module }} && npm ci
      - run: cd ${{ matrix.module }} && npm test

  audit:
    runs-on: ubuntu-24.04
    strategy:
      matrix:
        module: [app, booking, tours, platform]
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: "22" }
      - name: npm audit (production)
        run: cd ${{ matrix.module }} && npm audit --omit=dev --audit-level=high

  circular-deps:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: "22" }
      - run: cd app && npm ci && npx madge --circular --extensions ts,tsx,js,jsx src
      - run: cd tours && npm ci && npx madge --circular .

  secrets-scan:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Wichtige Eigenschaften:**
- `cancel-in-progress: true` spart Runner-Minuten bei Force-Pushes.
- `--max-warnings=0` erzwingt, dass Warnings als Fehler zählen — zwingt zur Aufräumung.
- `--audit-level=high` lässt low/moderate durch, blockt aber HIGH/CRITICAL (wie die aktuell 4 Findings).
- `gitleaks` fängt versehentlich committete Secrets — wichtig, da `admin-account.json` bereits im Repo liegt (BUG-21).
- Matrix-Build für `audit` und `test` parallelisiert die 4 Module.

### 6.2 Secret-Scanning & Dependabot

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/app"
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    groups:
      next-ecosystem:
        patterns: ["next", "@next/*", "eslint-config-next"]
      radix:
        patterns: ["@radix-ui/*"]
  - package-ecosystem: npm
    directory: "/booking"
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: "/tours"
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: "/platform"
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: "/website"
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
  - package-ecosystem: docker
    directory: "/"
    schedule: { interval: weekly }
```

**Effekt:** Wöchentliche Update-PRs für alle fünf Node-Module, GitHub-Actions und Docker-Base-Images. Bündelung (`groups`) verhindert 15 separate Next-PRs.

---

## 7. One-Command-Bootstrap

**Problem heute:** Es gibt keinen einzelnen Befehl, der das gesamte System lokal startet. Ein neuer Entwickler muss manuell: `cd app && npm ci`, `cd booking && npm ci`, `cd tours && npm ci`, `cd platform && npm ci`, `cd website && npm ci`, Postgres einrichten, `.env.example` → `.env` kopieren und Migrationen laufen lassen.

**Lösung:** Makefile + ein Docker-Compose-Profil für lokale Entwicklung.

### 7.1 `Makefile` (Root)

```make
.PHONY: help setup install migrate seed dev test lint clean

help:
	@echo "Verfügbare Targets:"
	@echo "  make setup    - Einmal ausführen: Dependencies + DB + Migrationen + Demodaten"
	@echo "  make dev      - Lokaler Stack (docker compose + Hot-Reload)"
	@echo "  make test     - Alle Tests in allen Modulen"
	@echo "  make lint     - Lint + Typecheck überall"
	@echo "  make migrate  - Alle ausstehenden Migrationen anwenden"
	@echo "  make clean    - node_modules & Docker-Volumes löschen"

setup: install migrate seed
	@echo ""
	@echo "✓ Setup fertig. Starte mit: make dev"
	@echo "  - Admin-Panel:  http://localhost:3000"
	@echo "  - Booking-API:  http://localhost:3100"
	@echo "  - Tour-Manager: http://localhost:3100/tour-manager/admin"

install:
	@echo "→ Installiere Dependencies in allen Modulen…"
	cd app && npm ci
	cd booking && npm ci
	cd tours && npm ci
	cd platform && npm ci
	cd website && npm ci
	@echo "✓ Dependencies installiert."

migrate:
	@echo "→ Wende Migrationen an…"
	cd core && node migrate.js
	cd booking && node migrate.js
	@echo "✓ Migrationen angewendet."

seed:
	@if [ -f scripts/seed-dev.js ]; then \
		echo "→ Lade Demodaten…" && node scripts/seed-dev.js; \
	else \
		echo "⚠ scripts/seed-dev.js existiert nicht — überspringe."; \
	fi

dev:
	docker compose -f docker-compose.dev.yml up

test:
	cd booking && npm test
	cd tours && npm test
	cd app && npx vitest run

lint:
	cd app && npx eslint . --ext .ts,.tsx --max-warnings=0
	cd app && npx tsc --noEmit

clean:
	rm -rf app/node_modules booking/node_modules tours/node_modules platform/node_modules website/node_modules
	docker compose -f docker-compose.dev.yml down -v
```

### 7.2 `.env.example` (Root, neu)

Heute wird `.env.example` nur unsystematisch geführt. Das Repo soll **eine einzige** `.env.example` im Root haben, die alle Variablen dokumentiert, nach Modul gruppiert, mit Default-Werten für lokale Entwicklung:

```bash
# --- Core ---
NODE_ENV=development
PORT=3100
LOG_LEVEL=debug

# --- Database (Postgres) ---
# Lokal via docker-compose.dev.yml gestartet
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=propus_dev
PGUSER=propus
PGPASSWORD=change-me-locally
DATABASE_URL=postgres://propus:change-me-locally@127.0.0.1:5432/propus_dev

# --- Sessions ---
# GENERIEREN mit: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=<64-hex-characters-required>
TOURS_SESSION_SECRET=<64-hex-characters-required>

# --- Auth (Logto) ---
# Für lokale Entwicklung: https://auth.propus.ch/dev oder Logto-Dev-Instanz
LOGTO_ENDPOINT=https://auth.propus.ch
LOGTO_APP_ID=
LOGTO_APP_SECRET=
LOGTO_COOKIE_SECRET=<32-hex-characters>

# --- Mail (Nodemailer) ---
# Lokal: Mailhog oder ethereal.email
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM=noreply@propus.test

# --- Payrexx (Test-Instanz!) ---
PAYREXX_INSTANCE=propus-test
PAYREXX_API_SECRET=
PAYREXX_WEBHOOK_SECRET=<required — KEINE Fallbacks in Code>

# --- MS Graph (Kalendersync) ---
MSGRAPH_TENANT_ID=
MSGRAPH_CLIENT_ID=
MSGRAPH_CLIENT_SECRET=

# --- Frontend-URLs ---
FRONTEND_URL=http://localhost:3100
ADMIN_PANEL_URL=http://localhost:3000
TOURS_MOUNT_PATH=/tour-manager

# --- Supabase (website/) ---
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

**Einbau-Guard:** `platform/server.js` sollte beim Boot fehlende Required-Variablen **hart ablehnen** statt leise Defaults zu setzen (siehe BUG-08):

```js
const REQUIRED = ["SESSION_SECRET", "TOURS_SESSION_SECRET", "DATABASE_URL", "PAYREXX_WEBHOOK_SECRET"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[platform] FATAL: missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}
```

---

## 8. Onboarding-Dokument

`docs/ONBOARDING.md` — ein Dokument, das einen neuen Entwickler in **< 30 Minuten** von „frisch gecloned" zu „läuft lokal" führt. Vorschlag:

```markdown
# Propus Platform — Onboarding (< 30 min)

## Voraussetzungen

- Node.js 22 LTS (nvm empfohlen)
- Docker + Docker Compose v2
- Postgres-Client `psql` (optional, zum Debuggen)
- Git und GitHub-Zugang (SSH-Key hinterlegt)

## Schritte

1. **Repo klonen**
   ```
   git clone git@github.com:Janez76/propus-platform.git
   cd propus-platform
   ```

2. **Env kopieren**
   ```
   cp .env.example .env
   # .env öffnen und alle <placeholder> durch echte Werte ersetzen.
   # Secrets generierst du mit: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. **Datenbank starten**
   ```
   docker compose -f docker-compose.dev.yml up -d db mailhog
   ```

4. **Bootstrap**
   ```
   make setup
   ```
   Das installiert alle Module (ca. 2 Minuten) und wendet die Core- und Booking-Migrationen an.

5. **Starten**
   ```
   make dev
   ```
   Drei Services laufen:
   - http://localhost:3000 — Admin-Panel (Next.js, Hot-Reload)
   - http://localhost:3100/ — Booking-Öffentlich (SPA in Next oder Express)
   - http://localhost:3100/tour-manager/admin — Tour-Manager-Backend
   - http://localhost:8025 — Mailhog (abgefangene E-Mails)

## Häufige Probleme

| Symptom | Ursache | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | DB nicht gestartet | `docker compose up -d db` |
| `FATAL: missing env vars: SESSION_SECRET` | `.env` leer | Werte aus `.env.example` generieren |
| Next-Build hängt | Port 3000 belegt | `lsof -ti:3000 | xargs kill` |
| Migration-Fehler „relation already exists" | Schema-Drift aus altem Stand | `docker compose down -v && make setup` (wipe-reset) |

## Nächste Schritte

- [ ] Issue zuweisen lassen, in das `.github/pull_request_template.md` reinschauen
- [ ] Einen kleinen „Hello"-PR bauen, damit CI/Review-Flow einmal durchlaufen wurde
- [ ] Bei Auth-Änderungen: `/docs/AUTH.md` lesen (TODO: noch anzulegen)
- [ ] Bei DB-Migrationen: `/docs/MIGRATIONS.md` lesen (TODO: noch anzulegen)
```

---

## 9. Editor-Config & Prettier

`.editorconfig` (liegt im Repo heute nicht vor):

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

`.prettierrc.json` (Root):

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

`.prettierignore`:

```
node_modules
.next
dist
build
coverage
*.min.js
*.min.css
**/migrations/*.sql
audit/raw
```

---

## 10. Observability-Hooks in der Dev-Loop

Für die DX wichtig: **Fehler im lokalen Stack sollen sofort sichtbar sein**, ohne dass man Logs aus einem Container ausgräbt.

- `pino-pretty` als Dev-Dependency in allen Node-Modulen, damit Logs beim `make dev` lesbar farbig sind statt rohem JSON.
- `docker-compose.dev.yml` leitet `stdout` aller Services an das Terminal.
- Optional: `lazydocker` oder `ctop` in der Onboarding-Doc empfehlen — Hilfen für mehrere Container.

```json
// booking/package.json (Auszug)
"scripts": {
  "start": "node server.js",
  "dev": "node server.js | pino-pretty -c -t SYS:HH:MM:ss.l"
}
```

---

## 11. Zusammenfassung — DX-Checkliste

| Artefakt | Status heute | Ziel | Aufwand |
|---|---|---|---|
| Husky pre-commit | ❌ | ✅ `.husky/pre-commit` + lint-staged | **S** |
| Commit-Message-Convention | ❌ | ✅ commitlint + Conventional Commits | **S** |
| PR-Template | ❌ | ✅ `.github/pull_request_template.md` | **S** |
| CODEOWNERS | ❌ | ✅ `.github/CODEOWNERS` | **S** |
| Branch-Protection main | ⚠ unbekannt | ✅ required checks + 1 approval + linear history | **S** |
| CI: Lint/Test/Audit als Required | ❌ (nur Guards) | ✅ `ci.yml` mit 5 Jobs | **M** |
| Dependabot | ❌ | ✅ `.github/dependabot.yml` | **S** |
| Secrets-Scanning | ❌ | ✅ gitleaks-Action + `.gitleaks.toml` | **S** |
| One-Command-Bootstrap | ❌ | ✅ `make setup && make dev` | **M** |
| `.env.example` (komplett) | ⚠ teilweise | ✅ alle Vars dokumentiert | **S** |
| Onboarding-Doc | ❌ | ✅ `docs/ONBOARDING.md` | **S** |
| EditorConfig/Prettier | ⚠ unbekannt | ✅ konsistente Formatierung | **S** |
| Dev-Logs lesbar | ⚠ rohes JSON | ✅ `pino-pretty` | **S** |

**Gesamtaufwand Phase-5-Maßnahmen: ~2 Tage Fokus-Arbeit.** Jede Einzelmaßnahme ist klein, aber die Summe verändert den Entwickler-Alltag spürbar: weniger Fehler im Main, schnelleres Onboarding, weniger Boilerplate beim PR-Öffnen.

Der Übergang zu pnpm-Workspaces (siehe `30-ARCHITECTURE.md` §1) würde die Install- und Lint-Targets zusätzlich um ~60 % beschleunigen — ist aber als eigenständige Architektur-Entscheidung in Phase 6 „Next" einsortiert.
