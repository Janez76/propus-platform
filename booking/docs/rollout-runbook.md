# Rollout-Runbook – Workflow v2 (DoD I)

Gestuftes Rollout mit Feature Flags. Kein Big-Bang-Deploy.

---

## Voraussetzungen

- Backup vorhanden (`_backup_pre_workflow.ps1` ausgeführt)
- Migrations `001`–`007` auf Staging erfolgreich
- Staging-Checkliste (`staging-checklist.md`) vollständig abgehakt
- Produktions-Snapshot: `SELECT COUNT(*) FROM orders` notiert

---

## Pflicht-Ergänzung: Backup, Cache-Purge, Smoke-Checks

### 1) Pre-Deploy: Backup (Fail-Fast, Pflicht)

Vor jedem Deploy muss ein Datenbank-Backup erstellt und verifiziert werden.  
Wenn dieser Schritt fehlschlägt, wird **kein Deploy** gestartet (keine Migrationen, kein Restart).

```bash
ssh Janez@192.168.1.5
mkdir -p /volume1/docker/Buchungstool-backups
TS=$(date +%Y%m%d-%H%M)
BACKUP_FILE="/volume1/docker/Buchungstool-backups/db-backup-${TS}.sql"
# Alternative komprimiert:
# BACKUP_FILE="/volume1/docker/Buchungstool-backups/db-backup-${TS}.sql.gz"

# Backup erstellen
docker exec buchungstool-postgres-1 pg_dump -U propus buchungstool > "${BACKUP_FILE}"
# Oder komprimiert:
# docker exec buchungstool-postgres-1 pg_dump -U propus buchungstool | gzip -c > "${BACKUP_FILE}"
BACKUP_EXIT=$?

# Verifikation (Fail-Fast)
if [ ${BACKUP_EXIT} -ne 0 ]; then
  echo "ERROR: DB-Backup fehlgeschlagen (Exit-Code ${BACKUP_EXIT}). Deploy wird abgebrochen."
  exit 1
fi
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup-Datei ist leer oder fehlt (${BACKUP_FILE}). Deploy wird abgebrochen."
  exit 1
fi

echo "OK: Backup erstellt und verifiziert: ${BACKUP_FILE}"
```

Restore (je nach Backup-Format):

```bash
# Restore für .sql
cat /volume1/docker/Buchungstool-backups/db-backup-YYYYMMDD-HHMM.sql \
  | docker exec -i buchungstool-postgres-1 psql -U propus -d buchungstool

# Restore für .sql.gz
gzip -dc /volume1/docker/Buchungstool-backups/db-backup-YYYYMMDD-HHMM.sql.gz \
  | docker exec -i buchungstool-postgres-1 psql -U propus -d buchungstool
```

Optional (falls relevant):
- Upload-/Storage-Verzeichnisse ebenfalls sichern (z. B. User-Uploads, generierte Dateien)
- Backup nicht nur lokal halten, sondern in definiertem Backup-Ordner/Remote-Storage ablegen

### 2) Deploy: Code + Migrationen

Deploy wie gewohnt (Code + Container-Restart).  
Migrationen dürfen nur laufen, wenn Schritt 1 erfolgreich war.

Falls Migration nicht automatisch lief:

```bash
docker compose exec -T backend node migrate.js
```

### 3) Post-Deploy: Cache purge / Invalidation (Pflicht)

Nach erfolgreichem Deploy alle relevanten Caches leeren bzw. invalidieren:
- App-Cache (falls vorhanden)
- Template-/Renderer-Cache (falls vorhanden)
- Frontend-/CDN-Cache (Cloudflare-Purge)

Danach Service restart/reload prüfen, damit neue Artefakte und Konfiguration aktiv sind.

### 4) Smoke-Checks (Pflicht, max. 3 Minuten)

- **Admin-Statuswechsel ohne E-Mail**
  - Status ändern mit Checkbox **„E-Mail(s) senden“ AUS** (`sendEmails=false`)
  - Erwartung: Status gespeichert, **keine** Mails versendet
- **Admin-Statuswechsel mit E-Mail**
  - Status ändern mit `sendEmails=true`
  - Erwartung: Mails werden gemäß Templates versendet
- **Template-Rendering / Review-Job Key**
  - Sicherstellen, dass `review_request` verwendet wird
  - Keine `Template not found`-Fehler in Logs

### 5) Deploy-Log (Pflicht)

Pro Deploy ein kurzer Eintrag, z. B.:

```text
Datum/Zeit: 2026-03-03 21:40 CET
Commit/Version: <git-sha> / v2.2.13
Backup-Datei/Ort: db-backup-20260303-2135.sql @ /volume1/docker/Buchungstool-backups/
Deploy-Ergebnis: OK
Smoke-Checks: OK
```

---

## Phase 1: Flags OFF (Shadow-Modus)

Alle Feature Flags auf `false` → System verhält sich wie vor dem Update.

```sql
UPDATE settings SET value='false' WHERE key='feature.provisionalBooking';
UPDATE settings SET value='false' WHERE key='feature.calendarOnStatusChange';
UPDATE settings SET value='false' WHERE key='feature.emailTemplatesOnStatusChange';
UPDATE settings SET value='false' WHERE key='feature.backgroundJobs';
UPDATE settings SET value='false' WHERE key='feature.autoReviewRequest';
```

Deployment ausführen:

1. Migration `007_template_language.sql` auf Produktion ausführen
2. Backend-Code deployen (`node server.js`)
3. Admin-Panel deployen

Verifikation nach Deploy:
- [ ] `GET /api/admin/health` → 200
- [ ] `SELECT COUNT(*) FROM orders` – Anzahl identisch mit Snapshot
- [ ] Ein Status-Wechsel manuell testen: `422` für ungültige Transition

---

## Phase 2: Kalender Shadow-Log aktivieren

```sql
UPDATE settings SET value='true' WHERE key='feature.calendarOnStatusChange';
```

Beobachten:
- Logs auf `[workflow-effects][shadow]` prüfen – sollten jetzt erscheinen
- Nach 24h: keine unerwarteten Graph-API-Fehler in Logs

---

## Phase 3: E-Mail-Templates aktivieren (Staging)

```sql
UPDATE settings SET value='true' WHERE key='feature.emailTemplatesOnStatusChange';
```

Test-Auftrag auf Staging:
- [ ] Status auf `provisional` setzen → E-Mail im Postfach
- [ ] Status auf `confirmed` setzen → 3 E-Mails (Kunde, Fotograf, Büro)
- [ ] `SELECT * FROM email_send_log LIMIT 10` – Einträge vorhanden

---

## Phase 4: Hintergrund-Jobs aktivieren

```sql
UPDATE settings SET value='true' WHERE key='feature.backgroundJobs';
UPDATE settings SET value='true' WHERE key='feature.autoReviewRequest';
```

Verifikation:
- [ ] Logs zeigen Job-Start um 03:00 / 10:00 Uhr
- [ ] Test-Provisorium mit `provisional_expires_at` in Vergangenheit → Status-Reset auf `pending`

---

## Phase 5: Provisorium-Feature aktivieren (UI)

```sql
UPDATE settings SET value='true' WHERE key='feature.provisionalBooking';
```

- [ ] Neuer Auftrag: Status auf `provisional` setzbar
- [ ] Kalender-Block als `tentative` in MS365 sichtbar
- [ ] Nach `confirmed`: Block auf `busy` aktualisiert

---

## Rollback

### Sofort-Rollback (Flags off)

```sql
UPDATE settings SET value='false' WHERE key='feature.provisionalBooking';
UPDATE settings SET value='false' WHERE key='feature.calendarOnStatusChange';
UPDATE settings SET value='false' WHERE key='feature.emailTemplatesOnStatusChange';
UPDATE settings SET value='false' WHERE key='feature.backgroundJobs';
UPDATE settings SET value='false' WHERE key='feature.autoReviewRequest';
```

System verhält sich nach Flags-Off wie vor dem Update. Keine DB-Daten-Änderung nötig.

### Code-Rollback (wenn Flags nicht ausreichen)

1. Altes Backend-Deployment wiederherstellen (Docker-Image oder Git-Tag)
2. Migration `007` ist rückwärtskompatibel – neue Spalten sind `nullable`/`DEFAULT`
3. Falls nötig: Spalten entfernen (nur wenn keine Daten geschrieben)

```sql
-- Nur wenn keine template_language-Daten existieren:
-- ALTER TABLE email_templates DROP COLUMN IF EXISTS template_language;
-- ALTER TABLE orders DROP COLUMN IF EXISTS preferred_language;
-- ALTER TABLE email_send_log DROP COLUMN IF EXISTS template_language;
```

### DB-Snapshot wiederherstellen (letzter Ausweg)

Backup aus `_backup_pre_workflow.ps1` verwenden:
```
psql $DATABASE_URL < backup_pre_workflow_YYYYMMDD_HHMMSS.sql
```

---

## Loki/Promtail Restart-Loop (Troubleshooting)

```bash
cd /volume1/docker/Buchungstool
docker compose logs loki promtail --tail=200
```

Wenn Config als Verzeichnis statt Datei gemountet ist:
```bash
docker run --rm -v /volume1/docker/Buchungstool/monitoring:/mnt alpine \
  sh -c 'rm -rf /mnt/loki-config.yml /mnt/promtail-config.yml /mnt/loki-rules.yml'
docker compose up -d --force-recreate loki promtail
```

Temporärer Fallback:
```bash
docker compose stop loki promtail
```
und in `docker-compose.yml` vorübergehend `restart: "no"` setzen.

---

## Optional: Backup-Retention

Script vorhanden: `scripts/prune-db-backups.sh`

Beispiel 30 Tage:
```bash
cd /volume1/docker/Buchungstool
./scripts/prune-db-backups.sh 30

# oder direkt:
find /volume1/docker/Buchungstool-backups -maxdepth 1 -type f \
  \( -name "db-backup-*.sql" -o -name "db-backup-*.sql.gz" \) -mtime +30 -delete
```

Cron-Beispiel:
```bash
30 3 * * * /volume1/docker/Buchungstool/scripts/prune-db-backups.sh 30 >> /volume1/docker/Buchungstool/logs/backup-prune.log 2>&1
```

---

## Monitoring-Metriken nach Rollout

| Metrik | Erwartung | Alarm |
|--------|-----------|-------|
| `SELECT COUNT(*) FROM orders WHERE status='provisional'` | Steigt moderat | > 50 ohne Ablauf |
| `SELECT COUNT(*) FROM email_send_log` | Steigt bei Übergängen | Doppelte Einträge |
| `SELECT COUNT(*) FROM calendar_delete_queue WHERE processed_at IS NULL` | Nahe 0 | > 5 über 1h |
| `graph_api_errors` im Log | 0 | Mehr als 3 in 10min |
| HTTP 409 auf `/status` Endpoint | Selten | > 10/h |

---

## Kontakt bei Problemen

- Backend-Logs: `docker logs buchungstool-backend -f`
- DB-Verbindung: `psql $DATABASE_URL`
- Feature-Flags UI: Admin-Panel → Einstellungen → Workflow
