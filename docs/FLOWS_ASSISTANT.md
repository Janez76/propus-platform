# Propus Assistant Flow

*Zuletzt aktualisiert: April 2026 (Web-MVP read-only, Claude Tool-Use, Whisper, Audit-Tabellen).*

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

Auth:

- Browser-Admin-Session via `booking.admin_sessions` / `getAdminSession()`.
- Erlaubt: `admin`, `super_admin`, `employee`.
- Portal-/Kundenrollen werden abgewiesen.

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
| `search_orders` | `booking.orders` |
| `get_today_schedule` | `booking.orders.schedule` |

### Tours

| Tool | Datenquelle |
|---|---|
| `get_tours_expiring_soon` | `tour_manager.tours`, bevorzugt `canonical_*` |
| `get_tour_status` | `tour_manager.tours` |
| `count_active_tours` | `tour_manager.tours` |

### Posteingang

| Tool | Datenquelle |
|---|---|
| `search_posteingang_conversations` | `tour_manager.posteingang_conversations/messages` |
| `get_recent_posteingang_messages` | `tour_manager.posteingang_messages` |
| `get_open_tasks` | `tour_manager.posteingang_tasks` |

---

## 7. ENV

| Variable | Zweck |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Messages API |
| `ANTHROPIC_MODEL` | Optional, Default `claude-sonnet-4-6` |
| `OPENAI_API_KEY` | Whisper-Transkription |

---

## 8. Bewusst nicht in Phase 1

- Keine schreibenden Tools.
- Kein direkter Graph-Mail-Versand.
- Keine Order-/Tour-Statusänderungen.
- Keine Home-Assistant-/MailerLite-/Paperless-Aktionen.
- Keine Mobile-Produktivfreigabe ohne separates Token-/Auth-Konzept.
