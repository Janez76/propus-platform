#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Documentation Guard: Docs müssen bei Schema/Route-Änderungen mitgepflegt werden
#
# Dieses Skript prüft ob neue SQL-Migrationen, neue Route-Dateien oder neue
# FLOWS_*.md-Dateien existieren ohne dass die docs/ aktualisiert wurden.
#
# Modi:
#   --ci       Strenger Modus: Warnung im CI-Output (kein harter Fehler)
#   --hook     Pre-Commit: Prüft nur staged Dateien (kein Fehler, nur Hinweis)
#   --strict   Blockiert wie --ci aber mit exit 1 (für manuelle QA-Gates)
#
# Verwendung:
#   bash scripts/guard-docs.sh --ci
#   bash scripts/guard-docs.sh --hook
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MODE="${1:---ci}"
WARNINGS=0
HINT_LINES=()

echo "==> Documentation Guard: Prüfe ob docs/ aktuell sind..."

# ── Hilfsfunktion: Warnung registrieren ───────────────────────────────────────
warn() {
  echo "::warning::$*"
  HINT_LINES+=("$*")
  WARNINGS=$((WARNINGS + 1))
}

hint() {
  echo "  ℹ  $*"
}

# ── Basis: Letztes docs-Update ermitteln ─────────────────────────────────────
DOCS_DIR="docs"
DATA_FIELDS="DATA_FIELDS.md"

if [ ! -d "$DOCS_DIR" ]; then
  warn "docs/-Ordner fehlt! Bitte 'docs/' mit Dokumentation anlegen."
  echo "  Erwartet: docs/FLOWS_BOOKING.md, docs/SCHEMA_FULL.md, docs/ROLES_PERMISSIONS.md, etc."
  exit 1
fi

# Neueste Änderungszeit der docs/ ermitteln
DOCS_NEWEST=$(find "$DOCS_DIR" "$DATA_FIELDS" -name '*.md' -newer /dev/null \
  -printf '%T@\t%p\n' 2>/dev/null | sort -rn | head -1 | cut -f2 || echo "")

# Fallback: git log für docs/
DOCS_LAST_COMMIT=$(git log --oneline -1 -- "$DOCS_DIR/" "$DATA_FIELDS" 2>/dev/null | head -1 || echo "")
DOCS_LAST_COMMIT_HASH=$(echo "$DOCS_LAST_COMMIT" | awk '{print $1}' || echo "")

# ── Check 1: Neue SQL-Migrationen ohne docs-Update ───────────────────────────
if [ "$MODE" = "--hook" ]; then
  # Nur gestaged Dateien prüfen
  NEW_MIGRATIONS=$(git diff --cached --name-only --diff-filter=A \
    | grep -E '(migrations?/.*\.sql|schema.*\.sql)' || true)
else
  # Im CI: alle Migrationen seit dem letzten docs-Commit
  if [ -n "$DOCS_LAST_COMMIT_HASH" ]; then
    NEW_MIGRATIONS=$(git diff --name-only "$DOCS_LAST_COMMIT_HASH"..HEAD \
      -- 'booking/migrations/*.sql' 'core/migrations/*.sql' 'tours/migrations/*.sql' \
      2>/dev/null || true)
  else
    NEW_MIGRATIONS=""
  fi
fi

if [ -n "$NEW_MIGRATIONS" ]; then
  warn "Neue SQL-Migrationen gefunden — docs/SCHEMA_FULL.md muss aktualisiert werden!"
  echo ""
  echo "  Neue Migrationen:"
  echo "$NEW_MIGRATIONS" | sed 's/^/    /'
  echo ""
  echo "  Bitte aktualisieren:"
  echo "    → docs/SCHEMA_FULL.md (neue Tabellen/Felder eintragen)"
  echo "    → Passende Flow-Datei in docs/ (z.B. FLOWS_BOOKING.md, FLOWS_TOURS.md)"
  echo ""
fi

# ── Check 2: Neue Route-Dateien ohne docs-Update ─────────────────────────────
if [ "$MODE" = "--hook" ]; then
  NEW_ROUTES=$(git diff --cached --name-only --diff-filter=A \
    | grep -E '(tours/routes/|booking/.*routes.*\.js$)' || true)
else
  if [ -n "$DOCS_LAST_COMMIT_HASH" ]; then
    NEW_ROUTES=$(git diff --name-only "$DOCS_LAST_COMMIT_HASH"..HEAD \
      -- 'tours/routes/*.js' 'booking/*routes*.js' \
      2>/dev/null || true)
  else
    NEW_ROUTES=""
  fi
fi

if [ -n "$NEW_ROUTES" ]; then
  warn "Neue Route-Dateien gefunden — FLOWS_*.md muss aktualisiert werden!"
  echo ""
  echo "  Neue Routen:"
  echo "$NEW_ROUTES" | sed 's/^/    /'
  echo ""
  echo "  Bitte prüfen und aktualisieren:"
  echo "    → docs/FLOWS_BOOKING.md (neue Buchungs-Endpunkte)"
  echo "    → docs/FLOWS_TOURS.md (neue Tour-Manager-Endpunkte)"
  echo ""
fi

# ── Check 3: Neue docs/FLOWS_*.md-Datei braucht INDEX-Update ─────────────────
if [ "$MODE" = "--hook" ]; then
  NEW_FLOWS=$(git diff --cached --name-only --diff-filter=A \
    | grep -E 'docs/FLOWS_.*\.md' || true)
else
  if [ -n "$DOCS_LAST_COMMIT_HASH" ]; then
    NEW_FLOWS=$(git diff --name-only "$DOCS_LAST_COMMIT_HASH"..HEAD \
      -- 'docs/FLOWS_*.md' \
      2>/dev/null || true)
  else
    NEW_FLOWS=""
  fi
fi

if [ -n "$NEW_FLOWS" ]; then
  # Prüfen ob DATA_FIELDS.md und .cursor/rules/data-fields.mdc auch geändert wurden
  if [ "$MODE" = "--hook" ]; then
    UPDATED_INDEX=$(git diff --cached --name-only | grep -E '(DATA_FIELDS\.md|data-fields\.mdc)' || true)
  else
    if [ -n "$DOCS_LAST_COMMIT_HASH" ]; then
      UPDATED_INDEX=$(git diff --name-only "$DOCS_LAST_COMMIT_HASH"..HEAD \
        -- 'DATA_FIELDS.md' '.cursor/rules/data-fields.mdc' \
        2>/dev/null || true)
    else
      UPDATED_INDEX=""
    fi
  fi

  if [ -z "$UPDATED_INDEX" ]; then
    warn "Neue docs/FLOWS_*.md-Datei ohne Index-Update!"
    echo ""
    echo "  Neue FLOWS-Dateien:"
    echo "$NEW_FLOWS" | sed 's/^/    /'
    echo ""
    echo "  Bitte aktualisieren:"
    echo "    → DATA_FIELDS.md (neue Datei in Tabelle eintragen)"
    echo "    → .cursor/rules/data-fields.mdc (Mapping erweitern)"
    echo ""
  fi
fi

# ── Check 4: Pflicht-Dateien vorhanden ───────────────────────────────────────
REQUIRED_DOCS=(
  "docs/FLOWS_BOOKING.md"
  "docs/FLOWS_TOURS.md"
  "docs/FLOWS_UPLOAD.md"
  "docs/FLOWS_EXXAS.md"
  "docs/SCHEMA_FULL.md"
  "docs/ROLES_PERMISSIONS.md"
  "docs/EMAIL_TEMPLATES.md"
  "DATA_FIELDS.md"
)

MISSING_DOCS=()
for f in "${REQUIRED_DOCS[@]}"; do
  if [ ! -f "$f" ]; then
    MISSING_DOCS+=("$f")
  fi
done

if [ "${#MISSING_DOCS[@]}" -gt 0 ]; then
  warn "Pflicht-Dokumentationsdateien fehlen!"
  echo ""
  for f in "${MISSING_DOCS[@]}"; do
    echo "  FEHLT: $f"
  done
  echo ""
fi

# ── Ergebnis ──────────────────────────────────────────────────────────────────
echo ""
if [ "$WARNINGS" -gt 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Documentation Guard: $WARNINGS Hinweis(e) gefunden"
  echo ""
  echo "  Bitte docs/ aktualisieren:"
  echo "    → DATA_FIELDS.md (Hauptindex)"
  echo "    → docs/SCHEMA_FULL.md (bei neuen DB-Feldern)"
  echo "    → docs/FLOWS_*.md (bei neuen Flows/Endpunkten)"
  echo "    → docs/EMAIL_TEMPLATES.md (bei neuen Templates)"
  echo "    → docs/ROLES_PERMISSIONS.md (bei neuen Rollen)"
  echo ""
  echo "  Cursor-Regel: .cursor/rules/data-fields.mdc"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ "$MODE" = "--strict" ]; then
    echo "  STRICT-Modus: Build wird blockiert."
    exit 1
  else
    # Im --ci und --hook Modus: Warnung, kein harter Fehler
    # (Dokumentation soll nicht Deployments blockieren, aber sichtbar sein)
    echo "  HINWEIS: Dieser Check blockiert den Deploy nicht."
    echo "  Im nächsten PR/Commit bitte docs/ nachpflegen."
    exit 0
  fi
fi

echo "✅ Documentation Guard bestanden — docs/ sind aktuell."
exit 0
