# Propus Assistant Flow

*Zuletzt aktualisiert: April 2026 (Web-MVP read-only, Claude Tool-Use, Whisper, Audit-Tabellen, Mobile App + Token-Auth).*

---

## 1. Zweck

Der Propus Assistant ist eine interne Admin-Seite unter `/assistant`. In Phase 1 beantwortet er Fragen zu Aufträgen, Touren und Posteingang read-only. Schreibende Aktionen sind bewusst deaktiviert.

---

## 2. Frontend

| Pfad | Zweck |
|---|---|
| `app/src/app/(admin)/assistant/page.tsx` | Admin-Seite `/assistant` |
| `app/src/app/(admin)/assistant/layout.tsx` | App-Router-Layout mit `AppSidebar` |
| `app/src/app/(admin)/assistant/_components/ConversationView.tsx` | Chat-UI |
| `app/src/app/(admin)/assistant/_components/VoiceButton.tsx` | Push-to-talk Aufnahme |
| `app/src/components/global/FloatingVoiceButton.tsx` | Optionaler globaler Trigger, nicht standardmässig eingebunden |

Navigation: `app/src/config/nav.config.ts` (`nav.item.assistant`).

Im Desktop-Layout zeigt der Assistant rechts die letzten 20 Chats. Wenn Tool-Ergebnisse eine Bestellung, Tour oder einen Kunden enthalten, wird die Konversation automatisch mit `booking_order_no`, `tour_id` und/oder `customer_id` markiert.

---

## 3. API-Endpunkte

| Methode | Route | Zweck |
|---|---|---|
| `POST` | `/api/assistant` | Chat-Turn mit Claude + read-only Tools |
| `POST` | `/api/assistant/transcribe` | Audio → Text via OpenAI Whisper |
| `GET` | `/api/assistant/history` | Letzte 20 Konversationen inkl. möglicher Kunden-/Bestell-/Tour-Zuordnung |

Auth (zwei Pfade, siehe `app/src/lib/assistant/auth.ts`):

1. **Cookie** (Browser): Admin-Session via `booking.admin_sessions` / `getAdminSession()`. Erlaubt: `admin`, `super_admin`, `employee`.
2. **Bearer Token** (Mobile App): `Authorization: Bearer <token>` → SHA-256-Hash gegen `tour_manager.assistant_mobile_tokens`.

Portal-/Kundenrollen werden abgewiesen.

---

## 4. Datenfluss

```
Admin /assistant
  │
  ├─ Text → POST /api/assistant
  │        ├─ Admin-Session prüfen
  │        ├─ assistant_conversations/messages speichern
  │        ├─ Claude Tool-Use ausführen
  │        ├─ Tool-Calls speichern
  │        └─ Antwort + history + conversationId zurückgeben
  │
  └─ Audio → POST /api/assistant/transcribe
           ├─ Admin-Session prüfen
           ├─ max. 10 MB Audio lesen
           └─ Whisper-Transkription zurückgeben
```

---

## 5. Datenbank

Migration: `core/migrations/045_assistant_tables.sql`

| Tabelle | Zweck |
|---|---|
| `tour_manager.assistant_conversations` | Konversation pro Admin/User |
| `tour_manager.assistant_messages` | User-/Assistant-/Tool-Nachrichten |
| `tour_manager.assistant_tool_calls` | Tool-Ausführung inkl. Input/Output/Fehler |
| `tour_manager.assistant_audit_log` | Audit für schreibende Aktionen (für Phase 2 vorbereitet) |

Migration `core/migrations/046_assistant_conversation_links.sql` ergänzt `customer_id`, `booking_order_no` und `tour_id` auf `assistant_conversations` für die Verlaufs-Zuordnung.

---

## 6. Tools Phase 1

Alle Tools sind read-only.

### Orders

| Tool | Datenquelle |
|---|---|
| `get_open_orders` | `booking.orders` |
| `get_order_by_id` | `booking.orders` |
| `get_order_detail` | `booking.orders` + `core.customers` + `booking.order_folder_links` + `tour_manager.renewal_invoices`/`exxas_invoices` + `booking.order_chat_messages` |
| `search_orders` | `booking.orders` |
| `get_today_schedule` | `booking.orders.schedule` |

### Tours

| Tool | Datenquelle |
|---|---|
| `get_tours_expiring_soon` | `tour_manager.tours`, bevorzugt `canonical_*` |
| `get_tour_status` | `tour_manager.tours` |
| `get_tour_detail` | `tour_manager.tours` + `renewal_invoices` + `exxas_invoices` + `actions_log` + `tickets` |
| `count_active_tours` | `tour_manager.tours` |
| `get_cleanup_selections` | `tour_manager.tours` + `cleanup_sessions` + `actions_log` + `core.customers` |
| `summarize_cleanup_status` | `tour_manager.tours` (Aggregation über Bereinigungspipeline) |

### Invoices

| Tool | Datenquelle |
|---|---|
| `search_invoices` | `tour_manager.invoices_central_v` |
| `get_overdue_invoices` | `tour_manager.renewal_invoices` + `tours` |
| `get_invoice_stats` | `tour_manager.renewal_invoices` + `exxas_invoices` |

### Posteingang

| Tool | Datenquelle |
|---|---|
| `search_posteingang_conversations` | `tour_manager.posteingang_conversations/messages` |
| `get_recent_posteingang_messages` | `tour_manager.posteingang_messages` |
| `get_open_tasks` | `tour_manager.posteingang_tasks` |
| `get_posteingang_conversation_detail` | `tour_manager.posteingang_conversations` + `messages` + `tags` + `tasks` + `core.customers` |
| `get_posteingang_stats` | `tour_manager.posteingang_conversations` + `posteingang_tasks` + `posteingang_messages` |

---

## 7. ENV

| Variable | Zweck |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Messages API |
| `ANTHROPIC_MODEL` | Optional, Default `claude-sonnet-4-6` |
| `OPENAI_API_KEY` | Whisper-Transkription |

---

## 8. Mobile App (Propus Assistant)

### Überblick

Expo-basierte React Native App unter `apps/propus-assistant-mobile/`. Voice-first Interface mit Push-to-talk, Whisper-Transkription und TTS (expo-speech).

### Abhängigkeiten

expo ~52, expo-av, expo-haptics, expo-router, expo-secure-store, expo-speech, React 18 / RN 0.76.

### Auth-Flow (Bearer Token)

Die Mobile App nutzt **Bearer Tokens** (nicht Cookie-Sessions). Flow:

1. Admin erstellt Token in `/assistant` → Sidebar → „Mobile-Zugang" → „Erstellen"
2. Token wird einmalig angezeigt (SHA-256-Hash in DB: `tour_manager.assistant_mobile_tokens`)
3. User gibt Token in der Mobile App ein (Login-Screen)
4. App speichert Token in `expo-secure-store` und sendet ihn als `Authorization: Bearer <token>`
5. Backend (`app/src/lib/assistant/auth.ts`) prüft Hash gegen DB, nutzt `user_id`/`user_email` aus Token-Zeile

### Token-Management-API

| Methode | Route | Beschreibung |
|---------|-------|-------------|
| `GET` | `/api/assistant/tokens` | Aktive Tokens auflisten (nur Admin-Session) |
| `POST` | `/api/assistant/tokens` | Neuen Token generieren (nur Admin-Session) |
| `DELETE` | `/api/assistant/tokens/[id]` | Token widerrufen (nur Admin-Session) |

### API-Domain

Die Mobile App verbindet sich über `ki.propus.ch` (konfiguriert in `app.json` → `expo.extra.apiBaseUrl`).

### DNS-Setup (manuell)

`ki.propus.ch` muss als **Cloudflare DNS A-Record** auf den VPS (`87.106.24.107`) zeigen — analog zu `admin-booking.propus.ch`. Auf dem VPS muss der Reverse-Proxy (Caddy/Nginx) die Domain auf den Platform-Container weiterleiten.

Dies ist ein **manueller Schritt** — nicht automatisiert.

### DB-Migration

`core/migrations/048_assistant_mobile_tokens.sql` erstellt die Tabelle `tour_manager.assistant_mobile_tokens`.

---

## 9. Bewusst nicht in Phase 1

- Keine schreibenden Tools.
- Kein direkter Graph-Mail-Versand.
- Keine Order-/Tour-Statusänderungen.
- Keine Home-Assistant-/MailerLite-/Paperless-Aktionen.
