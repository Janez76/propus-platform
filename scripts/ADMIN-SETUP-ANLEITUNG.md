# Admin-Benutzer Setup – Propus Platform

## Ziel
Hauptadministrator-Konto anlegen:
- **Benutzername**: janez
- **E-Mail**: js@propus.ch
- **Name**: Janez
- **Rolle**: super_admin
- **Passwort**: Zuerich8038!

---

## Methode A – Automatisch via Env-Variablen (empfohlen)

### Schritt 1: VPS .env bearbeiten
SSH zum VPS und `.env.vps` anpassen:

```bash
ssh propus@87.106.24.107
cd /opt/propus-platform
nano .env.vps
```

Folgende Variablen hinzufügen/aktualisieren:
```env
ADMIN_USER=janez
ADMIN_PASS=Zuerich8038!
ADMIN_EMAIL=js@propus.ch
ADMIN_NAME=Janez
ADMIN_ROLE=super_admin
ADMIN_BOOTSTRAP_SYNC_PASSWORD=true
```

### Schritt 2: Platform neu starten
```bash
docker compose restart platform
```

### Schritt 3: Prüfen
```bash
docker compose logs platform --tail=30 | grep -i "admin_users\|boot"
```
Erwartet: `[boot] admin_users angelegt: janez` oder `Passwort synchronisiert: janez`

### Schritt 4: Sync-Passwort deaktivieren (Sicherheit)
Nach erfolgreichem Setup in `.env.vps`:
```env
ADMIN_BOOTSTRAP_SYNC_PASSWORD=false
```
Dann: `docker compose restart platform`

---

## Methode B – Setup-Endpunkt (alternativ, ohne Restart)

### Schritt 1: Token setzen
In `.env.vps` hinzufügen:
```env
ADMIN_SETUP_TOKEN=PropusSetup2026!
```
Dann: `docker compose restart platform`

### Schritt 2: API aufrufen
```bash
curl -X POST https://admin-booking.propus.ch/api/admin/first-setup \
  -H "Content-Type: application/json" \
  -d '{
    "token": "PropusSetup2026!",
    "username": "janez",
    "email": "js@propus.ch",
    "name": "Janez",
    "password": "Zuerich8038!",
    "role": "super_admin"
  }'
```

Erwartet: `{"ok":true,"action":"created","username":"janez","email":"js@propus.ch","role":"super_admin"}`

### Schritt 3: Token entfernen (Sicherheit!)
```env
ADMIN_SETUP_TOKEN=
```
Dann: `docker compose restart platform`

---

## Methode C – Docker exec (direkter Zugriff)

```bash
ssh propus@87.106.24.107
cd /opt/propus-platform
bash scripts/vps-setup-admin.sh
```

---

## Login testen

Öffne: https://admin-booking.propus.ch/login

- Benutzername: `janez` oder `js@propus.ch`
- Passwort: `Zuerich8038!`

---

## Nach dem Setup

1. Passwort ändern unter: Einstellungen → Benutzerkonto
2. Weitere Admin-Benutzer anlegen unter: /settings/access → Intern → Neuer Benutzer
3. `ADMIN_SETUP_TOKEN` und `ADMIN_BOOTSTRAP_SYNC_PASSWORD` aus `.env.vps` entfernen
