# Paperless für Buchhaltung Propus GmbH einrichten

> **Ablageort:** `Y:\propus-platform\propus-platform\docs\PAPERLESS_BUCHHALTUNG_SETUP.md`
> **Stand:** Mai 2026
> **Zweck:** Block 3 des Bookkeeping-Setups – Paperless-ngx so vorbereiten, dass eingescannte Belege automatisch erkannt, getaggt und für den späteren `propus-bookkeeper` Service vorbereitet werden, ohne die bestehende paperless-ai Logik zu stören.
> **Aufwand:** ca. 3 Stunden konzentriert (mit Bootstrap-Skript ca. 30 min)
>
> **Zielsystem (alle Werte verifiziert aus `Y:\Arhive\Paperless\docker-compose.yml` + Cloudflare-Tunnel-Ingress):**
> - **NAS:** UGREEN, hostname `Propus`, IP `192.168.1.5`, SSH-Alias `nas-propus` (siehe [docs/SSH-NAS-ZUGANG.md](docs/SSH-NAS-ZUGANG.md)). Docker-Befehle auf der NAS brauchen `sudo` — Plain `docker ...` reicht nicht.
> - **Paperless-URL:** `https://paperless.propus.ch` → Cloudflare-Tunnel `dreamy_poincare` (Tunnel-ID `852d718f-22ff-4ab3-8e52-1a9e337314e0`) → `http://192.168.1.5:8777` → Container `paperless-ngx`. Eine WAF-Skip-Regel für diesen Hostname existiert bereits, Bot-Fight-Mode greift nicht — keine 403/Challenge bei Scanner-Uploads.
> - **Container-Namen:**
>   - `PaperlessNGX` (Hostname `paperless-ngx`, Image `ghcr.io/paperless-ngx/paperless-ngx:latest`)
>   - `PaperlessNGX-AI` (Hostname `paperless-ai`, Image `clusterzx/paperless-ai:latest`, Port `8779`)
>   - `PaperlessNGX-GPT` (Hostname `paperless-gpt`, Image `icereed/paperless-gpt:latest`, Port `8778`) — **zweiter** KI-Container, macht LLM-OCR + Auto-Titel/Tags/Created-Date
>   - `PaperlessNGX-DB` (Hostname `paper-db`, Postgres 18), `PaperlessNGX-REDIS`, `PaperlessNGX-GOTENBERG`, `PaperlessNGX-TIKA`
> - **NAS-Stack-Pfad (existierend, bleibt unverändert):** `/volume1/docker/paperlessngx/` — `docker-compose.yml`, `.env`, `db/`, `redis/`, `trash/`, `export/`, `paperless-gpt/prompts/`, `paperless-ai/`
> - **Daten-/Media-Pfad (existierend, GoBD-relevant):** `/volume2/paperless/{data,media}` — produktive Dokumente und Originale, **nicht** auf Volume1
> - **Existierender Consume-Stamm:** `/volume2/scandok` (rekursiv, mit `PAPERLESS_CONSUMER_DELETE_DUPLICATES=true`) — von der bestehenden paperless-ai/paperless-gpt-Pipeline überwacht
> - **Neuer Buchhaltungs-Scan-Stamm (zusätzlich):** `/volume1/scanpropus/` — separater Stamm für Buchhaltungs-Scans, bewusst auf Volume1, weil Buchhaltungsbelege eine eigene Pipeline haben und nicht von der KI auf `/volume2/scandok` angefasst werden sollen. Buchhaltungs-Unterordner: `/volume1/scanpropus/buchhaltung-propus/`. Wird als zusätzlicher Volume-Mount in den `PaperlessNGX`-Container eingehängt (siehe [3.1](#31-neuer-consume-ordner)).
>
> **Wichtig zur KI:** Der bestehende `paperless-ai`-Container mit seinen eingespielten Prompts (Sender/Empfänger-Erkennung, Propus-Tagging etc.) bleibt **unverändert**. Buchhaltungsbelege werden in [3.6](#36-paperless-ai-entkoppeln) lediglich aus seinem Sichtfeld ausgeblendet, damit die manuell vergebenen Buchhaltungs-Tags nicht überschrieben werden.

## Inhaltsverzeichnis

- [Vorbedingungen](#vorbedingungen)
- [3.0 Backup vor allem](#30-backup-vor-allem)
- [3.1 Neuer Consume-Ordner](#31-neuer-consume-ordner)
- [3.2 Custom Fields anlegen](#32-custom-fields-anlegen)
- [3.3 Tags vorbereiten](#33-tags-vorbereiten)
- [3.4 Document Type und Storage Path](#34-document-type-und-storage-path)
- [3.5 Workflow-Regel anlegen](#35-workflow-regel-anlegen)
- [3.6 paperless-ai entkoppeln](#36-paperless-ai-entkoppeln)
- [3.7 Service-User für Bookkeeper](#37-service-user-für-bookkeeper)
- [3.8 Korrespondenten-Vorbereitung](#38-korrespondenten-vorbereitung)
- [3.9 Abschlusscheck](#39-abschlusscheck)
- [Häufige Stolperfallen](#häufige-stolperfallen)
- [IDs zur Referenz für Block 4](#ids-zur-referenz-für-block-4)

---

## Vorbedingungen

- [x] paperless-ngx läuft auf der NAS — Container `PaperlessNGX`, erreichbar via `https://paperless.propus.ch`
- [x] Zwei KI-Container laufen daneben: `PaperlessNGX-AI` (clusterzx/paperless-ai, Tagging + RAG-Chat) und `PaperlessNGX-GPT` (icereed/paperless-gpt, LLM-OCR + Auto-Titel/Tags/Created-Date) — beide bedienen sich aus `/volume2/scandok` und werden in [3.6](#36-paperless-ai-und-paperless-gpt-entkoppeln) **gemeinsam** entkoppelt
- [x] Cloudflare-Tunnel `dreamy_poincare` aktiv mit gültigem TLS, WAF-Skip-Regel für `paperless.propus.ch` existiert
- [ ] SSH-Zugang zur NAS funktioniert: `ssh nas-propus` (siehe [docs/SSH-NAS-ZUGANG.md](docs/SSH-NAS-ZUGANG.md))
- [ ] Admin-Zugang im Paperless-Web-UI funktioniert (`https://paperless.propus.ch/`)
- [ ] Block 1 (bexio-Foundation) ist **vor Block 4** abgeschlossen — für Block 3 selbst nicht zwingend, da hier nur Tags/Felder/Pfade angelegt werden, keine Buchungslogik

> **Quellen für die obigen Werte:** `Y:\Arhive\Paperless\docker-compose.yml` + `Y:\Arhive\Paperless\AGENTS.md` (Stand 2026-05-04). Falls sich auf der NAS etwas geändert hat, vor Beginn einmal verifizieren mit `ssh nas-propus 'sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -i paperless'`.

---

## 3.0 Backup vor allem

**Ziel:** Wiederherstellbarkeit, falls bei Custom Fields oder Workflows etwas schiefgeht.

```bash
ssh nas-propus
cd /volume1/docker/paperlessngx
sudo docker compose down

# Snapshot — Achtung: Daten und Media liegen NICHT im Stack-Pfad, sondern auf /volume2/paperless/
DATE=$(date +%Y%m%d_%H%M)
sudo tar -czf paperless-backup-${DATE}.tar.gz \
    ./db ./redis ./trash ./export ./paperless-gpt ./paperless-ai \
    /volume2/paperless/data /volume2/paperless/media \
    /volume2/scandok

# Verifizieren
ls -lh paperless-backup-${DATE}.tar.gz

# Optional: zweite Kopie auf VPS (siehe propus-platform/docs/BACKUPS.md)
# rsync -avh paperless-backup-${DATE}.tar.gz root@87.106.24.107:/data/backups/

sudo docker compose up -d
```

> **Aufbewahrung:** Das `/volume2/paperless/media/`-Verzeichnis ist ab jetzt Teil der GoBD/OR-relevanten 10-Jahres-Aufbewahrung. Sicherstellen, dass Volume2 im NAS-eigenen Backup-Plan vollumfänglich erfasst ist (Snapshot + Off-Site).

- [ ] Backup-Datei existiert und hat plausible Grösse (mindestens ein paar GB bei Bestand)
- [ ] Container wieder gestartet (`docker ps` zeigt paperless als `Up`)

---

## 3.1 Neuer Consume-Ordner

### Auf der NAS Ordner anlegen

Der Buchhaltungs-Consume-Ordner liegt bewusst **nicht** unter dem bestehenden Paperless-Stack-Pfad, sondern unter dem separaten Stammordner `/volume1/scanpropus/`. Damit ist die Buchhaltungs-Pipeline physisch klar getrennt von der bestehenden Paperless-Ablage und kann unabhängig per SMB-Share / Drucker-Scan-Ziel exponiert werden.

```bash
ssh nas-propus
NAS_SCAN=/volume1/scanpropus

sudo mkdir -p ${NAS_SCAN}/buchhaltung-propus
sudo chown -R 1000:10 ${NAS_SCAN}/buchhaltung-propus
sudo chmod -R 0775 ${NAS_SCAN}/buchhaltung-propus
```

UID/GID `1000:10` entspricht dem Container-User (`USERMAP_UID=1000`, `USERMAP_GID=10` aus dem aktuellen Compose). Verifikation:

```bash
sudo docker exec PaperlessNGX id  # erwartet: uid=1000 gid=10
```

### docker-compose.yml anpassen

Der bestehende `consume`-Mount auf `/volume2/scandok` **bleibt unverändert**, damit die bisherige paperless-ai- und paperless-gpt-Pipeline weiter wie gehabt auf dem dortigen Scan-Eingang arbeitet. Zusätzlich wird `/volume1/scanpropus/` als zweiter Consume-Mount in den `PaperlessNGX`-Container eingehängt. Datei: `/volume1/docker/paperlessngx/docker-compose.yml` — Service `paperless-ngx`, Block `volumes:`:

```yaml
  paperless-ngx:
    container_name: PaperlessNGX
    # ... (alles wie bisher)
    volumes:
      - /volume2/paperless/data:/usr/src/paperless/data
      - /volume2/paperless/media:/usr/src/paperless/media
      - /volume1/docker/paperlessngx/export:/usr/src/paperless/export
      - /volume1/docker/paperlessngx/trash:/usr/src/paperless/trash
      - /volume2/scandok:/usr/src/paperless/consume   # bestehend — NICHT ändern
      - /volume1/scanpropus:/usr/src/paperless/consume/scanpropus   # NEU: Buchhaltungs-Scans
```

Container-intern liegt der neue Ordner dann unter `/usr/src/paperless/consume/scanpropus/buchhaltung-propus/`. Paperless überwacht den gesamten `consume`-Baum rekursiv (`PAPERLESS_CONSUMER_RECURSIVE=true` ist bereits gesetzt); der Workflow-Filter in [3.5](#35-workflow-regel-anlegen) trennt die beiden Pipelines anhand des Pfads.

Anwenden:

```bash
ssh nas-propus
cd /volume1/docker/paperlessngx
sudo docker compose up -d paperless-ngx
sudo docker exec PaperlessNGX ls -la /usr/src/paperless/consume/scanpropus/   # Sichtprüfung
```

> **Achtung:** Bestehende Dokumente bleiben unangetastet — es wird nur ein zusätzlicher Read-Write-Mount eingehängt. Datenbank, Media und `/volume2/scandok` sind nicht betroffen. Andere Container (`paperless-ai`, `paperless-gpt`, `db`, `redis`) brauchen keinen Restart.

### Scanner- oder Smartphone-Anbindung

**Option A – SMB-Share (empfohlen für Drucker):**

- SMB-Share `paperless-buchhaltung` auf NAS einrichten, der genau auf `/volume1/scanpropus/buchhaltung-propus/` zeigt
- Drucker-Scan-Ziel: `\\192.168.1.5\paperless-buchhaltung`
- Dateinamen-Schema: `{date}_{counter}.pdf`

**Option B – iOS Shortcut:**

- Shortcut „Beleg Propus" mit Home-Screen-Icon
- Ablauf: Foto → PDF konvertieren → SMB/SFTP-Upload nach `/volume1/scanpropus/buchhaltung-propus/`
- Separaten Shortcut für private Belege erstellen, damit sich die beiden nicht vermischen

**Option C – E-Mail an `belege@propus.ch`:**

- Wird in Block 4 implementiert via Microsoft Graph — die nötigen Credentials (`MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`) sind im Repo bereits vorgesehen, siehe [docker-compose.vps.yml:101-103](docker-compose.vps.yml#L101-L103)
- Anhänge werden direkt in `/volume1/scanpropus/buchhaltung-propus/` abgelegt
- Für Block 3 nicht nötig

### Test

```bash
cp ~/test-beleg.pdf ${NAS_SCAN}/buchhaltung-propus/

sudo docker logs -f PaperlessNGX 2>&1 | grep -i consum
```

Erwartet:
```
Consuming new file: /usr/src/paperless/consume/scanpropus/buchhaltung-propus/test-beleg.pdf
```

- [ ] Ordner existiert mit korrekten Rechten
- [ ] Mount-Pfad in compose stimmt
- [ ] Scan-Anbindung gewählt (A/B/C) und eingerichtet
- [ ] Test-PDF wird vom Container erkannt

---

## 3.2 Custom Fields anlegen

> **Schnellweg (empfohlen):** Statt 17 Felder + 7 Tags + Document Type + Storage Path + Workflow per UI anzulegen, gibt es ein idempotentes Bootstrap-Skript:
> ```bash
> ssh nas-propus
> cd /volume1/docker/paperlessngx
> # Skript einmalig hinkopieren (Source-of-Truth: Y:\Arhive\Paperless\scripts\setup_buchhaltung_pipeline.py)
> python3 scripts/setup_buchhaltung_pipeline.py --check    # zeigt was angelegt würde
> python3 scripts/setup_buchhaltung_pipeline.py            # legt an
> python3 scripts/setup_buchhaltung_pipeline.py --write-env /volume1/docker/propus-bookkeeper/.env
> ```
> Das Skript liest den Admin-Token aus `/volume1/docker/paperlessngx/.env`, ist mehrfach laufbar (idempotent), legt nichts doppelt an und gibt am Ende den vollständigen ENV-Block für `propus-bookkeeper` aus. Service-User legt das Skript bewusst nicht an (Passwort-Anforderung) — die werden manuell via Web-UI in [3.7](#37-service-user-für-bookkeeper) angelegt; das Skript verifiziert nur ihre Existenz.
>
> Wenn du den Schnellweg nutzt, kannst du Abschnitte 3.2 bis 3.5 überspringen und direkt zu [3.6](#36-paperless-ai-und-paperless-gpt-entkoppeln) weitergehen. Die folgenden Manuell-Anleitungen bleiben erhalten als Referenz und für die Felder, die im UI feinjustiert werden möchten.

---

Web-UI (manueller Weg): **Settings → Custom Fields → Create**

> **Wichtig:** Namen exakt so schreiben (lowercase, snake_case). Werden später per Field-ID via API angesprochen, daher nicht nachträglich umbenennen.

| # | Name | Datentyp | Default | Zweck |
|---|---|---|---|---|
| 1 | `belegart` | Auswahl (Select) | – | `quittung`, `lief_rechnung`, `bankauszug`, `spesenbeleg`, `gutschrift`, `sonstiges` (Slug `lief_rechnung` = Label „Lieferantenrechnung"; Paperless `value_select` ist varchar(16), Slugs müssen ≤16 Zeichen sein) |
| 2 | `belegdatum` | Datum (Date) | – | Datum vom Beleg, nicht vom Scan |
| 3 | `beleg_nr` | Text (String) | – | Externe Beleg- oder Rechnungsnummer |
| 4 | `lieferant` | Text (String) | – | Wird mit Paperless-Correspondent verknüpft |
| 5 | `betrag_brutto` | Zahl (Float) | – | Bruttobetrag in Mandantenwährung |
| 6 | `waehrung` | Text (String) | `CHF` | ISO-Code |
| 7 | `mwst_gesamt` | Zahl (Float) | – | Gesamte MwSt auf dem Beleg |
| 8 | `mwst_aufteilung_json` | Text (String, lang) | – | JSON-Array, siehe unten |
| 9 | `soll_konto` | Text (String) | – | Kontonummer Soll, z.B. `6210` |
| 10 | `haben_konto` | Text (String) | – | Kontonummer Haben |
| 11 | `buchungstext` | Text (String) | – | Text wie er in bexio landen soll |
| 12 | `confidence` | Zahl (Integer) | – | Modell-Confidence 0–100 |
| 13 | `bexio_buchungs_id` | Text (String) | – | Idempotenz-Anker nach Push |
| 14 | `verbuchungs_status` | Auswahl (Select) | `pending` | siehe unten |
| 15 | `privat_anteil_chf` | Zahl (Float) | `0` | Bei gemischten Belegen |
| 16 | `auftrag_propus` | Text (String) | – | Auftragsnr aus admin-booking |
| 17 | `notiz_ai` | Text (String, lang) | – | Anmerkung der KI |

**Auswahl-Werte für `belegart`:** (Label = lesbarer Anzeigename, Slug = `id`-Wert in `value_select varchar(16)`)
```
quittung              (Slug: quittung)
lieferantenrechnung   (Slug: lief_rechnung)   ← Slug gekürzt, Paperless varchar(16)-Limit
bankauszug            (Slug: bankauszug)
spesenbeleg           (Slug: spesenbeleg)
gutschrift            (Slug: gutschrift)
sonstiges             (Slug: sonstiges)
```

**Auswahl-Werte für `verbuchungs_status`:**
```
pending
vorgeschlagen
manuell_pruefen
approved
verbucht
fehler
privat
```

**JSON-Format-Beispiel für `mwst_aufteilung_json`:**
```json
[
  {"satz":"8.10","netto":162.30,"mwst":13.15,"konto":"6210"},
  {"satz":"2.60","netto":3.80,"mwst":0.10,"konto":"4500"}
]
```

### Field-IDs notieren

Nach dem Anlegen die ID jedes Felds notieren (steht in der URL beim Edit, z.B. `/settings/custom-fields/12/`):

```env
PAPERLESS_FIELD_ID_BELEGART=
PAPERLESS_FIELD_ID_BELEGDATUM=
PAPERLESS_FIELD_ID_BELEG_NR=
PAPERLESS_FIELD_ID_LIEFERANT=
PAPERLESS_FIELD_ID_BETRAG_BRUTTO=
PAPERLESS_FIELD_ID_WAEHRUNG=
PAPERLESS_FIELD_ID_MWST_GESAMT=
PAPERLESS_FIELD_ID_MWST_AUFTEILUNG_JSON=
PAPERLESS_FIELD_ID_SOLL_KONTO=
PAPERLESS_FIELD_ID_HABEN_KONTO=
PAPERLESS_FIELD_ID_BUCHUNGSTEXT=
PAPERLESS_FIELD_ID_CONFIDENCE=
PAPERLESS_FIELD_ID_BEXIO_BUCHUNGS_ID=
PAPERLESS_FIELD_ID_VERBUCHUNGS_STATUS=
PAPERLESS_FIELD_ID_PRIVAT_ANTEIL_CHF=
PAPERLESS_FIELD_ID_AUFTRAG_PROPUS=
PAPERLESS_FIELD_ID_NOTIZ_AI=
```

Alternativ alle IDs auf einen Schlag holen:

```bash
curl -s -H "Authorization: Token $PAPERLESS_TOKEN" \
  "$PAPERLESS_URL/api/custom_fields/" | jq '.results[] | {id, name}'
```

- [ ] Alle 17 Custom Fields angelegt
- [ ] Auswahlwerte für `belegart` und `verbuchungs_status` eingetragen
- [ ] Field-IDs notiert (Block 4 braucht sie)

---

## 3.3 Tags vorbereiten

**Settings → Tags → Create**

| Tag | Farbe (Hex) | Zweck |
|---|---|---|
| `buchhaltung` | `#B68E20` (Propus-Gold) | Marker dass es ein Buchhaltungsbeleg ist (NEU anzulegen) |
| `Propus` | (existiert bereits, id=470, orange) | Vorhandener Tag — **nicht neu anlegen**, vorhandene id 470 wiederverwenden. Siehe `Y:\Arhive\Paperless\docs\SETUP-STATUS.md` |
| `verbuchung-pending` | `#FFA500` (orange) | KI hat Beleg noch nicht angeschaut |
| `verbuchung-vorgeschlagen` | `#FFD700` (gelb) | Vorschlag liegt vor, wartet auf Review |
| `verbuchung-approved` | `#90EE90` (hellgrün) | Freigegeben, wartet auf bexio-Push |
| `verbuchung-verbucht` | `#228B22` (grün) | In bexio gebucht |
| `verbuchung-fehler` | `#DC143C` (rot) | Fehler aufgetreten |
| `verbuchung-privat` | `#808080` (grau) | Privatentnahme über Kontokorrent Gesellschafter |

### Tag-IDs notieren

```env
PAPERLESS_TAG_ID_BUCHHALTUNG=
PAPERLESS_TAG_ID_PROPUS=
PAPERLESS_TAG_ID_VERBUCHUNG_PENDING=
PAPERLESS_TAG_ID_VERBUCHUNG_VORGESCHLAGEN=
PAPERLESS_TAG_ID_VERBUCHUNG_APPROVED=
PAPERLESS_TAG_ID_VERBUCHUNG_VERBUCHT=
PAPERLESS_TAG_ID_VERBUCHUNG_FEHLER=
PAPERLESS_TAG_ID_VERBUCHUNG_PRIVAT=
```

Schnellabfrage:

```bash
curl -s -H "Authorization: Token $PAPERLESS_TOKEN" \
  "$PAPERLESS_URL/api/tags/?name__icontains=verbuchung" | jq '.results[] | {id, name, colour}'
```

- [ ] Alle 8 Tags angelegt
- [ ] Tag-IDs notiert

---

## 3.4 Document Type und Storage Path

### Document Type

**Settings → Document Types → Create**

- Name: `Buchhaltungsbeleg`
- Match: leer lassen (wird per Workflow gesetzt, nicht via Auto-Match)

### Storage Path

**Settings → Storage Paths → Create**

- Name: `Buchhaltung Propus`
- Path: `Buchhaltung/{created_year}/{created_month}/{correspondent}/{document_type}_{title}`

Damit landen Originale physisch sauber sortiert auf der NAS, z.B.:
```
media/documents/originals/Buchhaltung/2026/05/Coop_Mineraloel_AG/Buchhaltungsbeleg_Tankstelle_Adliswil.pdf
```

Das ist relevant für die **10-Jahres-Aufbewahrungspflicht** in der Schweiz.

- [ ] Document Type `Buchhaltungsbeleg` existiert
- [ ] Storage Path `Buchhaltung Propus` existiert mit obigem Path-Template

---

## 3.5 Workflow-Regel anlegen

**Settings → Workflows → Create Workflow**

### Trigger

| Feld | Wert |
|---|---|
| Name | `Buchhaltung Auto-Tag` |
| Type | `Consumption Started` |
| Filter source | `Folder` |
| Filter source paths | `*/scanpropus/buchhaltung-propus/*` |

> **Achtung:** Beide Asterisken sind nötig. Paperless macht Glob-Matching auf den vollen Container-internen Pfad (`/usr/src/paperless/consume/scanpropus/buchhaltung-propus/...`). Der Filter enthält bewusst `scanpropus/`, damit er nur auf den separaten `/volume1/scanpropus/`-Mount feuert und nicht auf gleichnamige Ordner unter dem alten Consume-Pfad.

### Actions (Reihenfolge wichtig)

**Action 1 – Assign:**

- Tags hinzufügen: `buchhaltung` (neu), `Propus` (existierend, id=470), `verbuchung-pending` (neu)
- Document Type setzen: `Buchhaltungsbeleg`
- Storage Path setzen: `Buchhaltung Propus`
- Owner setzen: dein Admin-User
- View Users: Admin + `bookkeeper-service` (kommt in [3.7](#37-service-user-für-bookkeeper))
- Change Users: Admin + `bookkeeper-service`

**Action 2 – Custom Fields setzen:**

| Feld | Wert |
|---|---|
| `verbuchungs_status` | `pending` |
| `waehrung` | `CHF` |
| `confidence` | `0` |

Andere Felder bleiben leer – die füllt der Bookkeeper-Service.

**Action 3 – Permissions:**

- Stelle sicher dass keine anderen Paperless-User die Belege sehen können (Privatsphäre für später, wenn Mitarbeiter mit Paperless arbeiten)

### Test

```bash
cp ~/test-beleg.pdf ${NAS_SCAN}/buchhaltung-propus/
sleep 30
```

Im Web-UI prüfen:

- [ ] Tag `buchhaltung`, `Propus`, `verbuchung-pending` automatisch gesetzt
- [ ] Document Type = `Buchhaltungsbeleg`
- [ ] Storage Path = `Buchhaltung Propus`
- [ ] Custom Field `verbuchungs_status` = `pending`
- [ ] Custom Field `waehrung` = `CHF`
- [ ] Permissions korrekt (nur Admin + bookkeeper-service)

---

## 3.6 paperless-ai und paperless-gpt entkoppeln

**Ziel:** Die zwei bestehenden KI-Pipelines auf der NAS sollen Buchhaltungsbelege NICHT anfassen, damit die sauber gesetzten Tags und Custom Fields nicht überschrieben werden.

> **Wichtig:** Die existierenden KI-Prompts und alle Tuning-Settings (`PGPT_*`, `PAI_*`, `paperless-gpt/prompts/`) auf der NAS bleiben **vollständig unverändert**. Beide Container greifen weiterhin auf alle bisherigen Dokumente in `/volume2/scandok` und auf bereits konsumierte Dokumente. Hier wird nur dafür gesorgt, dass beide KI-Container die neuen Buchhaltungsbelege gar nicht erst zu Gesicht bekommen.

### Zwei KI-Container — zwei zu schliessende Lücken

| Container | Image | Was er tut | Wie er Buchhaltungsbelege anfassen würde |
|---|---|---|---|
| `PaperlessNGX-AI` | `clusterzx/paperless-ai:latest` | Auto-Tagging, RAG-Chat, KI-Zusammenfassung (`SCAN_INTERVAL=*/15 * * * *`) | Würde Tags und das Custom Field `KI-Zusammenfassung (lat.)` überschreiben |
| `PaperlessNGX-GPT` | `icereed/paperless-gpt:latest` | LLM-OCR, Auto-Titel, Auto-Tags, Auto-Created-Date, Auto-Correspondents (`AUTO_GENERATE_*`) | Würde Titel, Created-Date und Correspondents auf den Buchhaltungsbelegen verändern |

Beide müssen entkoppelt werden. Wir nutzen **Variante C (Permissions-basiert)** als einheitliche Lösung für beide, weil:

- KI-Prompts und KI-Verhalten bleiben 100% unverändert — kein Risiko von Regression bei der bisherigen Pipeline
- Eine einheitliche Abschirmungs-Methode für beide Container, statt zwei verschiedene ENV-Variablen-Filter zu pflegen
- Keine Race Condition zwischen Workflow-Action und KI-Polling möglich — beide KI-Container sehen die Belege schlicht nie über die Paperless-API
- Keine Abhängigkeit von Fork-spezifischen ENV-Variablen, die sich beim nächsten Update umbenennen könnten

### Schritte (Variante C, einheitlich für beide KI-Container)

1. **Zwei dedizierte Service-User in Paperless anlegen** (Settings → Users):
   - `paperless-ai-bot` (für `PaperlessNGX-AI`) — nicht-Admin, nicht-Superuser
   - `paperless-gpt-bot` (für `PaperlessNGX-GPT`) — nicht-Admin, nicht-Superuser
   - Falls aktuell beide Container mit dem Admin-Token aus `${PAPERLESS_API_TOKEN}` in `/volume1/docker/paperlessngx/.env` betrieben werden: dieser Token bleibt **nicht** unverändert; er wird durch die zwei spezifischen Bot-Tokens ersetzt.
2. **Token generieren** in Paperless-UI (User-Edit → Tab „Token") und in `/volume1/docker/paperlessngx/.env` einsetzen:
   ```env
   # statt eines geteilten PAPERLESS_API_TOKEN jetzt zwei spezifische:
   PAI_PAPERLESS_API_TOKEN=<token von paperless-ai-bot>
   PGPT_PAPERLESS_API_TOKEN=<token von paperless-gpt-bot>
   ```
3. **Compose-Override anlegen** unter `/volume1/docker/paperlessngx/docker-compose.override.yml`, damit jeder KI-Container seinen eigenen Token verwendet:
   ```yaml
   services:
     paperless-gpt:
       environment:
         PAPERLESS_API_TOKEN: ${PGPT_PAPERLESS_API_TOKEN}
     paperless-ai:
       environment:
         PAPERLESS_API_TOKEN: ${PAI_PAPERLESS_API_TOKEN}
   ```
4. **Workflow aus [3.5](#35-workflow-regel-anlegen) gibt Buchhaltungsbelegen explizit nur** Admin + `bookkeeper-service` als View/Change Users. `paperless-ai-bot` und `paperless-gpt-bot` stehen nicht in der Liste → beide sehen die Buchhaltungsbelege schlicht nicht über die API.
5. **Bestehende Dokumente** bleiben für beide Bots weiter sichtbar (kein Tag `buchhaltung`, keine eingeschränkten Permissions) → die KI-Pipelines laufen auf dem gewohnten `/volume2/scandok`-Strom unverändert weiter.

> **Backup vorher:** Aktuelle `.env` sichern, bevor der Token-Wechsel passiert (`sudo cp /volume1/docker/paperlessngx/.env /volume1/docker/paperlessngx/.env.backup-$(date +%Y%m%d)`). So kann der Token-Wechsel im Notfall in 5 Sekunden zurückgerollt werden.

### Container neu starten und testen

```bash
ssh nas-propus
cd /volume1/docker/paperlessngx
sudo docker compose up -d paperless-ai paperless-gpt

# Test 1: neuer Buchhaltungsbeleg darf NICHT von KI angefasst werden
cp ~/test-beleg2.pdf /volume1/scanpropus/buchhaltung-propus/
sleep 900   # 15-Min-Scan-Intervall von paperless-ai abwarten + paperless-gpt-Lauf
```

Im Web-UI prüfen:

- [ ] Test-Buchhaltungsbeleg hat genau die 3 Tags aus dem Workflow (`buchhaltung`, `Propus`, `verbuchung-pending`)
- [ ] KEINE zusätzlichen Tags von `paperless-ai` (kein automatischer Correspondent, keine sender/empfänger-Tags)
- [ ] KEIN automatisch generierter Titel von `paperless-gpt` (Titel bleibt der ursprüngliche Dateiname oder vom Workflow gesetzte Wert)
- [ ] Custom Field `KI-Zusammenfassung (lat.)` ist leer (paperless-ai hat es nicht gefüllt)

```bash
# Test 2: Regression-Check — nicht-Buchhaltungsbeleg muss weiter von KI verarbeitet werden
cp ~/test-private-quittung.pdf /volume2/scandok/
sleep 900
```

- [ ] Privater Test-Beleg bekommt automatische Tags via paperless-ai
- [ ] Privater Test-Beleg bekommt KI-generierten Titel via paperless-gpt (falls `PGPT_AUTO_GENERATE_TITLE=true` in `.env` aktiv)
- [ ] Custom Field `KI-Zusammenfassung (lat.)` wird gefüllt

Falls beim Buchhaltungsbeleg trotzdem KI-Tags auftauchen:

```bash
sudo docker logs PaperlessNGX-AI --tail 200 | grep -iE 'tag|filter|skip|buchhaltung|forbidden|403'
sudo docker logs PaperlessNGX-GPT --tail 200 | grep -iE 'tag|filter|skip|buchhaltung|forbidden|403'
```

Erwartet bei korrekter Permission-Trennung: 403/Forbidden auf `/api/documents/<id>/` für Buchhaltungs-IDs in beiden Bot-Logs. Falls 200 OK: View-Permissions im Workflow nochmal prüfen — die Bot-User dürfen weder als View User noch als Change User noch über eine Group eingetragen sein.

### Fallback: ENV-Filter (falls Variante C unerwünscht)

Nur einsetzen, wenn der Token-Wechsel nicht möglich ist. Funktioniert nur bei `paperless-ai`, `paperless-gpt` hat keine vergleichbare Skip-Logik.

```yaml
# docker-compose.override.yml — nicht empfohlen
services:
  paperless-ai:
    environment:
      PROCESS_ONLY_NEW_DOCUMENTS: "true"
      TAG_FILTER_EXCLUDE: "buchhaltung"
```

Bei diesem Fallback bleibt `paperless-gpt` ein offenes Problem — es würde Buchhaltungsbelegen weiter Titel/Created-Date setzen. Nicht empfohlen.

---

## 3.7 Service-User für Bookkeeper

**Settings → Users → Create**

| Feld | Wert |
|---|---|
| Username | `bookkeeper-service` |
| E-Mail | leer |
| Active | ✅ |
| Staff status | ❌ |
| Superuser | ❌ |

### Permissions

- View & Change Documents (gefiltert auf Tag `buchhaltung`)
- View & Change Custom Fields
- View & Change Tags (nur die `verbuchung-*`-Tags)

### API-Token generieren

User-Edit → Tab „Token" → „Generate Token" → Token kopieren.

> **WICHTIG (Secrets-Handling):**
> - Token gehört in die `.env.bookkeeper`-Datei auf der NAS (analog zur VPS-Konvention: Secrets in `/opt/propus-platform/.env.vps`, single source of truth, nicht im Repo)
> - **Niemals** in `Y:\…`-Pfade ablegen (Spiegelung) und **niemals** ins Repo committen — siehe verbindliche Regel in [docs/SSH-NAS-ZUGANG.md](docs/SSH-NAS-ZUGANG.md): "Private Keys, Passwörter oder andere Secrets sollen nicht als Markdown auf `Y:` abgelegt werden."
> - Vor dem Commit dieses Dokuments (das hier!) prüfen, dass der echte Token-Wert NICHT eingetragen wurde — nur Platzhalter

```env
# Datei: /volume1/docker/propus-bookkeeper/.env (nur auf NAS, nie im Repo)
PAPERLESS_URL=https://paperless.propus.ch
PAPERLESS_TOKEN=<das_neu_generierte_token>
PAPERLESS_USER_ID_BOOKKEEPER=<user_id>
```

User-ID via:
```bash
curl -s -H "Authorization: Token <admin_token>" \
  "$PAPERLESS_URL/api/users/" | jq '.results[] | select(.username=="bookkeeper-service")'
```

- [ ] User `bookkeeper-service` existiert
- [ ] Permissions korrekt eingeschränkt
- [ ] API-Token generiert und in `.env.bookkeeper` auf der NAS abgelegt (nicht in Repo)
- [ ] `.env.bookkeeper` ist im `.gitignore` der Repo-Wurzel eingetragen (falls der Bookkeeper-Stack Teil des Repos wird)
- [ ] Token funktioniert (Test mit `curl -H "Authorization: Token $PAPERLESS_TOKEN" $PAPERLESS_URL/api/documents/?tags__id__all=$PAPERLESS_TAG_ID_BUCHHALTUNG`)

---

## 3.8 Korrespondenten-Vorbereitung

**Optional, aber sehr hilfreich.** Damit der Bookkeeper-Service später häufige Lieferanten korrekt zuordnet, manuell anlegen.

**Settings → Correspondents → Create**

Vorschlag für deinen Betrieb:

- Coop Mineraloel AG
- Coop Pronto AG
- UBS Switzerland AG
- Swisscom (Schweiz) AG
- Microsoft Schweiz GmbH
- Anthropic, PBC
- OpenAI, LLC
- IONOS SE
- Cloudflare, Inc.
- Allianz Suisse Versicherungs-Gesellschaft AG
- Strassenverkehrsamt Kanton Zug
- AHV-Ausgleichskasse Zug
- Suva
- Treuhänder (Name eintragen)
- 1a reptech AG (Drohnenservice)
- Grundeigentümer Verband Schweiz AG
- Frey + Cie F.E.M. AG
- Livit AG

Match-Regeln auf `Auto: Any` mit dem Firmennamen → Paperless lernt dann selbst.

Der Bookkeeper-Service wird beim ersten Antreffen eines unbekannten Lieferanten automatisch einen neuen Correspondent vorschlagen (Block 4).

- [ ] Mindestens die häufigsten 5 Lieferanten manuell angelegt

---

## 3.9 Abschlusscheck

| Check | OK? |
|---|---|
| Backup-Datei existiert | ☐ |
| `consume/buchhaltung-propus/` existiert mit korrekten Permissions | ☐ |
| Test-PDF wird automatisch konsumiert (Logs bestätigen) | ☐ |
| Alle 17 Custom Fields angelegt | ☐ |
| Alle 17 Field-IDs notiert in `.env` | ☐ |
| Alle 8 Tags angelegt | ☐ |
| Alle 8 Tag-IDs notiert in `.env` | ☐ |
| Document Type `Buchhaltungsbeleg` existiert | ☐ |
| Storage Path `Buchhaltung Propus` existiert mit Path-Template | ☐ |
| Workflow `Buchhaltung Auto-Tag` aktiv | ☐ |
| Test-Beleg bekommt automatisch alle 3 Tags via Workflow | ☐ |
| Test-Beleg landet im richtigen physischen Storage-Pfad | ☐ |
| paperless-ai ignoriert Belege mit Tag `buchhaltung` (verifiziert!) | ☐ |
| User `bookkeeper-service` mit API-Token existiert | ☐ |
| API-Token in `.env` (nicht in Git!) | ☐ |
| `.env` in `.gitignore` eingetragen | ☐ |
| Mindestens 5 Korrespondenten angelegt | ☐ |

---

## Häufige Stolperfallen

### Permissions auf NAS

Wenn der Container-User die eingeworfene Datei nicht lesen kann, wird sie ohne Fehlermeldung übergangen. Immer prüfen:

```bash
ls -la /volume1/scanpropus/buchhaltung-propus/
sudo docker exec PaperlessNGX ls -la /usr/src/paperless/consume/scanpropus/buchhaltung-propus/
```

Beide müssen die Datei zeigen, mit Lese-Recht für den Container-User.

### Workflow-Trigger feuert nicht

Der Source-Path-Filter braucht **beide** Asterisken: `*/scanpropus/buchhaltung-propus/*`. Ohne führendes `*/` matcht Paperless auf den Container-internen vollen Pfad nicht. Der Filter muss bewusst `scanpropus/` enthalten — sonst würde er auch auf gleichnamige Unterordner im alten Consume-Mount feuern und dort versehentlich Tags setzen.

### Custom Fields verändern Tag-Logik

Wenn du in Workflows Bedingungen mit Custom Fields baust, beachten dass diese erst NACH dem Setzen verfügbar sind. Sequentielle Action-Reihenfolge respektieren: erst Tags, dann Fields, dann eventuelle Folge-Bedingungen.

### paperless-ai läuft trotzdem

Manche Forks pollen Dokumente unabhängig vom Tag-Filter. Symptom: Buchhaltungsbelege bekommen plötzlich Korrespondenten oder zusätzliche Tags. Lösung: auf Variante C ([Permissions](#variante-c---universeller-fallback-via-permissions)) wechseln.

### Storage Path bewegt Bestandsdokumente

Wenn du einen Storage Path auf bestehende Tags anwendest, werden alte Belege physisch verschoben. Das willst du nicht. Storage Path daher nur über den Workflow auf NEUE Belege wirken lassen.

### Tokenizer / OCR liefert für Quittungen schlechte Resultate

Tankstellenbelege auf Thermopapier werden oft mässig erkannt. Lösung später in Block 4: Bookkeeper-Service nutzt zusätzlich Vision-Modell (Claude Sonnet 4.6) auf das PDF-Bild, nicht nur den OCR-Text.

### Doppelte Tags überschreiben

Wenn paperless-ai im selben Container `verbuchung-pending` interpretiert und entfernt, gibt es einen Race Condition zwischen Workflow und ai. Lösung: paperless-ai darf den `buchhaltung`-Tag gar nicht erst sehen (Variante A/B/C).

---

## IDs zur Referenz für Block 4

Nach Abschluss dieses Setups muss folgender Block in `.env.bookkeeper` von `propus-bookkeeper` ausgefüllt sein (Datei liegt auf der NAS, nicht im Repo):

```env
# Paperless Connection
PAPERLESS_URL=https://paperless.propus.ch
PAPERLESS_TOKEN=<API-Token aus 3.7>
PAPERLESS_USER_ID_BOOKKEEPER=<User-ID aus 3.7>

# Tag-IDs (aus 3.3)
PAPERLESS_TAG_ID_BUCHHALTUNG=
PAPERLESS_TAG_ID_PROPUS=
PAPERLESS_TAG_ID_VERBUCHUNG_PENDING=
PAPERLESS_TAG_ID_VERBUCHUNG_VORGESCHLAGEN=
PAPERLESS_TAG_ID_VERBUCHUNG_APPROVED=
PAPERLESS_TAG_ID_VERBUCHUNG_VERBUCHT=
PAPERLESS_TAG_ID_VERBUCHUNG_FEHLER=
PAPERLESS_TAG_ID_VERBUCHUNG_PRIVAT=

# Custom Field IDs (aus 3.2)
PAPERLESS_FIELD_ID_BELEGART=
PAPERLESS_FIELD_ID_BELEGDATUM=
PAPERLESS_FIELD_ID_BELEG_NR=
PAPERLESS_FIELD_ID_LIEFERANT=
PAPERLESS_FIELD_ID_BETRAG_BRUTTO=
PAPERLESS_FIELD_ID_WAEHRUNG=
PAPERLESS_FIELD_ID_MWST_GESAMT=
PAPERLESS_FIELD_ID_MWST_AUFTEILUNG_JSON=
PAPERLESS_FIELD_ID_SOLL_KONTO=
PAPERLESS_FIELD_ID_HABEN_KONTO=
PAPERLESS_FIELD_ID_BUCHUNGSTEXT=
PAPERLESS_FIELD_ID_CONFIDENCE=
PAPERLESS_FIELD_ID_BEXIO_BUCHUNGS_ID=
PAPERLESS_FIELD_ID_VERBUCHUNGS_STATUS=
PAPERLESS_FIELD_ID_PRIVAT_ANTEIL_CHF=
PAPERLESS_FIELD_ID_AUFTRAG_PROPUS=
PAPERLESS_FIELD_ID_NOTIZ_AI=
```

Schnellabfrage aller IDs:

```bash
# Tags
curl -s -H "Authorization: Token $PAPERLESS_TOKEN" \
  "$PAPERLESS_URL/api/tags/?page_size=100" | \
  jq '.results[] | select(.name | startswith("verbuchung-") or .name == "buchhaltung" or .name == "propus") | {id, name}'

# Custom Fields
curl -s -H "Authorization: Token $PAPERLESS_TOKEN" \
  "$PAPERLESS_URL/api/custom_fields/" | \
  jq '.results[] | {id, name}'
```

---

## Nach Abschluss

Sobald alle Häkchen gesetzt sind:

1. Eine Handvoll echter Belege in `/volume1/scanpropus/buchhaltung-propus/` werfen (z.B. die nächsten 5 Tankstellenbelege oder die nächste Lieferantenrechnung)
2. Prüfen ob alles korrekt getaggt wird
3. **Bookkeeper-Service noch nicht aktiv** – die Belege bleiben mit `verbuchungs_status: pending` liegen, bis Block 4 fertig ist
4. Mit dem ausgefüllten ENV-Block in [Block 4](./BUCHHALTUNG_SETUP.md#block-4--propus-bookkeeper-service-woche-2) starten

---

## Changelog

| Datum | Änderung |
|---|---|
| 2026-05-05 | Erste Version erstellt |
| 2026-05-05 | Anpassung an Propus-Stack: SSH-Alias `nas-propus`, Domain-Konvention `*.propus.ch`, Recon-Block ergänzt, Variante C (Permissions) als empfohlene Default-Lösung markiert um die bestehenden paperless-ai-Prompts garantiert nicht zu beeinträchtigen, Secrets-Handling-Hinweis (kein `Y:\`-Ablageort), Block-1-Vorbedingung gelockert, Backup-/Aufbewahrungs-Hinweis ergänzt |
| 2026-05-05 | Buchhaltungs-Consume-Ordner umgestellt auf separaten Stammordner `/volume1/scanpropus/` (statt unter dem bestehenden Paperless-Stack); zusätzlicher Volume-Mount in Paperless-Container, bestehender `consume`-Mount und paperless-ai-Pipeline bleiben unverändert; Workflow-Filter auf `*/scanpropus/buchhaltung-propus/*` angepasst |
| 2026-05-05 | Alle TBD-Platzhalter durch verifizierte Werte aus `Y:\Arhive\Paperless\docker-compose.yml` ersetzt: Paperless-URL `https://paperless.propus.ch`, Container-Namen `PaperlessNGX`/`PaperlessNGX-AI`/`PaperlessNGX-GPT`, NAS-Stack-Pfad `/volume1/docker/paperlessngx/`, Daten-/Media-Pfad `/volume2/paperless/`. Entkopplung in 3.6 erweitert: BEIDE KI-Container (`paperless-ai` clusterzx + `paperless-gpt` icereed) müssen via dedizierte Bot-User abgeschirmt werden, nicht nur einer. Volume-Mount-Anleitung an reales Compose angepasst (Volume2-basierte Daten/Media). `sudo docker` durchgehend ergänzt (UGREEN-Anforderung). |
| 2026-05-05 | Bootstrap-Skript `Y:\Arhive\Paperless\scripts\setup_buchhaltung_pipeline.py` als Schnellweg ergänzt: idempotenter REST-API-Aufruf, der Tags/Custom Fields/Document Type/Storage Path/Workflow anlegt und den vollständigen ENV-Block für `propus-bookkeeper` ausgibt. |
