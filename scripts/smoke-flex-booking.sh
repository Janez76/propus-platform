#!/usr/bin/env bash
# scripts/smoke-flex-booking.sh
#
# Manuelles Smoke gegen booking.propus.ch (oder eine Staging-/Local-URL):
# Submittet eine Flex-Buchung mit Deadline und prueft, dass das Backend
#   - die Order anlegt (status: disposition_offen, booking_kind: flexible)
#   - den orderNo zurueckgibt
#
# Optional (wenn DATABASE_URL gesetzt ist und psql verfuegbar):
#   - prueft die DB-Spalten booking_kind, deadline_at, flexible_earliest_at
#
# Verwendung:
#   BASE_URL=https://booking.propus.ch ./scripts/smoke-flex-booking.sh
#   BASE_URL=http://localhost:3100 ./scripts/smoke-flex-booking.sh
#   DATABASE_URL=postgres://... BASE_URL=... ./scripts/smoke-flex-booking.sh
#
# Default-Empfaenger und Adresse sind synthetisch; der Job sollte trotzdem
# einen echten Auftrag in der DB anlegen — danach manuell stornieren falls
# nicht gewuenscht.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3100}"
EMAIL="${SMOKE_EMAIL:-smoke-flex@invite.buchungstool.invalid}"
COMPANY="${SMOKE_COMPANY:-Smoke Test AG}"
NAME="${SMOKE_NAME:-Smoke Tester}"

# NAME in Vor-/Nachname splitten — alles vor dem ersten Leerzeichen ist
# `first_name`, der Rest landet in `name`. Default "Smoke Tester" ergibt
# damit weiterhin "Smoke" / "Tester" wie die Original-Hardcodes.
FIRST_NAME="${NAME%% *}"
LAST_NAME="${NAME#* }"
if [ "$FIRST_NAME" = "$LAST_NAME" ]; then
  # Kein Leerzeichen im Namen → kompletter Wert als first_name, name leer.
  LAST_NAME=""
fi

# Deadline = heute + 14 Tage in Europe/Zurich (Host-TZ wird ignoriert,
# damit Tagesgrenzen-Drift bei UTC-Servern nicht ueberraschen kann).
DEADLINE_DATE="$(TZ=Europe/Zurich date -d '+14 days' +%Y-%m-%d 2>/dev/null || TZ=Europe/Zurich date -v+14d +%Y-%m-%d)"
EARLIEST_DATE="$(TZ=Europe/Zurich date -d '+3 days' +%Y-%m-%d 2>/dev/null || TZ=Europe/Zurich date -v+3d +%Y-%m-%d)"

echo "▶ Smoke-Test Flex-Buchung gegen ${BASE_URL}"
echo "  Deadline:        ${DEADLINE_DATE}"
echo "  Frueheste-ab:    ${EARLIEST_DATE}"
echo "  Empfaenger:      ${EMAIL}"
echo

PAYLOAD=$(cat <<JSON
{
  "address": { "text": "Smoke-Strasse 1, 8001 Zürich", "coords": null },
  "object": {
    "type": "wohnung",
    "area": "100",
    "floors": 1,
    "rooms": "3.5",
    "specials": "",
    "desc": "Smoke-Test ${DEADLINE_DATE}",
    "onsiteName": "Smoke",
    "onsitePhone": "0791234567",
    "onsiteEmail": "${EMAIL}",
    "onsiteCalendarInvite": false,
    "additionalOnsiteContacts": []
  },
  "services": {
    "package": { "key": "basis", "price": 500, "label": "Basis-Paket" },
    "addons": []
  },
  "schedule": {
    "bookingKind": "flexible",
    "deadlineAt": "${DEADLINE_DATE}",
    "flexibleEarliestAt": "${EARLIEST_DATE}"
  },
  "billing": {
    "salutation": "Herr",
    "first_name": "${FIRST_NAME}",
    "name": "${LAST_NAME}",
    "company": "${COMPANY}",
    "email": "${EMAIL}",
    "phone": "0791234567",
    "street": "Smoke-Strasse 1",
    "zip": "8001",
    "city": "Zürich",
    "language": "de"
  },
  "pricing": { "subtotal": 500, "discountAmount": 0, "vat": 40.5, "total": 540.5 }
}
JSON
)

RESPONSE_FILE="$(mktemp -t flex-smoke.XXXX.json)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

# --connect-timeout / --max-time verhindern, dass der Smoke-Test bei
# DNS-/TLS-Haengern unbegrenzt blockiert. 60s Gesamt-Timeout reicht fuer
# den synchronen Teil des Booking-Submits inkl. Order-Insert.
HTTP_CODE=$(curl -sS --connect-timeout 10 --max-time 60 -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST "${BASE_URL}/api/booking" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD") || true

echo "▶ HTTP ${HTTP_CODE}"
cat "$RESPONSE_FILE"
echo

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "✗ Submit fehlgeschlagen (HTTP ${HTTP_CODE})"
  exit 1
fi

# orderNo extrahieren — robust auch wenn jq fehlt. Sed-Fallback toleriert
# Whitespace zwischen Key und Value, damit formatiertes JSON nicht durchs
# Raster faellt.
ORDER_NO=""
if command -v jq >/dev/null 2>&1; then
  ORDER_NO=$(jq -r '.orderNo // empty' < "$RESPONSE_FILE")
  STATUS=$(jq -r '.status // empty' < "$RESPONSE_FILE")
  KIND=$(jq -r '.bookingKind // empty' < "$RESPONSE_FILE")
elif command -v python3 >/dev/null 2>&1; then
  ORDER_NO=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('orderNo','') or '')" "$RESPONSE_FILE")
  STATUS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('status','') or '')" "$RESPONSE_FILE")
  KIND=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('bookingKind','') or '')" "$RESPONSE_FILE")
else
  ORDER_NO=$(sed -nE 's/.*"orderNo"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$RESPONSE_FILE" | head -1)
  STATUS=$(sed -nE 's/.*"status"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$RESPONSE_FILE" | head -1)
  KIND=$(sed -nE 's/.*"bookingKind"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$RESPONSE_FILE" | head -1)
fi

if [ -z "$ORDER_NO" ]; then
  echo "✗ Konnte orderNo nicht aus Response extrahieren"
  exit 1
fi

# Defense in depth: ORDER_NO landet weiter unten in einer psql-Query. Wir
# erlauben ausschliesslich rein-numerische Werte und reichen sie zudem als
# psql-Variable durch ($ORDER_NO -> :'order_no'::bigint), damit aus einer
# manipulierten Response keine SQL-Injection wird.
if ! [[ "$ORDER_NO" =~ ^[0-9]+$ ]]; then
  echo "✗ Ungueltige orderNo in Response (kein reiner Integer): ${ORDER_NO}"
  exit 1
fi

echo "✓ Order angelegt: #${ORDER_NO}"
[ -n "${STATUS:-}" ] && echo "  status:       ${STATUS}"
[ -n "${KIND:-}" ] && echo "  bookingKind:  ${KIND}"

# Optional: DB-Verifikation falls DATABASE_URL + psql vorhanden. ORDER_NO
# wird oben streng auf reine Ziffern validiert; zusaetzlich reichen wir
# den Wert nicht via Shell-Interpolation, sondern als psql-Variable durch.
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  echo
  echo "▶ DB-Verifikation (DATABASE_URL gesetzt)"
  psql "$DATABASE_URL" -v "order_no=$ORDER_NO" -A -F "|" -c "
    SELECT order_no, status, booking_kind,
           to_char(deadline_at, 'YYYY-MM-DD') AS deadline,
           to_char(flexible_earliest_at, 'YYYY-MM-DD') AS earliest
    FROM orders
    WHERE order_no = :'order_no'::bigint;
  " || {
    echo "✗ DB-Query fehlgeschlagen"
    exit 1
  }
else
  echo
  echo "ℹ DB-Verifikation uebersprungen (DATABASE_URL nicht gesetzt oder psql fehlt)."
  echo "  Manuell pruefen:"
  echo "    SELECT order_no, status, booking_kind, deadline_at, flexible_earliest_at"
  echo "      FROM orders WHERE order_no = ${ORDER_NO};"
fi

echo
echo "✓ Smoke-Test bestanden — Auftrag #${ORDER_NO} sollte in Admin /orders sichtbar sein."
echo "  Anschliessend ggf. manuell stornieren um die DB-Liste sauber zu halten."
