# FLOWS_ASSISTANT.md — Propus Assistant

Zuletzt aktualisiert: 2026-04-30

## Übersicht

Der Propus Assistant ist eine interne AI-Chat-Oberfläche (Claude-basiert) für Admin/Employee,
erreichbar unter `/assistant`. Er ermöglicht Read-/Write-Zugriff auf Aufträge, Touren,
Posteingang und Rechnungen via Tool-Calls.

## Architektur

```
Browser (React SPA)
  │
  ├─► POST /api/assistant?stream=true   (SSE-Streaming)
  ├─► POST /api/assistant?stream=false   (JSON-Response, Fallback)
  ├─► GET  /api/assistant/settings       (Einstellungen + Usage lesen)
  ├─► PATCH /api/assistant/settings      (Einstellungen ändern, nur super_admin)
  ├─► GET  /api/assistant/history        (Verlauf-Liste)
  ├─► GET  /api/assistant/history/:id    (Konversation laden)
  ├─► GET  /api/assistant/memories       (Erinnerungen)
  └─► DELETE /api/assistant/memories/:id (Erinnerung löschen)
         │
         ▼
  Anthropic Claude API (Streaming / Non-Streaming)
         │
         ▼
  Tool-Handler (orders, tours, invoices, posteingang, writes)
```

## Streaming (Feature seit 2026-04-30)

### Backend (`app/src/lib/assistant/claude-stream.ts`)

- Nutzt `client.messages.stream(...)` aus dem Anthropic SDK
- Sendet SSE-Events über `ReadableStream`:
  - `{"type":"text_delta","text":"..."}` — inkrementeller Text
  - `{"type":"tool_start","name":"..."}` — Tool-Aufruf startet
  - `{"type":"tool_result","name":"...","duration":123}` — Tool fertig
  - `{"type":"done","toolCallsExecuted":[...],"inputTokens":...,"outputTokens":...}` — Stream fertig
  - `{"type":"error","error":"..."}` — Fehler
- DB-Persistenz erfolgt **nach** Stream-Ende (fire-and-forget Promise)
- Fallback: `?stream=false` Query-Param → klassische JSON-Response

### Frontend (`ConversationView.tsx`)

- `fetch` mit `getReader()` konsumiert den SSE-Stream
- Assistant-Bubble erscheint sofort mit blinkenden Cursor
- Tool-Badges werden in Echtzeit hinzugefügt
- Bei Client-Disconnect: Stream wird graceful abgebrochen

## Error Handling

Strukturierte Fehler mit `{ error: "...", code: "..." }`:

| Code | HTTP | Nachricht (DE) |
|------|------|----------------|
| `auth_failed` | 401/403 | Nicht authentifiziert / Keine Berechtigung |
| `rate_limited` | 429 | Anfragelimit erreicht. Bitte warten. |
| `model_error` | 500/503 | Claude ist gerade nicht erreichbar. Bitte in 30s erneut versuchen. |
| `tool_error` | 400 | Fehler bei der Tool-Ausführung |
| `validation_error` | 400/413 | Ungültige Anfrage |

## Token-Tracking & Tageslimit

### DB-Schema

```sql
ALTER TABLE tour_manager.assistant_conversations
  ADD COLUMN input_tokens INTEGER DEFAULT 0,
  ADD COLUMN output_tokens INTEGER DEFAULT 0;
```

Migration: `core/migrations/049_assistant_usage_tracking.sql`

### Logik

- Nach jedem Turn werden `usage.input_tokens` und `usage.output_tokens` gespeichert
- `getAssistantUsageToday(userId)` summiert Tokens des heutigen Tages (Timezone Europe/Zurich)
- Tageslimit: `ASSISTANT_DAILY_TOKEN_LIMIT` ENV (Default: 500.000)
- Bei Überschreitung: `rate_limited` (429) vor Aufruf

### UI

- Footer zeigt „~Xk Token heute"
- Farben: normal → gelb (>80%) → rot (>95%)

## Tool Result Summaries

Wenn ein Tool-Ergebnis länger als 2.000 Zeichen ist, wird eine Zusammenfassung vorangestellt:

```
[Zusammenfassung: ~10 Einträge gefunden, Details folgen]

{vollständiges Ergebnis}
```

Dies hilft Claude, präzisere Antworten zu geben, ohne das volle Ergebnis ignorieren zu müssen.

## Admin-Einstellungen

### Speicherung

`booking.app_settings` mit Key `assistant_config` (JSONB):

```json
{
  "model": "claude-sonnet-4-6",
  "enabledTools": ["get_open_orders", "search_tours", ...],
  "dailyTokenLimit": 500000,
  "streamingEnabled": true
}
```

### API

| Methode | Pfad | Rolle | Beschreibung |
|---------|------|-------|-------------|
| `GET` | `/api/assistant/settings` | admin/employee | Settings + Usage + verfügbare Tools/Modelle |
| `PATCH` | `/api/assistant/settings` | super_admin | Einstellungen ändern |

### UI

- Gear-Icon im Assistant-Header öffnet Settings-Modal
- Felder: Modell-Dropdown, Tageslimit, Streaming-Toggle, Tool-Checkboxen
- Nur `super_admin` kann ändern; andere sehen read-only

## Authentifizierung

Zwei Pfade (`app/src/lib/assistant/auth.ts`):

1. **Cookie** (`admin_session`) — Browser/Desktop
2. **Bearer Token** — Mobile App (SHA-256 Hash in `tour_manager.assistant_mobile_tokens`)

## Tool-Kategorien

| Modul | Tools |
|-------|-------|
| Orders | `get_open_orders`, `get_order_detail`, `search_orders` |
| Tours | `search_tours`, `get_tour_detail`, `get_expiring_tours` |
| Invoices | `search_invoices`, `get_invoice_detail` |
| Posteingang | `get_posteingang_conversations`, `get_posteingang_tasks` |
| Writes | `create_posteingang_task`, `create_ticket`, etc. (mit Confirmation) |

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `app/src/app/api/assistant/route.ts` | Haupt-API (Streaming + Non-Streaming) |
| `app/src/app/api/assistant/settings/route.ts` | Settings-API |
| `app/src/lib/assistant/claude.ts` | Non-Streaming Claude-Loop |
| `app/src/lib/assistant/claude-stream.ts` | Streaming Claude-Loop |
| `app/src/lib/assistant/settings.ts` | Settings CRUD |
| `app/src/lib/assistant/store.ts` | DB-Persistenz (Messages, ToolCalls, Usage) |
| `app/src/lib/assistant/auth.ts` | Auth (Cookie + Bearer) |
| `app/src/lib/assistant/tools/index.ts` | Tool-Registry |
| `app/src/app/(admin)/assistant/_components/ConversationView.tsx` | Frontend-UI |
| `core/migrations/049_assistant_usage_tracking.sql` | Token-Spalten |
