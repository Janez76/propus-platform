# Propus Platform — Vollständiges Datenbankschema

> **Automatisch mitpflegen:** Bei jeder Migration, neuem Feld oder neuem Schema-Element dieses Dokument aktualisieren. Cursor-Regel `.cursor/rules/data-fields.mdc` erinnert daran.

*Zuletzt aktualisiert: April 2026*

---

## Übersicht: Drei Schemas

| Schema | Zweck |
|---|---|
| `core` | Modulübergreifende Stammdaten (Kunden, Firmen, Auth, RBAC) |
| `booking` | Buchungstool (Aufträge, Fotografen, Produkte, Sessions) |
| `tour_manager` | Tour-Manager (Touren, Matterport, Verlängerungen, KI) |

Initialisiert via `core/migrations/000_init_schemas.sql`.

---

## 1. `core.*`-Tabellen

### `core.customers` — Kundenstamm (Single Source of Truth)

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `id` | SERIAL PK | | |
| `email` | TEXT | `''` | Primäre E-Mail (Unique-Index wenn nicht leer) |
| `email_aliases` | TEXT[] | `'{}'` | Aliase (GIN-Index) |
| `name` | TEXT | `''` | |
| `company` | TEXT | `''` | |
| `phone` | TEXT | `''` | |
| `phone_2` | TEXT | `''` | |
| `phone_mobile` | TEXT | `''` | |
| `phone_fax` | TEXT | `''` | |
| `website` | TEXT | `''` | |
| `onsite_name` | TEXT | `''` | Vor-Ort-Kontakt Name (Legacy) |
| `onsite_phone` | TEXT | `''` | Vor-Ort-Kontakt Tel (Legacy) |
| `street` | TEXT | `''` | |
| `zipcity` | TEXT | `''` | PLZ + Ort (Legacy) |
| `salutation` | TEXT | `''` | |
| `first_name` | TEXT | `''` | |
| `address_addon_1/2/3` | TEXT | `''` | |
| `po_box` | TEXT | `''` | |
| `zip` | TEXT | `''` | |
| `city` | TEXT | `''` | |
| `country` | TEXT | `'Schweiz'` | |
| `password_hash` | TEXT | NULL | Legacy-Passwort |
| `exxas_contact_id` | TEXT | NULL | Exxas-Legacy-Referenz |
| `exxas_customer_id` | TEXT | NULL | Exxas-Kunden-ID |
| `exxas_address_id` | TEXT | NULL | Exxas-Adress-ID |
| `auth_sub` | TEXT | NULL | Auth-Subject (SSO) |
| `blocked` | BOOLEAN | FALSE | |
| `notes` | TEXT | `''` | |
| `email_verified` | BOOLEAN | FALSE | |
| `is_admin` | BOOLEAN | FALSE | → `customer_admin` vs `customer_user` in RBAC |
| `nas_customer_folder_base` | TEXT | NULL | NAS-Unterordner für Kundenordner |
| `nas_raw_folder_base` | TEXT | NULL | NAS-Unterordner für Rohmaterial |
| `customer_number` | TEXT | NULL | Propus-Kundennummer (Unique wenn gesetzt) |
| `created_at` | TIMESTAMPTZ | NOW() | |
| `updated_at` | TIMESTAMPTZ | NOW() | |

**SQL-Funktion:** `core.customer_email_matches(check_email, cust_email, cust_aliases)` — prüft primary + aliases (IMMUTABLE). **Immer verwenden statt direktem E-Mail-Vergleich!**

---

### `core.customer_contacts` — Kontaktpersonen

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `customer_id` | INT FK → customers CASCADE | |
| `name` | TEXT | |
| `role` | TEXT | |
| `phone` | TEXT | |
| `email` | TEXT | |
| `sort_order` | INT | |
| `salutation` | TEXT | |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `phone_direct` | TEXT | |
| `phone_mobile` | TEXT | |
| `department` | TEXT | |
| `exxas_contact_id` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `core.companies` — B2B-Mandanten

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `name` | TEXT NOT NULL | |
| `slug` | TEXT UNIQUE NOT NULL | URL-sicherer Name |
| `billing_customer_id` | INT FK → customers SET NULL | Rechnungskunde |
| `standort` | TEXT | |
| `notiz` | TEXT | |
| `status` | TEXT DEFAULT `'aktiv'` | CHECK: `aktiv`, `ausstehend`, `inaktiv` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `core.company_members` — Firmen-Mitglieder

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `company_id` | INT FK → companies CASCADE | |
| `auth_subject` | TEXT | Auth-Subject (SSO) |
| `customer_id` | INT FK → customers SET NULL | |
| `email` | TEXT | |
| `role` | TEXT | CHECK: `company_owner`, `company_admin`, `company_employee` |
| `status` | TEXT DEFAULT `'active'` | CHECK: `invited`, `active`, `disabled` |
| `is_primary_contact` | BOOLEAN DEFAULT FALSE | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `core.company_invitations` — Einladungen

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `company_id` | INT FK → companies CASCADE | |
| `email` | TEXT NOT NULL | |
| `role` | TEXT | CHECK: `company_owner`, `company_admin`, `company_employee` |
| `token` | TEXT UNIQUE | |
| `expires_at` | TIMESTAMPTZ | |
| `accepted_at` | TIMESTAMPTZ | NULL |
| `invited_by` | TEXT | |
| `given_name` / `family_name` / `login_name` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

---

### `core.admin_users` — Admin-Benutzer (konsolidiert)

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `email` | TEXT NOT NULL UNIQUE | |
| `username` | TEXT UNIQUE | |
| `full_name` | TEXT | |
| `logto_user_id` | TEXT UNIQUE | Legacy Auth-Subject (historisch) |
| `password_hash` | TEXT | Legacy |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `roles` | TEXT[] DEFAULT `ARRAY['admin']` | z.B. `['super_admin']`, `['admin']`, `['photographer']` |
| `module_access` | TEXT DEFAULT `'booking'` | `booking`, `tour_manager`, `both` |
| `phone` | TEXT | |
| `language` | TEXT DEFAULT `'de'` | |
| `profile_photo_url` | TEXT | |
| `profile_photo_version` | BIGINT DEFAULT 0 | |
| `last_login_at` | TIMESTAMPTZ | |
| `invited_by` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Kompatibilitäts-Views (seit Migration 040, April 2026):**
- `booking.admin_users` — VIEW mit INSTEAD-OF-Triggern (`INSERT`/`UPDATE`/`DELETE` schreiben auf `core.admin_users` zurück). Exponiert Legacy-Spaltennamen (`name` ← `full_name`, `role` ← `roles[1]`, `active` ← `is_active`). Filter: `module_access IN ('booking','both')`.
- `tour_manager.admin_users` — VIEW mit INSTEAD-OF-Triggern. Filter: `module_access IN ('tour_manager','both')`.
- Die alten Read-Only-Views `booking.v_admin_users` / `tour_manager.v_admin_users` (aus Migration 018) wurden gelöscht.

**Trigger-Funktionen (Migration 040):**
- `core.booking_admin_users_insert()` / `…_update()` / `…_delete()` — INSTEAD-OF-Trigger auf `booking.admin_users`
- `core.tour_manager_admin_users_insert()` / `…_update()` / `…_delete()` — INSTEAD-OF-Trigger auf `tour_manager.admin_users`
- Bei DELETE eines Users mit `module_access = 'both'` wird nur der Modulzugang entzogen (→ Downgrade auf das andere Modul), nicht physisch gelöscht.

---

### `core.customer_sessions` — Legacy-Auth-Sessions

| Feld | Typ |
|---|---|
| `id` | SERIAL PK |
| `customer_id` | INT FK CASCADE |
| `token_hash` | TEXT UNIQUE |
| `expires_at` | TIMESTAMPTZ |
| `created_at` | TIMESTAMPTZ |

---

### `core.sessions` — Zentrale Express-Sessions

| Feld | Typ | Beschreibung |
|---|---|---|
| `sid` | TEXT PK | Session-ID |
| `kind` | TEXT | `booking_admin`, `tour_admin`, `tour_portal` |
| `sess` | JSONB | Session-Daten |
| `expire` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

---

### `core.customer_email_verifications` & `core.customer_password_resets`

| Feld | Typ |
|---|---|
| `id` | SERIAL PK |
| `customer_id` | INT FK CASCADE |
| `token_hash` | TEXT UNIQUE |
| `expires_at` | TIMESTAMPTZ |
| `created_at` | TIMESTAMPTZ |

---

### `core.booking_sessions` & `core.tours_sessions` — Express-Session-Stores

Connect-pg-simple-kompatible Session-Stores für die zwei Express-Apps. Der
Platform-Container nutzt `core.booking_sessions`; das Legacy Tours-Backend
nutzt `core.tours_sessions`. Schema identisch, getrennt für Isolation.

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `sid` | TEXT PK | | Session-ID (Cookie-Wert) |
| `sess` | JSONB | | Serialisierter Session-Inhalt |
| `expire` | TIMESTAMPTZ | | Ablauf, wird vom GC abgeräumt |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOW() | |

Migration: `core/migrations/007_session_store.sql`

---

### `core.api_keys` — Langlebige API-Tokens

Langlebige, revozierbare API-Tokens fuer Integrationen, CI-Jobs und externe Tools. Der Token-Klartext wird dem User einmalig nach Erstellung angezeigt; in der DB liegt nur der SHA-256-Hash. Tokens vererben die Permissions des erstellenden Admin-Users (keine Custom-Scopes).

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `id` | BIGSERIAL PK | | |
| `label` | TEXT NOT NULL | | Freitext-Bezeichnung (max. 200 Zeichen, UI-Validierung) |
| `token_hash` | TEXT NOT NULL UNIQUE | | SHA-256-Hash des Klartext-Tokens (`ppk_live_…`) |
| `prefix` | TEXT NOT NULL | | Erste 12 Zeichen des Tokens (zur Anzeige im UI) |
| `created_by` | BIGINT FK → admin_users SET NULL | | Ersteller |
| `created_at` | TIMESTAMPTZ | NOW() | |
| `last_used_at` | TIMESTAMPTZ | NULL | Wird bei jeder Nutzung aktualisiert (fire-and-forget) |
| `expires_at` | TIMESTAMPTZ | NULL | Optional, aktuell nicht im UI gesetzt |
| `revoked_at` | TIMESTAMPTZ | NULL | Soft-Revoke (Zeitstempel statt DELETE) |

**Indizes:** `api_keys_token_hash_idx` (UNIQUE), `api_keys_active_idx` (Partial: `WHERE revoked_at IS NULL`)

Migration: `core/migrations/039_api_keys.sql`

---

## 2. `booking.*`-Tabellen

### `booking.orders` — Hauptbuchungstabelle

**Skalare Felder:**

| Feld | Typ | Beschreibung |
|---|---|---|
| `order_no` | INT PK | Auftragsnummer |
| `customer_id` | INT FK → core.customers | |
| `status` | TEXT | `pending`, `provisional`, `confirmed`, `completed`, `done`, `cancelled`, `paused`, `archived` |
| `address` | TEXT | Auftrittsadresse |
| `address_lat` / `address_lon` | NUMERIC | Geocoordinaten |
| `photographer_event_id` | TEXT | MS Graph Event-ID |
| `office_event_id` | TEXT | MS Graph Büro-Event-ID |
| `calendar_sync_status` | TEXT | `tentative`, `final`, `deleted`, `error` |
| `provisional_booked_at` | TIMESTAMPTZ | |
| `provisional_expires_at` | TIMESTAMPTZ | |
| `provisional_reminder_1_sent_at` | TIMESTAMPTZ | |
| `provisional_reminder_2_sent_at` | TIMESTAMPTZ | |
| `provisional_reminder_3_sent_at` | TIMESTAMPTZ | |
| `confirmation_token` | TEXT | |
| `confirmation_token_expires_at` | TIMESTAMPTZ | |
| `exxas_order_id` | TEXT | |
| `exxas_status` | TEXT | `not_sent`, `sent`, `error` |
| `exxas_error` | TEXT | |
| `created_by_member_id` | INT FK → core.company_members ON DELETE SET NULL | B2B: welches Company-Member die Buchung angelegt hat (seit Migration 082 auf `core.company_members`) |
| `cancel_reason` | TEXT | |
| `closed_at` | TIMESTAMPTZ | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**JSONB-Felder:**

| Feld | Struktur |
|---|---|
| `object` | `{ type, area, floors, rooms, desc, specials, onsiteName, onsitePhone, onsiteEmail }` |
| `services` | `{ package: { code, label, price }, addons: [{ code, label, price, qty }] }` |
| `photographer` | `{ key, name, email, phone, phone_mobile, whatsapp, initials, max_radius_km }` |
| `schedule` | `{ date, time, duration_minutes }` |
| `billing` | Primär + `alt_*`-Felder (s. [FLOWS_BOOKING.md](./FLOWS_BOOKING.md)) |
| `pricing` | `{ total, net, vat, vat_rate, travel, items, discount_amount, rounding_step }` |
| `settings_snapshot` | Snapshot der `app_settings` zur Buchungszeit |
| `discount` | `{ code, type, amount, discount_code_id }` |
| `key_pickup` | `{ address, info }` |
| `onsite_contacts` | JSONB-Spalte: `[{ name, phone, email }]` (Migration 056) |

---

### `booking.photographers`

| Feld | Typ |
|---|---|
| `id` | SERIAL PK |
| `key` | TEXT UNIQUE |
| `name` | TEXT |
| `email` | TEXT |
| `phone` / `phone_mobile` / `whatsapp` | TEXT |
| `initials` | TEXT |
| `is_admin` | BOOLEAN |
| `active` / `bookable` | BOOLEAN |
| `photo_url` | TEXT |

---

### `booking.products`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `code` | TEXT UNIQUE | |
| `name` | TEXT | |
| `kind` | TEXT | `package` oder `addon` |
| `group_key` | TEXT | |
| `category_key` | TEXT | |
| `description` | TEXT | |
| `affects_travel` | BOOLEAN | |
| `affects_duration` | BOOLEAN | |
| `duration_minutes` | INT | |
| `skill_key` | TEXT | |
| `required_skills` | JSONB | |
| `active` | BOOLEAN | |
| `sort_order` | INT | |

---

### `booking.discount_codes`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `code` | TEXT UNIQUE | |
| `type` | TEXT | `percent` oder `fixed` |
| `amount` | NUMERIC(10,2) | |
| `active` | BOOLEAN DEFAULT TRUE | |
| `valid_from` / `valid_to` | DATE | |
| `max_uses` | INT | |
| `uses_count` | INT | |
| `uses_per_customer` | INT | |
| `conditions_json` | JSONB | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `booking.discount_code_usages`

| Feld | Typ |
|---|---|
| `id` | BIGSERIAL PK |
| `discount_code_id` | BIGINT FK |
| `customer_email` | TEXT |
| `order_id` | INT FK → orders |
| `used_at` | TIMESTAMPTZ |

---

### `booking.app_settings`

| Feld | Typ | Beschreibung |
|---|---|---|
| `key` | TEXT PK | Einstellungs-Key |
| `value_json` | JSONB | |
| `updated_at` | TIMESTAMPTZ | |

Wichtige Keys: `enable_confirmation_mails`, `enable_calendar_sync`, `calendar_provider`, `enable_reminder_mails`, `booking_open`, `booking_requires_login`, `vat_rate`, `travel_base_fee`, u.v.m.

---

### `booking.order_status_audit` — Status-Protokoll

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `order_no` | BIGINT FK | |
| `from_status` | TEXT | |
| `to_status` | TEXT | |
| `source` | TEXT | `api`, `expiry_job`, `confirmation_job`, `manual` |
| `actor_id` | TEXT | |
| `calendar_result` | TEXT | `ok`, `skipped`, `error`, `partial`, `not_required` |
| `error_message` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

---

### `booking.order_messages` & `booking.order_chat_messages`

**order_messages** (intern):

| Feld | Typ |
|---|---|
| `id` | SERIAL PK |
| `order_no` | INT FK |
| `sender_role` | TEXT |
| `sender_name` | TEXT |
| `recipient_roles` | JSONB |
| `message` | TEXT |
| `created_at` | TIMESTAMPTZ |

**order_chat_messages** (Kunde ↔ Fotograf):

| Feld | Typ |
|---|---|
| `id` | SERIAL PK |
| `order_no` | INT FK |
| `sender_role` | TEXT |
| `sender_id` | TEXT |
| `sender_name` | TEXT |
| `message` | TEXT |
| `read_at` | TIMESTAMPTZ |
| `created_at` | TIMESTAMPTZ |

---

### `booking.auth_audit_log` & `booking.employee_activity_log`

**auth_audit_log:**

| Feld | Typ |
|---|---|
| `id` | BIGSERIAL PK |
| `actor_id` | TEXT |
| `actor_role` | TEXT |
| `action` | TEXT |
| `target_type` | TEXT |
| `target_id` | TEXT |
| `details` | JSONB |
| `ip_address` | TEXT |
| `created_at` | TIMESTAMPTZ |

**employee_activity_log:**

| Feld | Typ |
|---|---|
| `id` | BIGSERIAL PK |
| `employee_key` | TEXT |
| `action` | TEXT |
| `details` | JSONB |
| `performed_by` | TEXT |
| `created_at` | TIMESTAMPTZ |

---

### `booking.photographer_settings` — Fotograf-Konfiguration

Einstellungen pro Fotograf (Verfügbarkeit, Skills, Heimadresse, Login).
Getrennt von `booking.photographers`, damit Stammdaten und Konfiguration
unabhängig versionierbar sind.

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `photographer_key` | TEXT PK FK CASCADE | | → `booking.photographers(key)` |
| `home_address` / `home_lat` / `home_lon` | TEXT / FLOAT | `''` / NULL | Startpunkt für Reisezeitberechnung |
| `max_radius_km` | INTEGER | NULL | Optionaler Reise-Radius |
| `skills` | JSONB | `'{}'` | Tag-Map: `{drone: true, …}` |
| `blocked_dates` | JSONB | `'[]'` | Gesperrte Daten (Urlaub etc.) |
| `depart_times` | JSONB | `'{}'` | Abfahrtszeiten pro Wochentag |
| `work_start` / `work_end` / `workdays` / `work_hours_by_day` | TEXT/JSONB | NULL | Arbeitszeiten |
| `buffer_minutes` / `slot_minutes` | INTEGER | NULL | Slot-Generator-Parameter |
| `national_holidays` | BOOLEAN | TRUE | Schweizer Feiertage berücksichtigen |
| `languages` / `native_language` | JSONB / TEXT | `'[]'` / `'de'` | |
| `event_color` | TEXT | `'#3b82f6'` | Kalender-Anzeigefarbe |
| `password_hash` | TEXT | NULL | Lokales Passwort (lokal oder SSO) |
| `earliest_departure` | TEXT | NULL | Globale Untergrenze, z. B. `'07:00'` |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOW() | |

---

### `booking.service_categories` — Produkt-Kategorien

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `key` | TEXT PK | | Stable-ID (z. B. `'photo_basic'`) |
| `name` / `description` | TEXT | | Anzeige-Texte |
| `kind_scope` | TEXT CHECK | `'addon'` | `'package'` / `'addon'` / `'both'` |
| `sort_order` | INTEGER | 0 | Anzeige-Reihenfolge im Wizard |
| `active` | BOOLEAN | TRUE | |
| `show_in_frontpanel` | BOOLEAN | FALSE | Auf öffentlicher Buchungsseite zeigen |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOW() | |

---

### `booking.pricing_rules` — Dynamische Preisformeln

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `id` | BIGSERIAL PK | | |
| `product_id` | BIGINT FK CASCADE | | → `booking.products(id)` |
| `rule_type` | TEXT CHECK | | `'fixed'`/`'per_floor'`/`'per_room'`/`'area_tier'`/`'conditional'` |
| `config_json` | JSONB | `'{}'` | Regel-spezifische Parameter |
| `priority` | INTEGER | 100 | Niedriger = früher angewendet |
| `valid_from` / `valid_to` | DATE | NULL | Optionaler Gültigkeitszeitraum |
| `active` | BOOLEAN | TRUE | |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOW() | |

---

### `booking.email_templates`, `booking.email_template_history`, `booking.email_send_log`

E-Mail-Vorlagen mit Audit-Trail und Idempotenz-Log. → Vollständige Beschreibung:
[EMAIL_TEMPLATES.md](./EMAIL_TEMPLATES.md)

**`booking.email_templates`** — aktuelle Vorlagen.

| Feld | Typ | Default |
|---|---|---|
| `id` | SERIAL PK | |
| `key` | TEXT UNIQUE | |
| `label` / `subject` / `body_html` / `body_text` | TEXT | `''` |
| `placeholders` | JSONB | `'[]'` |
| `active` | BOOLEAN | TRUE |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOW() |

**`booking.email_template_history`** — jede Änderung als unveränderbare Zeile.

| Feld | Typ |
|---|---|
| `id` | BIGSERIAL PK |
| `template_id` | INT FK CASCADE |
| `template_key` / `subject` / `body_html` / `body_text` | TEXT |
| `changed_by` | TEXT (default `'system'`) |
| `changed_at` | TIMESTAMPTZ NOW() |

**`booking.email_send_log`** — verhindert Doppel-Versand pro `idempotency_key`.

| Feld | Typ |
|---|---|
| `id` | BIGSERIAL PK |
| `idempotency_key` | TEXT UNIQUE |
| `order_no` | INT (nullable) |
| `template_key` | TEXT |
| `recipient` | TEXT |
| `sent_at` | TIMESTAMPTZ NOW() |

---

### `booking.email_workflow_config` — Status → E-Mail-Mapping

Steuert, welche Vorlage bei welchem Status-Übergang an welche Rolle (customer /
photographer / office) verschickt wird.

| Feld | Typ | Default |
|---|---|---|
| `id` | SERIAL PK | |
| `status_to` | VARCHAR(32) | |
| `template_key` | VARCHAR(64) | |
| `role` | VARCHAR(32) | |
| `active` | BOOLEAN | TRUE |
| `updated_at` | TIMESTAMPTZ | NOW() |

UNIQUE `(status_to, template_key, role)`.

---

### `booking.calendar_templates` — Kalender-Event-Vorlagen

Body/Subject für die Google-/iCal-Events der Termine.

| Feld | Typ | Default |
|---|---|---|
| `id` | SERIAL PK | |
| `key` | TEXT UNIQUE | |
| `label` / `subject` / `body` | TEXT | `''` |
| `active` | BOOLEAN | TRUE |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOW() |

---

### `booking.calendar_delete_queue` — Async-Lösch-Worker

Termine, deren zugehörige Kalendereinträge noch beim Provider entfernt werden
müssen. Wird vom Cron-Worker abgearbeitet.

| Feld | Typ | Default |
|---|---|---|
| `id` | SERIAL PK | |
| `order_no` | INTEGER | |
| `event_type` | TEXT CHECK | `'photographer'` oder `'office'` |
| `event_id` | TEXT | (Provider-ID) |
| `user_email` | TEXT | (auf wessen Kalender) |
| `attempts` | INTEGER | 0 |
| `last_error` | TEXT | NULL |
| `next_retry_at` | TIMESTAMPTZ | NOW() |
| `done_at` | TIMESTAMPTZ | NULL (gesetzt → fertig) |
| `created_at` | TIMESTAMPTZ | NOW() |

---

### `booking.order_reviews` — Kundenbewertungen

Magic-Link-Reviews per `token`; pro Order genau ein Eintrag möglich.

| Feld | Typ |
|---|---|
| `id` | SERIAL PK |
| `order_no` | INT FK CASCADE |
| `token` | TEXT UNIQUE |
| `rating` | INT CHECK 1..5 |
| `comment` | TEXT |
| `submitted_at` | TIMESTAMPTZ (NULL = Link nicht eingelöst) |
| `created_at` | TIMESTAMPTZ NOW() |

---

### `booking.order_folder_links`, `booking.upload_batches`, `booking.upload_batch_files`

NAS-Upload-Workflow (Roh-/Kunden-Material). → Vollständige Beschreibung:
[FLOWS_UPLOAD.md](./FLOWS_UPLOAD.md)

Kurzform für Diff/Lookup:

**`booking.order_folder_links`** — registrierte Order-Folders auf dem NAS.
`order_no FK CASCADE`, `folder_type ∈ ('raw_material','customer_folder')`,
`status ∈ ('pending','ready','linked','archived','failed')`, plus Pfade,
Display-Name, Firma, Fehlermeldung, Timestamps inkl. `archived_at`.

**`booking.upload_batches`** — geplante / laufende Übertragungen ans NAS.
`id TEXT PK`, `order_no FK CASCADE`, `upload_mode ∈ ('existing','new_batch')`,
`status ∈ ('staged','transferring','completed','failed','retrying','cancelled')`,
plus Pfade, Kategorie, Datei-Statistiken, Timestamps, Conflict-Mode,
Multi-Part-Felder (`upload_group_*`).

**`booking.upload_batch_files`** — einzelne Dateien pro Batch mit Hash,
`status ∈ ('staged','stored','skipped_duplicate','skipped_invalid_type','failed')`
und Verweis auf Duplikate.

---

### `booking.bug_reports` — Frontend-Bug-Reports

Inline-Formular im Admin-Frontend, Screenshot landet als BYTEA.

| Feld | Typ | Default |
|---|---|---|
| `id` | SERIAL PK | |
| `name` | TEXT | |
| `text` | TEXT | |
| `page` | TEXT | NULL |
| `file_name` / `file_mime` | TEXT | NULL |
| `file_data` | BYTEA | NULL |
| `status` | TEXT | `'new'` |
| `created_at` | TIMESTAMPTZ | NOW() |

---

### `booking.gbp_oauth_tokens` — Google-Business-Profile-Auth

Single-Row-Tabelle (CHECK `id = 1`) für die OAuth-Tokens des GBP-Admin-Panels.

| Feld | Typ | Default |
|---|---|---|
| `id` | INT PK CHECK = 1 | 1 |
| `access_token` / `refresh_token` | TEXT | |
| `expires_at` | TIMESTAMPTZ | |
| `account_id` / `location_id` | TEXT | NULL (nach erstem Login befüllt) |
| `updated_at` | TIMESTAMPTZ | NOW() |

---

### ~~`booking.companies`, `booking.company_members`, `booking.company_invitations`~~ — entfernt

**Seit Migration 082 (April 2026) gelöscht.** Die Daten wurden per
`booking/migrations/082_companies_legacy_dedup.sql` in die `core.*`-Pendants
gemergt (ON CONFLICT via slug/natural-keys) und die Legacy-Tabellen gedroppt.

FK-Änderungen durch Migration 082:

| FK-Spalte | Alte Referenz | Neue Referenz |
|---|---|---|
| `booking.orders.created_by_member_id` | `booking.company_members(id)` | `core.company_members(id)` ON DELETE SET NULL |
| `booking.access_subjects.company_member_id` | `booking.company_members(id)` | `core.company_members(id)` ON DELETE CASCADE |

Kanonische Tabellen: [`core.companies`](#corecompanies--b2b-mandanten),
[`core.company_members`](#corecompanies--b2b-mandanten),
[`core.company_invitations`](#corecompanies--b2b-mandanten).

---

### `booking.admin_users` (VIEW), `booking.admin_sessions`, `booking.photographer_password_resets`

**Seit Migration 040 (April 2026):** `booking.admin_users` ist ein **VIEW** über
[`core.admin_users`](#coreadmin_users--admin-benutzer-konsolidiert) mit INSTEAD-OF-Triggern
für INSERT/UPDATE/DELETE. Die physische Tabelle heisst `core.admin_users`;
`booking.admin_users` exponiert die historischen Legacy-Spaltennamen (`name`, `role`, `active`)
und wirkt wie eine schreibbare Tabelle. FK `booking.access_subjects.admin_user_id` zeigt
auf `core.admin_users(id)`.

| Tabelle | Feld | Typ |
|---|---|---|
| `booking.admin_users` (VIEW) | `id` | BIGINT (aus `core.admin_users.id`) |
| | `username` | TEXT |
| | `email` / `name` | TEXT (`name` ← `core.full_name`) |
| | `role` | TEXT (`roles[1]`) |
| | `password_hash` | TEXT |
| | `active` | BOOLEAN (`core.is_active`) |
| | `created_at` / `updated_at` | TIMESTAMPTZ |
| `booking.admin_sessions` | `token_hash` | TEXT PK |
| | `role` / `user_key` / `user_name` | TEXT |
| | `expires_at` | TIMESTAMPTZ |
| | `created_at` | TIMESTAMPTZ NOW() |
| `booking.photographer_password_resets` | `token_hash` | TEXT PK |
| | `photographer_key` | TEXT FK CASCADE → `booking.photographer_settings` |
| | `expires_at` | TIMESTAMPTZ |
| | `created_at` | TIMESTAMPTZ NOW() |

---

### RBAC-Tabellen (in `booking.*`)

| Tabelle | Zweck |
|---|---|
| `booking.permission_definitions` | `permission_key PK, description, module_tag` |
| `booking.system_roles` | `role_key PK, label, description` |
| `booking.system_role_permissions` | `(role_key FK, permission_key FK)` |
| `booking.access_subjects` | Alle Akteure mit exactly-one-FK-Constraint (s. ROLES_PERMISSIONS.md) |
| `booking.access_subject_system_roles` | `(subject_id FK CASCADE, role_key FK CASCADE)` |
| `booking.permission_groups` | `id, name, scope_type, scope_company_id, scope_customer_id` |
| `booking.permission_group_permissions` | Gruppe → Permissions |
| `booking.permission_group_members` | Gruppe → Subjects |
| `booking.subject_permission_overrides` | Individuelle allow/deny-Overrides |

→ Vollständige Beschreibung: [ROLES_PERMISSIONS.md](./ROLES_PERMISSIONS.md)

---

## 3. `tour_manager.*`-Tabellen

### `tour_manager.tours` — Haupttabelle Touren

→ Vollständige Beschreibung: [FLOWS_TOURS.md](./FLOWS_TOURS.md#1-tourmanagertours--alle-felder)

---

### `tour_manager.renewal_invoices` — Verlängerungsrechnungen

→ Vollständige Beschreibung: [FLOWS_TOURS.md](./FLOWS_TOURS.md#4-verlängerungs-flow-portal)

---

### `tour_manager.exxas_invoices` — Exxas-Rechnungs-Sync

→ Vollständige Beschreibung: [FLOWS_EXXAS.md](./FLOWS_EXXAS.md#3-tabelle-exxas_invoices)

---

### `tour_manager.invoices_central_v` — View (Admin-Rechnungsübersicht)

**Migration:** `core/migrations/026_invoices_central_view.sql`

Read-only View: vereinheitlicht `renewal_invoices` und `exxas_invoices` für Reporting / zukünftige Abfragen. Die React-Seite `/admin/invoices` nutzt primär die JSON-API `GET /api/tours/admin/invoices-central` (Queries direkt auf die Basistabellen in `tours/lib/admin-phase3.js`).

| Spalte | Typ / Hinweis |
|---|---|
| `invoice_source` | `renewal` \| `exxas` |
| `id` | PK der jeweiligen Quelltabelle (nicht global eindeutig über beide Quellen) |
| `invoice_number` | Verlängerung: `invoice_number`; Exxas: `nummer` |
| `invoice_status` | Verlängerung: wie Tabelle; Exxas: bei `exxas_status = 'bz'` → `paid`, sonst Rohstatus |
| `invoice_kind` | Nur Verlängerung; Exxas: `NULL` |
| `amount_chf` | Verlängerung: `amount_chf`; Exxas: `preis_brutto` |
| `due_at` | Verlängerung: `due_at`; Exxas: `zahlungstermin` (als TIMESTAMPTZ) |
| `paid_at` | Verlängerung: `paid_at`; Exxas: nur bei `bz` gesetzt (aus `zahlungstermin`) |
| `tour_id` | FK zu `tours` (kann bei Exxas NULL sein) |
| `tour_object_label` | `COALESCE(object_label, bezeichnung)` |
| `tour_customer_name` | `COALESCE(customer_name, kunde_ref)` |
| `created_at` | Zeitstempel aus Quellzeile |

**Indexes (Migration 026):** u.a. `idx_renewal_invoices_status`, `idx_exxas_invoices_exxas_status`, `idx_exxas_invoices_zahlungstermin`.

---

### `tour_manager.assistant_*` — Propus Assistant

→ Vollständige Beschreibung: [FLOWS_ASSISTANT.md](./FLOWS_ASSISTANT.md)

**Migration:** `core/migrations/045_assistant_tables.sql`

| Tabelle | Wichtigste Felder |
|---|---|
| `assistant_conversations` | `id UUID PK`, `user_id`, `user_email`, `title`, `created_at`, `updated_at` |
| `assistant_messages` | `id UUID PK`, `conversation_id`, `role` (`user`, `assistant`, `tool`), `content JSONB`, `audio_url`, `created_at` |
| `assistant_tool_calls` | `id UUID PK`, `conversation_id`, `message_id`, `tool_name`, `input JSONB`, `output JSONB`, `status`, `error_message`, `duration_ms`, `created_at` |
| `assistant_audit_log` | `id UUID PK`, `user_id`, `conversation_id`, `action`, `payload JSONB`, `ip_address`, `user_agent`, `executed_at` |

**Migration 046:** `assistant_conversations` enthält zusätzlich `customer_id`, `booking_order_no`, `tour_id` für die Anzeige der letzten Chats mit Kunden-/Bestell-/Tour-Bezug.

---

### `tour_manager.bank_import_runs` & `tour_manager.bank_import_transactions`

→ Vollständige Beschreibung: [FLOWS_TOURS.md](./FLOWS_TOURS.md#6-bank-import)

---

### `tour_manager.incoming_emails`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | UUID PK | |
| `mailbox_upn` | TEXT | Postfach |
| `graph_message_id` | TEXT UNIQUE | MS-Graph-ID |
| `internet_message_id` | TEXT | RFC 2822 |
| `conversation_id` | TEXT | Thread-ID |
| `subject` | TEXT | |
| `from_email` | TEXT | |
| `from_name` | TEXT | |
| `received_at` / `sent_at` | TIMESTAMPTZ | |
| `body_preview` | TEXT | |
| `body_text` | TEXT | |
| `is_read` | BOOLEAN | |
| `matched_tour_id` | INT FK → tours | |
| `processing_status` | VARCHAR(20) | `new`, `matched`, `suggested`, `reviewed`, `ignored`, `error` |
| `raw_json` | JSONB | |
| `synced_at` / `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `tour_manager.outgoing_emails` — E-Mail-Log

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | UUID PK | |
| `tour_id` | INT FK → tours | |
| `mailbox_upn` | TEXT | Absender-Postfach |
| `graph_message_id` | TEXT UNIQUE | |
| `internet_message_id` | TEXT | |
| `conversation_id` | TEXT | |
| `recipient_email` | TEXT | |
| `subject` | TEXT | |
| `template_key` | TEXT | |
| `sent_at` | TIMESTAMPTZ | |
| `details_json` | JSONB | |
| `created_at` | TIMESTAMPTZ | |

---

### `tour_manager.ai_suggestions`

→ Vollständige Beschreibung: [FLOWS_TOURS.md](./FLOWS_TOURS.md#7-ki--ai-suggestions)

---

### `tour_manager.tickets`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `module` | TEXT DEFAULT `'tours'` | |
| `reference_id` | TEXT | |
| `reference_type` | TEXT DEFAULT `'tour'` | |
| `category` | TEXT DEFAULT `'sonstiges'` | |
| `subject` | TEXT | |
| `description` | TEXT | |
| `link_url` | TEXT | |
| `attachment_path` | TEXT | |
| `status` | TEXT DEFAULT `'open'` | |
| `priority` | TEXT DEFAULT `'normal'` | |
| `created_by` | TEXT | |
| `created_by_role` | TEXT DEFAULT `'admin'` | |
| `assigned_to` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `tour_manager.settings` — Key/Value-Store

| Key | Inhalt |
|---|---|
| `dashboard_widgets` | Sichtbare Dashboard-Widgets |
| `ai_prompt_settings` | `{ mailSystemPrompt: TEXT }` |
| `matterport_api_credentials` | `{ tokenId, tokenSecret }` |
| `automation_settings` | Cron-Konfiguration (s. FLOWS_TOURS.md) |
| `email_templates` | Alle Tour-Manager-E-Mail-Templates (s. EMAIL_TEMPLATES.md) |

---

### `tour_manager.portal_team_members`

→ Vollständige Beschreibung: [ROLES_PERMISSIONS.md](./ROLES_PERMISSIONS.md#portal-rollen)

---

### `tour_manager.portal_staff_roles`

| Feld | Typ |
|---|---|
| `email_norm` | TEXT (PK Teil) |
| `role` | TEXT DEFAULT `'tour_manager'` |
| `created_at` | TIMESTAMPTZ |
| `created_by` | TEXT NULL |

---

### `tour_manager.portal_tour_assignees`

| Feld | Typ |
|---|---|
| `tour_id` | INT PK FK → tours |
| `assignee_email` | TEXT |
| `workspace_owner_email` | TEXT |
| `customer_id` | BIGINT FK → core.customers |
| `updated_by` | TEXT NULL |
| `updated_at` | TIMESTAMPTZ |

---

### `tour_manager.user_profile_settings`

| Feld | Typ |
|---|---|
| `realm` | TEXT (PK Teil), CHECK: `admin`, `portal` |
| `user_key` | TEXT (PK Teil) |
| `display_name` | TEXT |
| `organization_display` | TEXT |
| `profile_photo_mime` | TEXT |
| `profile_photo_data` | BYTEA |

---

### `tour_manager.galleries` — Listing / Kunden-Galerie (Magic-Link)

**Migrationen:** `core/migrations/028_listing_galleries.sql` (Basis), `031_gallery_links.sql` (Kunde/Kontakt/Bestellung), `032_gallery_nas_sources.sql` (NAS-Quelle, lokale Video-Pfade), `038_gallery_friendly_slug.sql` (leserlicher Slug).

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | UUID PK | |
| `slug` | TEXT UNIQUE | Öffentlicher Pfad-Slug (`/listing/:slug`) |
| `friendly_slug` | TEXT (038) | Leserlicher Slug im Format `<plz>-<ort>-<bestellnr>`, Unique-Index (partiell, WHERE NOT NULL). Wird bei `createGallery` / `updateGallery` automatisch generiert. Öffentliche Auflösung: `WHERE slug = $1 OR friendly_slug = $1`. |
| `title` | TEXT | Anzeigetitel |
| `address` | TEXT | Objektadresse |
| `client_name` | TEXT | Anzeige-Name Kunde |
| `client_contact` | TEXT | Ansprechpartner (Freitext, Migration 031) |
| `client_email` | TEXT | E-Mail für Versand / Magic-Link |
| `customer_id` | INT FK → `core.customers` ON DELETE SET NULL (031) | |
| `customer_contact_id` | INT FK → `core.customer_contacts` ON DELETE SET NULL (031) | |
| `booking_order_no` | INT FK → `booking.orders(order_no)` ON DELETE SET NULL (031) | |
| `client_delivery_status` | TEXT | `open`, `sent` |
| `client_delivery_sent_at` | TIMESTAMPTZ | |
| `client_log_email_received_at` | TIMESTAMPTZ | |
| `client_log_gallery_opened_at` | TIMESTAMPTZ | |
| `client_log_files_downloaded_at` | TIMESTAMPTZ | |
| `status` | TEXT | `active`, `inactive` |
| `matterport_input` | TEXT | URL oder Matterport-Modell-ID |
| `cloud_share_url` | TEXT | Propus-Cloud/Nextcloud-Freigabe (Share-Import) |
| `storage_source_type` | TEXT (032) | `share_link`, `order_folder`, `nas_browser` oder NULL |
| `storage_root_kind` | TEXT (032) | `customer`, `raw` — welcher Booking-Upload-Root |
| `storage_relative_path` | TEXT (032) | Relativer Pfad unter diesem Root (POSIX-Style) |
| `video_url` | TEXT | Öffentliche Video-URL (Share-Import / extern) |
| `video_source_type` | TEXT (032) | `url`, `nas_local` |
| `video_source_root_kind` | TEXT (032) | Bei `nas_local`: `customer` oder `raw` |
| `video_source_path` | TEXT (032) | Relativer Pfad zur MP4-Datei |
| `floor_plans_json` | TEXT | JSON-Array von Grundrissen (s. `gallery_images`) |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**`floor_plans_json` — Einträge:** Jedes Element ist ein Objekt mit mindestens `title`. Für Propus-Cloud-Import: `url` (öffentliche PDF-URL). Für NAS-Import: `source_type = 'nas_local'`, `source_root_kind`, `source_path` (ohne öffentliche URL in der DB).

---

### `tour_manager.gallery_images`

**Migrationen:** `028_listing_galleries.sql`, `032_gallery_nas_sources.sql`.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | UUID PK | |
| `gallery_id` | UUID FK → `galleries` CASCADE | |
| `sort_order` | INT | Reihenfolge |
| `enabled` | BOOLEAN | Sichtbarkeit in Kundengalerie |
| `category` | TEXT | optional |
| `file_name` | TEXT | Anzeige-/Dateiname |
| `remote_src` | TEXT | Öffentliche Bild-URL (Share-Link / Remote) |
| `source_type` | TEXT (032) | `remote_url`, `nas_local` |
| `source_root_kind` | TEXT (032) | Bei `nas_local`: `customer` oder `raw` |
| `source_path` | TEXT (032) | Relativer Pfad zur Bilddatei |
| `created_at` | TIMESTAMPTZ | |

---

### `tour_manager.gallery_feedback` — Kundenkommentare / Revisionen

**Migration:** `028_listing_galleries.sql`.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | UUID PK | |
| `gallery_id` | UUID FK → `galleries` CASCADE | |
| `gallery_slug` | TEXT | Denormalisiert |
| `asset_type` | TEXT | `image`, `floor_plan` |
| `asset_key` | TEXT | z. B. Bild-ID oder `floor_plan_N` |
| `asset_label` | TEXT | |
| `body` | TEXT | Kommentar |
| `author` | TEXT | `client`, `office` |
| `revision` | INT | |
| `resolved_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

---

### `tour_manager.actions_log` — Audit-Log Touren

Generischer Audit-Trail für alles, was an einer Tour passiert (Statuswechsel,
Mail-Versand, Cleanup-Trigger). Wird vom `actions`-Helper geschrieben.

| Feld | Typ | Default |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `tour_id` | INT FK CASCADE | NULL möglich (Aktion ohne Tour-Bezug) |
| `actor_type` / `actor_ref` | TEXT | Wer hat ausgelöst (`'admin'`, `'cron'`, `'customer'`…) |
| `action` | TEXT | Action-Key |
| `details_json` | JSONB | Optional zusätzlicher Kontext |
| `created_at` | TIMESTAMPTZ | NOW() |

---

### `tour_manager.admin_users` (VIEW), `tour_manager.admin_invites`, `tour_manager.admin_remember_tokens`

**Seit Migration 040 (April 2026):** Wie `booking.admin_users` ein VIEW über
[`core.admin_users`](#coreadmin_users--admin-benutzer-konsolidiert) mit
INSTEAD-OF-Triggern. Filter: `module_access IN ('tour_manager','both')`.

| Tabelle | Feld | Typ |
|---|---|---|
| `tour_manager.admin_users` (VIEW) | `id` | BIGINT (aus `core.admin_users.id`) |
| | `email` | TEXT |
| | `full_name` / `password_hash` | TEXT (nullable) |
| | `is_active` | BOOLEAN |
| | `invited_by` | TEXT (nullable) |
| | `created_at` / `updated_at` | TIMESTAMPTZ |
| | `last_login_at` | TIMESTAMPTZ (nullable) |
| `tour_manager.admin_invites` | `id` | BIGSERIAL PK |
| | `email` | TEXT |
| | `token_hash` | TEXT UNIQUE |
| | `invited_by` | TEXT (nullable) |
| | `created_at` / `expires_at` | TIMESTAMPTZ |
| | `accepted_at` / `revoked_at` | TIMESTAMPTZ (nullable) |
| `tour_manager.admin_remember_tokens` | `id` | BIGSERIAL PK |
| | `email` | TEXT |
| | `token_hash` | TEXT UNIQUE |
| | `created_at` / `expires_at` | TIMESTAMPTZ |
| | `revoked_at` | TIMESTAMPTZ (nullable) |

---

### `tour_manager.portal_users`, `tour_manager.portal_password_reset_tokens` — Kundenportal-Auth

Eigene Auth-Tabelle für das Tour-Manager-Portal (Tour-Owner). Kein Bezug zu
`core.customers` — historisch separater Login.

| Tabelle | Feld | Typ |
|---|---|---|
| `tour_manager.portal_users` | `email` | TEXT PK |
| | `full_name` / `password_hash` | TEXT (nullable) |
| | `is_active` | BOOLEAN (default TRUE) |
| | `last_login_at` | TIMESTAMPTZ (nullable) |
| | `created_at` / `updated_at` | TIMESTAMPTZ NOW() |
| `tour_manager.portal_password_reset_tokens` | `id` | BIGSERIAL PK |
| | `email` | TEXT |
| | `token_hash` | TEXT UNIQUE |
| | `expires_at` | TIMESTAMPTZ |
| | `used_at` | TIMESTAMPTZ (nullable) |
| | `created_at` | TIMESTAMPTZ NOW() |

---

### `tour_manager.portal_team_exclusions` — Negative Team-Mitgliedschaft

Ergänzt `portal_team_members` um Auschluss-Regeln (z. B. „Mitglied X soll bei
Owner Y NICHT in der Vorschlagsliste auftauchen").

| Feld | Typ | Default |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `owner_email` | TEXT | |
| `member_email` | TEXT | |
| `reason` | TEXT | NULL |
| `created_by` | TEXT | NULL |
| `created_at` | TIMESTAMPTZ | NOW() |

---

### `tour_manager.gallery_email_templates` — Vorlagen (Listing-E-Mails)

**Migration:** `028_listing_galleries.sql` — feste IDs `propus-listing-email-v1`, `propus-email-followup-v1`, `propus-email-revision-done-v1`.

---

## 4. Upload-Tabellen

→ Vollständige Beschreibung: [FLOWS_UPLOAD.md](./FLOWS_UPLOAD.md#2-tabellen)

---

## 5. Migration-Tracking

**`core.applied_migrations`** — Welche SQL-Migrations-Dateien wurden angewendet.

| Feld | Typ |
|---|---|
| `filename` | TEXT PK |
| `applied_at` | TIMESTAMPTZ |
