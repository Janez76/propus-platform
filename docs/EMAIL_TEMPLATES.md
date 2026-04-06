# Propus Platform — E-Mail-Templates

> **Automatisch mitpflegen:** Bei neuen E-Mail-Templates, geänderten Platzhaltern, neuem Mail-Transport oder neuen Auslösern dieses Dokument aktualisieren.

*Zuletzt aktualisiert: April 2026*

---

## Inhaltsverzeichnis

1. [Mail-Transport](#1-mail-transport)
2. [Booking-Modul: Direkte Template-Builder](#2-booking-modul-direkte-template-builder)
3. [Tour-Manager: DB-basierte Templates](#3-tour-manager-db-basierte-templates)
4. [E-Mail-Logging](#4-e-mail-logging)

---

## 1. Mail-Transport

### Booking-Modul (`sendMailWithFallback`)

| Transport | Konfiguration | Fallback |
|---|---|---|
| MS Graph (primär) | `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET` | SMTP |
| SMTP (Fallback) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | — |

Steuerung via `PREFER_GRAPH=true/false`.

### Tour-Manager (`sendMailDirect` / `sendArchiveNoticeEmail`)

| Transport | Konfiguration |
|---|---|
| MS Graph | `M365_TENANT_ID/CLIENT_ID/CLIENT_SECRET` |
| SMTP-Fallback | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |

---

## 2. Booking-Modul: Direkte Template-Builder

**Datei:** `booking/templates/emails.js`  
**Sprachen:** `de`, `en`, `fr`, `it`, `sr` (Fallback: `de`)  
**Rückgabe:** `{ subject, html, text }`

---

### Buchungsbestätigung Kunde

**Funktion:** `buildCustomerEmail(data, lang)`

| Parameter | Typ | Beschreibung |
|---|---|---|
| `data.orderNo` | string | Auftragsnummer |
| `data.date` / `data.time` | string | Termin |
| `data.address` | string | Auftragsadresse |
| `data.billing` | object | Rechnungsdaten (name, company, etc.) |
| `data.serviceListWithPrice` | string | Leistungsliste mit Preisen (HTML) |
| `data.pricing` | object | Preisübersicht |
| `data.photographerName/Email/Phone/Mobile/WhatsApp` | string | Fotografen-Kontaktdaten |
| `data.onsiteContacts[]` | array | Vor-Ort-Kontakte |
| `data.keyPickup` | object | Schlüsselabholung |
| `data.icsUrl` | string | Kalender-ICS-Download-Link |
| `data.portalMagicLink` | string | Magic-Link für Portal-Zugang |
| `data.isProvisional` | boolean | Provisorische Buchung? |

**Auslöser:** Jede neue Buchung (online oder manuell)

---

### Neue Buchung Fotograf

**Funktion:** `buildPhotographerEmail(data, lang)`

| Parameter | Typ | Beschreibung |
|---|---|---|
| `data.orderNo` | string | |
| `data.date` / `data.time` | string | |
| `data.address` | string | |
| `data.objectInfo` | string | Gebäudeart, Fläche, Zimmer, Etagen |
| `data.objectType/Area/Rooms/Floors` | string/number | |
| `data.serviceListNoPrice` | string | Leistungsliste ohne Preise |
| `data.billing` | object | |
| `data.onsiteContacts[]` | array | |
| `data.keyPickup` | object | |

**Auslöser:** Jede neue Buchung

---

### Eingangsbestätigung Büro

**Funktion:** `buildOfficeEmail(data, lang)`

Wie `buildCustomerEmail`, zusätzlich:
- `data.billing.alt_*` — abweichende Rechnungsadresse
- `data.isProvisional` — provisorische Buchung

**Auslöser:** Jede neue Buchung

---

### Storno-E-Mails

| Funktion | Empfänger |
|---|---|
| `buildCancellationOfficeEmail(order, photogPhone, lang)` | Büro |
| `buildCancellationPhotographerEmail(order, lang)` | Fotograf |
| `buildCancellationCustomerEmail(order, photogPhone, lang)` | Kunde |

**Gemeinsame Parameter:** `order.orderNo`, `order.schedule.date/time`, `order.address`, `order.object.type/area`, `order.photographer`, `order.billing`, `photogPhone`

**Auslöser:** Status-Wechsel auf `cancelled`

---

### Terminverschiebungs-E-Mails (Reschedule)

| Funktion | Empfänger |
|---|---|
| `buildRescheduleOfficeEmail(order, oldDate, oldTime, newDate, newTime, photogPhone, lang)` | Büro |
| `buildReschedulePhotographerEmail(order, oldDate, oldTime, newDate, newTime, lang)` | Fotograf |
| `buildRescheduleCustomerEmail(order, oldDate, oldTime, newDate, newTime, photogPhone, lang)` | Kunde |

**Auslöser:** Terminverschiebung (Reschedule-API)

---

### Fotograf-Wechsel (Reassign)

| Funktion | Empfänger |
|---|---|
| `buildReassignOfficeEmail(order, oldPhotog, newPhotog, lang)` | Büro |
| `buildReassignPhotographerEmail(order, role, otherPhotog, lang)` | Alter/Neuer Fotograf (`role='old'`/`'new'`) |
| `buildReassignCustomerEmail(order, newPhotog, lang)` | Kunde |

**Auslöser:** Fotograf-Wechsel (Reassign-API)

---

### Admin-Benutzer-E-Mails

| Funktion | Parameter | Auslöser |
|---|---|---|
| `buildWelcomeEmail({name, adminUrl}, lang)` | | Neuer Admin via Logto |
| `buildCredentialsEmail({name, key, email, tempPw, adminUrl, resetUrl}, lang)` | `tempPw` optional | Admin-Zugangsdaten erstellt |
| `buildResetPasswordEmail({name, resetUrl}, lang)` | | Passwort-Reset-Anfrage |

---

## 3. Tour-Manager: DB-basierte Templates

**Speicherort:** `tour_manager.settings` Key `email_templates` als JSONB  
**Struktur:** `{ [key]: { name, description, category, subject, html, text } }`  
**Bearbeitbar:** Im Admin-UI (Template-Editor)

**Kategorien:** `aktiv` (aktiv verschickt), `vorbereitet`, `intern`

---

### Template-Übersicht

| Template-Key | Name | Auslöser | Kategorie |
|---|---|---|---|
| `renewal_request` | Verlängerungs-Anfrage | Cron Stufe 1+2 (30 / 10 Tage) | aktiv |
| `renewal_request_final` | Letzte Reminder | Cron Stufe 3 (ca. 3 Tage) | aktiv |
| `tour_confirmation_request` | Tour-Bestätigung | Bereinigungslauf (geplant) | vorbereitet |
| `payment_confirmed` | Zahlungsbestätigung | Payrexx-Webhook `confirmed` | aktiv |
| `extension_confirmed` | Verlängerung bestätigt | Manuelle Verlängerungsbestätigung | aktiv |
| `reactivation_confirmed` | Reaktivierung bestätigt | Zahlung für archivierte Tour | aktiv |
| `archive_notice` | Archivierungs-Mitteilung | Tour archiviert | aktiv |
| `expiry_reminder` | Ablauf-Erinnerung | Kurzfristig vor Ablauf | aktiv |
| `portal_invoice_sent` | Rechnung (QR) | Kunde wählt QR-Zahlung | aktiv |
| `invoice_overdue_reminder` | Zahlungserinnerung | QR-Rechnung überfällig, Tour noch aktiv | vorbereitet |
| `payment_failed` | Zahlung fehlgeschlagen | Payrexx abgebrochen/Fehler | vorbereitet |
| `team_invite` | Team-Einladung | Neues Portal-Team-Mitglied | aktiv |

---

### Platzhalter pro Template

#### `renewal_request`

| Platzhalter | Beschreibung |
|---|---|
| `{{customerGreeting}}` | z.B. "Sehr geehrte Frau Müller" |
| `{{objectLabel}}` | Name des Objekts |
| `{{createdAt}}` | Erstelldatum der Tour |
| `{{termEndFormatted}}` | Ablaufdatum (formatiert) |
| `{{amount}}` | Verlängerungsbetrag in CHF |
| `{{tourLinkHtml}}` | Matterport-Tour-Link (HTML) |
| `{{tourLinkText}}` | Matterport-Tour-Link (Text) |
| `{{yesUrl}}` | Ja-Link (Tour verlängern) |
| `{{noUrl}}` | Nein-Link (Tour archivieren) |
| `{{portalLinkHtml}}` | Portal-Link (HTML) |
| `{{portalLinkText}}` | Portal-Link (Text) |

---

#### `payment_confirmed` / `extension_confirmed` / `reactivation_confirmed`

| Platzhalter | Beschreibung |
|---|---|
| `{{customerGreeting}}` | |
| `{{objectLabel}}` | |
| `{{termEndFormatted}}` | Neues Ablaufdatum |
| `{{tourLinkHtml}}` / `{{tourLinkText}}` | |
| `{{portalLinkHtml}}` / `{{portalLinkText}}` | |

---

#### `archive_notice`

| Platzhalter | Beschreibung |
|---|---|
| `{{customerGreeting}}` | |
| `{{objectLabel}}` | |
| `{{portalLinkHtml}}` / `{{portalLinkText}}` | |

---

#### `portal_invoice_sent`

| Platzhalter | Beschreibung |
|---|---|
| `{{customerGreeting}}` | |
| `{{objectLabel}}` | |
| `{{actionLabel}}` | "Verlängerung" oder "Reaktivierung" |
| `{{amountCHF}}` | Betrag |
| `{{dueDateFormatted}}` | Zahlungsziel |
| `{{tourLinkHtml}}` / `{{tourLinkText}}` | |
| `{{portalLinkHtml}}` / `{{portalLinkText}}` | |

---

#### `expiry_reminder`

| Platzhalter | Beschreibung |
|---|---|
| `{{customerGreeting}}` | |
| `{{objectLabel}}` | |
| `{{termEndFormatted}}` | |
| `{{tourLinkHtml}}` / `{{tourLinkText}}` | |
| `{{portalLinkHtml}}` / `{{portalLinkText}}` | |

---

#### `team_invite`

| Platzhalter | Beschreibung |
|---|---|
| `{{appName}}` | z.B. "Propus Portal" |
| `{{invitedByEmail}}` | E-Mail des Einladenden |
| `{{inviteLink}}` | Einladungs-Link |

---

### Automatisierungs-Settings (`automation_settings`-Key)

| Setting | Default | Beschreibung |
|---|---|---|
| `expiringMailEnabled` | true | Ablauf-E-Mails aktiv |
| `expiringMailLeadDays` | 30 | Tage vor Ablauf |
| `expiringMailTemplateKey` | `renewal_request` | Template-Key |
| `expiringMailCooldownDays` | 14 | Mindestabstand zwischen Mails |
| `expiringMailBatchLimit` | 50 | Max. pro Cron-Lauf |
| `expiringMailCreateActionLinks` | true | Ja/Nein-Links einbauen |
| `expiryPolicyEnabled` | — | Ablauf-Policy aktiv |
| `expirySetPendingAfterDays` | — | Tage nach Ablauf → Pending |
| `expiryLockMatterportOnPending` | — | Matterport sperren |
| `expiryArchiveAfterDays` | — | Tage nach Ablauf → Archiv |
| `paymentCheckEnabled` | — | Zahlungsprüfung aktiv |
| `paymentCheckBatchLimit` | — | Max. pro Lauf |
| `matterportAutoLinkEnabled` | — | Auto-Linking aktiv |
| `matterportAutoLinkBatchLimit` | — | Max. pro Lauf |
| `matterportStatusSyncEnabled` | — | Status-Sync aktiv |
| `matterportStatusSyncBatchLimit` | — | Max. pro Lauf |

---

## 4. E-Mail-Logging

### `tour_manager.outgoing_emails` — Tour-Manager-E-Mails

| Feld | Beschreibung |
|---|---|
| `tour_id` | Verknüpfte Tour |
| `mailbox_upn` | Absender-Postfach |
| `graph_message_id` | MS-Graph-Message-ID (Thread-Erkennung) |
| `conversation_id` | Thread-ID |
| `recipient_email` | Empfänger |
| `template_key` | Welches Template |
| `sent_at` | Versandzeitpunkt |
| `details_json` | Zusatz-Infos |

### Booking-Modul

Das Booking-Modul hat kein dediziertes E-Mail-Log. Gesendet E-Mails sind über `order_status_audit` und `employee_activity_log` nachverfolgbar.
