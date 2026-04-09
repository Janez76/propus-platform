# Propus Platform — Tour-Workflow Regelwerk

> **Gültig ab:** April 2026  
> **Automatisch mitpflegen:** Bei jeder Änderung an Status-Übergängen, Cron-Timings oder Preisen dieses Dokument und [FLOWS_TOURS.md](./FLOWS_TOURS.md) synchron halten.

---

## 1. Tour-Erstellung

- `term_end_date = created_at + 6 Monate`
- Status bei Erstellung: `ACTIVE`
- Die 6 Monate Laufzeit sind im Erstellungspreis inbegriffen — kein separater Kauf nötig
- Tour kann manuell angelegt werden oder automatisch via `booking_order_no`

---

## 2. Status-Maschine — erlaubte Übergänge

| Von | Nach | Auslöser | Automatisch? |
|---|---|---|---|
| `ACTIVE` | `ACTIVE` | Verlängerung bezahlt | ✓ |
| `ACTIVE` | `EXPIRED_PENDING_ARCHIVE` | `term_end_date` erreicht | ✓ Cron |
| `EXPIRED_PENDING_ARCHIVE` | `ARCHIVED` | 3 Tage Kulanzfrist abgelaufen | ✓ Cron |
| `ARCHIVED` | `ACTIVE` | Reaktivierung bezahlt (74 CHF) | ✓ nach Zahlung |

**Regel:** Transfer ist nur möglich wenn Tour `ACTIVE`. Aus `ARCHIVED` zuerst reaktivieren, dann transferieren.

---

## 3. Reminder-System (3 Stufen)

| Reminder | Wann | Inhalt |
|---|---|---|
| Reminder 1 | 30 Tage vor `term_end_date` | Ja / Nein / Transfer — freundlich |
| Reminder 2 | 10 Tage vor `term_end_date` | Ja / Nein / Transfer — freundlich |
| Reminder 3 | 3 Tage vor `term_end_date` | Ja / Nein / Transfer + Hinweis: Reaktivierung kostet 15 CHF extra |

Alle 3 Reminder enthalten dieselben drei Optionen als Call-to-Action-Links.

---

## 4. Ja-Flow (Verlängerung)

```
Kunde klickt Ja
  │
  ├── Rechnung generieren (59 CHF)
  │     → Payrexx-Checkout (wenn konfiguriert)
  │     → QR-Rechnung PDF (Fallback)
  │
  └── Zahlung bestätigt
        → term_end_date + 6 Monate
        → Tour bleibt ACTIVE
        → Bestätigungs-E-Mail an Kunde
```

---

## 5. Nein-Flow

```
Kunde klickt Nein
  │
  └── Tour bleibt ACTIVE bis term_end_date
        │
        └── term_end_date erreicht
              → Status: EXPIRED_PENDING_ARCHIVE
              → 3 Tage Kulanzfrist
              │
              └── Nach 3 Tagen
                    → Status: ARCHIVED
                    → Matterport deaktiviert
                    → Archivierungs-E-Mail an Kunde
```

---

## 6. Keine Antwort

Gleiche Behandlung wie Nein-Flow. Kunde reagiert auf alle 3 Reminder nicht:

```
term_end_date erreicht
  → EXPIRED_PENDING_ARCHIVE
  → nach 3 Tagen → ARCHIVED
  → Matterport deaktiviert
  → Archivierungs-E-Mail an Kunde
```

---

## 7. Transfer-Flow

```
Kunde klickt Transfer-Link (in Reminder-E-Mail)
  │
  ├── Voraussetzung: Tour ist ACTIVE
  │     (aus ARCHIVED: zuerst reaktivieren → dann Transfer)
  │
  ├── Kunde gibt Matterport-E-Mail ein
  │
  ├── System sendet Transfer-Einladung via Matterport API
  │
  ├── Bestätigungs-E-Mail an Kunde inkl. Anleitung:
  │     → Wie Einladung in Matterport annehmen
  │     → Hinweis: Matterport 3 Abo erforderlich
  │
  └── Nach Annahme durch Kunde
        → matterport_is_own = false
        → Tour-URL bleibt erhalten
```

---

## 8. Reaktivierungs-Flow

```
Tour ist ARCHIVED
  │
  └── Kunde reaktiviert im Portal
        → 74 CHF (59 CHF Abo + 15 CHF Reaktivierungsgebühr)
        → Payrexx oder QR-Rechnung
        │
        └── Zahlung bestätigt
              → Status: ACTIVE
              → Matterport reaktiviert
              → term_end_date + 6 Monate
              → Bestätigungs-E-Mail an Kunde
```

---

## 9. Preise

| Aktion | Betrag | Laufzeit |
|---|---|---|
| Inklusive bei Erstellung | 0 CHF | 6 Monate |
| Verlängerung | 59 CHF | +6 Monate ab `term_end_date` |
| Reaktivierung | 74 CHF (59 + 15) | +6 Monate ab Zahlung |

---

## 10. Cron-Jobs

| Job | Endpunkt | Zweck |
|---|---|---|
| Reminder-Versand | `POST /cron/send-expiring-soon` | Prüft täglich: 30 / 10 / 3 Tage vor `term_end_date` |
| Archivierung | `POST /cron/archive-expired` | `EXPIRED_PENDING_ARCHIVE` → nach 3 Tagen → `ARCHIVED` |
| Zahlungsprüfung | `POST /cron/check-payments` | Offene Rechnungen → `overdue` wenn überfällig |
| Matterport Status-Sync | `POST /api/tours/cron/sync-matterport-state` | `matterport_state` aktuell halten (typisch alle 5 Minuten) |
| Pending Deletions | `POST /api/tours/cron/process-pending-deletions` | Fällige Löschvormerkungen nach 30 Tagen ausführen |

---

## 11. E-Mail-Übersicht

| Template-Key | Auslöser |
|---|---|
| `renewal_request` | Reminder 1 + 2 (30 / 10 Tage) |
| `renewal_request_final` | Reminder 3 (ca. 3 Tage) |
| `tour_confirmation_request` | Bereinigungslauf (geplant) |
| `cleanup_thankyou` | Alle Touren im Cleanup-Dashboard erledigt → Dankesmail mit Gutschein |
| `payment_confirmed` | Verlängerung bezahlt |
| `reactivation_confirmed` | Reaktivierung bezahlt |
| `archive_notice` | Tour archiviert |
| Transfer-Bestätigung | Kunde klickt Transfer, E-Mail-Adresse eingegeben |

---

## 12. Abo-Startdatum (`subscription_start_date`)

| Situation | Start der Periode | Ende (`term_end_date`) |
|---|---|---|
| Neue Tour | `created_at` (Datum) | `created_at + 6 Monate` |
| Verlängerung bezahlt | bisheriges `term_end_date` (falls zukünftig) bzw. Zahlungsdatum | +6 Monate ab gewähltem Start |
| Reaktivierung bezahlt | `paid_at` (Zahlungsdatum) | `paid_at + 6 Monate` |

Feld in DB: `tour_manager.tours.subscription_start_date` (Migration `027_tours_workflow_fields.sql`).

---

## 13. Admin: Workflow-Einstellungen

Zentrale React-Seite: **`/admin/tours/workflow-settings`** (Tabs: Workflow, E-Mail-Templates, Bereinigungslauf). Alte Pfade `/admin/tours/email-templates` und `/admin/tours/automations` leiten dorthin um.

---

## 14. Bereinigungslauf (`confirmation_required`)

- Checkbox pro Tour im Admin (Intern): „Bestätigung erforderlich“ → `confirmation_required = true`.
- API: `GET /api/tours/admin/confirmation-pending`, `POST /api/tours/admin/run-confirmation-batch` (Dry-Run, kein Mail-Versand).
- Template-Vorbereitung: `tour_confirmation_request` in den E-Mail-Vorlagen.

### Kundendashboard nach Versand

- Die Dashboard-Variante gruppiert Touren pro Kunde/Firma und wird über `/cleanup/dashboard?token=...` geöffnet.
- `weiterfuehren` reagiert statusabhängig: sofortige Reaktivierung inkl. Matterport-Unarchive, Zahlungswahl (`online`/`qr`) oder manueller Review bei Sonderfällen.
- `archivieren` archiviert Tour und Matterport-Space direkt.
- `uebertragen` erzeugt ein Ticket zur Nachbearbeitung.
- `loeschen` löscht nicht sofort, sondern legt eine Löschvormerkung mit 30 Tagen Sicherheitsfrist an.
- Nach Abschluss aller Touren einer Gruppe kann einmalig eine `cleanup_thankyou`-Mail mit Gutschein versendet werden.

---

## 15. Felder-Checkliste bei neuem Tour-Eintrag

- [ ] `object_label` gesetzt
- [ ] `customer_id` verknüpft (oder mind. `customer_email` + `customer_name`)
- [ ] `term_end_date = created_at + 6 Monate`
- [ ] `subscription_start_date` = `created_at` (setzt das System bei Anlage)
- [ ] `matterport_space_id` oder `tour_url` gesetzt
- [ ] `exxas_subscription_id` für Exxas-Matching
- [ ] `status = 'ACTIVE'`
- [ ] `confirmation_required = false` (Default)
