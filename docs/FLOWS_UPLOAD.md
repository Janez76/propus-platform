# Propus Platform — Upload-System

> **Automatisch mitpflegen:** Bei Änderungen an Upload-Kategorien, NAS-Pfad-Logik, Chunked-Upload oder Konflikt-Modi dieses Dokument aktualisieren.

*Zuletzt aktualisiert: April 2026*

---

## Inhaltsverzeichnis

1. [Endpunkte](#1-endpunkte)
2. [Tabellen](#2-tabellen)
3. [NAS-Pfad-Logik](#3-nas-pfad-logik)
4. [Kategorien](#4-kategorien)
5. [Chunked-Upload-Flow](#5-chunked-upload-flow)
6. [Konflikt-Modi](#6-konflikt-modi)
7. [Upload-Gruppen](#7-upload-gruppen)
8. [Was nach erfolgreichem Upload passiert](#8-was-nach-erfolgreichem-upload-passiert)

---

## 1. Endpunkte

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `POST` | `/api/admin/orders/:orderNo/upload-chunked/init` | Fotograf/Admin | Chunked-Upload initialisieren → gibt `uploadId`, `sessionId` zurück |
| `POST` | `/api/admin/orders/:orderNo/upload-chunked/status` | Fotograf/Admin | Chunk-Status abrufen (welche Teile vorhanden) |
| `POST` | `/api/admin/orders/:orderNo/upload-chunked/part` | Fotograf/Admin | Einzelnen Chunk hochladen (Index + Datei) |
| `POST` | `/api/admin/orders/:orderNo/upload-chunked/complete` | Fotograf/Admin | Chunks zusammenfügen → merged file in Session |
| `POST` | `/api/admin/orders/:orderNo/upload-chunked/finalize` | Fotograf/Admin | Session in Batch überführen → Transfer starten |
| `POST` | `/api/admin/orders/:orderNo/upload` | Fotograf/Admin | Direkter (nicht-chunked) Upload |
| `GET` | `/api/admin/orders/:orderNo/upload-batches` | Fotograf/Admin | Alle Batches eines Auftrags |
| `GET` | `/api/admin/orders/:orderNo/upload-batches/:batchId` | Fotograf/Admin | Einzelnen Batch abrufen |
| `POST` | `/api/admin/orders/:orderNo/upload-batches/:batchId/retry` | Admin | Fehlgeschlagenen Batch neu starten |
| `GET` | `/api/admin/orders/:orderNo/uploads` | Fotograf/Admin | Dateien im NAS-Ordner auflisten |
| `GET` | `/api/admin/orders/:orderNo/uploads/file` | Fotograf/Admin | Datei herunterladen |
| `DELETE` | `/api/admin/orders/:orderNo/uploads/file` | Fotograf/Admin | Datei löschen |
| `DELETE` | `/api/admin/orders/:orderNo/uploads/folder` | Fotograf/Admin | Unterordner löschen |
| `POST` | `/api/admin/orders/:orderNo/uploads/websize-sync` | Fotograf/Admin | Websize-Sync manuell auslösen (synchron) |
| `POST` | `/api/admin/orders/:orderNo/uploads/websize-rebuild` | Fotograf/Admin | Websize force-Rebuild (fire-and-forget, läuft im Hintergrund) |
| `GET` | `/api/admin/orders/:orderNo/storage` | Admin | Ordner-Status, Batches, NAS-Gesundheit |
| `POST` | `/api/admin/orders/:orderNo/storage/provision` | Admin | Kanonische NAS-Struktur anlegen + DB-Link (`createMissing`) |
| `POST` | `/api/admin/orders/:orderNo/storage/link` | Admin | Bestehenden Ordner verknüpfen; optional Umbenennen auf kanonischen Pfad |
| `POST` | `/api/admin/orders/:orderNo/storage/nextcloud-share` | Admin | Nextcloud-Freigabe für `customer_folder` |
| `DELETE` | `/api/admin/orders/:orderNo/storage/folder` | Admin | Ordner archivieren (phys. ins Archiv-Root) |

---

## 1a. Nextcloud-Freigabelinks

Über den Endpunkt `POST .../storage/nextcloud-share` wird für den `customer_folder` eines Auftrags ein öffentlicher Freigabelink in Nextcloud angelegt (Nextcloud OCS Share API v2).

**Infrastruktur (seit April 2026):**

| Eigenschaft | Wert |
|---|---|
| Nextcloud-Host | UGREEN NAS `192.168.1.5` |
| Öffentliche URL | `https://cloud.propus.ch` (Cloudflare Tunnel direkt vom NAS) |
| Docker-Pfad (NAS) | `/volume1/docker/nextcloud/` |
| Log-Pfad (NAS) | `/volume1/docker/nextcloud/data/nextcloud.log` |

**Erforderliche Env-Variablen** (in `.env.vps` / `.env.vps.secrets`):

| Variable | Beschreibung |
|---|---|
| `NEXTCLOUD_URL` | `https://cloud.propus.ch` |
| `NEXTCLOUD_USER` | Nextcloud-Benutzername |
| `NEXTCLOUD_PASS` | Nextcloud-Passwort |
| `NEXTCLOUD_CUSTOMER_FOLDER_PATH` | Nextcloud-Pfad, der auf `BOOKING_UPLOAD_CUSTOMER_HOST_PATH` zeigt (z. B. `/Immobilien Fotografie Propusimmo/Kunden`) |

**Verhalten:**
- Fehlende Konfiguration → `503` mit Hinweis auf fehlende Env-Variablen
- Erstellter Link wird in `booking.order_folder_links.nextcloud_share_url` gespeichert
- Bestehende Links können über denselben Endpunkt erneuert werden

**Implementierung:** `booking/nextcloud-share.js` (Hilfsfunktionen), `booking/server.js` (Route)

---

## 2. Tabellen

### `booking.upload_batches`

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | TEXT PK | Format: `upl_{orderNo}_{timestamp}_{random4hex}` |
| `order_no` | INT FK → orders | |
| `folder_type` | TEXT | `raw_material` oder `customer_folder` |
| `category` | TEXT | Kategorie-Schlüssel (s. Kategorie-Map) |
| `upload_mode` | TEXT | `existing` oder `new_batch` |
| `status` | TEXT | s. Status-Werte |
| `local_path` | TEXT | Absoluter Staging-Pfad |
| `target_relative_path` | TEXT | Relativer Zielpfad (nach Transfer) |
| `target_absolute_path` | TEXT | Absoluter Zielpfad (nach Transfer) |
| `batch_folder` | TEXT | Unterordner-Name (bei `new_batch`) |
| `comment` | TEXT | Optionaler Kommentar (wird als .txt geschrieben) |
| `file_count` | INT | Anzahl Dateien im Batch |
| `total_bytes` | BIGINT | Gesamtgrösse |
| `uploaded_by` | TEXT | Wer den Upload angestossen hat |
| `error_message` | TEXT | Fehlermeldung bei `failed` |
| `conflict_mode` | TEXT | `skip` (default) oder `replace` |
| `custom_folder_name` | TEXT | Reserviert; im aktuellen API-Flow nicht als eigener `upload_mode` aktiv |
| `upload_group_id` | TEXT | Gruppen-ID für mehrteilige Uploads |
| `upload_group_total_parts` | INT | Gesamtanzahl Teile in der Gruppe |
| `upload_group_part_index` | INT | Index dieses Teils (1-basiert) |
| `created_at` / `updated_at` | TIMESTAMPTZ | |
| `started_at` | TIMESTAMPTZ | Beginn des Transfers |
| `completed_at` | TIMESTAMPTZ | Abschluss des Transfers |

**Status-Werte (`upload_batches.status`):**

| Wert | Bedeutung |
|---|---|
| `staged` | Dateien im Staging, Transfer noch nicht gestartet |
| `transferring` | Transfer läuft |
| `retrying` | Wiederholung nach Fehler |
| `completed` | Alle Dateien erfolgreich übertragen |
| `failed` | Mindestens eine Datei fehlgeschlagen |
| `cancelled` | Manuell abgebrochen |

---

### `booking.upload_batch_files`

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `batch_id` | TEXT FK → upload_batches | |
| `original_name` | TEXT | Originaler Dateiname vom Client |
| `stored_name` | TEXT | Sanitierter Dateiname im Staging |
| `staging_path` | TEXT | Absoluter Pfad im Staging |
| `size_bytes` | BIGINT | Dateigrösse |
| `sha256` | TEXT | SHA-256 Hash |
| `status` | TEXT | s. Status-Werte |
| `duplicate_of` | TEXT | Dateiname der Duplikat-Quelle |
| `error_message` | TEXT | Fehlertext oder `content_identical` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Status-Werte (`upload_batch_files.status`):**

| Wert | Bedeutung |
|---|---|
| `staged` | Im Staging, noch nicht übertragen |
| `stored` | Erfolgreich ins NAS kopiert |
| `skipped_duplicate` | Duplikat (Name oder Hash) → übersprungen |
| `skipped_invalid_type` | Dateierweiterung für Kategorie nicht erlaubt |
| `failed` | Transfer fehlgeschlagen |

---

## 3. NAS-Pfad-Logik

### Umgebungsvariablen

| Variable | Zweck |
|---|---|
| `BOOKING_UPLOAD_CUSTOMER_ROOT` | Root für Kundenordner (NAS-Mount) |
| `BOOKING_UPLOAD_RAW_ROOT` | Root für Rohmaterial (NAS-Mount) |
| `BOOKING_UPLOAD_STAGING_ROOT` | Lokales Staging-Verzeichnis |
| `BOOKING_UPLOAD_CHUNK_TMP_ROOT` | Temporäres Root für Chunk-Dateien |
| `BOOKING_UPLOAD_CHUNK_SESSION_ROOT` | Root für zusammengeführte Session-Dateien vor dem finalen Batch |
| `BOOKING_UPLOAD_CHUNK_TTL_HOURS` | TTL für Cleanup alter Chunk-/Session-Verzeichnisse |
| `BOOKING_UPLOAD_CUSTOMER_ARCHIVE_ROOT` | Archiv-Root für Kundenordner |
| `BOOKING_UPLOAD_RAW_ARCHIVE_ROOT` | Archiv-Root für Rohmaterial |
| `BOOKING_UPLOAD_REQUIRE_MOUNT` | Optionaler Guard: verlangt gemountete Zielpfade vor NAS-Transfers |

### Pfad-Aufbau

```
customer_folder:
  customerNasCustomerFolderBase gesetzt →
    {CUSTOMER_ROOT}/{customerNasCustomerFolderBase}/{displayName}/
  sonst:
    {CUSTOMER_ROOT}/{companyName}/{displayName}/

raw_material:
  customerNasRawFolderBase gesetzt →
    {RAW_ROOT}/{customerNasRawFolderBase}/{displayName}/
  sonst:
    {RAW_ROOT}/{displayName}/
```

Die Felder `customerNasCustomerFolderBase` und `customerNasRawFolderBase` kommen aus den Kundenstammdaten (`customers`-Tabelle) und ermöglichen kundenspezifische Unterordner-Strukturen auf dem NAS.

### Provisioning und Verknüpfung bestehender Ordner

| Auslöser | Verhalten |
|---|---|
| Statuswechsel auf `confirmed` (`booking/order-status-workflow.js`) | `provisionOrderFolders` legt die leere Standard-Unterstruktur am **kanonischen** Pfad an und schreibt den DB-Link. |
| `POST .../storage/provision` | Gleiches über die Admin-API. |
| `POST .../storage/link` (`customer_folder`, `rename` default `true`) | Gewählter Ordner soll auf den kanonischen Pfad **verschoben/umbenannt** werden (`booking/order-storage.js` → `linkExistingOrderFolder`). |

**Platzhalter vor Umbenennung (April 2026):** Liegt der kanonische Zielpfad bereits (z. B. durch Provisioning), blockierte das früher die Umbenennung — es entstanden zwei Ordner (leerer Kanon + alter Kurzname). Enthält der Zielbaum **keine einzige Datei** (nur leere Ordner), wird dieser Platzhalter vor dem Verschieben entfernt; der verknüpfte Ordner rückt an die kanonische Stelle. Sobald **irgendwo** unter dem Zielpfad Dateien liegen, bleibt das bisherige Verhalten: Warnung *Zielordner existiert bereits*, kein Löschen.

Implementierung: `linkExistingOrderFolder` prüft per Dateiwald (`walkFilesRecursive`); bei Bedarf `fs.rmSync` auf den leeren Zielbaum, danach `moveDirectoryWithFallback`.

---

## 4. Kategorien

(`UPLOAD_CATEGORY_MAP`)

| Schlüssel | NAS-Unterordner | folder_type |
|---|---|---|
| `raw_bilder` | `Unbearbeitete/Bilder` | raw_material |
| `raw_grundrisse` | `Unbearbeitete/Grundrisse` | raw_material |
| `raw_video` | `Unbearbeitete/Video` | raw_material |
| `raw_sonstiges` | `Unbearbeitete/Sonstiges` | raw_material |
| `zur_auswahl` | `Zur Auswahl` | customer_folder |
| `final_websize` | `Finale/Bilder/WEB SIZE` | customer_folder |
| `final_fullsize` | `Finale/Bilder/FULLSIZE` | customer_folder |
| `final_grundrisse` | `Finale/Grundrisse` | customer_folder |
| `final_video` | `Finale/Video` | customer_folder |

---

## 5. Chunked-Upload-Flow

```
1. init (POST .../upload-chunked/init):
   → Chunk-Verzeichnis unter `BOOKING_UPLOAD_CHUNK_TMP_ROOT` erstellen
   → Gibt `uploadId` (`chu_...`) und `sessionId` (`chs_...`) zurück

2. status (POST .../upload-chunked/status):
   → Welche Chunk-Teile sind bereits vorhanden?
   → Für Wiederaufnahme bei Unterbrechung

3. part (POST .../upload-chunked/part):
   → Chunk schreiben: `{BOOKING_UPLOAD_CHUNK_TMP_ROOT}/{uploadId}/{index}.part`
   → Ein oder mehrere Chunks pro Datei

4. complete (POST .../upload-chunked/complete):
   → Alle Chunks zu einer Datei zusammenfügen
   → SHA-256 und Grösse prüfen
   → Merged file in Session unter `BOOKING_UPLOAD_CHUNK_SESSION_ROOT/{sessionId}` ablegen

5. finalize (POST .../upload-chunked/finalize):
   → Session → Upload-Batch überführen
   → Transfer zum NAS starten
   → Batch-Record in DB anlegen (`id = upl_...`)
   → Status: staged → transferring → completed/failed
```

---

## 6. Konflikt-Modi

| Wert | Verhalten |
|---|---|
| `skip` (default) | Datei mit gleichem Namen oder Hash vorhanden → `skipped_duplicate` |
| `replace` | Datei mit gleichem Namen: SHA-256 prüfen. Inhalt abweichend → alte löschen, neue schreiben. Gleicher Hash → `skipped_duplicate` |

---

## 7. Upload-Gruppen

Ermöglichen das Zusammenfassen mehrerer Batches zu einer logischen Einheit (z.B. grosser Upload in mehreren Durchgängen):

| Feld | Bedeutung |
|---|---|
| `upload_group_id` | Gemeinsame Gruppen-ID aller Teile |
| `upload_group_total_parts` | Gesamtanzahl Teile |
| `upload_group_part_index` | Dieser Batch ist Teil Nr. X (1-basiert) |

---

## 8. Was nach erfolgreichem Upload passiert

```
1. Dateien via copyFileSync Staging → NAS
2. SHA-256 + Dateigrösse nach Kopieren nochmals prüfen
3. Timestamps (atime/mtime) von Quelldatei übernehmen
4. Kommentar-Datei in Zielordner schreiben (falls comment gesetzt)
5. Staging-Verzeichnis löschen (fs.rmSync)
6. notifyCompleted-Callback: ggf. E-Mail, ggf. Websize-Sync auslösen
7. Batch: status='completed', completed_at=NOW()

Bei Fehler:
   → status='failed', Staging bleibt erhalten
   → Retry via POST .../retry
```

### Websize-Sync-Logik

Der Sync läuft auf zwei Wegen:

| Auslöser | Verhalten |
|---|---|
| Cronjob (`setInterval` alle 10 Min.) | `syncWebsizeForAllCustomerFolders` – alle verknüpften Kundenordner, inkrementell (nur neue/geänderte Bilder) |
| Button "Websize generieren" im Admin-Panel | `websize-rebuild` – fire-and-forget, `forceRebuild: true` (überschreibt bestehende Websize-Bilder) |

**Alias-Auflösung (seit April 2026):**

- Quelle und Ziel werden mit `resolveCategoryPath` aufgelöst – nicht mit `getCanonicalCategoryAbsolutePath`
- `resolveCategoryPath` sucht case-insensitiv nach Leerzeichen-normalisierten Alias-Namen (z.B. `WEB SIZE` = `websize` = `Websize`)
- Konsequenz: bestehende Alias-Ordner (`Finale/Fullsize`, `Finale/Bilder/WEB SIZE`) werden gefunden und verwendet – es werden keine Duplikate angelegt
- Ein leerer Zielordner wird **nicht** angelegt wenn keine verarbeitbaren `.jpg`-Dateien im Quellordner vorhanden sind

**Verarbeitete Pipelines pro Sync-Lauf:**

```
staging_fullsize → staging_websize
final_fullsize   → final_websize
final_grundrisse → JPG-Variante (PDF → JPEG)
```

### NAS-Archivierung

Wenn ein Auftrag archiviert wird, werden die Ordner-Links in `booking.order_folder_links` auf `status='archived'`, `archived_at=NOW()` gesetzt. Die physischen Dateien werden in die Archive-Root verschoben.

### Tabelle `booking.order_folder_links`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `order_no` | INT FK → orders | |
| `folder_type` | TEXT | `raw_material` oder `customer_folder` |
| `root_kind` | TEXT | `raw` oder `customer` |
| `relative_path` | TEXT | Relativer Pfad im NAS |
| `absolute_path` | TEXT | Vollständiger Pfad |
| `display_name` | TEXT | Anzeigename |
| `company_name` | TEXT | Firmenname |
| `status` | TEXT | `pending`, `ready`, `linked`, `archived`, `failed` |
| `last_error` | TEXT | Fehlermeldung |
| `created_at` / `updated_at` | TIMESTAMPTZ | |
| `archived_at` | TIMESTAMPTZ | |

Unique Index auf `(order_no, folder_type)` WHERE `archived_at IS NULL`.
