#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <current-env-file> <incoming-env-file>" >&2
  exit 2
fi

current_file="$1"
incoming_file="$2"

if [ ! -f "$incoming_file" ]; then
  echo "Incoming env file not found: $incoming_file" >&2
  exit 2
fi

if [ ! -f "$current_file" ]; then
  echo "[guard-vps-env] No current remote env file found. Guard skipped."
  exit 0
fi

python3 - "$current_file" "$incoming_file" <<'PY'
import sys
from pathlib import Path


def parse_env(path_str: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in Path(path_str).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


current = parse_env(sys.argv[1])
incoming = parse_env(sys.argv[2])
protected = (
    "PAYREXX_INSTANCE",
    "PAYREXX_API_SECRET",
    "PAYREXX_WEBHOOK_SECRET",
)

missing = []
for key in protected:
    current_value = current.get(key, "").strip()
    incoming_value = incoming.get(key, "").strip()
    if current_value and not incoming_value:
        missing.append(key)

if missing:
    keys = ", ".join(missing)
    print(
        "[guard-vps-env] Refusing deploy: incoming VPS_ENV_FILE would clear "
        f"live Payrexx config: {keys}.",
        file=sys.stderr,
    )
    print(
        "[guard-vps-env] Sync the full production .env.vps into the "
        "GitHub secret VPS_ENV_FILE before deploying again.",
        file=sys.stderr,
    )
    print(
        "[guard-vps-env] Recommended command: "
        "powershell -File scripts/push-github-production-secrets.ps1",
        file=sys.stderr,
    )
    sys.exit(1)

print("[guard-vps-env] OK: incoming VPS_ENV_FILE keeps current Payrexx values.")
PY
