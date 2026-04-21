# Propus Platform – VPS-Betriebshandbuch

## Überblick

| Eigenschaft         | Wert                                       |
|---------------------|--------------------------------------------|
| VPS-IP              | `87.106.24.107`                            |
| SSH-Zugang          | `root` / SSH-Key `id_ed25519_propus_vps` (Passwort entfernt) |
| Projektpfad         | `/opt/propus-platform`                     |
| Compose-Projekt     | `propus-platform`                          |
| Env-Datei           | `/opt/propus-platform/.env.vps`            |
| Alte Installation   | `/opt/buchungstool-OLD` (Rollback-Reserve) |
| Node-Version (Docker) | `20.18.1` (gepinnt in allen Dockerfiles und Compose-Dateien) |

### Öffentliche Endpunkte

| Dienst               | URL                                      |
|----------------------|------------------------------------------|
| Buchungsseite        | https://booking.propus.ch                |
| Admin-Panel          | https://admin-booking.propus.ch          |
| API                  | https://api-booking.propus.ch            |

### Docker-Container

| Container                         | Interner Port | Externer Port (127.0.0.1) |
|-----------------------------------|---------------|---------------------------|
| `propus-platform-postgres-1`      | 5432          | 5435                      |
| `propus-platform-platform-1`      | 3000          | 3100                      |

---

## Täglicher Betrieb

### Stack starten

```bash
cd /opt/propus-platform
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps up -d
```

### Stack stoppen

```bash
cd /opt/propus-platform
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps down
```

### Platform-Container neu erstellen

```bash
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate platform
```

Verwende fuer Env-Aenderungen bewusst `--force-recreate`, damit neue Werte aus `.env.vps`
wirklich in den laufenden Container uebernommen werden.

### Logs ansehen

```bash
# Alle Container
docker compose -p propus-platform -f docker-compose.vps.yml logs --tail 100 -f

# Nur Platform
docker logs propus-platform-platform-1 --tail 100 -f

```

### Health-Check

```bash
curl -s http://127.0.0.1:3100/api/health | python3 -m json.tool
```

---

## Backup

Siehe fuer den aktuellen Soll-Zustand auch `docs/BACKUPS.md`.

### Manuelles Backup auf dem VPS

```bash
cd /opt/propus-platform
bash scripts/backup-vps.sh
```

Erzeugt unter `/opt/propus-platform/backups/` ein Verzeichnis mit:
- `propus-db.sql` (PostgreSQL-Dump)
- `orders.json` (Auftragsdaten)
- `.env.vps` (Konfiguration)
- `checksums.sha256`

### NAS-Cronjobs

Täglicher NAS-Sync ohne grosse Volume-Archive:

```bash
0 2 * * * /volume1/backup/propus-platform/scripts/backup-nas-pull.sh >> /volume1/backup/propus-platform/logs/backup.log 2>&1
```

Wöchentlicher Voll-Backup-Lauf inklusive Volumes:

```bash
0 3 * * 0 /volume1/backup/propus-platform/scripts/backup-nas-full-pull.sh >> /volume1/backup/propus-platform/logs/backup-full.log 2>&1
```

Der tägliche Job sichert standardmässig `db.sql`, `metadata.txt` und `SHA256SUMS.txt`.
Der Wochenjob setzt `BACKUP_NAS_INCLUDE_VOLUMES=1` und nimmt zusätzlich nur die VPS-lokalen Restore-Pfade `state`, `logs` und `upload_staging` als `.tar.gz` mit.
Externe NAS-Mounts wie Kunden- und Raw-Uploads werden dabei bewusst nicht archiviert.

### Backup lokal herunterladen (Windows PowerShell)

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
& "C:\Program Files\PuTTY\pscp.exe" -batch -i "$env:USERPROFILE\.ssh\id_ed25519_propus_vps.ppk" `
  -hostkey "ssh-ed25519 255 SHA256:m9PtE+Rhlykcl5l8pfDibqU2s9FLwVkxwabcUxgJ0RQ" `
  -r root@87.106.24.107:/opt/propus-platform/backups/ `
  "z:\propus-platform\backups\vps-$ts\"
```

---

## Restore

### Datenbank wiederherstellen

```bash
cd /opt/propus-platform

# Platform stoppen
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps stop platform

# Dump einspielen
docker exec -i propus-platform-postgres-1 \
  psql -U propus -d propus < /opt/propus-platform/backups/<BACKUP_DIR>/propus-db.sql

# Platform starten
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate platform
```

### orders.json wiederherstellen

```bash
docker cp /opt/propus-platform/backups/<BACKUP_DIR>/orders.json \
  propus-platform-platform-1:/data/state/orders.json

docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps restart platform
```

---

## Schema-Migration

Nach einem Code-Update mit Datenbankänderungen:

```bash
cd /opt/propus-platform
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps \
  --profile migrate run --rm migrate
```

---

## Deployment (vom lokalen Windows-Rechner)

### Automatisiert via Script

```powershell
.\scripts\deploy-vps.ps1 -VpsHost 87.106.24.107
```

### Manuell: Nur Platform-Image neu bauen

```bash
cd /opt/propus-platform
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps \
  build --no-cache platform
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps \
  up -d --force-recreate platform
```

### CI/CD: Datei-Synchronisation auf dem VPS (`deploy-remote.sh`)

Das Skript `scripts/deploy-remote.sh` wird vom GitHub-Actions-Workflow auf dem VPS ausgefuehrt. Es entpackt das Deploy-Archiv in ein Staging-Verzeichnis und synchronisiert es nach `/opt/propus-platform`.

**rsync --delete** (bevorzugt): Entfernt Dateien, die im Archiv nicht mehr enthalten sind, damit keine veralteten Quell-Dateien auf dem VPS liegen bleiben (verhindert Stale-TS/Docker-Fehler). Folgende Pfade werden vom Loeschen ausgenommen:

| Exclude-Pfad        | Grund                                              |
|----------------------|----------------------------------------------------|
| `.env.vps`           | Produktive Umgebungsvariablen (nur auf VPS)        |
| `.env.vps.secrets`   | VPS-lokale Secrets (z. B. Payrexx)                 |
| `backups/`           | Lokale Backup-Daten                                |

**Fallback** (kein rsync verfuegbar): Die Source-Verzeichnisse (`app`, `booking`, `core`, `platform`, `tours`, `website`) werden vor dem Overlay-Copy explizit geloescht.

---

## Rollback auf altes Buchungstool

Falls die neue Plattform kritische Probleme hat:

```bash
# 1. Neue Plattform stoppen
cd /opt/propus-platform
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps down

# 2. Alte Installation wiederherstellen
cd /opt/buchungstool-OLD
docker compose -p buchungstool_prod up -d

# 3. Cloudflare-Tunnel manuell auf alte Ports zurückstellen
#    (booking.propus.ch -> http://127.0.0.1:3100 auf alten Port ändern)
```

Lokales Backup der Vor-Migration-Daten liegt unter:
`z:\propus-platform\backups\vps-pre-migration\`

---

## Externe Integrationen

### Payrexx (Online-Zahlung für Tour-Reaktivierungen)

Payrexx ist optional. Ohne Konfiguration steht nur "QR-Rechnung" zur Verfügung — der Dialog zeigt die Payrexx-Option dann ausgegraut an.

**Env-Variablen:** Entweder in `.env.vps` oder — empfohlen für feste VPS-Verankerung — in **`.env.vps.secrets`** (gleiche Keys). Die Datei `.env.vps.secrets` liegt nur auf dem Server, wird vom GitHub-Deploy **nicht** überschrieben und von Docker Compose nach `.env.vps` geladen (spätere Datei gewinnt). Vorlage: `.env.vps.secrets.example`.

**Einmalig auf dem VPS** (nach einem Deploy liegt das Skript unter `/opt/propus-platform/scripts/`):

```bash
cd /opt/propus-platform && bash scripts/vps-bootstrap-env-secrets.sh
# Werte in .env.vps.secrets eintragen, dann platform neu erstellen (siehe unten)
```

```env
PAYREXX_INSTANCE=propus          # Instanzname aus der URL: https://propus.payrexx.com
PAYREXX_API_SECRET=xxx           # Dashboard → Einstellungen → API → Key erstellen
PAYREXX_WEBHOOK_SECRET=xxx       # Webhook-Signing-Key (optional, Fallback auf API-Secret)
PAYREXX_PAYMENT_METHODS=curated  # Optional: curated | all | visa,mastercard,twint,...
```

**Webhook in Payrexx konfigurieren:**

Dashboard → **Einstellungen → Webhooks** → neue URL eintragen:

```
https://admin-booking.propus.ch/webhook/payrexx
```

- Methode: `POST`
- Event: `gateway.confirmed` (mindestens)
- Die Signatur-Verifizierung läuft über `PAYREXX_API_SECRET` (HMAC-SHA256)

**Nach Änderung der Env-Variablen:**

```bash
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate platform
```

> Die `payrexx_configured`-Info wird bei jedem Tour-Detail-Aufruf live aus den Env-Vars gelesen — kein Neustart nötig um den Status im UI zu sehen, aber die Variablen selbst brauchen einen Neustart.

### Google Reviews (Firmenhomepage)

`GOOGLE_REVIEWS_PLACE_ID` legt die Google-Place-ID fuer die Bewertungsanzeige auf der Propus-Website fest. Seit PR #88 ist der Default-Wert **nicht mehr in `docker-compose.vps.yml` hartcodiert**, sondern muss in `.env.vps` (bzw. `.env.vps.example` als Vorlage) gesetzt sein. Ohne diesen Wert bleibt die Variable leer und die Google-Reviews-Integration ist inaktiv.

```env
GOOGLE_REVIEWS_PLACE_ID=ChIJCXJ70_ZCiisRJDlGdaYk66Y
```

---

## Cloudflare

### Tunnel-Konfiguration

Der Tunnel `a07b6bcd-f180-4ed8-9bf0-7b52f9098550` wird vom systemd-Service `cloudflared` betrieben.

Aktuelle Ingress-Regeln:

| Hostname                    | Origin                      |
|-----------------------------|-----------------------------|
| `booking.propus.ch`         | `http://127.0.0.1:3100`    |
| `admin-booking.propus.ch`   | `http://127.0.0.1:3100`    |
| `api-booking.propus.ch`     | `http://127.0.0.1:3100`    |
| `api.propus.ch`             | `http://127.0.0.1:3100`    |
| `auth.propus.ch`            | `http://127.0.0.1:3301`    |
| `auth-admin.propus.ch`      | `http://127.0.0.1:3302`    |

### Cache purgen

```bash
# Zugangsdaten: CLOUDFLARE_AUTH_EMAIL + CLOUDFLARE_AUTH_KEY (Global API Key) oder API-Token
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
  -H "X-Auth-Email: ${CLOUDFLARE_AUTH_EMAIL}" \
  -H "X-Auth-Key: ${CLOUDFLARE_AUTH_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

### WAF-Regeln

- **Auth-Hosts**: Skip-Regel für WAF/SBFM/RateLimit/SecurityLevel aktiv
- **Auth-Hosts**: Email-Obfuscation deaktiviert (Config Rule)
- **Auth-Hosts**: CSP-Header entfernt (Response Header Transform Rule)

---

## Wichtige Dateien

| Datei                          | Zweck                                    |
|--------------------------------|------------------------------------------|
| `docker-compose.vps.yml`       | Docker-Service-Definitionen              |
| `.env.vps`                     | Produktive Umgebungsvariablen            |
| `.env.vps.example`             | Template mit Variablen-Dokumentation     |
| `scripts/backup-vps.sh`        | Automatisches VPS-Backup-Script          |
| `scripts/restore-vps.sh`       | VPS-Restore-Script                       |
| `scripts/deploy-vps.ps1`       | Windows-Deployment-Script                |
| `scripts/deploy-remote.sh`     | VPS-seitiges Deploy-Script (rsync --delete) |
| `core/migrate.js`              | Schema-Migrationen                       |
| `core/migrate-from-vps.js`     | Daten-Migration vom alten Buchungstool   |

---

## Troubleshooting

### Container startet nicht

```bash
docker logs propus-platform-<container>-1 --tail 50
```

### Datenbank nicht erreichbar

```bash
docker exec propus-platform-postgres-1 pg_isready -U propus -d propus
```

### Cloudflare 502/403

1. Container-Status prüfen: `docker ps`
2. Tunnel-Status: `systemctl status cloudflared`
3. Lokaler Port erreichbar? `curl -I http://127.0.0.1:3100`
4. WAF-Regeln in Cloudflare Dashboard prüfen
