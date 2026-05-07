#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Architecture Guard: Kein neues EJS im Portal/Admin
#
# Dieses Skript wird im CI (GitHub Actions) und als Pre-Commit-Hook ausgeführt.
# Es blockiert, wenn:
#   1. Neue .ejs-Dateien außerhalb von tours/views/customer/ existieren
#   2. res.render() mit portal/ oder admin/ Pfaden in Route-Dateien vorkommt
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ERRORS=0

echo "==> Architecture Guard: Prüfe EJS-Richtlinien..."

# ── Check 1: Keine neuen EJS-Dateien außerhalb customer/ ──────────────────────
FORBIDDEN_EJS=$(find tours/views -name '*.ejs' \
  ! -path 'tours/views/customer/*' \
  2>/dev/null || true)

if [ -n "$FORBIDDEN_EJS" ]; then
  echo ""
  echo "❌ FEHLER: EJS-Dateien außerhalb von tours/views/customer/ gefunden!"
  echo "   Seit April 2026 werden alle UI-Seiten über React (Next.js) gerendert."
  echo "   Neue Seiten müssen als React-Komponenten in app/src/ erstellt werden."
  echo ""
  echo "   Betroffene Dateien:"
  echo "$FORBIDDEN_EJS" | sed 's/^/     /'
  echo ""
  ERRORS=$((ERRORS + 1))
fi

# ── Check 2: Kein res.render() für portal/ oder admin/ in Route-Dateien ──────
RENDER_VIOLATIONS=$(grep -rn "res\.render(['\"]portal/" tours/routes/ 2>/dev/null || true)
RENDER_VIOLATIONS+=$(grep -rn "res\.render(['\"]admin/" tours/routes/ 2>/dev/null || true)

if [ -n "$RENDER_VIOLATIONS" ]; then
  echo ""
  echo "❌ FEHLER: res.render() mit 'portal/' oder 'admin/' in Express-Routen gefunden!"
  echo "   Express-Routen dürfen kein EJS rendern. Stattdessen:"
  echo "   - Für Seiten: res.redirect('/portal/...') oder res.redirect('/login')"
  echo "   - Für APIs: res.json({ ok: true, ... })"
  echo ""
  echo "   Betroffene Stellen:"
  echo "$RENDER_VIOLATIONS" | sed 's/^/     /'
  echo ""
  ERRORS=$((ERRORS + 1))
fi

# ── Check 3: Keine neuen View-Engine-Registrierungen ─────────────────────────
NEW_ENGINES=$(grep -rn "set('view engine'" tours/ --include='*.js' 2>/dev/null | grep -v 'ejs' || true)

if [ -n "$NEW_ENGINES" ]; then
  echo ""
  echo "❌ FEHLER: Neue View-Engine gefunden (nur EJS für Customer-Seiten erlaubt)!"
  echo "   $NEW_ENGINES"
  echo ""
  ERRORS=$((ERRORS + 1))
fi

# ── Ergebnis ──────────────────────────────────────────────────────────────────
if [ "$ERRORS" -gt 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Architecture Guard FEHLGESCHLAGEN ($ERRORS Verstoß/Verstöße)"
  echo "  Bitte alle UI-Seiten als React-Komponenten umsetzen."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

echo "✅ Architecture Guard bestanden — keine EJS-Verstöße gefunden."
exit 0
