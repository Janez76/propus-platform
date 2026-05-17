#!/usr/bin/env bash
# Cloud-/Linux-SessionStart-Init für Ruflo.
# Erzeugt .claude/agents/, wenn der Ordner fehlt (z. B. Claude Code on the web).
# Auf Windows läuft stattdessen der `cmd /c`-Hook aus settings.json — daher hier OS-Check.

set -u

case "$(uname -s 2>/dev/null || echo Unknown)" in
  Linux*|Darwin*) ;;
  *) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
AGENTS_DIR="$PROJECT_DIR/.claude/agents"

if [ -d "$AGENTS_DIR" ] && [ -n "$(ls -A "$AGENTS_DIR" 2>/dev/null)" ]; then
  exit 0
fi

command -v npx >/dev/null 2>&1 || exit 0

mkdir -p "$AGENTS_DIR"

(
  cd "$PROJECT_DIR" || exit 0
  npx -y ruflo@latest init --yes >/dev/null 2>&1 \
    || npx -y ruflo@latest init       >/dev/null 2>&1 \
    || true
)

exit 0
