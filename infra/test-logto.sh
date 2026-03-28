#!/bin/sh
CREDS=$(echo -n 'm-admin:RIUL9hh4WD9KF9C2dFFYHr1bUDKNadBV' | base64 | tr -d '\n')
BODY="grant_type=client_credentials&resource=https%3A%2F%2Fadmin.logto.app%2Fapi"

TOKEN=$(wget -q -O- \
  --post-data="$BODY" \
  --header="Authorization: Basic $CREDS" \
  --header="Content-Type: application/x-www-form-urlencoded" \
  http://localhost:3002/oidc/token 2>/dev/null | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

echo "Token (first 30): ${TOKEN:0:30}"

RESULT=$(wget -q -O- \
  --header="Authorization: Bearer $TOKEN" \
  "http://localhost:3002/api/applications?pageSize=5" 2>/dev/null)

echo "API Response: $RESULT"
