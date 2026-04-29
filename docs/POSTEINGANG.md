# POSTEINGANG — Vereinheitlichte Zentrale für E-Mail, Tickets und Aufgaben

> **Stand:** 29. April 2026
> **Repo:** `Janez76/propus-platform`
> **Ziel:** Separater Planer und ständiger Wechsel zwischen Outlook und internen Tools reduzieren — ein einziges Modul im Admin Panel.

---

## 1. Vision

Ein einziger Arbeitsplatz für alles, was kommunikativ und operativ pro Kunde anfällt:

- Eingehende und ausgehende **E-Mails** (über `office@propus.ch` via Microsoft Graph)
- Interne **Tickets** (z.B. Mitarbeiter meldet etwas)
- **Aufgaben** mit Fälligkeit, Priorität, Zuweisung
- **Verknüpfung** mit Kunde, Auftrag, Tour und Rechnung in der Propus-Plattform

Statt zwischen Outlook und mehreren internen Tools zu wechseln, läuft die Kommunikation in einer Konversations-orientierten Inbox direkt im Propus Admin Panel im Dark/Gold-Designsystem.

### Erfolgskriterien

- Eingehende Mail an `office@propus.ch` erscheint binnen ≤ 2 Minuten als Konversation in der Plattform.
- Antworten gehen über Microsoft Graph mit korrektem Threading raus.
- Aufgaben können standalone existieren oder an Konversationen hängen.
- Ein Klick auf einen Kunden zeigt alle zugehörigen Konversationen, Aufgaben, Aufträge, Touren und Rechnungen in einer Ansicht.
### Out of Scope (vorerst)

- Knowledge Base (ggf. später separates Modul)
- SLA-Eskalationen, automatisierte Helpdesk-Reports
- Mehrere Mailboxen (initial nur `office@propus.ch`; weitere später trivial)
- Live-Chat / Webchat-Integration

---

## 2. Architektur — Übersicht

```
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │   E-Mail     │   │   Manuell    │   │   System     │
   │  MS Graph    │   │  Quick-Add   │   │ Auto-Trigger │
   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
              ┌──────────────────────────────┐
              │         POSTEINGANG          │
              │  Conversation + Message      │
              │           + Task             │
              └──────────────┬───────────────┘
                             │ (verknüpft mit)
       ┌────────┬────────┬───┴────┬─────────┐
       ▼        ▼        ▼        ▼         ▼
    Kunde   Auftrag    Tour   Rechnung   Mitarbeiter
```

Eingangs-Kanäle:

1. **E-Mail (MS Graph)** — Pull alle 2 Min (Phase 1), später Webhook-basiert (Phase 7).
2. **Manuell** — Mitarbeiter erfasst Ticket/Aufgabe direkt im UI.
3. **System** — Plattform erzeugt automatisch Konversationen oder Aufgaben aus Geschäftsereignissen (Tour läuft ab, Rechnung überfällig, neuer Auftrag, etc.).

---

## 3. Datenmodell

> **Hinweis:** Die ursprüngliche Spec-Vorlage ging von Prisma aus; das Repo nutzt jedoch raw `pg` mit SQL-Migrationen unter `core/migrations/`. Vor Phase 1 muss das Datenmodell in SQL überführt werden (siehe Anhang B). Konzeptuell bleiben die Entitäten gleich:

### Entitäten

- **Conversation** — channel (`email | internal | task_only`), status (`open | in_progress | waiting | resolved | archived`), priority, optionale FKs auf customer/order/tour/invoice, Graph-Threading-Felder, externalSource für Migration.
- **Message** — direction (`inbound | outbound | internal_note | system`), Body HTML/Text, Graph-IDs, in_reply_to, Author.
- **MessageAttachment** — filename, content_type, size, storage_key.
- **Task** — title, description, status, priority, due_date, optional an Conversation und/oder Customer/Order/Tour gebunden.
- **ConversationParticipant** — email, name, role (`from | to | cc`).
- **ConversationTag** — frei definierbare Tags pro Konversation.
- **GraphSyncState** — pro Mailbox: delta_token, last_sync_at, last_error_*.

Bestehende Relationen erweitern: `customers`, `orders`, `tours`, `invoices`, `users` bekommen Gegen-Indizes auf die neuen Tabellen.

---

## 4. API-Routen

> Express-Routen in `tours/routes/` (JSON-only) plus Next.js-Proxy in `app/next.config.ts`.

### Konversationen

| Methode | Route | Zweck |
|---|---|---|
| `GET` | `/api/posteingang/conversations` | Liste mit Filtern (status, assigned, customer, search, page, limit) |
| `GET` | `/api/posteingang/conversations/:id` | Detail inkl. Messages, Tasks, Participants, Tags |
| `POST` | `/api/posteingang/conversations` | Neue Konversation (channel=internal oder task_only) |
| `PATCH` | `/api/posteingang/conversations/:id` | Status, Priorität, Zuweisung, Verknüpfungen ändern |
| `POST` | `/api/posteingang/conversations/:id/tags` | Tag hinzufügen |
| `DELETE` | `/api/posteingang/conversations/:id/tags/:name` | Tag entfernen |

### Nachrichten

| Methode | Route | Zweck |
|---|---|---|
| `POST` | `/api/posteingang/conversations/:id/messages` | Neue Nachricht. Bei `direction=outbound` wird via Graph gesendet. |
| `POST` | `/api/posteingang/conversations/:id/messages/:msgId/reply` | Antwort als neue Nachricht im Thread |

### Aufgaben

| Methode | Route | Zweck |
|---|---|---|
| `GET` | `/api/posteingang/tasks` | Liste mit Filtern (status, assigned, due, customer, conversation) |
| `POST` | `/api/posteingang/tasks` | Neue Aufgabe (mit oder ohne Konversation) |
| `PATCH` | `/api/posteingang/tasks/:id` | Status, Priorität, Fälligkeit, Zuweisung |
| `DELETE` | `/api/posteingang/tasks/:id` | Löschen |

### Sync (intern)

| Methode | Route | Zweck |
|---|---|---|
| `POST` | `/api/posteingang/sync/pull` | Manueller Pull-Trigger. Cron ruft das alle 2 Min auf. |
| `POST` | `/api/posteingang/sync/webhook` | (Phase 7) MS Graph Subscription Endpoint |

---

## 5. UI-Struktur

### Routing

```
/admin/posteingang                      → Liste (Standard-Filter: meine offenen)
/admin/posteingang/[conversationId]     → Detail-Ansicht mit Thread + Composer
/admin/posteingang/aufgaben             → Aufgaben-Übersicht
/admin/posteingang/neu                  → Neue Konversation/Aufgabe
```

### Hauptansicht (3-Spalten-Layout)

- **Links:** Konversations-Liste mit Tabs (Alle / Meine / Unbeantwortet / Aufgaben)
- **Mitte:** Ausgewählte Konversation (Header, Thread, Composer)
- **Rechts:** Kontext-Panel (Kunde, verknüpfte Aufträge/Touren/Rechnungen, Aufgaben)

### Komponenten (React, in `app/src/pages-legacy/posteingang/` + `app/src/components/posteingang/`)

```
PosteingangShell, KonversationsListe, KonversationsListenItem,
KonversationsDetail, KonversationsHeader, KonversationsThread,
NachrichtBubble, AntwortComposer, KontextPanel, KontextKunde,
KontextVerknuepfungen, KontextAufgaben, AufgabenListe, AufgabenZeile,
AufgabeFormular, PrioritaetBadge, StatusBadge
```

### Designsystem (bestehend)

- Background: `#0c0d10`, Surface: `#111217`, Hover: `#15171d`
- Border: `#1e2028`
- Gold: `#B68E20`, Gold-Hover: `#c49a28`
- Text: `#e8e4dc` (primär), `#888` (sekundär), `#5a5a5a` (tertiär)
- Fonts: DM Sans (UI), DM Serif Display (Überschriften)
- Border-Radius: 4px (Buttons/Inputs), 6px (Cards), 12px (Container)

### Sprachen

UI-Labels in **Deutsch** (Hochdeutsch, Schweizer Schreibung). E-Mail-Vorlagen mehrsprachig: **Deutsch, Englisch, Serbisch** (per Customer-Locale).

---

## 6. Microsoft Graph Integration

### Vorhandene Konfiguration

```env
MS_GRAPH_TENANT_ID=8aee6efb-b620-459d-95b1-0ea7ff434458
MS_GRAPH_CLIENT_ID=e23a0d84-9f8d-47ce-9a1c-73be8809d787
MS_GRAPH_CLIENT_SECRET=<aus Vault>
```

App-Permissions sind erteilt (Mail.ReadWrite, Mail.Send). App-only-Auth.

### SDK

`@microsoft/microsoft-graph-client` und `@azure/identity` sind bereits in `app/package.json` vorhanden.

### Pull-Strategie (Phase 1)

Pro überwachtem Ordner eine eigene Delta-Query mit eigenem Delta-Token in `tour_manager.posteingang_graph_sync_state`:

- `folder_scope = inbox` → `/users/{mailbox}/mailFolders/inbox/messages/delta`
- `folder_scope = sentitems` → `/users/{mailbox}/mailFolders/sentitems/messages/delta` (Gesendet, u. a. Antworten aus Outlook)

Implementiert in `tours/lib/posteingang-sync.js` als `syncPosteingangFull()` (wird von `POST /api/tours/admin/posteingang/sync/pull` und `POST /api/tours/cron/sync-posteingang` aufgerufen). Scheitert ein Delta-Lauf, greift ein Fallback (Inbox: letzte N Nachrichten; Gesendet: `pullRecentSent`).

Primärschlüssel `(mailbox_address, folder_scope)`. Cron z. B. alle 2 Minuten.

### Senden

Reply via `/users/office@propus.ch/messages/{id}/reply`. Damit Phase-2-Acceptance erfüllt ist, **muss** die Outbound-Message zusätzlich auf einem von zwei Wegen in der Plattform-Konversation auftauchen:

1. **Write-through (bevorzugt):** Beim Senden direkt eine `messages`-Zeile mit `direction=outbound` einfügen, Graph-IDs nachziehen sobald die API-Response zurückkommt.
2. **Sent-Items-Delta-Sync:** Der oben definierte zweite Delta-Loop ingestiert die Mail beim nächsten Pull.

Beide Mechanismen werden implementiert (Write-through für Sofort-UX, Sent-Items-Sync als Quelle der Wahrheit + Backfill für aus Outlook gesendete Mails). Deduplizierung über `graph_message_id`.

### Cron

Optionen für Phase 1: Vercel Cron, Synology Task Scheduler, Container in HestiaCP, oder bestehender `node-cron` im Express-Backend.

---

## 7. Externe Helpdesk-Migration

Nicht anwendbar (kein Zammad o. ä. im Einsatz). Historische E-Mails liegen in Exchange/Outlook; der Posteingang baut auf Microsoft Graph auf.

---

## 8. Phasen-Plan

### Phase 1 — Inbox-MVP (S/M)

**Ziel:** Mails von `office@propus.ch` landen in der Plattform und sind lesbar.

**Deliverables:**
- SQL-Migrationen `core/migrations/0XX_posteingang_*.sql` (siehe Anhang B)
- `app/src/lib/graph/client.ts`, `app/src/lib/graph/syncMail.ts`
- API: `GET /api/posteingang/conversations`, `GET /api/posteingang/conversations/:id`, `POST /api/posteingang/sync/pull`
- React-Liste + Detail (read-only)
- Cron-Konfiguration

**Acceptance:**
- Eine echte E-Mail an `office@propus.ch` ist binnen ≤ 2 Min in der Liste sichtbar.
- Detail-Ansicht zeigt vollständigen Thread inkl. HTML-Body.
- Liste filtert nach Status, sortiert nach `last_message_at` desc.

### Phase 2 — Antworten senden (M)

**Deliverables:** `sendMail.ts` (Reply, Reply-All, neue Mail), `POST /messages` mit `direction=outbound`, `AntwortComposer` mit Reply / Internal Note Tabs, E-Mail-Vorlagen-System.

**Acceptance:** Antwort über UI landet im Outlook-Thread mit korrektem `In-Reply-To`. Outbound-Message erscheint nach Sync auch in der Plattform-Konversation. Vorlagen-Variablen werden ersetzt.

### Phase 3 — Aufgaben-Layer (S/M)

**Deliverables:** `tasks` Tabelle, CRUD-API, `AufgabenListe`, `AufgabeFormular`, `KontextAufgaben` mit Quick-Add.

**Acceptance:** Quick-Add unter 5 Sekunden. Filter „Meine offenen" und „Heute fällig". Aufgabe an Konversation hängbar/lösbar.

### Phase 4 — Kunden-Verknüpfung & Auto-Match (M)

**Deliverables:** `tours/lib/posteingang-match.js` — exakte E-Mail via `getCustomerByEmail()`, Domain-Match über primäre E-Mail, `email_aliases` und `customer_contacts` (Freemail-Domains ausgeschlossen). UI: „Kunde zuweisen", Kontext-Panel.

**Acceptance:** Firmen-Domain eindeutig einem Kunden zugeordnet; bei Mehrdeutigkeit keine automatische Zuweisung; Banner wenn kein Kunde.

### Phase 5 — Auftrag/Tour/Rechnung-Verknüpfung (S/M)

**Deliverables:** „Verknüpfen mit"-Picker, Auto-Vorschläge per Subject-Heuristik, Kontext-Panel.

**Acceptance:** Verknüpfung mit einem Klick. Im Kunden-Profil alle Konversationen sichtbar.

### Phase 6 — Sent-Folder-Delta & Deduplizierung (M)

**Stand Code:** `syncPosteingangFull` synchronisiert Inbox + `sentitems` mit getrenntem Delta-Token; Dedupe über `graph_message_id`. Nach Antwort aus der Plattform weiterhin `pullRecentSent` im Message-Handler.

**Optional:** Write-through-Outbound mit Graph-ID aus der Send-Response, wenn Graph das zuverlässig liefert.

**Acceptance:** Aus Outlook gesendete Mails erscheinen im Thread; keine doppelten Zeilen bei gleicher `graph_message_id`.

### Phase 7 — Automationen & Webhooks (M)

**Stand Code:**

1. **Auto-Trigger Engine** (`tours/lib/posteingang-triggers.js`):
   - `triggerExpiringTours()` — Touren die in 30/14/7 Tagen ablaufen → Task "Verlängerung anbieten"
   - `triggerOverdueInvoices()` — Rechnungen 14+ Tage überfällig → Task "Mahnung senden"
   - `triggerUnknownSenderTag()` — E-Mail-Konversationen ohne Kunde → Tag "Neukunde?"
   - `runAllTriggers()` — orchestriert alle Trigger (Cron + manueller Button)

2. **Graph Webhook Endpoint** (`tours/routes/posteingang-webhook.js`):
   - `POST /api/tours/posteingang/webhook` — empfängt Microsoft Graph Notifications
   - Validierung via `validationToken` bei Subscription-Erstellung
   - `clientState`-Check via `GRAPH_WEBHOOK_SECRET`
   - Triggert `syncPosteingangFull` im Hintergrund bei neuen Nachrichten

3. **Cron-Endpoints**:
   - `POST /api/tours/cron/posteingang-triggers` — Trigger-Ausführung per Cronjob

4. **Admin-API-Erweiterungen**:
   - `GET /api/tours/admin/posteingang/stats` — Dashboard-Statistiken
   - `GET /api/tours/admin/posteingang/admin-users` — Admin-Liste für Zuweisung
   - `POST /api/tours/admin/posteingang/run-triggers` — manuelle Trigger-Ausführung

5. **UI-Erweiterungen** in `PosteingangPage.tsx`:
   - Stats-Leiste: Offene Konversationen, Tasks, Ø Antwortzeit
   - Neue Konversation: Dialog für interne Threads
   - Priorität-Selector: low/medium/high/urgent
   - Zuweisung-Selector: Admin-User-Dropdown
   - Tag-Management: Inline hinzufügen/entfernen
   - Trigger-Button: manuelles Ausführen der Auto-Trigger

**Acceptance:** Mindestens 3 aktive Auto-Trigger (Verlängerung, Mahnung, Neukunde). Webhook-Endpoint für Echtzeit-Benachrichtigungen (erfordert öffentliche URL + Graph-Subscription-Registrierung).

---

## 9. Hinweise für Cursor und Claude Code

Diese Datei ist die Quelle der Wahrheit. Bei jeder Phase: bestehende Designtokens nutzen, UI-Strings in Deutsch, Code in Englisch, **kein** Supabase, **kein** Prisma — Repo nutzt raw `pg` + SQL-Migrationen.

Bei Unsicherheit zur DB-Struktur, Stack-Wahl oder Designentscheidung: STOPPE und frage.

Tech-Stack (real, aus `app/package.json` + `AGENTS.md`):
- Next.js 16 + React 19 (SPA in `app/`)
- Express-Backend in `tours/`
- Postgres via raw `pg`, Migrationen in `core/migrations/*.sql`
- Auth über `auth/` + `openid-client`
- Tailwind, DM Sans/DM Serif Display
- `@microsoft/microsoft-graph-client` + `@azure/identity` bereits vorhanden
- `node-cron`, `nodemailer`, `winston` bereits vorhanden

---

## 10. Offene Fragen vor Start

1. **Multi-User-Berechtigungen** — ab Phase 4 oder erst nach Phase 7?
2. **E-Mail-Anhänge — Storage-Backend?** (R2, MinIO, Vercel Blob, Synology FS?)
3. **Graph-Sync Cron-Host?** (Vercel, Synology, HestiaCP, oder bestehender `node-cron` im Express-Backend?)
4. **Mehrere Mailboxen** initial relevant? (`info@`, `office@`, ...)

---

## Anhang A — Beispiel-Use-Case (Frau Ulrich)

1. Frau Ulrich schreibt an `office@propus.ch` mit Frage zur Halbjahres-Rechnung.
2. **Phase 1**: E-Mail wird via Graph gepullt → `Conversation` (channel=email) + `Message` (direction=inbound).
3. **Phase 4**: Auto-Match auf Domain `freycie-holding.ch` → Frey + Cie zugewiesen.
4. **Phase 5**: System schlägt Verknüpfung mit Rechnung RE-2026-0421 vor.
5. **Phase 3**: Janez fügt Aufgabe „Halbjahresabrechnung erklären" hinzu.
6. **Phase 2**: Janez wählt Vorlage, klickt „Senden". Antwort geht via Graph als Reply.
7. **Phase 1**: Sync spiegelt Outbound-Message, Status → `waiting`.
8. **Phase 7**: Bei Antwort der Kundin springt Status auf `open` + Reminder-Trigger.

---

## Anhang B — SQL-Schema-Skizze (statt Prisma)

> Migrations-Nummern werden bei Implementierung vergeben (aktuell zuletzt 043).

```sql
-- schema (muss vor allen schema-qualifizierten Typen/Tabellen existieren)
CREATE SCHEMA IF NOT EXISTS posteingang;

-- enums
CREATE TYPE posteingang.conversation_channel AS ENUM ('email','internal','task_only');
CREATE TYPE posteingang.conversation_status  AS ENUM ('open','in_progress','waiting','resolved','archived');
CREATE TYPE posteingang.priority             AS ENUM ('low','medium','high','urgent');
CREATE TYPE posteingang.message_direction    AS ENUM ('inbound','outbound','internal_note','system');
CREATE TYPE posteingang.task_status          AS ENUM ('open','in_progress','done','cancelled');

-- FK-Typen muessen zu den referenzierten PKs passen:
--   core.customers.id, booking.orders.id, tour_manager.tours.id  -> SERIAL  (INTEGER)
--   core.admin_users.id                                           -> BIGSERIAL (BIGINT)
CREATE TABLE posteingang.conversations (
  id                       TEXT PRIMARY KEY,
  subject                  TEXT NOT NULL,
  channel                  posteingang.conversation_channel NOT NULL,
  status                   posteingang.conversation_status NOT NULL DEFAULT 'open',
  priority                 posteingang.priority           NOT NULL DEFAULT 'medium',
  customer_id              INTEGER REFERENCES core.customers(id),
  order_id                 INTEGER REFERENCES booking.orders(id),
  tour_id                  INTEGER REFERENCES tour_manager.tours(id),
  -- Rechnungen liegen heute in zwei Tabellen (tour_manager.exxas_invoices,
  -- tour_manager.renewal_invoices). Daher kein FK, sondern (invoice_kind, invoice_id):
  invoice_kind             TEXT CHECK (invoice_kind IN ('exxas','renewal')),
  invoice_id               INTEGER,
  assigned_to_id           BIGINT REFERENCES core.admin_users(id),
  created_by_id            BIGINT NOT NULL REFERENCES core.admin_users(id),
  graph_conversation_id    TEXT UNIQUE,
  graph_mailbox_address    TEXT,
  external_source          TEXT,
  external_id              TEXT,
  last_message_at          TIMESTAMPTZ,
  first_response_at        TIMESTAMPTZ,
  resolved_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_source, external_id)
);
CREATE INDEX ON posteingang.conversations (status, priority, last_message_at DESC);
CREATE INDEX ON posteingang.conversations (customer_id, status);
CREATE INDEX ON posteingang.conversations (assigned_to_id, status);

-- weitere Tabellen analog: messages, message_attachments, tasks,
-- conversation_participants, conversation_tags, graph_sync_state
```

Konkrete Schemas, Constraints und Backfill-Reihenfolge werden im Phase-1-PR finalisiert.

---

*Letzte Aktualisierung: 29. April 2026 — Stack-Sektion an Repo-Realität angepasst.*
