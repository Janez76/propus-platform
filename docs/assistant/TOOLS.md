# Tools-Referenz

Alle Tools, die der Assistant aufrufen kann. Read-Tools werden direkt ausgeführt; Write-Tools erst nach Bestätigung des Users.

## Orders

| Tool | Typ | Zweck |
|---|---|---|
| `get_open_orders` | read | Offene Aufträge der nächsten N Tage |
| `get_order_by_id` | read | Detailansicht eines Auftrags |
| `search_orders` | read | Suche nach Kunde/Adresse/Notiz |
| `get_today_schedule` | read | Heutige Shootings |
| `update_order_status` | **write** | Status setzen |
| `create_order_draft` | **write** | Neuen Auftrag (draft) anlegen |

## Calendar (Microsoft Graph)

| Tool | Typ | Zweck |
|---|---|---|
| `get_upcoming_events` | read | Outlook-Termine der nächsten 48h |
| `create_calendar_event` | **write** | Termin anlegen |

## Email (Microsoft Graph)

| Tool | Typ | Zweck |
|---|---|---|
| `search_emails` | read | KQL-Suche im Posteingang |
| `send_email_draft` | **write** | Entwurf in Outlook anlegen (sicher) |
| `send_email_now` | **write** | Sofort versenden (vorsichtig) |

## Matterport Tours

| Tool | Typ | Zweck |
|---|---|---|
| `get_tours_expiring_soon` | read | Bald ablaufende Touren |
| `get_tour_status` | read | Detailstatus einer Tour |
| `count_active_tours` | read | Anzahl aktiver Touren |

## MailerLite

| Tool | Typ | Zweck |
|---|---|---|
| `mailerlite_subscriber_count` | read | Anzahl aktiver Subscriber |
| `mailerlite_add_subscriber` | **write** | Subscriber anlegen |
| `mailerlite_recent_campaigns` | read | Letzte Kampagnen + Stats |

## Home Assistant

| Tool | Typ | Zweck |
|---|---|---|
| `ha_get_state` | read | State einer Entität |
| `ha_call_service` | **write** | Service ausführen (Licht, Heizung, Szene…) |

## Paperless-ngx

| Tool | Typ | Zweck |
|---|---|---|
| `paperless_search` | read | Volltextsuche in Dokumenten |
| `paperless_get_document` | read | Dokument-Details |

---

## Eigenes Tool hinzufügen

1. Neue Datei in `lib/assistant/tools/<bereich>.ts` anlegen, Schema:

```typescript
import type { ToolDefinition, ToolHandler } from './index';

export const meinBereichTools: ToolDefinition[] = [
  {
    name: 'mein_tool',
    description: 'Was es tut. Wichtig: für Claude formuliert, klar und knapp.',
    input_schema: {
      type: 'object',
      properties: {
        param: { type: 'string' },
      },
      required: ['param'],
    },
  },
];

export const meinBereichHandlers: Record<string, ToolHandler> = {
  mein_tool: async (input, ctx) => {
    // Logik hier
    return { ok: true };
  },
};
```

2. In `lib/assistant/tools/index.ts` importieren und zu `allTools` / `allHandlers` hinzufügen.

3. Wenn schreibend: Im `route.ts` wird automatisch auditiert, sobald der Tool-Name mit `create_`, `update_`, `delete_`, `send_`, `ha_call_service` oder `mailerlite_add` beginnt. Sonst Audit-Logik manuell ergänzen.

## Naming-Konvention

- Read-Tools: `get_*`, `search_*`, `list_*`, `count_*`
- Write-Tools: `create_*`, `update_*`, `delete_*`, `send_*`
- Bereichsspezifisch prefixen, wenn Konfliktgefahr: `paperless_search`, `mailerlite_add_subscriber`

## Bestätigungsflow

Der System-Prompt instruiert Claude, vor jedem schreibenden Tool den User zu fragen. Beispiel:

> User: "Lege einen Auftrag für Müller in Zürich an, Foto und Drohne"
>
> Assistant: "Soll ich diesen Auftrag anlegen?
> - Kunde: Müller
> - Adresse: Zürich (welche genaue Adresse?)
> - Services: Foto + Drohne
> - Status: draft"
>
> User: "Ja, Bahnhofstrasse 1"
>
> Assistant: [`create_order_draft` ausführen]
