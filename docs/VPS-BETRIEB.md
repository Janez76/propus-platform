# Propus Platform – VPS-Betriebshandbuch

## Überblick

| Eigenschaft         | Wert                                       |
|---------------------|--------------------------------------------|
| VPS-IP              | `87.106.24.107`                            |
| SSH-Zugang          | `root` / Passwort `Lvig22SI`               |
| Projektpfad         | `/opt/propus-platform`                     |
| Compose-Projekt     | `propus-platform`                          |
| Env-Datei           | `/opt/propus-platform/.env.vps`            |
| Alte Installation   | `/opt/buchungstool-OLD` (Rollback-Reserve) |

### Öffentliche Endpunkte

| Dienst               | URL                                      |
|----------------------|------------------------------------------|
| Buchungsseite        | https://booking.propus.ch                |
| Admin-Panel          | https://admin-booking.propus.ch          |
| API                  | https://api-booking.propus.ch            |
| Logto OIDC           | https://auth.propus.ch                   |
| Logto Admin Console  | https://auth-admin.propus.ch/console     |

### Docker-Container

| Container                         | Interner Port | Externer Port (127.0.0.1) |
|-----------------------------------|---------------|---------------------------|
| `propus-platform-postgres-1`      | 5432          | 5435                      |
| `propus-platform-logto-db-1`      | 5432          | 5436                      |
| `propus-platform-logto-1`         | 3001 / 3002   | 3301 / 3302               |
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

### Einzelnen Container neu starten

```bash
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps restart platform
```

### Logs ansehen

```bash
# Alle Container
docker compose -p propus-platform -f docker-compose.vps.yml logs --tail 100 -f

# Nur Platform
docker logs propus-platform-platform-1 --tail 100 -f

# Nur Logto
docker logs propus-platform-logto-1 --tail 100 -f
```

### Health-Check

```bash
curl -s http://127.0.0.1:3100/api/health | python3 -m json.tool
```

---

## Backup

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

### Backup lokal herunterladen (Windows PowerShell)

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
& "C:\Program Files\PuTTY\pscp.exe" -batch -pw "Lvig22SI" `
  -hostkey "ssh-ed25519 255 SHA256:m9PtE+Rhlykcl5l8pfDibqU2s9FLwVkxwabcUxgJ0RQ" `
  -r root@87.106.24.107:/opt/propus-platform/backups/ `
  "z:\propus-platform\backups\vps-$ts\"
```

### Logto-DB separat sichern

```bash
docker exec propus-platform-logto-db-1 \
  pg_dump -U logto -d logto > /opt/propus-platform/backups/logto-$(date +%Y%m%d-%H%M%S).sql
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
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps up -d platform
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
  up -d platform
```

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
curl -X POST "https://api.cloudflare.com/client/v4/zones/705b4ad4994d062aada5c5432044d9cb/purge_cache" \
  -H "X-Auth-Email: js@propus.ch" \
  -H "X-Auth-Key: 6521f97f602256db7891475518d0d7b6c646e" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

### WAF-Regeln

- **Auth-Hosts**: Skip-Regel für WAF/SBFM/RateLimit/SecurityLevel aktiv
- **Auth-Hosts**: Email-Obfuscation deaktiviert (Config Rule)
- **Auth-Hosts**: CSP-Header entfernt (Response Header Transform Rule)

---

## Logto-Apps (SSO)

| App                  | Client-ID                    | Typ          |
|----------------------|------------------------------|--------------|
| Propus Booking       | `pwdmwn455oxoxdmaydjjo`      | Traditional  |
| Propus Tours Admin   | `ijxjuyq6ez1kvdans6goe`      | Traditional  |
| Propus Tours Portal  | `4de87xl1ecuwphccqzqaw`      | Traditional  |
| Propus Management    | `xp7smk9yr99x9isgu9ci5`      | M2M          |

Admin-Console: https://auth-admin.propus.ch/console

---

## Wichtige Dateien

| Datei                          | Zweck                                    |
|--------------------------------|------------------------------------------|
| `docker-compose.vps.yml`       | Docker-Service-Definitionen              |
| `.env.vps`                     | Produktive Umgebungsvariablen            |
| `.env.vps.example`             | Template mit Variablen-Dokumentation     |
| `.env.logto`                   | Logto Client-IDs und Secrets             |
| `scripts/backup-vps.sh`        | Automatisches VPS-Backup-Script          |
| `scripts/restore-vps.sh`       | VPS-Restore-Script                       |
| `scripts/deploy-vps.ps1`       | Windows-Deployment-Script                |
| `core/migrate.js`              | Schema-Migrationen                       |
| `core/migrate-from-vps.js`     | Daten-Migration vom alten Buchungstool   |
| `auth/setup-logto.js`          | Logto-App-Setup-Script                   |

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

### Logto "password authentication failed"

Hauptrolle-Passwort zurücksetzen:

```bash
docker exec propus-platform-logto-db-1 \
  psql -U logto -d postgres -c "ALTER ROLE logto WITH PASSWORD '<Passwort aus .env.vps>';"
```

### Cloudflare 502/403

1. Container-Status prüfen: `docker ps`
2. Tunnel-Status: `systemctl status cloudflared`
3. Lokaler Port erreichbar? `curl -I http://127.0.0.1:3100`
4. WAF-Regeln in Cloudflare Dashboard prüfen
