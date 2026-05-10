# Plan — Tour-Manager-Schema-Konsolidierung

> **Status:** Entwurfsdokument. Noch nicht freigegeben, kein Termin.
> **Zweck:** Roadmap fuer das langfristige Ziel, das `tour_manager`-Schema
> zu eliminieren und alle Funktionen ins `core` / `booking`-Schema zu ueberfuehren.
> **Trigger:** Aussage des Owners (Mai 2026): „Tour-Manager soll weg".

---

## Ist-Zustand (Mai 2026)

`tour_manager` ist **nicht tot**, sondern ein lebendes Schema mit ueber 197 aktiven
HTTP-Routen, 257 Frontend-Treffern in `app/src/`, regelmaessigen Commits und
mission-kritischen Subsystemen. Eine ungeplante „Loeschung" wuerde mehrere
zentrale Flows brechen. Der Plan unten beschreibt, in welcher Reihenfolge ein
Rueckbau realistisch ist.

---

## Subsystem-Inventar

| Subsystem | Hauptdateien | Tabellen / Views | Externe Abhaengigkeiten | Geschaetzter Aufwand |
|---|---|---|---|---|
| **Portal-Auth (Customer)** | `booking/portal-auth-bridge.js`, `tours/lib/portal-team.js`, `tours/lib/portal-auth.js` | `portal_users` (bcrypt), `portal_team_members`, `portal_staff_roles`, `portal_invitations` | bcryptjs, Cookie `customer_session` (geht ueber `core.customer_sessions`) | **2-3 Wochen** |
| **Tours / Listings / Galerien** | `tours/lib/gallery.js`, `tours/routes/gallery-admin-api.js`, `tours/routes/gallery-public-api.js`, `app/src/pages-legacy/tours/admin/*` | `tours`, `tour_assignments`, `tour_renewal_invoices`, `tour_actions`, `tour_action_log` | Matterport-API, NAS-Import, Mailer | **4-6 Wochen** |
| **Posteingang** | `tours/lib/posteingang-store.js`, `tours/lib/posteingang-sync.js`, `tours/routes/posteingang-admin-api.js`, `tours/routes/posteingang-webhook.js` | `posteingang_conversations`, `posteingang_messages`, `posteingang_message_attachments`, `posteingang_tasks`, `posteingang_tags`, `posteingang_graph_sync_state` | Microsoft Graph (Webhook + Delta-Sync), `office@propus.ch` Mailbox | **3-4 Wochen** |
| **Tickets** | `tours/lib/tickets.js`, `app/src/pages-legacy/tours/admin/AdminTicketsPage.tsx` | `tour_manager.tickets`, `tour_manager.ticket_attachments` | File-Uploads (`tours/uploads/tickets/`) | **1-2 Wochen** |
| **Zentrales Rechnungsmodul** | `tours/lib/admin-phase3.js`, `app/src/pages-legacy/admin/invoices/AdminInvoicesPage.tsx` | View `invoices_central_v` ueber `renewal_invoices` + `exxas_invoices` | bexio, Exxas-Mapping | **2-3 Wochen** |
| **Customer-Admin** | `tours/routes/admin-customers-api.js`, `tours/routes/admin-link-customer.js` | nutzt `portal_team_members` + `tours.customer_email` als Owner-Erkennung | `core.customers` (read), Email-Aliase | **1 Woche** |
| **Auto-Trigger Engine** | `tours/lib/posteingang-triggers.js` | Schreibt `posteingang_tasks`, liest `tours`, `renewal_invoices` | Cron `/api/tours/cron/posteingang-triggers` | **Woche** |
| **Assistant** | `tours/lib/admin-agent.js`, `app/src/lib/assistant/*` | `assistant_conversations`, `assistant_memories`, `assistant_*` | OpenAI/Anthropic | **bleibt in `tour_manager` oder eigenes `assistant`-Schema** |

**Summe:** grob 14-20 Wochen Engineering-Arbeit + Migration-Window. Das ist
kein Sprint, das ist ein Quartal.

---

## Strategische Entscheidung vor Beginn

**Frage 1:** Soll `tour_manager` wirklich komplett weg oder nur die
Customer-Auth-Tabellen, damit das Login-Modell sauber ist?

| Option | Was bedeutet das? | Aufwand |
|---|---|---|
| **A — Nur Auth migrieren** | `portal_users`, `portal_team_members`, `portal_invitations` → `core.*`. Rest bleibt in `tour_manager`. | 2-3 Wochen |
| **B — Komplett weg** | Alle Subsysteme oben migrieren, `tour_manager`-Schema droppen. | 14-20 Wochen |

> **Empfehlung:** Option A jetzt (klein, sauber, schliesst die Auth-Drift-Luecke,
> die jeden Tag teurer wird). Option B als Q3/Q4-Initiative wenn die Geschaefts-
> prioritaet das hergibt.

---

## Phasenplan

### Phase 0 — Absicherung (1 Woche)

- [ ] **DB-Backup-Strategie pruefen** (`scripts/diagnose-nas-*`, regelmaessige
      `pg_dump`s). Wenn nicht vorhanden, vor allem anderen einrichten.
- [ ] **Read-Only-Snapshot** der `tour_manager.portal_*`-Tabellen erstellen
      (CSV nach `analysis-portal-users-snapshot/`).
- [ ] **Inventar verifizieren**: alle Routes, die auf `portal_users` /
      `portal_team_members` schreiben, listen (CI-Guard, der neue Writes
      blockt).

### Phase 1 — Auth-Migration (Empfehlung als naechster Schritt)

**Ziel:** Customer-Login geht zu 100 % gegen `core.customers` /
`core.company_members`. `portal-auth-bridge.js` wird obsolete.

1. **Daten-Migration (idempotent, eigene Migration `065_*`):**
   - Fuer jede Zeile in `tour_manager.portal_users`:
     - Customer per Email in `core.customers` finden (via
       `core.customer_email_matches`).
     - Falls kein Treffer: ueberspringen + Report (manueller Reconcile).
     - Sonst: `password_hash` von bcrypt → scrypt **konvertieren ist nicht
       moeglich**. Stattdessen:
       - bcrypt-Hash in neue Spalte `core.customers.legacy_bcrypt_hash` schreiben.
       - Beim naechsten erfolgreichen Login transparent zu scrypt
         reshashen (Standard-Pattern).
   - Fuer jede Zeile in `tour_manager.portal_team_members`:
     - Eintrag in `core.company_members` anlegen, Rolle mappen
       (`inhaber` → `company_owner`, `admin` → `company_admin`,
       Rest → `company_employee`).
   - Fuer `portal_invitations` analog → `core.company_invitations`.
2. **Code-Migration:**
   - `verifyPortalCustomerPassword()` lernt `legacy_bcrypt_hash`-Fallback +
     Reshash-on-Login.
   - `getPortalCustomerRole()` wird zu `getCustomerRoleFromCoreMembers()`.
   - **Magic-Link** (bereits gebaut) braucht keine Aenderung — sitzt schon auf
     `core.customers`.
   - Ein Lauf von `npm run audit:portal-auth-drift` (neues Script) vergleicht
     `portal_team_members` vs. `company_members` auf Abweichungen.
3. **Cutover:**
   - Feature-Flag `PROPUS_AUTH_USE_CORE_ONLY=1` schaltet Lookup ausschliesslich
     auf `core.*` um (Standard: dual-read).
   - Nach 2 Wochen ohne Drift: Schreibpfade auf `tour_manager.portal_*`
     stilllegen (200er → Warnung in den Tabellen).
   - Nach weiteren 2 Wochen: Tabellen `RENAME TO _archived_*` (nicht droppen,
     fuer Forensik).
4. **Cleanup:**
   - `booking/portal-auth-bridge.js` loeschen.
   - `tours/lib/portal-team.js` und `tours/lib/portal-auth.js` ent-rufen.
   - Tests in `tours/test/` an `core.*` anpassen.

**Risiken Phase 1:**
- bcrypt → scrypt geht nur bei Login, nicht im Hintergrund. Kunden, die sich
  nicht einloggen, bleiben auf bcrypt → man kann die Tabelle nicht „am Tag X"
  abschalten ohne Login-Verlust.
- Domain-basierte Owner-Erkennung in `getPortalCustomerRole()` (Tour-Owner via
  `tours.customer_email`) muss in `core.company_members` als expliziter
  Eintrag landen — sonst verlieren Bestandskunden ihre `customer_admin`-Rolle.

### Phase 2 — Tickets ins `booking`- oder `core`-Schema (1-2 Wochen)

- Tabellen: `booking.tickets`, `booking.ticket_attachments`.
- API-Pfade `/api/admin/tickets/*` (parallel zu `/api/tours/admin/tickets/*`).
- Frontend duale Quelle, dann Cutover.

### Phase 3 — Zentrales Rechnungsmodul (2-3 Wochen)

- View `invoices_central_v` neu auf `booking.invoices` + `booking.exxas_invoices`
  bauen.
- Renewal-Logik aus `tours/lib/admin-phase3.js` extrahieren in
  `booking/lib/renewal-invoices.js`.

### Phase 4 — Posteingang (3-4 Wochen)

- Eigenes Schema `inbox` oder Eingliederung in `core.communications`.
- Microsoft-Graph-Webhook-URL bleibt stabil — interner Router umstellen.
- Auto-Trigger-Engine an neuen Schemata ausrichten.

### Phase 5 — Tours / Listings / Galerien (4-6 Wochen)

- Schwerstes Stueck: Geschaeftslogik (Matterport-Sync, NAS-Import, Renewals).
- Tabellen-Migration `tour_manager.tours` → `booking.tours` mit Verschluesselungs-
  korrektur (kanonische Felder beachten — siehe CLAUDE.md Regel 6).

### Phase 6 — `tour_manager`-Schema droppen

- Voraussetzung: 30 Tage ohne Read/Write auf `tour_manager.*` (Audit per pg_stat).
- Migration `099_drop_tour_manager_schema.sql` mit `DROP SCHEMA tour_manager CASCADE`
  hinter zwei Code-Reviewer-Approvals und manuellem Backup-Check.

---

## Welche Tests sichern den Umbau ab?

| Bereich | Bestehende Tests | Was zusaetzlich gebraucht wird |
|---|---|---|
| Auth | nur Smoke-Tests in `booking/tests/` | Drift-Test `portal_team_members` ↔ `company_members`, Reshash-Test |
| Customer-Lookup | `core.customer_email_matches` ist ueber `getCustomerByEmail` getestet | E2E-Test: Customer mit Alias loggt sich per Magic-Link ein |
| Posteingang | `tours/test/posteingang-*.test.js` | Migrations-Replay-Test auf Snapshot |
| Rechnungen | `tours/test/admin-actions-schema.test.js` | View-Aequivalenz-Test (alte vs. neue `invoices_central_v`) |

---

## Was bleibt unaendert

- **Magic-Link-Login** (gebaut Mai 2026, Migration 064): sitzt schon auf
  `core.customer_login_tokens` + `core.customer_sessions`. Keine Aenderung
  noetig, wenn Phase 1 kommt — er funktioniert vorher und nachher.
- **Cookie `customer_session`** und Cookie-Domain `.propus.ch`: stabil.
- **Frontend-Routen** im Portal: stabil. Aenderung nur bei API-Pfaden, die
  von `/api/tours/admin/*` auf `/api/admin/*` migrieren (Phase 2-5).

---

## Anti-Pattern (was nicht gemacht werden soll)

1. **Nicht „in einem grossen Sprint" alles auf einmal migrieren.** Phasen
   einzeln deployen, jede mit eigenem Cutover-Termin.
2. **Nicht parallele Schreibwege ohne Drift-Audit lassen.** Jede Phase, die
   dual-write hat, braucht einen Cron-Job, der Differenzen meldet.
3. **Nicht `tour_manager`-Schema droppen, bevor pg_stat 30 Tage sauber ist.**
   `DROP SCHEMA CASCADE` ist nicht reversibel ausser per Restore.
4. **Nicht Magic-Link warten lassen.** Der ist eigenstaendig deploybar und
   liefert sofort Wert (Phase 0 Voraussetzung ist nicht noetig dafuer).

---

## Naechster konkreter Schritt

Wenn der Owner Phase 1 starten will:
1. Termin fuer 2-3 Wochen Auth-Migration einplanen.
2. Backup-/Snapshot-Strategie aus Phase 0 einrichten.
3. Migration `065_portal_users_to_core.sql` als ersten PR aufsetzen
   (`CREATE FUNCTION` zur Migration, dry-run-faehig).
4. Audit-Skript `scripts/portal-auth-drift.js` schreiben (parallel).

Bis dahin: Magic-Link laeuft, Tour-Manager bleibt unangefasst.
