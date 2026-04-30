# Propus Assistant — Setup

Der Assistant ist bereits ins `propus-platform`-Repo eingearbeitet. Diese Anleitung deckt das ab, was du noch tun musst, um ihn produktiv zu schalten.

## Ablage im Repo

```
app/src/
├── app/
│   ├── (admin)/assistant/page.tsx               # Web-UI Route /assistant
│   └── api/assistant/
│       ├── route.ts                             # POST /api/assistant
│       └── transcribe/route.ts                  # POST /api/assistant/transcribe
├── components/global/FloatingVoiceButton.tsx    # optional, im Admin-Layout einbinden
└── lib/assistant/
    ├── audit.ts          # → @/lib/db (assistant.audit_log)
    ├── claude.ts         # Tool-Use-Loop + Prompt-Caching
    ├── graph-client.ts   # geteilter MS-Graph-Token-Cache
    ├── system-prompt.ts
    ├── whisper.ts
    └── tools/
        ├── index.ts
        ├── orders.ts        # gegen booking.orders (JSONB-Felder)
        ├── tours.ts         # gegen tour_manager.tours
        ├── calendar.ts      # MS Graph
        ├── email.ts         # MS Graph
        ├── mailerlite.ts
        ├── home-assistant.ts
        └── paperless.ts

core/migrations/045_assistant_tables.sql   # Schema "assistant" (4 Tabellen)
mobile/                                     # Expo-App, separat
```

## Schritte zur Aktivierung

### 1. Dependencies installieren

`@anthropic-ai/sdk` ist bereits in `app/package.json` eingetragen.

```bash
cd app
npm install
```

### 2. ENV-Variablen setzen

Trage in deine bestehende `.env` (App-Verzeichnis, oder Server-ENV) ein:

```env
# AI
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-7      # optional, Default ist gesetzt
OPENAI_API_KEY=sk-...

# Microsoft Graph (sollten existieren)
MS_GRAPH_TENANT_ID=8aee6efb-b620-459d-95b1-0ea7ff434458
MS_GRAPH_CLIENT_ID=e23a0d84-9f8d-47ce-9a1c-73be8809d787
MS_GRAPH_CLIENT_SECRET=

# MailerLite
MAILERLITE_API_KEY=

# Home Assistant
HA_BASE_URL=https://smartzh.janez.ch
HA_LONG_LIVED_TOKEN=

# Paperless-ngx (optional)
PAPERLESS_BASE_URL=
PAPERLESS_API_TOKEN=
```

### 3. Migration ausführen

Über deinen bestehenden Migration-Runner. Die Datei liegt bei `core/migrations/045_assistant_tables.sql` und legt das Schema `assistant` mit vier Tabellen an: `conversations`, `messages`, `tool_calls`, `audit_log`.

Manuell:

```bash
psql $DATABASE_URL -f core/migrations/045_assistant_tables.sql
```

### 4. Smoke-Test

```bash
cd app && npm run build
```

Wenn der Build durchläuft, deploye über deine bestehende Pipeline. Dann:

1. Auf `/assistant` einloggen (Admin-Session-Cookie wird vom bestehenden Login gesetzt)
2. Mikro-Berechtigung erteilen
3. „Welche Aufträge habe ich heute?" sagen → sollte read-Tool `get_today_schedule` ausführen
4. „Wie viele Touren laufen ab?" → `count_active_tours` + `get_tours_expiring_soon`

### 5. Floating-Button (optional)

In `app/src/app/(admin)/layout.tsx` einbinden:

```tsx
import { FloatingVoiceButton } from "@/components/global/FloatingVoiceButton";

export default async function AdminGroupLayout({ children }: { children: ReactNode }) {
  await requireAdminLayoutSession();
  return (
    <>
      {children}
      <FloatingVoiceButton />
    </>
  );
}
```

## Auth-Integration

Beide API-Routen nutzen `getAssistantSession(req)` aus `@/lib/assistant/auth`. Akzeptiert wird:

- **Cookie** `admin_session` (wie der Rest des Admin-Panels — Web-UI braucht nichts extra), ODER
- **Header** `Authorization: Bearer <token>` (für Mobile)

Beide Wege schauen den Token-Hash in `booking.admin_sessions` nach. Portal-only-Rollen (Kunden) werden abgelehnt — der Assistant ist admin-Niveau.

Mobile: Im Login-Screen kannst du momentan einen `admin_session`-Token aus dem Browser-Cookie ins Token-Feld pasten. Phase 4 wäre ein eigener Mobile-Login-Endpoint, der Email/Passwort entgegennimmt und einen langlebigen Token zurückgibt.

## Was wir bereits gefixt haben

- ✅ DB-Stubs ersetzt durch `@/lib/db`-Imports (audit, orders, tours)
- ✅ Auth-Stub ersetzt durch `getAdminSession()` (admin_session-Cookie)
- ✅ Whisper-Endpoint mit Auth + 25 MB Size-Limit
- ✅ Orders-Queries gegen reales `booking.orders`-Schema (JSONB)
- ✅ Tours-Queries gegen reales `tour_manager.tours`-Schema (`matterport_space_id`, `term_end_date`, `status='ACTIVE'`)
- ✅ Geteilter Microsoft-Graph-Token-Cache
- ✅ Prompt-Caching auf System-Prompt + Tools (~80% Token-Ersparnis bei Folge-Turns)
- ✅ Timeouts auf alle externen Fetches (Graph 15s, HA 10s, ML 15s, Paperless 15s, Whisper 45s)

## Bewusste Auslassungen

- `create_order_draft`: zu komplex für saubere Implementation (booking.orders hat verschachtelte JSONB-Strukturen für services/billing/schedule, sequenzielles `order_no`, Settings-Snapshot). Bei Bedarf nachträglich hinzufügen.
- Rate-Limiting per User: nicht im Backend implementiert. Da Auth an `admin_session` gebunden ist, ist der Angriffsvektor klein. Bei Bedarf später.

## Mobile

Siehe `docs/assistant/DEPLOYMENT.md` für Expo-Setup, EAS Build und TestFlight.
