# Handoff-Paket — Propus-Platform Audit (April 2026)

**Für:** Claude Code / Entwickler, der die Audit-Findings umsetzt
**Input:** `../20-FINDINGS.md` (60 Findings), `../99-ACTION-PLAN.md` (Prioritäten)
**Output dieses Dokuments:** 5 sofort umsetzbare Fixes (Top-5), 1 Bulk-Import für Issues, ein Runbook pro Schritt.

---

## So benutzt du dieses Paket

### Variante A: Mit Claude Code

Im Repo-Root:

```bash
cd /path/to/propus-platform
git checkout -b audit-2026-04/top-5-immediate
claude
```

Im Chat:

> Lies `audit/handoff/HANDOFF.md` komplett. Arbeite die Top-5 in der dort vorgegebenen Reihenfolge ab. Starte mit Fix 0 (Passwort-Rotation in Prod) — warte aber auf meine explizite Freigabe, bevor du Änderungen in der Git-History vornimmst oder `--force` pushst.

Claude Code hat dann den vollständigen Kontext (Findings, exakte Dateien, Verifikation) in einem Dokument.

### Variante B: Manuell

Jeder Abschnitt „Fix N" unten enthält: Datei, exakter Diff, Verifikationsbefehl. In Reihenfolge abarbeiten.

### Variante C: Issues zuerst

```bash
# 60 GitHub-Issues aus ISSUES.csv anlegen:
bash audit/handoff/import-issues.sh
```

Anschliessend wie Variante A/B vorgehen, aber pro Fix die Issue-Nummer im Commit referenzieren.

---

## Reihenfolge & Abhängigkeiten

```
Fix 0 (Prod-Rotation)  ────┐
                           │
Fix 1 (Cron)           ────┼──► keine Abhängigkeiten, parallel machbar
Fix 3 (Payrexx)        ────┤
Fix 4 (Deps-Update)    ────┤
Fix 5 (Husky)          ────┘

Fix 2 (History-Rewrite) ─► läuft nach Fix 0, BLOCKIERT Dependabot/gitleaks-Aktivierung bis danach
```

**Wichtig:** Fix 0 ist **nicht im Code**, sondern eine operative Massnahme in Produktion. Der Grund steht in `99-ACTION-PLAN.md` §7. Bitte nicht überspringen.

---

## Fix 0 — Admin-Passwort in Produktion rotieren (10 min, NICHT im Code)

**Warum zuerst:** `booking/admin-account.json` steht seit mehreren Commits im Repo und enthält einen scrypt-Hash eines echten Admin-Kontos. Jeder Klon/Fork hat den Hash. Offline-Bruteforce gegen scrypt ist langsam, aber möglich — besonders wenn das Passwort aus einem Wörterbuch kommt. Bevor wir die History umschreiben (Fix 2), muss das Passwort in Produktion geändert sein, sonst ist der Hash bis zur Rotation nutzbar, auch wenn wir ihn aus der History entfernen.

**Schritte:**

1. Mit einem Admin-Account in `https://admin-booking.propus.ch` einloggen.
2. Passwort über die UI zurücksetzen (oder per `node booking/reset-admin-password.js` auf dem VPS, mit neuer, aus `openssl rand -base64 24` generierter Passphrase).
3. Neues Passwort im Passwort-Manager (1Password / Bitwarden) speichern, nirgendwo ins Repo.
4. Log-Eintrag in einem Incident-Journal / Notion: Datum, Wer, Warum („Audit April 2026 — Hash-History-Exposure, BUG-21").

**Verifikation:** Alter Hash (aus `booking/admin-account.json`) gegen neues Passwort scheitert beim Login-Versuch (in Staging oder mit Test-Browser).

---

## Fix 1 — Cron-Endpoint absichern (BUG-02)

**Datei:** `tours/routes/cron-api.js`
**Problem:** Zeile 25 vergleicht Secrets per `!==` (nicht timing-safe) und erlaubt Secrets über `req.query.secret`-Fallback via `getAdminSessionToken` (im platform/server.js-Bridge).
**Aufwand:** S (~ 30 min inkl. Tests)

### Diff

```diff
--- a/tours/routes/cron-api.js
+++ b/tours/routes/cron-api.js
@@ -11,6 +11,7 @@
 'use strict';

 const express = require('express');
+const crypto = require('crypto');
 const router = express.Router();
 const phase3 = require('../lib/admin-phase3');

@@ -19,12 +20,23 @@ function requireCron(req, res, next) {
   const secret = String(process.env.CRON_SECRET || '').trim();
   if (!secret) {
-    console.warn('[cron-api] CRON_SECRET nicht gesetzt — Zugriff verweigert');
-    return res.status(403).json({ ok: false, error: 'CRON_SECRET nicht konfiguriert' });
+    // Boot-Guard sollte das vorher abfangen. Hier hard-fail für Defense-in-Depth.
+    console.error('[cron-api] CRON_SECRET nicht gesetzt — sollte beim Boot abgelehnt werden');
+    return res.status(500).json({ ok: false, error: 'Server-Misconfiguration' });
   }
-  const provided = String(req.headers['x-cron-secret'] || '').trim();
-  if (!provided || provided !== secret) {
+
+  // NUR Header akzeptieren, kein Query-Fallback (verhindert Leaks in Access-Logs/Referer).
+  const provided = String(req.headers['x-cron-secret'] || '').trim();
+  if (!provided) {
+    return res.status(403).json({ ok: false, error: 'Ungültiges Cron-Secret' });
+  }
+
+  const expected = Buffer.from(secret, 'utf8');
+  const got = Buffer.from(provided, 'utf8');
+  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
     return res.status(403).json({ ok: false, error: 'Ungültiges Cron-Secret' });
   }
+
   return next();
 }
```

### Ergänzung in `platform/server.js` (Boot-Guard)

Nach Zeile 19 (`dotenv.config({ override: true });`) einfügen:

```js
const REQUIRED_ENV = [
  "SESSION_SECRET",
  "TOURS_SESSION_SECRET",
  "DATABASE_URL",
  "CRON_SECRET",
  "PAYREXX_WEBHOOK_SECRET",
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k] || !String(process.env[k]).trim());
if (missing.length) {
  console.error(`[platform] FATAL: missing/empty env vars: ${missing.join(", ")}`);
  process.exit(1);
}
```

### Verifikation

```bash
# 1. Secret prüfen
curl -i -X POST https://admin-booking.propus.ch/api/tours/cron/sync-matterport-state
# Erwartet: HTTP/1.1 403 Forbidden

# 2. Mit Secret
curl -i -X POST \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  https://admin-booking.propus.ch/api/tours/cron/sync-matterport-state
# Erwartet: HTTP/1.1 200 OK

# 3. Timing-Test (lokal)
node -e "
const crypto = require('crypto');
const correct = 'supersecret123456';
const guesses = ['supersecret123455', 'supersecret12345x', 'totallywrong'];
for (const g of guesses) {
  const t = process.hrtime.bigint();
  try { crypto.timingSafeEqual(Buffer.from(correct), Buffer.from(g.padEnd(correct.length, ' '))); } catch(e) {}
  console.log(g, Number(process.hrtime.bigint() - t), 'ns');
}
"
# Alle drei Werte sollten nahezu gleich sein.
```

### Commit-Message

```
fix(tours): use timing-safe comparison for CRON_SECRET, reject query-param fallback

Prevents timing-oracle attacks against cron endpoints and removes the
possibility of secrets leaking into access logs via query string.

Refs: BUG-02
```

---

## Fix 2 — Secrets aus Git-History entfernen (BUG-03, BUG-04, BUG-21)

**Dateien:**
- `booking/admin-account.json` — scrypt-Hash eines Prod-Admins
- `scripts/deploy-mail-inbox.ps1` — Klartext-Passwort `Biel2503!` auf Zeile 35
- (und alle Varianten in History)

**Aufwand:** M (~ 2 h inkl. Abstimmung und Force-Push)

**ACHTUNG:** Destruktiv. Alle offenen PRs müssen vorher gemerged oder rebase't werden. Alle Clone-Benutzer müssen ihren Clone nach Abschluss neu ziehen (`git fetch origin && git reset --hard origin/main`).

### Ablauf

```bash
# 1. Aktuelles Repo sichern (Backup-Branch lokal + Push zu privatem Remote)
cd /path/to/propus-platform
git branch backup/pre-history-rewrite-2026-04-20
git push origin backup/pre-history-rewrite-2026-04-20

# 2. git filter-repo installieren (Alternative zu BFG)
pip install git-filter-repo

# 3. History-Rewrite: beide Dateien komplett entfernen
git filter-repo --force \
  --invert-paths \
  --path booking/admin-account.json \
  --path scripts/deploy-mail-inbox.ps1

# 4. Prüfen, dass die Dateien wirklich weg sind
git log --all --full-history -- booking/admin-account.json   # leere Ausgabe
git log --all --full-history -- scripts/deploy-mail-inbox.ps1 # leere Ausgabe

# 5. Force-Push (NUR mit Freigabe)
git push origin --force --all
git push origin --force --tags
```

### Ersatz-Artefakte anlegen (im selben Schritt)

**Statt `booking/admin-account.json`:**

Die App soll den ersten Admin aus ENV lesen und in die DB seeden, nicht aus einer Datei:

```js
// booking/lib/ensure-admin.js (neu)
'use strict';
const crypto = require('crypto');
const { pool } = require('./db');

async function ensureBootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;                    // Kein Bootstrap nötig

  const { rowCount } = await pool.query(
    `SELECT 1 FROM core.admin_users WHERE email = $1`,
    [email.toLowerCase()],
  );
  if (rowCount > 0) return;                           // Admin existiert schon

  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  await pool.query(
    `INSERT INTO core.admin_users (email, password_hash, password_salt, role, created_at)
     VALUES ($1, $2, $3, 'admin', NOW())`,
    [email.toLowerCase(), hash.toString('hex'), salt.toString('hex')],
  );
  console.log(`[ensure-admin] Bootstrap-Admin ${email} angelegt`);
}

module.exports = { ensureBootstrapAdmin };
```

Aufruf in `booking/server.js` vor dem `app.listen(...)`:

```js
await require('./lib/ensure-admin').ensureBootstrapAdmin();
```

**`BOOTSTRAP_ADMIN_EMAIL` und `BOOTSTRAP_ADMIN_PASSWORD`** in GitHub-Actions-Secrets + VPS `.env` hinterlegen, **nicht** ins Repo.

**Statt `scripts/deploy-mail-inbox.ps1`:**

Das Script wird überhaupt nicht mehr gebraucht (Mail-Inbox kann über normale Admin-API geholt werden). Wenn doch: neues Script, das Passwort aus ENV liest:

```powershell
# scripts/deploy-mail-inbox.ps1 (neu, nach History-Rewrite)
param(
    [string]$AdminUser = $env:PROPUS_ADMIN_USER,
    [string]$AdminPass = $env:PROPUS_ADMIN_PASS
)
if (-not $AdminUser -or -not $AdminPass) {
    Write-Error "Bitte PROPUS_ADMIN_USER und PROPUS_ADMIN_PASS setzen."
    exit 1
}
# ... Rest des Scripts, aber $AdminPass statt "Biel2503!"
```

### Verifikation

```bash
# Sicherstellen, dass kein Secret mehr in History ist
git log --all --full-history --source -- booking/admin-account.json
# Leer

# Gitleaks drüberlaufen
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source=/repo --report-format=json --report-path=/repo/gitleaks-report.json
cat gitleaks-report.json | jq '.[] | {rule, file, commit}'
# Keine Treffer auf "password" / "Biel2503" / scrypt-Hash-Pattern
```

### Commit-Message

Da History-Rewrite mit `filter-repo` neue Commits erzeugt, ist dies **nicht** ein normaler Commit. Erstelle stattdessen ein RELEASE-Notes-Issue:

> **Security: History rewrite on 2026-04-20** — Removed committed scrypt hash (`booking/admin-account.json`) and plaintext password (`scripts/deploy-mail-inbox.ps1`) from all history. All clones must `git fetch origin && git reset --hard origin/main`. Affected credential has been rotated in production (Fix 0). Refs: BUG-03, BUG-04, BUG-21.

---

## Fix 3 — Payrexx-Webhook-Secret hart requiren (BUG-07)

**Datei:** `tours/routes/payrexx-webhook.js`
**Problem:** Zeile 58 fällt von `PAYREXX_WEBHOOK_SECRET` auf `PAYREXX_API_SECRET` zurück. Wenn beide leer sind, rejectet der Handler zwar (Zeile 60 ff.), aber der Fallback bedeutet: bei falschem Deployment könnte der API-Secret-Wert als Webhook-Secret akzeptiert werden — unterschiedliche Trust-Domains.
**Aufwand:** S (~ 15 min)

### Diff

```diff
--- a/tours/routes/payrexx-webhook.js
+++ b/tours/routes/payrexx-webhook.js
@@ -55,11 +55,16 @@ router.post('/payrexx', express.raw({ type: '*/*' }), async (req, res) => {
   // Payrexx sendet X-Webhook-Signature (nicht payrexx-signature)
   const signature = req.headers['x-webhook-signature'] || req.headers['payrexx-signature'] || '';

-  const webhookSecret = process.env.PAYREXX_WEBHOOK_SECRET || process.env.PAYREXX_API_SECRET || '';
-
-  if (!webhookSecret || !signature) {
-    console.warn('[payrexx-webhook] Kein Secret oder keine Signatur');
-    return res.status(401).json({ error: 'Invalid signature' });
+  // KEIN Fallback auf PAYREXX_API_SECRET — das ist eine andere Trust-Domain.
+  // Boot-Guard in platform/server.js lehnt Start ohne PAYREXX_WEBHOOK_SECRET ab.
+  const webhookSecret = String(process.env.PAYREXX_WEBHOOK_SECRET || '').trim();
+  if (!webhookSecret) {
+    console.error('[payrexx-webhook] PAYREXX_WEBHOOK_SECRET fehlt — Misconfiguration');
+    return res.status(500).json({ error: 'Server misconfiguration' });
+  }
+  if (!signature) {
+    return res.status(401).json({ error: 'Missing signature' });
   }

   const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');
```

### Verifikation

```bash
# 1. Ohne Signatur → 401
curl -i -X POST https://admin-booking.propus.ch/api/payrexx \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "transaction[id]=99999&transaction[status]=confirmed"
# Erwartet: HTTP/1.1 401 Missing signature

# 2. Mit falscher Signatur → 401 Invalid signature
curl -i -X POST https://admin-booking.propus.ch/api/payrexx \
  -H "X-Webhook-Signature: 0000000000000000000000000000000000000000000000000000000000000000" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "transaction[id]=99999"

# 3. Mit korrekter Signatur (Test-Payload)
PAYLOAD="transaction[id]=test"
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "${PAYREXX_WEBHOOK_SECRET}" | awk '{print $2}')
curl -i -X POST https://admin-booking.propus.ch/api/payrexx \
  -H "X-Webhook-Signature: $SIG" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "$PAYLOAD"
# Erwartet: 200 oder 400 (Body invalid) — aber NICHT 401
```

### Commit-Message

```
fix(tours): require PAYREXX_WEBHOOK_SECRET, drop PAYREXX_API_SECRET fallback

The two secrets belong to different trust domains. Falling back to the
API secret would accept webhooks signed with credentials that should
only be used for outbound API calls.

Refs: BUG-07
```

---

## Fix 4 — Security-Updates einspielen (4× HIGH)

**Module:** `app/`, `booking/`, `tours/`, `platform/`
**Aufwand:** S (Install, ~ 10 min) + M (Regressionslauf, ~ 2 h)

### Befehle

```bash
# Next.js
cd app && npm update next && npm audit --omit=dev && cd ..

# nodemailer — in allen drei Modulen auf Patch-Release
cd booking && npm install 'nodemailer@^6.10.2' && npm audit --omit=dev && cd ..
cd tours   && npm install 'nodemailer@^6.10.2' && npm audit --omit=dev && cd ..
cd platform && npm install 'nodemailer@^6.10.2' && npm audit --omit=dev && cd ..

# Tests
cd booking && npm test && cd ..
cd tours   && npm test && cd ..
cd app     && npx tsc --noEmit && cd ..
```

### Manueller Regressionstest (in Staging)

- [ ] Neue Buchung anlegen → Bestätigungsmail kommt an
- [ ] Admin-Login → Session-Cookie wird gesetzt (Next.js-Route)
- [ ] Tour-Renewal-Invoice generieren → Mail an Kunde
- [ ] Matterport-Sync (Cron) → läuft durch
- [ ] Payrexx-Webhook-Stub → Order wird als bezahlt markiert

### Commit-Message

```
chore(deps): update next + nodemailer to patch HIGH-severity CVEs

- next@16.2.x: DoS via Server Components
- nodemailer@6.10.2: addressparser DoS + email-to-unintended-domain

Refs: Phase 2 npm audit
```

---

## Fix 5 — Husky + lint-staged + commitlint (DX-Basis)

**Dateien:** neu
**Aufwand:** S (~ 30 min)

### Schritte

```bash
# Im Monorepo-Root
npm init -y                      # falls noch keine Root-package.json
npm install -D husky lint-staged @commitlint/cli @commitlint/config-conventional prettier
npx husky init
```

### `.husky/pre-commit`

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx lint-staged
```

### `.husky/commit-msg`

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx --no -- commitlint --edit "$1"
```

### `commitlint.config.js`

```js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

### Root `package.json` (Ergänzungen)

```json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "app/**/*.{ts,tsx}": [
      "bash -c 'cd app && npx eslint --fix --max-warnings=0 \"$@\"' --"
    ],
    "app/**/*.{js,json,md}": [
      "prettier --write"
    ],
    "booking/**/*.js": [
      "bash -c 'cd booking && npx eslint --fix \"$@\"' --"
    ],
    "tours/**/*.js": [
      "bash -c 'cd tours && npx eslint --fix \"$@\"' --"
    ],
    "*.{md,yml,yaml,json}": [
      "prettier --write"
    ]
  }
}
```

### Verifikation

```bash
# 1. Hook ist aktiv
ls -la .husky/pre-commit .husky/commit-msg

# 2. Bewusst fehlerhafter Commit
echo "const x = 1" > app/src/_test-lint.ts        # unused, ESLint wird meckern
git add app/src/_test-lint.ts
git commit -m "test: linter-gate check"
# Erwartet: lint-staged schlägt mit ESLint-Fehler fehl, Commit wird abgelehnt

# 3. Schlechte Commit-Message
echo "// noop" > /tmp/x && git add -A
git commit -m "fixed stuff"
# Erwartet: commitlint lehnt ab (kein gültiger Type)

# 4. Cleanup
rm app/src/_test-lint.ts
git restore --staged .
```

### Commit-Message

```
chore(dx): add husky + lint-staged + commitlint pre-commit gates

Blocks commits with ESLint errors in touched files and enforces
Conventional Commit messages. Adds "prepare" script so new clones
activate hooks automatically after npm install.
```

---

## Nach den Top-5: Bucket „Now" fortsetzen

`99-ACTION-PLAN.md` §2 listet 12 weitere Punkte für 14 Tage. Die zwei mit höchster Wirkung gegen Aufwand:

- **N8: `ci.yml` mit lint/test/audit als Required-Check** — Snippet in `40-DX-WORKFLOW.md` §6.1
- **N7: Branch-Protection main aktivieren** — Snippet in `40-DX-WORKFLOW.md` §5 (inkl. `gh api`-Aufruf)

Zusammen schliessen sie die Lücke zwischen „Lint-Fix vergessen" und „Prod-Deploy".

---

## Commit-Struktur-Empfehlung

Ein PR pro Fix (leichter Review, einfacher Rollback), alle in einem Stacked-Branch:

```
audit-2026-04/top-5-immediate (Basis-Branch, nur Marker)
 ├── audit-2026-04/fix-01-cron-timing-safe      → PR #1
 ├── audit-2026-04/fix-03-payrexx-webhook       → PR #2
 ├── audit-2026-04/fix-04-deps-update           → PR #3
 └── audit-2026-04/fix-05-husky-setup           → PR #4
```

Fix 0 (Passwort-Rotation) und Fix 2 (History-Rewrite) sind **nicht Teil der PR-Pipeline** — Fix 0 ist operativ, Fix 2 ist ein koordinierter Force-Push nach erfolgtem Fix 0.

Für jede PR: `Closes #XX` (Issue-Nummer aus `ISSUES.csv`-Import) in die Beschreibung, damit GitHub den Bug automatisch schliesst.

---

## Nach Abschluss: Bestätigung

Wenn alle Top-5 gemerged sind, führe diese Verifikations-Suite aus:

```bash
# In Repo-Root
cd app      && npm audit --omit=dev --audit-level=high && npx tsc --noEmit && npx eslint . --ext .ts,.tsx --max-warnings=0 && cd ..
cd booking  && npm audit --omit=dev --audit-level=high && npm test && cd ..
cd tours    && npm audit --omit=dev --audit-level=high && npm test && cd ..
cd platform && npm audit --omit=dev --audit-level=high && cd ..

# History-Scan
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source=/repo

# Hooks aktiv
test -x .husky/pre-commit && test -x .husky/commit-msg && echo "hooks-ok"
```

**Erwartetes Ergebnis:** Alle Befehle exit-code 0, „hooks-ok" am Ende.

Ab hier ist der Stack in einem messbar besseren Zustand. Weiter geht es mit Bucket „Now" aus dem Action-Plan.
