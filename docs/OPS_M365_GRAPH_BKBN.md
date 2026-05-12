# Betrieb: Microsoft Graph (BKBN-Kalender) + VPS-ENV

> **Ziel:** App-only-Zugriff auf die Kalender der in `BKBN_CALENDAR_MAILBOXES` genannten Benutzer (gleiche Graph-Calls wie `booking/server.js` → `GET /users/{upn}/calendarView`).

*Zuletzt aktualisiert: Mai 2026*

---

## 1. Entra ID (Azure AD) — App-Registrierung

| | Produktion (VPS, siehe `AGENTS.md`) |
|---|-----|
| **Tenant ID** | `8aee6efb-b620-459d-95b1-0ea7ff434458` |
| **Application (Client) ID** | `8b602a1c-def3-44f3-8a39-84d4f3664ef4` |

**API-Berechtigungen (Microsoft Graph → Application permissions):**

| Permission | Erforderlich für |
|------------|------------------|
| **Calendars.Read** | BKBN (`calendarView`), Lese-Termine in fremden Postfächern |
| *bereits üblich in derselben App* | **Calendars.ReadWrite** — Order-Kalender (Create/PATCH/DELETE); **Mail.Send**, **Mail.Read**, … Posteingang — siehe bestehende Produktionskonfiguration |

**Admin-Consent erteilen:**

1. Entra Admin Center → **App registrations** → App **Propus-Produktion** (Client-ID oben) → **API permissions** → **Grant admin consent for …**.
2. Oder Direktlink (Tenant + Client-ID anpassen falls abweichend):  
   `https://login.microsoftonline.com/8aee6efb-b620-459d-95b1-0ea7ff434458/adminconsent?client_id=8b602a1c-def3-44f3-8a39-84d4f3664ef4`

Ohne Consent liefert Graph **403** (oft `Authorization_RequestDenied` / fehlende Rolle).

---

## 2. Exchange Online (nur bei 403 trotz Consent)

Wenn `calendarView` für ein Postfach **403** oder **ErrorAccessDenied** liefert, prüfen:

- **Application Access Policies** (Eingeschränkter Postfachzugriff für die App): die App muss die genutzten Postfächer abdecken, oder die Policy muss für die Mailboxen erweitert werden.
- Doku: [Limiting application permissions to specific Exchange Online mailboxes](https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access) (Microsoft).

---

## 3. VPS — `BKBN_CALENDAR_MAILBOXES` und Deploy

Datei (laut `.env.vps.example`): **`/opt/propus-platform/.env.vps`** (wird vom CI nicht überschrieben).

```bash
# Beispiel: explizit setzen (Komma- oder Leerzeichen-getrennt)
BKBN_CALENDAR_MAILBOXES=ivan.mijajlovic@propus.ch,janez.smirmaul@propus.ch
# optional weiterhin dokumentiert in docs/FLOWS_BOOKING.md:
# BKBN_MATCH_DOMAINS, BKBN_CACHE_TTL_MS, BKBN_PAST_DAYS, BKBN_FUTURE_MONTHS
```

Container neu laden (siehe Kommentar in `.env.vps.example`):

```bash
ssh root@87.106.24.107   # oder euer Alias
cd /opt/propus-platform
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate platform
```

`MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` müssen in derselben Datei gesetzt sein (BKBN nutzt denselben Client wie E-Mail/Kalender).

---

## 4. Verifikation (ohne Produktions-Daten zu leaken)

Im Repo, mit **gleicher ENV** wie der Platform-Container:

```bash
cd booking
set -a && source /opt/propus-platform/.env.vps && set +a   # auf dem VPS
node scripts/verify-graph-bkbn-mailboxes.js
```

Oder von lokal, wenn `.env` die Graph-Variablen enthält:

```bash
cd booking
npm run verify:graph-bkbn
```

**Exit-Code 0:** alle Postfächer in `BKBN_CALENDAR_MAILBOXES` haben lesbaren Kalender-Zugriff. **Exit 1:** fehlende ENV, oder mindestens ein Postfach-Fehler — Log zeigt Graph-Status und Kurzgrund.

---

## 5. KI-Assistent („E-Mail von heute“ / Posteingang)

Fehler **„Nicht authentifiziert“** im Chat betrifft die **Admin-Session** (kein Microsoft-Graph-Problem): eingeloggt am **Admin-Booking** bleiben bzw. Session/Cookies prüfen. Technischer Hintergrund: `docs/FLOWS_ASSISTANT.md`, Tools in `app/src/lib/assistant/tools/`.

---

## Siehe auch

- `docs/FLOWS_BOOKING.md` — BKBN-Aufträge, ENV-Liste
- `booking/server.js` — `loadBkbnCalendarEvents`, `bkbnMailboxes()`
