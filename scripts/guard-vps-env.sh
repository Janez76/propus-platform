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

node - "$current_file" "$incoming_file" <<'NODE'
const fs = require('fs');

function parseEnv(filePath) {
  const values = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex < 1) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }
  return values;
}

const current = parseEnv(process.argv[2]);
const incoming = parseEnv(process.argv[3]);
const protectedKeys = [
  'PAYREXX_INSTANCE',
  'PAYREXX_API_SECRET',
  'PAYREXX_WEBHOOK_SECRET',
];

const missing = protectedKeys.filter((key) => {
  const currentValue = String(current[key] || '').trim();
  const incomingValue = String(incoming[key] || '').trim();
  return currentValue && !incomingValue;
});

if (missing.length > 0) {
  const keys = missing.join(', ');
  console.error(
    `[guard-vps-env] Refusing deploy: incoming VPS_ENV_FILE would clear live Payrexx config: ${keys}.`,
  );
  console.error(
    '[guard-vps-env] Sync the full production .env.vps into the GitHub secret VPS_ENV_FILE before deploying again.',
  );
  console.error(
    '[guard-vps-env] Recommended command: powershell -File scripts/push-github-production-secrets.ps1',
  );
  process.exit(1);
}

console.log('[guard-vps-env] OK: incoming VPS_ENV_FILE keeps current Payrexx values.');
NODE
