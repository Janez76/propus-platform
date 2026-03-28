# Staging-Checkliste – Workflow v2 (DoD H)

Manuelle Verifikation vor Produktions-Rollout.

---

## A. Datenbank-Integrität (DoD A-Beweis)

- [ ] Migration `007_template_language.sql` ausgeführt ohne Fehler
- [ ] `SELECT COUNT(*) FROM orders` – Anzahl unverändert gegenüber Snapshot
- [ ] Stichprobe: 3 bestehende Aufträge prüfen – Status, Daten unverändert
- [ ] `SELECT * FROM orders WHERE provisional_booked_at IS NOT NULL LIMIT 5` – keine unbeabsichtigten NULLs
- [ ] Keine `UPDATE`/`DELETE` auf `orders`-Tabelle in Migrations-Dateien `001`-`007` vorhanden

---

## B. Status-SSOT und UI-Konsistenz (DoD B)

- [ ] Orders-Liste: alle 8 Status korrekt als deutsches Label angezeigt
- [ ] Kalender-Filter: alle 8 Status im Dropdown (kanonische Reihenfolge)
- [ ] OrderCards-Dropdown: zeigt nur erlaubte Ziel-Status (ALLOWED_TRANSITIONS)
- [ ] OrderDetail-Dropdown: zeigt nur erlaubte Ziel-Status
- [ ] Dashboard StatusBars: Balken mit deutschem Label
- [ ] PrintOrder: Status-Label auf Druckansicht ist deutsch
- [ ] Kein roher englischer Key sichtbar in der UI

---

## C. Transition-Matrix (DoD C)

- [ ] `cancelled → pending` via API: 422-Fehler erwartet
- [ ] `provisional → pending` via API manuell: 422-Fehler erwartet
- [ ] `confirmed → paused`: erlaubt, Kalender-Event gelöscht
- [ ] `paused → pending`: erlaubt, kein Kalender-Effect
- [ ] `archived → pending`: erlaubt (Reaktivierung)
- [ ] `done → archived`: erlaubt
- [ ] Ungültiger Status-Key: 400 `Ungültiger Status`

---

## D. Kalender-Invariante (DoD D)

- [ ] `pending → confirmed` mit gültigem Fotograf + Termin:
  - Kalender-Eintrag erstellt (Graph API Call sichtbar im Log)
  - Status auf `confirmed` gesetzt
- [ ] Simulierter Graph-API-Fehler bei `confirmed`:
  - API gibt 409 zurück
  - Status bleibt auf vorherigem Wert
  - Kein Datenbank-Update für Status
- [ ] `provisional → confirmed`: Upgrade von `tentative` zu `busy`
- [ ] `confirmed → paused`: Kalender-Event gelöscht
- [ ] `confirmed → cancelled`: Kalender-Event gelöscht + ICS-Cancel

---

## E. Provisorium 3 Tage (DoD E)

- [ ] `pending → provisional`: Eintrag mit `provisional_expires_at = +3 Tage` gesetzt
- [ ] Kalender-Block als `tentative` erstellt
- [ ] Reminder-Job (manuell triggern): sendet Reminder 1 nach 24h, 2 nach 48h, 3 nach 72h
- [ ] Expiry-Job (manuell triggern): setzt Status auf `pending`, löscht Kalender-Event
- [ ] Nach Expiry: `provisional_booked_at`, `provisional_expires_at` = NULL
- [ ] Keine doppelten Reminder-Mails (Marker `provisional_reminder_X_sent_at` gesetzt)

---

## F. Template-only Mailflow (DoD F)

- [ ] `pending → confirmed`: E-Mail an Kunde, Fotograf, Büro via Template gesendet
- [ ] `pending → paused`: E-Mail an Kunde, Fotograf, Büro via Template
- [ ] `* → cancelled`: E-Mail an Kunde via Template `cancelled_customer`
- [ ] Wiederholter API-Call mit identischem Status: kein zweiter Mail-Versand (`email_send_log` prüfen)
- [ ] `feature.emailTemplatesOnStatusChange=false`: keine Mails gesendet

---

## G. Sprach-Fallback (DoD G)

- [ ] Template mit `template_language='de-CH'` angelegt: wird für unbekannte Sprache geliefert
- [ ] Template mit `template_language='en'` angelegt: wird für `en` Empfänger geliefert
- [ ] Kein `en`-Template vorhanden, `sr-latn` angefragt: Fallback auf `de-CH`
- [ ] `email_send_log` enthält `template_language`-Spalte nach Versand
- [ ] Interne Status-Keys in Mails bleiben englisch (keine deutschen Labels in DB-Feldern)

---

## H. Idempotenz (DoD E/F)

- [ ] `sendMailIdempotent`: zweiter Aufruf mit gleichem Key = `already_sent`, kein Versand
- [ ] Kalender-Delete: 404-Fehler bei bereits gelöschtem Event → kein Fehler, `null` in DB
- [ ] `calendar_delete_queue`: Einträge bei Fehler vorhanden, Retry-Job verarbeitet sie
- [ ] Provisorium-Expiry-Job: Wiederholung ohne Änderung wenn bereits auf `pending`

---

## I. Feature Flags (DoD I)

- [ ] `feature.provisionalBooking=false`: `provisional` nicht als Ziel-Status angeboten (UI)
- [ ] `feature.calendarOnStatusChange=false`: Shadow-Log vorhanden, kein Graph-API-Call
- [ ] `feature.backgroundJobs=false`: Cron-Jobs starten nicht
- [ ] `feature.emailTemplatesOnStatusChange=false`: kein Mail-Versand
- [ ] Alle Flags default `false` in neuer Produkt-Instanz

---

## Tester-Signatur

| Punkt | Tester | Datum | OK |
|-------|--------|-------|----|
| A     |        |       | ☐  |
| B     |        |       | ☐  |
| C     |        |       | ☐  |
| D     |        |       | ☐  |
| E     |        |       | ☐  |
| F     |        |       | ☐  |
| G     |        |       | ☐  |
| H     |        |       | ☐  |
| I     |        |       | ☐  |
