# Fix 5 — Husky Setup (neue Dateien)

Die Dateien in diesem Ordner werden ins Repo-Root kopiert. Keine Patches, weil sie komplett neu sind.

## Installation

```bash
cd /path/to/propus-platform

# Falls noch keine Root-package.json
test -f package.json || npm init -y

# Dependencies
npm install -D husky lint-staged @commitlint/cli @commitlint/config-conventional prettier

# Dateien kopieren
cp audit/handoff/patches/05-husky-setup/commitlint.config.js .
cp audit/handoff/patches/05-husky-setup/.prettierrc.json .
cp audit/handoff/patches/05-husky-setup/.prettierignore .
cp audit/handoff/patches/05-husky-setup/.editorconfig .

# Husky initialisieren
npx husky init
cp audit/handoff/patches/05-husky-setup/pre-commit .husky/pre-commit
cp audit/handoff/patches/05-husky-setup/commit-msg .husky/commit-msg
chmod +x .husky/pre-commit .husky/commit-msg

# lint-staged + prepare in Root-package.json eintragen
# (manuell — JSON-Merge je nach Editor)
# Die Inhalte stehen in package.json.snippet.json
```

## Verifikation

```bash
# 1. Hook aktiv
ls -la .husky/pre-commit .husky/commit-msg

# 2. Fehlerhafter Commit wird abgelehnt
echo "const unused = 1" > /tmp/test.ts
cp /tmp/test.ts app/src/_lint-test.ts
git add app/src/_lint-test.ts
git commit -m "test: lint gate"  # sollte fehlschlagen

# 3. Cleanup
git restore --staged app/src/_lint-test.ts
rm app/src/_lint-test.ts
```
