#!/usr/bin/env bash
# import-issues.sh — erstellt GitHub-Issues aus ISSUES.csv
#
# Voraussetzungen:
#   - gh CLI installiert und angemeldet (gh auth login)
#   - Repo-Remote erreichbar (gh repo view liefert owner/name)
#
# Benutzung:
#   cd propus-platform
#   bash audit/handoff/import-issues.sh            # dry-run, listet nur
#   DRY_RUN=0 bash audit/handoff/import-issues.sh  # legt echte Issues an
#
# Idempotent: Titel werden zuerst gegen bestehende Issues geprüft (Label audit-2026-04).
# Bestehende Issues werden übersprungen.

set -euo pipefail

CSV="$(dirname "$0")/ISSUES.csv"
DRY_RUN="${DRY_RUN:-1}"
LABEL_ANCHOR="audit-2026-04"

if [[ ! -f "$CSV" ]]; then
  echo "FATAL: $CSV nicht gefunden" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "FATAL: gh CLI nicht installiert (https://cli.github.com/)" >&2
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [[ -z "$REPO" ]]; then
  echo "FATAL: Kein GitHub-Remote gefunden. Führe dies im propus-platform-Repo aus." >&2
  exit 1
fi

echo "Repo: $REPO"
echo "Quelle: $CSV"
echo "Dry-run: $DRY_RUN  (für echte Anlage: DRY_RUN=0 bash $0)"
echo ""

# Anker-Label einmalig anlegen (falls nicht vorhanden)
gh label create "$LABEL_ANCHOR" \
  --description "Findings aus dem April-2026-Audit" \
  --color "B68E20" 2>/dev/null || true

# Severity-Labels
for sev in "severity:critical:D73A4A" "severity:high:E99695" "severity:medium:FBCA04" "severity:low:C2E0C6"; do
  IFS=':' read -r _ label color <<< "$sev"
  gh label create "severity:$label" --color "$color" 2>/dev/null || true
done

# Bestehende Issues mit Anchor-Label für Idempotenz cachen
EXISTING="$(gh issue list --label "$LABEL_ANCHOR" --state all --limit 200 --json title -q '.[].title' 2>/dev/null || echo "")"

# CSV einlesen (einfacher Parser, geht davon aus: kein Komma in Feldern, stattdessen in Quotes)
python3 - "$CSV" "$DRY_RUN" "$REPO" "$EXISTING" <<'PYEOF'
import csv, subprocess, sys, shlex

csv_path, dry_run, repo, existing = sys.argv[1], sys.argv[2] == '0' and False or True, sys.argv[3], sys.argv[4]
# Invert the dry-run variable name: DRY_RUN=0 means "do it"
do_create = (sys.argv[2] == "0")
existing_titles = set(t.strip() for t in existing.split("\n") if t.strip())

created, skipped = 0, 0

with open(csv_path, newline='', encoding='utf-8') as fh:
    reader = csv.DictReader(fh)
    for row in reader:
        bug_id = row['id'].strip()
        sev = row['severity'].strip()
        bucket = row['bucket'].strip()
        title = f"[{bug_id}] {row['title'].strip()}"
        labels = row['labels'].strip()
        file_ref = row['file'].strip()
        effort = row['effort'].strip()
        body = row['body'].strip()

        full_body = f"""**Severity:** {sev}
**Bucket:** {bucket}
**Aufwand:** {effort}
**Betroffen:** `{file_ref}`

{body}

---
*Automatisch erstellt aus `audit/handoff/ISSUES.csv` (Audit April 2026).*
*Siehe `audit/20-FINDINGS.md` → {bug_id} für vollständigen Kontext.*
"""

        if title in existing_titles:
            print(f"skip (exists): {title}")
            skipped += 1
            continue

        if not do_create:
            print(f"would create: {title}  [labels: {labels}]")
            continue

        cmd = [
            "gh", "issue", "create",
            "--repo", repo,
            "--title", title,
            "--body", full_body,
            "--label", labels,
        ]
        try:
            out = subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode().strip()
            print(f"created: {title}  ->  {out}")
            created += 1
        except subprocess.CalledProcessError as e:
            print(f"ERROR on {title}: {e.output.decode()}", file=sys.stderr)

print(f"\nFertig. created={created}, skipped={skipped}")
PYEOF
