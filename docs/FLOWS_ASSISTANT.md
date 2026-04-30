# FLOWS_ASSISTANT.md — Propus Assistant

Zuletzt aktualisiert: 2026-05-01

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
  ├─► GET  /api/assistant/history        (Verlauf-Liste, Suche/Filter)
  ├─► GET  /api/assistant/history/:id    (Konversation laden)
  ├─► PATCH /api/assistant/history/:id   (Archiv/Papierkorb wiederherstellen)
  ├─► DELETE /api/assistant/history/:id  (Konversation soft-löschen)
  ├─► GET  /api/assistant/memories       (Erinnerungen)
  ├─► POST /api/assistant/memories       (Erinnerung anlegen)
  └─► DELETE /api/assistant/memories/:id (Erinnerung löschen)
         │
         ▼
  Anthropic Claude API (Streaming / Non-Streaming)
         │
         ▼
  Tool-Handler (orders, tours, invoices, posteingang, customers, email, designs, database, writes)
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

## Verlauf: Suche, Archiv und Papierkorb

### DB-Schema

```sql
ALTER TABLE tour_manager.assistant_conversations
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ;
```

Migration: `core/migrations/050_assistant_history_archive_trash.sql`

### API

| Methode | Route | Beschreibung |
|---------|-------|--------------|
| `GET` | `/api/assistant/history?q=&filter=active\|archived\|trash` | Listet max. 20 Chats; Standard ist aktive, nicht archivierte und nicht gelöschte Chats |
| `PATCH` | `/api/assistant/history/[id]` mit `{ "archived": true\|false }` | Archiviert oder reaktiviert eine Konversation |
| `PATCH` | `/api/assistant/history/[id]` mit `{ "deleted": false }` | Stellt eine Konversation aus dem Papierkorb wieder her |
| `DELETE` | `/api/assistant/history/[id]` | Setzt `deleted_at=NOW()` und blendet den Chat aus aktiven/archivierten Listen aus |

### UI

Die Sidebar „Verlauf / Letzte 20 Chats" enthält Suche, Filterchips (`Aktiv`, `Archiv`, `Papierkorb`) sowie kompakte Aktionen pro Chat. Archivierte Chats erscheinen nur im Archivfilter; gelöschte Chats nur im Papierkorb und können dort wiederhergestellt werden.

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

## Persistente Erinnerungen (Memory)

### DB

`tour_manager.assistant_memories` — Migration `047_assistant_memories.sql`; optional `expires_at`: `051_assistant_memories_expires_at.sql`.

### Prompt-Auswahl

Pro Turn werden aktive Erinnerungen geladen und per einfachem Stichwort-Match zur User-Nachricht priorisiert (`selectMemoriesForPrompt` / `rankMemoryBodiesForPrompt`).

### API

| Methode | Route | Beschreibung |
|---------|-------|--------------|
| `GET` | `/api/assistant/memories` | Liste |
| `POST` | `/api/assistant/memories` | Anlegen (`body`, optional `expires_in_days`, `conversation_id`) |
| `DELETE` | `/api/assistant/memories/:id` | Soft-Delete (Cookie oder Bearer) |

### Tool

| Tool | Typ | Beschreibung |
|------|-----|--------------|
| `save_memory` | read | Speichert Kurz-Erinnerung; optional `expires_in_days`, `conversation_id`; Kontext-Konversation wird automatisch verknüpft |

„Merk dir …“-Shortcut: nur im **Non-Streaming**-Pfad (`?stream=false` bzw. Streaming aus), damit die Antwort nicht als SSE gebrochen wird. Bei Streaming nutzt das Modell `save_memory`.

### ki.propus.ch

Siehe **`docs/KI_PROPUS_CH.md`** (DNS, Nginx, Checks).

## Tool-Kategorien

| Modul | Tools |
|-------|-------|
| Memories | `save_memory` |
| Orders | `get_open_orders`, `get_order_by_id`, `get_order_detail`, `search_orders`, `get_today_schedule`, `list_photographers`, `list_available_services`, `validate_booking_order` |
| Tours | `get_tours_expiring_soon`, `get_tour_status`, `get_tour_detail`, `count_active_tours`, `get_cleanup_selections`, `summarize_cleanup_status` |
| Invoices | `search_invoices`, `get_overdue_invoices`, `get_invoice_stats` |
| Posteingang | `search_posteingang_conversations`, `get_recent_posteingang_messages`, `get_open_tasks`, `get_posteingang_conversation_detail`, `get_posteingang_stats` |
| Customers (CRM) | `search_customers`, `get_customer_detail`, `get_customer_contacts`, `search_contacts`, `create_customer_contact`✏️, `update_customer_note`✏️ |
| Email | `search_emails`, `get_email_thread`, `send_email`✏️, `draft_email_reply`✏️ |
| Designs | `create_listing_gallery`✏️, `prepare_customer_delivery`✏️ |
| Database | `query_database` (nur `super_admin`, nur SELECT) |
| Writes | `create_posteingang_task`✏️, `create_ticket`✏️, `create_posteingang_note`✏️, `draft_email`✏️, `update_order_status`✏️, `create_order`✏️ |

✏️ = Write-Tool mit `requiresConfirmation: true`

### Customer/CRM Tools (`app/src/lib/assistant/tools/customers.ts`)

| Tool | Typ | Beschreibung |
|------|-----|-------------|
| `search_customers` | read | Kunden nach Name, E-Mail, Firma, Telefon suchen; `email_aliases` + Kontakte |
| `get_customer_detail` | read | Vollständiges Profil: Stammdaten, Kontakte, Firmen, letzte Bestellungen, aktive Touren |
| `get_customer_contacts` | read | Alle Kontaktpersonen für eine Kunden-ID |
| `search_contacts` | read | Kontakte nach Name/E-Mail suchen mit Parent-Kunden-Info |
| `create_customer_contact` | write | Neue Kontaktperson für Kunden erstellen |
| `update_customer_note` | write | Notiz-Feld (`notiz`) auf Kundendatensatz aktualisieren |

### Email Tools (`app/src/lib/assistant/tools/email.ts`)

| Tool | Typ | Beschreibung |
|------|-----|-------------|
| `search_emails` | read | Postfach-Suche via Admin-API (`PLATFORM_INTERNAL_URL`) |
| `get_email_thread` | read | Vollständiger Thread aus `posteingang_messages` |
| `send_email` | write | E-Mail über Posteingang-System senden (ggf. neue Konversation) |
| `draft_email_reply` | write | Antwort in bestehendem E-Mail-Thread senden |

E-Mail-Tools rufen die bestehende Express-API auf (`PLATFORM_INTERNAL_URL`, Default `http://127.0.0.1:3100`).

### Design Tools (`app/src/lib/assistant/tools/designs.ts`)

| Tool | Typ | Beschreibung |
|------|-----|-------------|
| `create_listing_gallery` | write | Neue Listing-Galerie erstellen (Entwurf) in `tour_manager.galleries` |
| `prepare_customer_delivery` | write | Galerie als zugestellt markieren, optional Listing-E-Mail auslösen |

### Database Tool (`app/src/lib/assistant/tools/database.ts`)

| Tool | Typ | Beschreibung |
|------|-----|-------------|
| `query_database` | read | Read-only SQL-Abfrage. Nur `super_admin`. Nur SELECT/WITH. Max 100 Zeilen, 5s Timeout. |

Sicherheitsmaßnahmen:
- Regex-Check lehnt INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE/GRANT/REVOKE ab
- `SET statement_timeout = '5s'` vor jeder Abfrage
- Automatisches `LIMIT 100` falls kein LIMIT vorhanden
- `ctx.role === 'super_admin'` Prüfung im Handler

## Auftragsanlage (Conversational Order Creation)

### Übersicht

Der Assistent kann Aufträge im natürlichen Gespräch erstellen. Trigger-Phrasen: „neue Bestellung", „neuer Auftrag", „Auftrag erstellen", „new order". Claude sammelt die erforderlichen Felder schrittweise und erstellt den Auftrag nach expliziter Bestätigung.

### Conversation Flow

```
Benutzer: "Neuer Auftrag"
  │
  ├─ 1. Kunde → search_customers → Bestätigung
  ├─ 2. Objektadresse → Freitext
  ├─ 3. Dienstleistungen → list_available_services → Auswahl
  ├─ 4. Wunschtermin → Datum + Uhrzeit (optional)
  ├─ 5. Fotograf → list_photographers → Auswahl (optional)
  ├─ 6. Notizen/Hinweise (optional)
  │
  ├─ validate_booking_order (optional bei Teilangaben — fehlende Schritte)
  │
  └─ 7. Zusammenfassung → create_order (requiresConfirmation: true)
         │
         └─► Bestätigung → INSERT booking.orders → Auftragsnummer zurück
```

Claude überspringt bereits beantwortete Schritte, wenn der Benutzer mehrere Informationen auf einmal gibt.

### Neue Tools

| Tool | Typ | Datei | Beschreibung |
|------|-----|-------|-------------|
| `list_photographers` | read | `orders.ts` | Aktive, buchbare Fotografen mit Key, Name, Adresse, Skills |
| `list_available_services` | read | `orders.ts` | Alle aktiven Produkte (Pakete + Addons) aus `booking.products` |
| `validate_booking_order` | read | `orders.ts` | Pflichtfelder / DB-Checks ohne Schreibzugriff (Wizard) |
| `create_order` | write | `writes.ts` | Erstellt `booking.orders`-Eintrag. `requiresConfirmation: true` |

### create_order — Input-Schema

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|-------------|
| `customer_id` | number | ✅ | Kunden-ID (via `search_customers` ermittelt) |
| `address` | string | ✅ | Objektadresse (Immobilie) |
| `services` | object | ✅ | `{ photography?, drone?, matterport?, floorplan?, video?, staging? }` (Boolean-Flags) |
| `schedule_date` | string | — | ISO-Datum (z.B. `2026-05-15`) |
| `schedule_time` | string | — | Uhrzeit (z.B. `10:00`) |
| `photographer_key` | string | — | Fotografen-Schlüssel |
| `notes` | string | — | Zusätzliche Hinweise |

### create_order — DB-Insert

- `order_no`: `COALESCE(MAX(order_no), 0) + 1` (atomic INSERT)
- `status`: `pending`
- `object`: `{ "type": "Immobilie" }`
- `billing`: Kopie aus Kundenstammdaten (name, email, company)
- `pricing`: `{}` (wird später berechnet)
- `settings_snapshot`: enthält `assistant_notes` falls Notizen vorhanden

### Validierungen

- Kunde muss in `core.customers` existieren
- Mindestens ein Service muss `true` sein
- Fotograf (falls angegeben) muss aktiv in `booking.photographers` sein
- Adresse darf nicht leer sein

## Mobile App (Propus Assistant)

Expo-basierte React Native App unter `apps/propus-assistant-mobile/`. Voice-first Interface mit Push-to-talk, Whisper-Transkription und TTS (expo-speech).

### Tech Stack

expo ~52, expo-av, expo-haptics, expo-router, expo-secure-store, expo-speech, React 18 / RN 0.76.

### Auth-Flow (Bearer Token)

1. Admin erstellt Token in `/assistant` → Sidebar → „Mobile-Zugang" → „Erstellen"
2. Token wird einmalig angezeigt (SHA-256-Hash in DB: `tour_manager.assistant_mobile_tokens`)
3. User gibt Token in der Mobile App ein (Login-Screen)
4. App speichert Token in `expo-secure-store` und sendet `Authorization: Bearer <token>`
5. Backend prüft Hash gegen DB, nutzt `user_id`/`user_email` aus Token-Zeile

### Token-Management-API

| Methode | Route | Beschreibung |
|---------|-------|-------------|
| `GET` | `/api/assistant/tokens` | Aktive Tokens auflisten (nur Admin-Session) |
| `POST` | `/api/assistant/tokens` | Neuen Token generieren (nur Admin-Session) |
| `DELETE` | `/api/assistant/tokens/[id]` | Token widerrufen (nur Admin-Session) |

### API-Domain

Die Mobile App nutzt `extra.apiBaseUrl` aus **`app.config.ts`** (Priorität: `EXPO_PUBLIC_API_BASE_URL` → `app.json` → Default `https://ki.propus.ch`). Siehe `apps/propus-assistant-mobile/README.md`.

### DNS & Proxy

Deployment-Checkliste: **`docs/KI_PROPUS_CH.md`** (Cloudflare A-Record, Nginx → Next :3001).

### DB-Migration

`core/migrations/048_assistant_mobile_tokens.sql` erstellt die Tabelle `tour_manager.assistant_mobile_tokens`.

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `app/src/app/api/assistant/route.ts` | Haupt-API (Streaming + Non-Streaming) |
| `app/src/app/api/assistant/settings/route.ts` | Settings-API |
| `app/src/app/api/assistant/tokens/route.ts` | Token-Management (GET/POST) |
| `app/src/app/api/assistant/tokens/[id]/route.ts` | Token-Widerruf (DELETE) |
| `app/src/lib/assistant/claude.ts` | Non-Streaming Claude-Loop |
| `app/src/lib/assistant/claude-stream.ts` | Streaming Claude-Loop |
| `app/src/lib/assistant/settings.ts` | Settings CRUD |
| `app/src/lib/assistant/store.ts` | DB-Persistenz (Messages, ToolCalls, Usage) |
| `app/src/lib/assistant/auth.ts` | Auth (Cookie + Bearer + Token-CRUD) |
| `app/src/lib/assistant/tools/index.ts` | Tool-Registry + ToolContext (inkl. `role`) |
| `app/src/lib/assistant/tools/customers.ts` | CRM-/Kunden-Tools |
| `app/src/lib/assistant/tools/email.ts` | E-Mail-Tools (via PLATFORM_INTERNAL_URL) |
| `app/src/lib/assistant/tools/designs.ts` | Design-/Galerie-Tools |
| `app/src/lib/assistant/tools/database.ts` | Read-only SQL-Tool (super_admin) |
| `app/src/app/(admin)/assistant/_components/ConversationView.tsx` | Frontend-UI |
| `apps/propus-assistant-mobile/` | Expo Mobile App |
| `core/migrations/048_assistant_mobile_tokens.sql` | Mobile-Token-Tabelle |
| `app/src/__tests__/assistantCrmTools.test.ts` | Tests: CRM-Tools, SQL-Injection-Prävention, E-Mail-Params |
| `app/src/__tests__/assistantMemory.test.ts` | Tests: Memory-Validation & Ranking |
| `app/src/__tests__/assistantOrderValidate.test.ts` | Tests: `validate_booking_order` |
| `core/migrations/051_assistant_memories_expires_at.sql` | Optional `expires_at` auf Erinnerungen |
| `docs/KI_PROPUS_CH.md` | ki.propus.ch Routing-Checkliste |
| `core/migrations/049_assistant_usage_tracking.sql` | Token-Spalten |
| `app/src/lib/assistant/model-router.ts` | Model-Escalation-Logik |
| `app/src/__tests__/modelRouter.test.ts` | Tests: Escalation-Heuristiken |

## Automatische Model-Escalation (seit 2026-05-01)

### Konzept

Der Assistant startet mit dem günstigsten/schnellsten Modell und eskaliert bei Bedarf automatisch:

```
Haiku (schnell/günstig) → Sonnet (Standard) → Opus (optional, max)
```

### Entscheidungslogik (`app/src/lib/assistant/model-router.ts`)

**Initiale Modellwahl** (`selectInitialModel`):

| Bedingung | Startmodell |
|-----------|-------------|
| Nachricht > 500 Zeichen | Sonnet |
| Komplexitäts-Keywords (`erkläre`, `analysiere`, `vergleiche`, `warum`, `zusammenfassung`, `plane`, `strategie`, `bewerte`, `überblick`) | Sonnet |
| Alles andere | Haiku |

**Escalation** (`shouldEscalate`) — nach dem ersten Durchlauf:

| Auslöser | Ergebnis |
|----------|----------|
| Unsicherheits-Marker ("ich weiss nicht", "kann ich nicht", etc.) | Nächsthöheres Modell |
| ≥4 Tool-Calls mit Antwort < 100 Zeichen | Nächsthöheres Modell |
| Antwort < 30 Zeichen ohne Tool-Calls | Nächsthöheres Modell |
| Antwort ist lang und klar | Keine Escalation |

### Konfiguration

| ENV-Variable | Default | Beschreibung |
|-------------|---------|-------------|
| `ASSISTANT_AUTO_ESCALATION` | `true` | Escalation aktiviert |
| `ASSISTANT_MAX_MODEL_TIER` | `opus` | Maximales Modell (`haiku`/`sonnet`/`opus`) |
| `ASSISTANT_ENABLE_OPUS_ESCALATION` | `true` | Opus als Ziel erlauben |

Alternativ über Admin-Settings (DB): `autoEscalation` (boolean) und `maxModelTier` (string).

### Token-Kosten

Bei Escalation zählen **beide** Durchläufe zum Token-Budget. Das Response enthält:
- `modelUsed`: tatsächlich verwendetes Modell
- `escalated`: `true` wenn höher als initial

### UI-Indikation

Im Chat erscheint bei eskalierter Antwort ein subtiler Badge: `⚡ sonnet` oder `⚡ opus`.

### Streaming-Verhalten

Beim Streaming wird das Modell **vorab** basierend auf der Nachrichtenanalyse gewählt (keine Re-Execution möglich, da der Stream bereits läuft). Im Non-Streaming-Pfad erfolgt eine echte Retry-Escalation.

### Tests

`app/src/__tests__/modelRouter.test.ts` — Unit-Tests für `selectInitialModel`, `shouldEscalate`, `parseTier`.
