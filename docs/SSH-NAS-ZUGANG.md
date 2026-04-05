# SSH-Zugang NAS `192.168.1.5`

## Verbindung

- Host: `192.168.1.5`
- User: `Janez`
- Hostname: `Propus`
- Home: `/home/Janez`

## Verwendeter lokaler SSH-Key

- Privater Key liegt lokal auf diesem Rechner unter:
  `C:\Users\svajc\.ssh\id_ed25519`

Wichtig:
- Der **Inhalt des privaten Keys** ist absichtlich **nicht** in dieser Datei gespeichert.
- Private Keys, Passwörter oder andere Secrets sollen **nicht als Markdown auf `Y:`** abgelegt werden.

## SSH-Login von diesem Rechner

```powershell
ssh -i "C:\Users\svajc\.ssh\id_ed25519" Janez@192.168.1.5
```

## Empfohlener SSH-Alias

In `C:\Users\svajc\.ssh\config` ist zusätzlich dieser Alias hinterlegt:

```text
Host nas-propus
  HostName 192.168.1.5
  User Janez
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

Damit reicht künftig:

```powershell
ssh nas-propus
```

## Verbindung testen

```powershell
ssh -o BatchMode=yes -i "C:\Users\svajc\.ssh\id_ed25519" Janez@192.168.1.5 "pwd && hostname"
```

Erwartete Ausgabe:

```text
/home/Janez
Propus
```

## Optionaler SCP-Upload

```powershell
scp -i "C:\Users\svajc\.ssh\id_ed25519" "C:\lokale\datei.txt" Janez@192.168.1.5:/home/Janez/
```

## Optionaler Datei-Download

```powershell
scp -i "C:\Users\svajc\.ssh\id_ed25519" Janez@192.168.1.5:/home/Janez/datei.txt "C:\lokaler\zielordner\"
```

## Hinweis

Falls du einen SSH-Alias willst, kann ich zusätzlich einen Eintrag für `C:\Users\svajc\.ssh\config` vorbereiten, damit künftig einfach `ssh nas-propus` reicht.
