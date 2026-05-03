# Pilot-Review – Server Action `termin/actions.ts`

**Stichprobendatei:** `app/src/app/(admin)/orders/[id]/termin/actions.ts` (195 LOC)
**Tranche-Vorbild:** T02 – Server Actions
**Zweck:** Schärfe, Severity-Calls, Format und Detail-Tiefe vom User abnehmen lassen,
bevor der Volllauf startet.

**Kontext:** Diese Action ändert Termin, Status, Fotograf einer Bestellung,
synchronisiert nach Outlook, schreibt Audit-Log, versendet Workflow-Mails und
führt am Ende `revalidatePath` + `redirect` aus. Sie ist hochfrequent, datenkritisch
(Doppelbuchung-Risiko) und externseitig integriert (Outlook, Mail).

---

## Findings

### [PILOT][HIGH][H] Race Condition: Conflict-Check vs Update (TOCTOU)
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:62-97`
- Kategorie: 8. Race Conditions / State
- Problem: `findScheduleConflicts(...)` (Z. 62) und `updateOrderTermin(...)` (Z. 90)
  laufen sequentiell ohne Lock. Zwischen beiden kann eine parallele Action für denselben
  `photographerKey` + `scheduleDate/Time` erfolgreich ihren Conflict-Check passieren
  und schreiben.
- Auswirkung: **Doppelbuchung eines Fotografen** zur selben Zeit ist möglich, obwohl
  beide UIs „Konflikt"-Warnung korrekt angezeigt hätten, wenn sie nacheinander gelaufen
  wären. Ergebnis: Außendienst-Termin-Kollision, manuelles Aufräumen nötig, Kundenkommunikation.
- Reproduktion: Zwei Browser-Tabs/Editor-Sessions, identische Termin-Daten,
  beide drücken „Speichern" innerhalb desselben Hundertstel.
- Vorschlag: Konflikt-Check in dieselbe Transaktion mit dem Update ziehen und auf
  Photographer-Slot per `SELECT … FOR UPDATE` (Postgres-Row-Lock) oder DB-seitiger
  Unique-Constraint/Exclusion-Constraint (z. B. `EXCLUDE USING gist (photographer_key
  WITH =, tsrange(start, end) WITH &&)`) absichern. Wenn ein Constraint feuert,
  Mapping zu strukturiertem Fehler.
- Aufwand: M (Repo-Layer + Migration für Constraint, ggf. Test)
- Confidence: H
- Tags: #data-loss #regression-risk

### [PILOT][HIGH][H] Multi-Step-Mutation ohne Transaktion / Outbox
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:90-186`
- Kategorie: 4. SQL & DB / 10. Error Handling
- Problem: Nach `updateOrderTermin` folgen externe Schritte:
  `requestAdminReschedule` (Outlook-Sync, Z. 100) → `logStatusAuditEntry` (Z. 110) →
  `logOrderEvent` (Z. 117/126/135) → `sendWorkflowMails` (Z. 162). Jeder Schritt kann
  fehlschlagen; es gibt **keine Transaktion und keinen Outbox-/Retry-Mechanismus**.
  Bei Fehler in Schritt N bleiben N-1 Schritte committed.
- Auswirkung: Inkonsistente Zustände: Termin in DB neu, aber Outlook-Event noch alt;
  oder Status geändert, aber Audit-Log fehlt → Nachvollziehbarkeit kaputt; oder Mail
  nicht raus, aber DB sagt „bestätigt".
- Reproduktion: Outlook-Sync-Endpoint kurz down ⇒ DB-Update committed, Outlook ist
  schief, kein Retry.
- Vorschlag: DB-Schreibvorgänge (Termin-Update + Audit-Einträge) in eine Transaktion
  zusammenziehen. Externe Effekte (Outlook, Mail) in eine `outbox`-Tabelle schreiben
  und von einem Worker mit Retry/Backoff verarbeiten lassen. Minimum-Variante:
  klares strukturiertes Fehler-Reporting an den User, statt `ok: true` bei
  Teilerfolg.
- Aufwand: L (Outbox + Worker), M (nur DB-Tx-Bündelung)
- Confidence: H
- Tags: #data-loss #regression-risk

### [PILOT][MEDIUM][H] Mail-Versand-Fehler werden verschluckt → User sieht „Erfolg"
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:175-194`
- Kategorie: 10. Error Handling & Logging
- Problem: Wenn `sendWorkflowMails` Fehler liefert, wird zwar ein
  `logOrderEvent("note_added", { mailErrors })` (Z. 176-185) geschrieben — aber die
  Action returned trotzdem `{ ok: true }` (Z. 194). Der UI-Toast meldet „gespeichert",
  obwohl Bestätigungs- oder Fotografen-Benachrichtigungs-Mail nicht raus ist.
- Auswirkung: Kunde / Fotograf bekommt keine Benachrichtigung, niemand weiß es.
  „Stille Lieferausfälle" sind in einem Termin-System ein operativer GAU.
- Reproduktion: Mailer mit ungültigem `OFFICE_EMAIL` oder gestopften SMTP-Credentials,
  Termin speichern → Toast „erfolgreich".
- Vorschlag: Bei `result.errors.length > 0` einen Soft-Warn-Pfad zurückgeben:
  `{ ok: true, warning: "Termin gespeichert, aber Mailversand fehlgeschlagen", mailErrors }`.
  UI muss dann gelben Toast statt grünen zeigen.
- Aufwand: S
- Confidence: H
- Tags: #regression-risk

### [PILOT][MEDIUM][M] Idempotenz fehlt: Doppel-Submit erzeugt doppelte Mails
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:162-174`
- Kategorie: 3. Server Actions / 8. Race Conditions
- Problem: `sendWorkflowMails` hat keinen Idempotency-Key. Bei Doppelklick (oder
  Browser-Retry nach Timeout) läuft die Action zweimal, und der Kunde bekommt zwei
  Bestätigungsmails plus zwei Status-Audit-Einträge.
- Auswirkung: Verwirrte Kunden, dopplelte Audit-Einträge.
- Reproduktion: Schnell zweimal auf „Speichern". Action ist nicht durch
  ETag/`updated_at`-Check geschützt.
- Vorschlag: Optimistic Concurrency mit `expected_updated_at` aus dem Form-Payload
  vergleichen; oder Mail-Versand auf Event-Hash dedupen
  (`order_no + new_status + new_schedule_hash` → einmal pro 60s).
- Aufwand: M
- Confidence: M
- Tags: #regression-risk

### [PILOT][MEDIUM][L] Cache-Revalidation evtl. unvollständig
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:189-190`
- Kategorie: 2. Next.js-spezifisch
- Problem: Nur die Detail-Pfade `/orders/${orderNo}` und `/orders/${orderNo}/termin`
  werden invalidiert. Order-Listen-Pages, Kalender-Views, Dashboard-Widgets, die
  „heute geplante Termine" zeigen, bleiben stale, falls sie über `unstable_cache`
  oder Tag-basierte Caches gehen.
- Auswirkung: Admin-Liste/Dashboard zeigt veralteten Status nach Bearbeiten.
- Reproduktion: Termin verschieben → zur Order-Liste → alter Termin wird angezeigt
  bis nächste Hard-Reload.
- Vorschlag: Verifizieren ob Listen-Queries `cache()`/`unstable_cache(["orders"])`
  nutzen; falls ja, `revalidateTag("orders")` ergänzen. Wenn rein DB-Live ohne Cache,
  Finding obsolet.
- Aufwand: S (verifizieren), S (fix)
- Confidence: L
- Tags: —

### [PILOT][LOW][H] Inline-SQL umgeht Repo-Layer (Architektur-Drift)
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:147-155`
- Kategorie: 13. Konsistenz / Architektur
- Problem: Zwei `queryOne(...)`-Aufrufe (E-Mail von `booking.orders.billing` und
  `booking.photographers`) hängen direkt in der Action, während alle anderen
  Datenzugriffe über `lib/repos/orders/*` laufen. Macht Naming-/Schema-Migrationen
  fragiler und Tests schwerer.
- Auswirkung: Zukünftige Änderung an `billing`-JSON-Form oder Photographer-Schema
  bricht hier still, weil keine Repo-Funktion zu refactorn ist. Bug-Class-Vermehrung
  (jeder Action-Autor schreibt eigene SQL-Snippets).
- Reproduktion: Kein Bug heute, eher latent.
- Vorschlag: Helper `getOrderBillingEmail(orderNo)` und `getPhotographerEmail(key)`
  in `lib/repos/orders/` bzw. `lib/repos/photographers/`. Nutzung aus der Action.
- Aufwand: S
- Confidence: H
- Tags: #refactor

### [PILOT][LOW][H] Mail-Errors als „note_added"-Event geloggt – falsche Semantik
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:176-185`
- Kategorie: 10. Logging
- Problem: `logOrderEvent(orderNo, "note_added", { mailErrors, mailSent })` mischt
  zwei Konzepte. Wer im Verlauf nach „Mail-Fehler" sucht, findet sie nicht.
- Auswirkung: Operative Suche/Alerting auf Mail-Versand-Probleme funktioniert nicht.
- Reproduktion: Verlauf-Tab nach „mail" filtern → keine Treffer.
- Vorschlag: Eigenes Event `mail_failed` (oder `mail_dispatched`) mit
  `{ effects, errors, sent }` als Payload. State-Machine in
  `lib/orderWorkflow/stateMachine` kennt die Effekte sowieso.
- Aufwand: S
- Confidence: H
- Tags: —

### [PILOT][LOW][M] Schedule-Equality-Vergleich anfällig für Format-Drift
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:85-88`
- Kategorie: 7. Logik
- Problem:
  ```ts
  v.scheduleDate !== String(scheduleBefore.date || "") ||
  v.scheduleTime !== String(scheduleBefore.time || "") ||
  v.durationMin !== Number(scheduleBefore.durationMin || 0);
  ```
  Wenn der DB-Treiber ein Datum als `Date`-Objekt oder ISO-String mit Zeitzone
  zurückgibt, schlägt der Vergleich gegen `"YYYY-MM-DD"` aus dem Form-Schema fehl
  → `scheduleChanged` ist immer `true` → unnötige Outlook-Resyncs und Audit-Events.
  Außerdem: `|| 0` swallowt einen echten `0`-Wert nicht (kein Bug), aber `?? 0`
  wäre semantisch korrekter.
- Auswirkung: Outlook-Reschedule und Verlauf-Spam selbst wenn nichts geändert wurde;
  evtl. Mail-Versand ohne Anlass (s. o.).
- Reproduktion: Termin öffnen, ohne Änderung „Speichern" drücken → prüfen, ob
  `schedule_updated`-Audit-Event entsteht und ob Outlook-API gerufen wird.
- Vorschlag: Vergleich auf normalisierten Werten:
  Date → `formatISODate`, Time → `HH:mm`, Duration → Number. Helper:
  `hasScheduleChanged(before, after)` in `lib/repos/orders/termin`.
- Aufwand: S
- Confidence: M
- Tags: —

### [PILOT][LOW][M] Magic-String `"cancelled"` außerhalb State-Machine
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:99`
- Kategorie: 13. Konsistenz
- Problem: `if (scheduleChanged && v.status !== "cancelled")` benutzt einen
  hartkodierten Status-String, obwohl `lib/orderWorkflow/stateMachine` existiert
  und die kanonische Liste der Status-Werte hat.
- Auswirkung: Wenn jemand „canceled" (US) oder Großbuchstaben einführt, läuft der
  Outlook-Reschedule trotz Cancellation.
- Vorschlag: Konstante `STATUS.CANCELLED` aus `stateMachine` importieren und
  damit vergleichen.
- Aufwand: S
- Confidence: M
- Tags: —

### [PILOT][INFO][L] `process.env.OFFICE_EMAIL` ohne Boot-Validierung benutzt
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:167`
- Kategorie: 1. Security / 13. Konsistenz
- Problem: Direkter Zugriff auf `process.env.OFFICE_EMAIL` ohne Fallback und ohne
  Schema-Validierung beim App-Start. Wenn die Env-Var fehlt, wird `undefined`
  weitergereicht; `sendWorkflowMails` muss damit umgehen.
- Auswirkung: Stiller Mail-Verlust an Office-Adresse je nach Mailer-Implementierung.
- Vorschlag: Zentrales `env.ts` mit Zod-Validierung beim Boot;
  Verwendung von `env.OFFICE_EMAIL` statt `process.env.…`.
- Aufwand: M (zentrales `env.ts` einführen, falls noch nicht vorhanden)
- Confidence: L (evtl. existiert das schon woanders – im Volllauf prüfen)
- Tags: —

### [PILOT][INFO][L] Owner-/Tenant-Check nicht erkennbar
- Datei: `app/src/app/(admin)/orders/[id]/termin/actions.ts:26`
- Kategorie: 1. Security
- Problem: `requireOrderEditor()` prüft Rollen-Zugehörigkeit, aber ob der Editor
  diese spezifische `orderNo` bearbeiten darf, ist hier nicht erkennbar. Ob ein
  Mehrmandanten-Modell existiert, muss verifiziert werden.
- Auswirkung: Bei Mandanten-Modell potenziell IDOR; ohne Mandanten unkritisch.
- Reproduktion: Verifikation: gibt es `tenant_id`/`org_id` in `booking.orders`?
- Vorschlag: Im Volllauf in `lib/auth.server.ts` und `lib/repos/orders/termin.ts`
  prüfen. Falls Mandanten existieren, Owner-Check in der Repo-Funktion erzwingen.
- Aufwand: S (Verifikation), M (Fix falls nötig)
- Confidence: L
- Tags: #security

---

## Pilot-Statistik

- **Gefundene Findings:** 11
- **Severity-Verteilung:** 2 HIGH, 3 MEDIUM, 4 LOW, 2 INFO, 0 CRITICAL
- **Confidence-Verteilung:** 5 H, 4 M, 4 L (Summen >11 weil Categorien mehrfach)
- **Aufwandsschätzung Sofort-Fixes (HIGH+MEDIUM):** ~ 1 L (Outbox), 1 M, 2 M, 1 S → realistisch 1–2 Sprint-Tage für die kritischen Pfade

---

## Was der User jetzt prüfen sollte

1. **Format**: Findings-Block-Struktur OK (Datei/Kategorie/Problem/Auswirkung/Reproduktion/Vorschlag/Aufwand/Confidence/Tags)? Zu viel? Zu wenig?
2. **Schärfe**: Sind die HIGH-Calls (TOCTOU, Multi-Step-Mutation) berechtigt, oder zu hart? Sind die LOW-Calls (Magic-String, Repo-Drift) Spam oder hilfreich?
3. **Tonalität**: Direkt genug? Zu defensive? Zu aggressive?
4. **Detail-Tiefe pro Finding**: Reichen 6–10 Zeilen? Oder lieber knapper / länger?
5. **Confidence-Disziplin**: Habe ich `L`-Findings sauber als „bitte verifizieren" markiert?
6. **Vorschläge**: Sollen die Fix-Vorschläge so konkret bleiben oder kürzer („Outbox einführen, Details später") sein?

---

## Nächster Schritt

**STOP** — bitte `bug-hunt/PILOT.md` prüfen.

- `/continue` → Volllauf von T01 bis T17 startet
- `/adjust <Hinweise>` → Pilot wird mit angepasstem Stil neu erstellt
