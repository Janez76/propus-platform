# Handoff-Paket — Übersicht

Dieses Verzeichnis ist als **in sich geschlossene Übergabe** an Claude Code oder einen Entwickler gedacht. Es enthält alle Artefakte, die nötig sind, um die Top-5-Sofortmassnahmen aus dem Audit (April 2026) umzusetzen, ohne das gesamte 150-Seiten-Audit nochmal zu lesen.

## Inhalt

| Datei | Zweck |
|---|---|
| [`HANDOFF.md`](./HANDOFF.md) | Runbook für Claude Code — vollständige Anleitung für die Top-5 mit Verifikations-Befehlen. |
| [`ISSUES.csv`](./ISSUES.csv) | 60 Findings als Bulk-Import für `gh issue create`. |
| [`import-issues.sh`](./import-issues.sh) | Script, das die CSV in GitHub-Issues verwandelt (idempotent). |
| [`patches/01-cron-timing-safe.patch`](./patches/01-cron-timing-safe.patch) | BUG-02: Cron-Endpoint timing-safe machen. |
| [`patches/01b-platform-boot-guard.patch`](./patches/01b-platform-boot-guard.patch) | BUG-08, BUG-16, BUG-19: Boot-Guard + Error-Handler + secure-Cookie in platform/server.js. |
| [`patches/03-payrexx-webhook-secret.patch`](./patches/03-payrexx-webhook-secret.patch) | BUG-07: Payrexx-Webhook ohne Secret-Fallback. |
| [`patches/05-husky-setup/`](./patches/05-husky-setup/) | Neue Dateien für Husky/lint-staged/commitlint. |

Keine Patches enthalten sind die **operativen Schritte** (Fix 0: Passwort-Rotation, Fix 2: Git-History-Rewrite) und das **Dependency-Update** (Fix 4) — beides sind Einzeiler-Befehle, die in `HANDOFF.md` stehen und kein patchbares Artefakt haben.

## Schnellstart

```bash
cd /path/to/propus-platform
git checkout -b audit-2026-04/top-5-immediate

# Patches applizieren (Fix 1, Fix 3)
git apply audit/handoff/patches/01-cron-timing-safe.patch
git apply audit/handoff/patches/01b-platform-boot-guard.patch
git apply audit/handoff/patches/03-payrexx-webhook-secret.patch

# Smoke-Test
cd tours && npm test && cd ..
cd booking && npm test && cd ..
cd app && npx tsc --noEmit && cd ..

# Husky (Fix 5) — siehe patches/05-husky-setup/README.md

# Dependency-Update (Fix 4)
cd app      && npm update next && cd ..
cd booking  && npm install 'nodemailer@^6.10.2' && cd ..
cd tours    && npm install 'nodemailer@^6.10.2' && cd ..
cd platform && npm install 'nodemailer@^6.10.2' && cd ..

# Verifikation (alle sollten exit 0 haben)
cd app && npm audit --omit=dev --audit-level=high && cd ..
cd booking && npm audit --omit=dev --audit-level=high && cd ..
cd tours && npm audit --omit=dev --audit-level=high && cd ..
cd platform && npm audit --omit=dev --audit-level=high && cd ..

# Issues anlegen (optional, nach gh auth login)
bash audit/handoff/import-issues.sh             # dry-run
DRY_RUN=0 bash audit/handoff/import-issues.sh   # echt
```

## Claude-Code-Prompt (copy-paste)

Für eine autonome Umsetzung durch Claude Code im Repo-Root:

```
Lies audit/handoff/HANDOFF.md komplett. Arbeite die darin beschriebenen Fixes
in dieser Reihenfolge ab: Fix 1, Fix 3, Fix 4, Fix 5.

Fix 0 (Passwort-Rotation in Prod) und Fix 2 (Git-History-Rewrite) NICHT
ausführen — das sind operative Schritte, die der Nutzer manuell macht.

Für jeden Fix:
  1. Patch bzw. Anleitung aus audit/handoff/patches/ bzw. HANDOFF.md anwenden.
  2. Verifikations-Befehle aus HANDOFF.md laufen lassen.
  3. Separaten Commit mit der in HANDOFF.md vorgegebenen Commit-Message.
  4. Separaten Branch audit-2026-04/fix-NN-<slug>.

Am Ende: Zusammenfassung der 4 Commits + Auflistung der Tests, die gelaufen sind.
```

## Was nach den Top-5 folgt

Nach Abschluss siehe `../99-ACTION-PLAN.md` §2 („Now") und §3 („Next"). Die dort gelisteten Punkte haben alle ein BUG-Label, das als Issue in GitHub (via `ISSUES.csv`) trackbar ist.

## Annahmen

- Die Zeilennummern in den Patches stimmen mit dem `main`-Branch-Stand vom **20. April 2026** überein. Wenn zwischenzeitlich Änderungen gepusht wurden, kann `git apply --reject` für einen 3-Wege-Merge nötig sein.
- `gh`, `git`, `npm`, `node >= 22` und `pip` (für `git-filter-repo` in Fix 2) sind lokal verfügbar.
- Der ausführende Branch ist von aktuellem `main` abgezweigt und hat keine offenen Konflikte.
