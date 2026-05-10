#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Architecture Guard: Theme-Tokens (Light/Dark)
#
# Verbietet hartkodierte Farb-Utility-Klassen ohne dark:-Pendant in app/src.
# Baseline: app/scripts/theme-tokens-baseline.json — bricht nur bei NEUEN
# Verstoessen relativ zur Baseline.
#
# Nutzung:
#   scripts/guard-theme-tokens.sh
#   (intern -> cd app && node scripts/check-theme-tokens.mjs)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/app"

echo "==> Theme-Token Guard: Pruefe app/src auf hartkodierte Light/Dark-Farben..."

if node scripts/check-theme-tokens.mjs; then
  echo "✅ Theme-Token Guard bestanden."
  exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Theme-Token Guard FEHLGESCHLAGEN"
echo "  Verwende Theme-Tokens (bg-bg, bg-surface, text-text, ...) oder paire"
echo "  hartkodierte Farben mit dark:-Variante."
echo "  Nach absichtlichem Refactor: cd app && npm run theme:lint:update"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit 1
