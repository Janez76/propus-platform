# Propus Platform - Backups

> **Automatisch mitpflegen:** Bei Aenderungen an Backup-Skripten, Cronjobs, Restore-Pfaden oder NAS-Sync dieses Dokument aktualisieren.

*Zuletzt aktualisiert: April 2026*

---

## Zweck

Dieses Dokument beschreibt den aktuellen Soll-Zustand des Backup-Setups fuer die vereinheitlichte Propus-Platform auf der VPS und auf dem NAS.

Ziel:

1. Tägliche Backups muessen schnell und stabil laufen.
2. Wiederherstellungsrelevante Daten muessen separat auch als Volume-Archive gesichert werden koennen.
3. Externe NAS-Mounts duerfen die regulären Backups nicht mehr blockieren.

---

## Backup-Arten

### 1. Täglicher NAS-Sync

Der tägliche Job erstellt auf der VPS ein Backup und synchronisiert es anschliessend auf das NAS.

Cron auf dem NAS:

```bash
0 2 * * * /volume1/backup/propus-platform/scripts/backup-nas-pull.sh >> /volume1/backup/propus-platform/logs/backup.log 2>&1
```

Standardverhalten:

- `BACKUP_INCLUDE_VOLUMES=0`
- gesichert werden `db.sql`, `logto.sql`, `metadata.txt`, `SHA256SUMS.txt`
- keine grossen Volume-Archive

### 2. Wöchentlicher Voll-Backup-Lauf

Der Wochenjob nutzt dasselbe Grundskript, aktiviert aber zusaetzlich die lokalen Restore-Volumes.

Cron auf dem NAS:

```bash
0 3 * * 0 /volume1/backup/propus-platform/scripts/backup-nas-full-pull.sh >> /volume1/backup/propus-platform/logs/backup-full.log 2>&1
```

Standardverhalten:

- `BACKUP_NAS_INCLUDE_VOLUMES=1`
- `BACKUP_NAS_VOLUME_PATHS=/data/state:/app/logs:/upload_staging`
- `RETENTION_DAYS=14` im NAS-Wrapper

---

## Gesicherte Inhalte

### Immer enthalten

- `db.sql`
- `logto.sql` sofern Logto konfiguriert ist
- `metadata.txt`
- `SHA256SUMS.txt`
- `orders.json` falls vorhanden
- `.env.vps` falls vorhanden

### Nur im Voll-Backup enthalten

Es werden ausschliesslich VPS-lokale Restore-Pfade archiviert:

- `/data/state`
- `/app/logs`
- `/upload_staging`

Resultierende Archive:

- `state.tar.gz`
- `logs.tar.gz`
- `upload_staging.tar.gz`

### Bewusst ausgeschlossen

Diese Pfade sind externe NAS-Mounts und werden nicht mehr in die Volume-Backups aufgenommen:

- `/booking_upload_customer`
- `/booking_upload_raw`

Begruendung:

- liegen nicht lokal auf der VPS
- machen Backups sehr gross und langsam
- sind fuer den lokalen Plattform-Restore nicht der erste Pflichtbestandteil

---

## Speicherorte

### VPS

- Projekt: `/opt/propus-platform`
- Backup-Root: `/opt/propus-platform/backups`
- NAS-Sync-Status: `/opt/propus-platform/backups/.nas-sync.log`

### NAS

- Zielordner: `/volume1/backup/propus-platform/data`
- Skripte: `/volume1/backup/propus-platform/scripts`
- Logs: `/volume1/backup/propus-platform/logs`

---

## Wichtige Skripte

- `scripts/backup-vps.sh`
  Erstellt das eigentliche Backup im laufenden `platform`-Container.

- `scripts/backup-nas-pull.sh`
  Täglicher Pull-Job auf dem NAS. Startet das VPS-Backup per SSH und synchronisiert anschliessend per `rsync`.

- `scripts/backup-nas-full-pull.sh`
  Wochen-Wrapper fuer lokale Restore-Volumes. Exportiert die passenden Variablen und delegiert an `backup-nas-pull.sh`.

- `scripts/restore-vps.sh`
  Restore-Skript fuer DB und vorhandene Volume-Archive.

---

## Relevante Konfiguration

### VPS / Container

Wichtige Variablen:

- `BACKUP_ROOT=/data/backups`
- `BACKUP_INCLUDE_VOLUMES=0`
- `BACKUP_VOLUME_PATHS=/data/state:/app/logs:/upload_staging`
- `BACKUP_NAS_LOG_PATH=/data/backups/.nas-sync.log`

### NAS

Wichtige Variablen im NAS-Skript:

- `BACKUP_NAS_TARGET=/volume1/backup/propus-platform/data`
- `BACKUP_NAS_INCLUDE_VOLUMES=0` im Tagesjob
- `BACKUP_NAS_INCLUDE_VOLUMES=1` im Wochenjob
- `BACKUP_NAS_VOLUME_PATHS=/data/state:/app/logs:/upload_staging` im Wochenjob

---

## Restore-Relevanz

Fuer einen technischen Plattform-Restore auf der VPS sind vor allem relevant:

- `db.sql`
- `logto.sql`
- `state.tar.gz`
- `logs.tar.gz`
- `upload_staging.tar.gz`
- `.env.vps`

Nicht Bestandteil dieses Restore-Ziels:

- externer Kunden-Upload-Mount
- externer Raw-Upload-Mount

---

## UI-Verhalten

Im Admin-UI bedeutet "Komplettes Volume mitsichern" inzwischen:

- nur lokale VPS-Restore-Daten
- nicht die externen NAS-Mounts

Relevante UI-/API-Dateien:

- `app/src/components/backups/BackupManager.tsx`
- `booking/server.js`

---

## Prüfung

### Täglichen Job manuell testen

```bash
/volume1/backup/propus-platform/scripts/backup-nas-pull.sh
```

### Wochenjob manuell testen

```bash
/volume1/backup/propus-platform/scripts/backup-nas-full-pull.sh
```

### Letzten Sync-Status auf der VPS lesen

```bash
tail -n 20 /opt/propus-platform/backups/.nas-sync.log
```

### Letzte NAS-Backups anzeigen

```bash
ls -lah /volume1/backup/propus-platform/data
```

---

## Aktueller Soll-Zustand

- Tagesjob sichert DB und Metadaten schnell und stabil.
- Wochenjob sichert DB, Metadaten und lokale Restore-Volumes.
- Externe NAS-Mounts sind aus der Backup-Logik entfernt.
- NAS-Sync-Status wird auf der VPS in `.nas-sync.log` gespiegelt.
