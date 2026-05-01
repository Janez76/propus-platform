# Cursor-Prompt: Restliche Assistant-Capabilities

> **Kontext:** Wetter (MeteoSwiss/Open-Meteo) und Google-Maps-Routing sind bereits als Assistant-Tools im Branch `claude/define-assistant-capabilities-HkWxP` umgesetzt (siehe `app/src/lib/assistant/tools/weather.ts`, `app/src/lib/assistant/tools/maps.ts`). Email-Tools existieren ebenfalls. Direkter DB-Zugriff existiert lese-seitig via `query_database` für `super_admin`.
>
> Dieses Dokument ist der **Auftrag an Cursor**, die restlichen sechs Integrationen ergänzend zu bauen. Für jede Integration sind Pfad, Pattern und Test-Erwartung vorgegeben — bitte exakt diesen Konventionen folgen.

## Zielarchitektur (gilt für alle neuen Tools)

- **Datei**: `app/src/lib/assistant/tools/<name>.ts`
- **Export-Pattern** (siehe bestehende `tools/customers.ts`, `tools/email.ts`):
  ```ts
  export const <name>Tools: ToolDefinition[] = [...];
  export function create<Name>Handlers(deps: <Name>Deps = {}): Record<string, ToolHandler> { ... }
  export const <name>Handlers = create<Name>Handlers();
  ```
- **Schreib-Tools immer mit** `kind: "write"`, `requiresConfirmation: true` — jede Schreibaktion läuft durch den vorhandenen Confirmation-Flow (`runAssistantTurn` → `pendingConfirmation` → `/api/assistant/confirm`) und wird in `writeAudit` protokolliert.
- **Registrierung**: Im selben PR `app/src/lib/assistant/tools/index.ts` ergänzen (Imports + `allTools` + `allHandlers`).
- **Tests**: `app/src/__tests__/assistant<Name>.test.ts` mit vitest, gemockten `fetch`/`query` — niemals echte Netz-/DB-Calls in Tests.
- **Strings**: ASCII-Anführungszeichen `"..."` benutzen, keine deutschen Typografie-Quotes innerhalb von JS-Strings (sonst Parser-Fehler).
- **Antworten**: Immer Deutsch, kurz, mit `error`-Feld bei Fehlern (nicht `throw`). Erfolgsantwort ist ein einfaches Objekt — KEIN Wrapping in `{ data: ... }`.
- **Auth/Role**: Sensitive Tools per `ctx.role !== "super_admin"` schützen, wie `query_database` es vormacht.

---

## 1. Nextcloud — Datei-Operationen

**Use-cases:** Verzeichnisse listen, Datei-Metadaten lesen, Public-Share-Links generieren, Dateien hochladen/löschen für Auftragsordner.

**Bestehender Code zum Wiederverwenden:**
- `app/src/components/listing/demo/nextcloudShare.ts` — Share-Link-Aufbau
- `app/src/lib/selekto/galleryApi.ts` — bestehende Auth/Endpoint-Wrapping
- `app/src/api/listingAdmin.ts` — gibt das Backend-Pattern vor

**Env-Variablen (sollten existieren — sonst aus `.env.example` ableiten):**
- `NEXTCLOUD_BASE_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_APP_PASSWORD`
- WebDAV-Endpoint: `${BASE_URL}/remote.php/dav/files/${USERNAME}/`
- OCS-Share-API: `${BASE_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`

**Tools:**
| Name | Kind | Beschreibung |
|---|---|---|
| `nextcloud_list_folder` | read | Listet eine Ordnerebene (PROPFIND, depth=1). Input: `path`. Output: Liste mit `name`, `type` (`file`/`folder`), `size`, `mtime`, `etag`. |
| `nextcloud_get_file_meta` | read | Metadaten einer Datei. Input: `path`. |
| `nextcloud_create_share_link` | write+confirm | Erstellt einen Public-Share-Link. Input: `path`, optional `expires_at`, `password`. Output: `url`, `token`. |
| `nextcloud_upload_file` | write+confirm | Lädt eine Datei via PUT hoch. Input: `path`, `content_base64`, `content_type`. Achtung: max 5 MB, sonst Ablehnung. |
| `nextcloud_delete_path` | write+confirm | Löscht Datei oder Ordner. Doppelte Bestätigung (Tool gibt vor Ausführung in `description` "ACHTUNG, Löschen ..." aus). |

**WebDAV/PROPFIND-Parsing:** XML-Antwort parsen mit `fast-xml-parser` (bereits in den Dependencies — siehe `app/package.json`). Whitelist nur folgende Properties: `d:displayname`, `d:getlastmodified`, `d:getcontentlength`, `d:resourcetype`, `d:getetag`.

**Tests:** vitest mit gemocktem `fetch` (Response mit `text()` für PROPFIND-XML). Mindestens: List parsed korrekt, Share-Link wird zurückgegeben, Delete ohne Bestätigung schlägt im Tool-Layer NICHT fehl (Bestätigung läuft in `claude.ts`).

---

## 2. Matterport Spaces

**Use-cases:** Spaces eines Kunden listen, Space-Details lesen, vorhandene Tour mit Space verknüpfen, Space-Verfallsdatum ändern.

**Bestehender Code zum Wiederverwenden:**
- `app/src/app/(admin)/orders/[id]/verknuepfungen/matterport-linking.ts` — bereits implementierte Linking-Logik
- `app/src/__tests__/matterportLinking.test.ts` — zeigt das Test-Pattern
- Tabellen: `tour_manager.tours.matterport_space_id`, `tour_manager.tours.canonical_matterport_space_id`

**Env-Variablen:**
- `MATTERPORT_API_KEY`, `MATTERPORT_API_SECRET` (Bundle Token Auth) — falls nicht in `.env.example`, ergänzen.
- Endpoint: `https://api.matterport.com/api/models/graph` (GraphQL).

**Tools:**
| Name | Kind | Beschreibung |
|---|---|---|
| `matterport_list_spaces` | read | Liste mit Pagination. Input: optional `customer_id`/`search`. Felder: `id`, `name`, `created_at`, `floor_count`, `address`. |
| `matterport_get_space` | read | Details inkl. Visibility, Sharing-State. |
| `matterport_link_space_to_tour` | write+confirm | Setzt `matterport_space_id` und `canonical_matterport_space_id` auf einer existierenden Tour. Input: `tour_id`, `matterport_space_id`. Validiert, dass beide existieren. |
| `matterport_unlink_space_from_tour` | write+confirm | Entfernt Verknüpfung (NULL setzen). |
| `matterport_set_space_visibility` | write+confirm | Public/Unlisted/Private umschalten. |

**Wichtig:** Die DB-Schreibaktionen gehen über bestehende Repos in `app/src/lib/repos/...` — NICHT direkt in den Code von `(admin)/orders/[id]/verknuepfungen/actions.ts` greifen, sondern eine kleine `linkMatterportSpaceToTour(tourId, spaceId)`-Funktion in einem Repo isolieren und sowohl der bestehende Server-Action als auch das neue Tool nutzen sie.

---

## 3. Microsoft Teams

**Use-cases:** Channel-Nachricht posten, Direktnachricht (Chat) senden, Meeting erstellen.

**Bestehender Code zum Wiederverwenden:**
- `app/src/lib/auth/microsoft-graph-*` (siehe Email-Tool — bereits Microsoft-Graph-Token-Setup)
- Die Azure-App benötigt zusätzliche Permissions: `Chat.ReadWrite`, `ChannelMessage.Send`, `OnlineMeetings.ReadWrite` — **vor dem Deployment im Azure-Portal aktivieren und Admin-Consent geben**, das ist Voraussetzung.

**Env-Variablen:** Bereits vorhanden — `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

**Tools:**
| Name | Kind | Beschreibung |
|---|---|---|
| `teams_list_channels` | read | Listet Channels eines Teams. Input: `team_id` oder `team_name`. |
| `teams_send_channel_message` | write+confirm | `POST /teams/{team-id}/channels/{channel-id}/messages`. Input: `team_id`, `channel_id`, `body_html`, optional `mention_user_emails[]`. |
| `teams_send_chat_message` | write+confirm | `POST /chats/{chat-id}/messages` ODER neuen 1:1-Chat anlegen. Input: `to_email`, `body_html`. |
| `teams_create_meeting` | write+confirm | `POST /me/onlineMeetings`. Input: `subject`, `start`, `end`, `attendee_emails[]`. Output: `joinUrl`. |

**Tests:** Mocken des Graph-Clients über injizierten `fetch`/`graphClient`. Auf Permissions achten: Tool soll bei `403 Forbidden` eine klare Meldung zurückgeben, nicht crashen.

---

## 4. exxas (Plattform-Integration — API muss erst geklärt werden)

**Status:** Im Repo gibt es **keine Treffer** für „exxas". Bevor Code geschrieben wird:

**Bitte vom Auftraggeber holen:**
1. **Welcher Dienst?** EXXAS-Vermietungssoftware? Eigene Backoffice-Plattform? URL?
2. **API-Spezifikation:** OpenAPI/Swagger oder Endpoint-Liste mit Auth-Schema (API-Key, OAuth, Basic).
3. **Use-cases**: Was soll der Assistant tun (Listings sehen? Buchungen ändern? Reports ziehen?)
4. **Sandbox-Zugang** für Tests.

**Sobald vorhanden**, dasselbe Pattern wie Nextcloud anwenden:
- `app/src/lib/assistant/tools/exxas.ts`
- Lese-Tools ohne Bestätigung, Schreib-Tools mit `requiresConfirmation: true`
- Env: `EXXAS_BASE_URL`, `EXXAS_API_KEY` (in `.env.example` und `.env.vps.example` ergänzen)
- Tests: vitest mit gemocktem `fetch`

**Bis API geklärt: keinen Stub-Code committen, der sonst toten Pfad einführt.**

---

## 5. Admin-Tool — gezielte Schreib-Endpoints

**Use-cases (laut Auftrag „alle Rechte"):** Mitarbeiter anlegen/ändern, Produkte/Preise pflegen, App-Settings ändern, Cleanup-Selektionen markieren.

**Wichtig (Sicherheits-Argumentation, bitte 1:1 in PR-Beschreibung übernehmen):**
> Wir bauen **keinen Generic-DB-Write-Tool**. Stattdessen pro Use-case ein dediziertes Tool, das die **gleichen** Repos/Validierungen nutzt wie das UI. Das verhindert, dass der Assistant SQL ausführt, das die Geschäftsregeln umgeht (Rechnungen ändern, Preise rückwirkend, etc.).

**Tool-Liste (pro Use-case ein File ist okay; oder als `admin.ts` zusammen):**
| Name | Repo/Action | Bemerkung |
|---|---|---|
| `admin_create_employee` | `app/src/lib/repos/employees/...` | Felder gemäss `EmployeeModal.tsx`. |
| `admin_update_employee` | dito | Nur Felder, die UI auch erlaubt. |
| `admin_deactivate_employee` | dito | Soft-Delete (`active=false`), nie Hard-Delete. |
| `admin_create_product` | `app/src/lib/repos/products/...` | Validierung wie `ProductEditModal.tsx`. |
| `admin_update_product` | dito | |
| `admin_update_app_setting` | `app/src/lib/db.ts → booking.app_settings` | Whitelist erlaubter Keys, Werte typgeprüft. |
| `admin_mark_cleanup_selection` | `app/src/lib/repos/...` | Status setzen. |

**Nicht bauen:**
- Kein `admin_run_sql` (das gibt es bereits read-only via `query_database`).
- Kein `admin_delete_*` ausser explizit gefordert (Soft-Delete bevorzugen).
- Kein `admin_grant_permission` (Rollen werden über ein separates IAM-Tooling vergeben).

**Tests:** vitest mit gemockten Repos.

---

## 6. Direkter DB-Zugriff — Erweiterung des bestehenden Tools

**Bereits vorhanden:** `query_database` (`app/src/lib/assistant/tools/database.ts`) — read-only SELECT/WITH, max. 100 Zeilen, 5s Timeout, nur `super_admin`.

**Erweiterung (sofern wirklich gewünscht, sonst weglassen):**

| Name | Kind | Beschreibung |
|---|---|---|
| `describe_schema` | read | Listet Tabellen + Spalten eines Schemas. Input: `schema` (Default `booking`). Aus `information_schema.columns`. |
| `explain_query` | read | Führt `EXPLAIN (FORMAT JSON)` aus, gibt Plan zurück. Nur SELECT. |
| `query_database_write` | **write+confirm** | Führt EINE Schreib-Anweisung aus. **NUR** wenn der Auftraggeber das ausdrücklich bestätigt — sonst NICHT bauen. Falls gebaut: <ul><li>Whitelist-Schemas: `booking`, `tour_manager` (KEIN `auth`, `system`, `pg_*`).</li><li>Max. eine Statement (kein `;` außer am Ende).</li><li>Pflicht-Bestätigung mit Plain-Text-Vorschau der SQL.</li><li>Audit-Eintrag mit User-ID, SQL, Anzahl betroffener Zeilen.</li><li>Statement-Timeout 10s.</li><li>Hartes Limit: max. 1000 Zeilen affected (sonst rollback).</li></ul> |

**Empfehlung:** Vor `query_database_write` zuerst die spezifischen Admin-Tools aus Punkt 5 fertigstellen — die decken 90 % der realistischen Use-cases ab und sind sicherer.

---

## Akzeptanzkriterien (für alle PRs)

- [ ] Pro Integration ein eigener PR mit Branch `claude/assistant-<integration>` (z. B. `claude/assistant-nextcloud`).
- [ ] Tests grün: `npm --prefix app test`.
- [ ] Typecheck grün: `cd app && npx tsc --noEmit`.
- [ ] Lint grün: `npm --prefix app run lint`.
- [ ] Tools in `tools/index.ts` registriert.
- [ ] Schreib-Tools haben `requiresConfirmation: true` UND laufen erkennbar durch `writeAudit` (regex in `assistant/route.ts:187` muss matchen — Tool-Namen-Präfix `create_|update_|delete_|send_|<feste_liste>` ggf. erweitern).
- [ ] System-Prompt (`app/src/lib/assistant/system-prompt.ts`) um eine Zeile pro Integration ergänzt, die dem Modell erklärt, wann diese Tools sinnvoll sind.
- [ ] Neue Env-Variablen in `.env.example` UND `.env.vps.example` ergänzt.
- [ ] Falls eine Integration externe API-Permissions braucht (Teams!), in der PR-Beschreibung als „Action item für Ops" markiert.

## Reihenfolge / Priorität

1. **Nextcloud** (existierender Code, klare Use-cases)
2. **Matterport** (existierender Linking-Code)
3. **Admin-Tools** (pro Use-case, niedrigster Risikoanteil pro Tool)
4. **Teams** (braucht Azure-Permissions vorab)
5. **DB Read-Erweiterungen** (`describe_schema`, `explain_query`)
6. **exxas** (erst nach API-Klärung)
7. **`query_database_write`** (NUR auf explizite Anweisung)

## Out of scope

- Voice-Funktionen (Whisper-Pipeline existiert bereits separat).
- Multi-Account-Switching.
- UI-Änderungen am `(admin)/assistant`-Frontend.
