# OpenAPI-Spezifikation — Propus Platform

> **Status:** Vollständiges Routen-Inventar — **553 Endpoints** (5 kuratiert
> mit echten Schemas + 548 Auto-Stubs aus `booking/server.js` und
> `tours/routes/*.js`). Auto-Stubs haben `summary: "TODO: ..."` und
> `x-source-file`/`x-source-line`-Marker.

## Regenerieren

```bash
node scripts/extract-routes.js
```

Das Script scannt alle Express-Route-Definitionen, behält kuratierte
Einträge (alles ohne `x-source-file`) und ersetzt vorhandene Auto-Stubs.
Neu hinzugefügte Routen erscheinen beim nächsten Run automatisch als Stub,
gelöschte Routen verschwinden.

## Wo liegt die Spec?

- **Datei:** [`docs/openapi/openapi.yaml`](openapi/openapi.yaml)
- **Format:** OpenAPI 3.1 (YAML)
- **Single Source of Truth:** Diese Datei. Kein generierter Output, keine
  zweite Spec.

## Was ist dokumentiert?

**Vollständig (kuratiert, mit echten Schemas):**

| Endpunkt | Zweck | Tag |
|---|---|---|
| `POST /api/admin/login` | Lokaler Admin-Login (Legacy) | auth |
| `POST /auth/login` | Unified Admin-Login | auth |
| `POST /api/booking` | Öffentliche Buchungsanfrage | booking |
| `GET /api/booking/confirm/{token}` | Bestätigung per Token-Link | booking |
| `GET /api/health` | Health-Check + Feature-Flags | system |

**Als Stub dokumentiert (548 Routen):** Methode, Pfad, Auth-Security aus
Middleware-Name abgeleitet, generische Responses. Request-/Response-Bodies
sind `additionalProperties: true` — manuelle Ergänzung empfohlen für
operationskritische Endpoints.

Tag-Gruppen: `auth`, `booking`, `system`, `tours`, `tours-admin`,
`tours-auth`, `tours-customer`, `tours-portal`, `tours-webhook`.

## Spec lokal ansehen

Drei einfache Optionen, kein Build-Step nötig:

```bash
# 1. Swagger UI als Docker-Container
docker run --rm -p 8080:8080 \
  -e SWAGGER_JSON=/spec/openapi.yaml \
  -v "$PWD/docs/openapi:/spec" \
  swaggerapi/swagger-ui
# → http://localhost:8080

# 2. Redocly CLI (ohne Docker)
npx @redocly/cli preview-docs docs/openapi/openapi.yaml

# 3. VS Code Extension "OpenAPI (Swagger) Editor"
#    → öffnet eingebauten Preview-Pane
```

## Spec validieren

```bash
npx @redocly/cli lint docs/openapi/openapi.yaml
# oder strenger:
npx @apidevtools/swagger-cli validate docs/openapi/openapi.yaml
```

CI-Integration ist noch nicht eingerichtet — siehe TODO unten.

## Konventionen für neue Endpunkte

### 1. Pfad-Gruppen
- `/api/*` — JSON-API (sowohl public als auch admin)
- `/auth/*` — Unified-Auth-Routen (modernisiert)
- `/admin/*` — Reine HTML-Renderings (NICHT in OpenAPI dokumentieren — wir
  sind eine SPA, das ist Legacy)

### 2. Tags (Reihenfolge in `tags:` ist die Anzeige-Reihenfolge)
- `auth` — Login, Sessions, Logout, RBAC
- `booking` — Alles unter `/api/booking*`
- `tours` — Tour-Manager-Routen (eigene API-Surface, separates Modul)
- `admin` — Admin-spezifische Verwaltungsrouten
- `system` — Health, Build-Info, Feature-Flags

Neuen Tag nur hinzufügen, wenn ≥3 Endpunkte ihn nutzen würden.

### 3. Security
Routen ohne `security:` sind public. Geschützte Routen:

```yaml
security:
  - bearerAuth: []
  - sessionCookie: []
```

(`anyOf`-Semantik: eine der beiden Methoden reicht.)

### 4. Rate-Limits dokumentieren
Wenn ein `express-rate-limit`-Middleware vor der Route hängt, im
`description:`-Block angeben:

```
**Rate-Limit:** N Versuche / M min pro IP (`<limiterName>`).
```

Und in `responses:` die `429` mit `$ref: "#/components/responses/TooManyRequests"`
ergänzen.

### 5. Schemas
- Wiederverwendbare Schemas → `components.schemas.*`
- Inline nur, wenn das Schema endpunkt-spezifisch ist UND <10 Felder hat
- Bei komplexen, noch nicht voll dokumentierten Bodies (wie `/api/booking`):
  `additionalProperties: true` setzen + `**TODO:**` im `description:`

### 6. operationId
- camelCase, Verb voran: `createBooking`, `getHealth`, `confirmBooking`
- Eindeutig in der ganzen Spec (Codegen-Hooks brauchen das)

## Wartung

### Wer aktualisiert die Spec?
Wer einen neuen Endpunkt hinzufügt **oder** Request/Response-Schema eines
bestehenden Endpunkts ändert, aktualisiert auch `docs/openapi/openapi.yaml`
im selben PR.

Cursor-Regel `.cursor/rules/data-fields.mdc` kann erweitert werden, um das
zu erinnern (TODO).

### Wie verifiziere ich, dass die Spec stimmt?
1. Swagger-UI lokal starten (siehe oben)
2. „Try it out" klicken
3. Real gegen lokalen Container (`docker compose up booking`) ausführen
4. Wenn die Antwort vom dokumentierten Schema abweicht → Spec ist falsch ODER
   Code ist falsch. Im Zweifel: Code ist Source of Truth, Spec anpassen.

## Bekannte Lücken

| # | Lücke | Lösung |
|---|---|---|
| 1 | 548 Routen sind nur als Stub dokumentiert (keine echten Request/Response-Schemas) | Top-Endpoints (Order-CRUD, Customer-API, Tour-Workflow) schrittweise kuratieren |
| 2 | Kein CI-Lint-Job für die Spec | `.github/workflows/openapi-lint.yml` mit `redocly lint` ergänzen |
| 3 | Keine `tag-description` auf den meisten Tags (Linter-Warning) | In `spec.tags[].description` ergänzen |
| 4 | Keine Webhooks (Payrexx, Exxas) dokumentiert | OpenAPI 3.1 unterstützt `webhooks:` — aktuell als normale POST-Routen erfasst |
| 5 | Keine `examples:` in Responses | Schrittweise beim Kuratieren eines Endpoints ergänzen |

## Verwandte Dokumentation

- [`DATA_FIELDS.md`](../DATA_FIELDS.md) — Doku-Index
- [`docs/SCHEMA_FULL.md`](SCHEMA_FULL.md) — DB-Schema (Quelle der Response-Felder)
- [`docs/ROLES_PERMISSIONS.md`](ROLES_PERMISSIONS.md) — RBAC-Permissions im `LoginSuccess`-Schema
- [`booking/rate-limiters.js`](../booking/rate-limiters.js) — Rate-Limit-Konfiguration
