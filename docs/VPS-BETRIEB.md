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

Der tägliche Job sichert standardmässig `db.sql`, `logto.sql`, `metadata.txt` und `SHA256SUMS.txt`.
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

## Externe Integrationen

### Payrexx (Online-Zahlung für Tour-Reaktivierungen)

Payrexx ist optional. Ohne Konfiguration steht nur "QR-Rechnung" zur Verfügung — der Dialog zeigt die Payrexx-Option dann ausgegraut an.

**Env-Variablen in `.env.vps`:**

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
docker compose -p propus-platform -f docker-compose.vps.yml --env-file .env.vps up -d platform
```

> Die `payrexx_configured`-Info wird bei jedem Tour-Detail-Aufruf live aus den Env-Vars gelesen — kein Neustart nötig um den Status im UI zu sehen, aber die Variablen selbst brauchen einen Neustart.

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

### Sign-in im Propus-Stil (Branding)

Die Login-Oberfläche wird von **Logto** ausgeliefert (nicht vom React-Frontend). Anpassungen erfolgen in der **Logto Console** unter **Sign-in & account → Branding**. Siehe auch [Match your brand](https://docs.logto.io/customization/match-your-brand) und [Custom CSS](https://docs.logto.io/customization/custom-css).

| Einstellung | Wert (Propus, siehe `app/src/index.css`) |
|-------------|--------------------------------------------------------|
| Brandfarbe (Light) | `#B68E20` (`--propus-gold`) |
| Brandfarbe (Dark, falls aktiv) | `#d4b860` (`--propus-gold-dark`) |
| Hintergrund / Stimmung | Beige `#F1F2EA` (`--propus-beige`) – über **Custom CSS** (unten) |
| Logo / Favicon | Dieselbe Datei wie im Admin: öffentlich unter [https://booking.propus.ch/assets/brand/logopropus.png](https://booking.propus.ch/assets/brand/logopropus.png) (speichern und in Logto **hochladen**; Logto nutzt in der Regel keine Hotlink-URL). Favicon: z. B. dieselbe PNG oder `favicon.png` aus dem Brand-Ordner, maximal 500 KB |
| Pro App abweichend | **Applications → [App] → App-level sign-in experience** |

#### Automatisch per Skript (empfohlen)

Repository: `auth/apply-logto-propus-branding.js` setzt per **Logto Management API** den Tenant-Default für **Anmeldung & Konto**: Brandfarben, Logo-/Favicon-URLs (`https://booking.propus.ch/assets/brand/logopropus.png`), **Custom CSS** (`auth/logto-propus-branding.css`), Terms/Privacy, Forgot Password und ein konservatives Patch der vorhandenen Sign-in-/Sign-up-Einstellungen. Für Booking/Tours-Apps setzt es zusaetzlich das **App-Level-Branding** mit den von Logto erlaubten Feldern (Farben, Branding, Display-Name, Terms/Privacy). Voraussetzung: `PROPUS_MANAGEMENT_LOGTO_APP_ID` / `SECRET` und `LOGTO_ENDPOINT` wie im laufenden Betrieb (lokal oder VPS).

```bash
# Auf dem Rechner mit gültiger .env.logto / .env.vps (oder exportierte Variablen):
node auth/apply-logto-propus-branding.js

# Nur anzeigen, nichts schreiben:
node auth/apply-logto-propus-branding.js --dry-run
```

Auf dem VPS (Beispiel, Pfade wie in `AGENTS.md`):

```bash
cd /opt/propus-platform && set -a && source .env.vps 2>/dev/null; set +a; node auth/apply-logto-propus-branding.js
```

`--dry-run` zeigt sowohl den Tenant-Patch (`PATCH /api/sign-in-exp`) als auch alle geplanten App-Level-Payloads. Ohne M2M-Credentials wird dabei kein aktueller Tenant-Zustand geladen; die Vorschau basiert dann nur auf Defaults/Overrides.

Overrides per Umgebungsvariable:

- `PROPUS_LOGTO_BRAND_PRIMARY`, `PROPUS_LOGTO_BRAND_DARK`
- `PROPUS_LOGTO_BRAND_LOGO_URL`, `PROPUS_LOGTO_BRAND_FAVICON_URL`
- `PROPUS_LOGTO_BRAND_CSS_FILE`
- `PROPUS_LOGTO_DISPLAY_NAME`
- `PROPUS_LOGTO_TERMS_URL`, `PROPUS_LOGTO_PRIVACY_URL`
- `PROPUS_LOGTO_FORGOT_PASSWORD_METHODS`
- `PROPUS_LOGTO_FALLBACK_LANGUAGE`, `PROPUS_LOGTO_LANGUAGE_AUTO_DETECT`
- `PROPUS_LOGTO_AGREE_TO_TERMS_POLICY`
- `PROPUS_LOGTO_HIDE_BRANDING`

Optional **„Powered by Logto“ ausblenden**, wenn die Lizenz/Edition das erlaubt (das Skript setzt `hideLogtoBranding`, falls die API das Feld liefert).

Wichtig: **App-Level** unterstuetzt in Logto nur Branding-nahe Felder. **Custom CSS, Forgot Password und Sign-in-/Sign-up-Methoden** werden weiterhin ueber den Tenant-Default gesteuert.

#### Branding wirkt nicht (noch Lila / Standard-Logto)?

1. **Speichern nicht vergessen** – nach Änderungen in der Console explizit speichern.
2. **Brandfarbe in der Oberfläche setzen** – unter **Branding** die Felder **Brandfarbe (Light)** = `#B68E20` (nicht nur Custom CSS; Logto schreibt die Farbe in die Experience-Variablen).
3. **App-Level prüfen** – unter **Applications → [eure App]**: Wenn **App-level sign-in experience** aktiv ist, gilt das **Omni**-Branding dort nicht. Entweder dort dieselben Farben / Logos / Links setzen oder App-Level wieder aus.
4. **Cache** – Seite mit hartem Reload testen (`Strg+F5`) oder privates Fenster; bei Cloudflare ggf. Cache für `auth.propus.ch` leeren (oder kurz **Development Mode**).
5. **Logo** – bleibt das Logto-Logo, solange unter **Branding** kein eigenes Logo hochgeladen ist (Propus-Logo: siehe Tabelle, URL `booking.propus.ch/.../logopropus.png`).

**Custom CSS** (unter **Branding → Custom CSS**): Neuere Logto-Versionen stylen Buttons und Links über **CSS-Variablen auf `body`** (z. B. `--color-brand-default`), nicht über feste `#app`-Strukturen. Deshalb zuerst die Variablen setzen; die alten Selektoren aus älteren Beispielen greifen oft nicht mehr.

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Roboto:wght@400;500;600&display=swap');

/* Primärfarbe & Hintergrund – Logto Design Tokens (Experience) */
body {
  font-family: 'Roboto', system-ui, sans-serif !important;
  --color-brand-default: #B68E20;
  --color-brand-hover: #c9a22a;
  --color-brand-pressed: #9a7619;
  --color-type-link: #B68E20;
  --color-bg-body-base: #F1F2EA;
}

body h1,
body h2 {
  font-family: 'Montserrat', system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  body {
    --color-brand-default: #d4b860;
    --color-brand-hover: #c9a22a;
    --color-brand-pressed: #B68E20;
    --color-type-link: #d4b860;
  }
}

/* Fallback für Submit-Buttons, falls Variablen nicht greifen */
button[type='submit'] {
  background: #B68E20 !important;
  color: #111111 !important;
  font-family: 'Montserrat', system-ui, sans-serif !important;
  font-weight: 600 !important;
}

button[type='submit']:hover {
  background: #9a7619 !important;
}
```

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
| `auth/apply-logto-propus-branding.js` | Sign-in & Konto per Management API auf Logto anwenden |

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
