# Obsidian ↔ Claude Code

Anleitung um diese Repo-MCP-Konfiguration mit deinem Obsidian-Vault zu verbinden.
Folgt der Reddit-Guide
<https://www.reddit.com/r/ClaudeAI/comments/1qr19df/claude_code_obsidian_how_i_use_it_short_guide/>
und nutzt das Plugin
<https://github.com/iansinnott/obsidian-claude-code-mcp>.

## Wie es funktioniert

1. **Obsidian-Plugin** startet im Vault einen lokalen WebSocket/SSE-Server auf
   Port **22360**.
2. **`.mcp.json`** in diesem Repo registriert den MCP-Server `obsidian`, der
   per `npx mcp-remote http://localhost:22360/sse` an dieses lokale Plugin
   andockt.
3. Sobald Obsidian läuft + Plugin aktiv ist + Claude Code in diesem Repo
   gestartet wird, kann Claude die Vault-Notizen lesen, suchen und schreiben.

## Einmaliges Setup auf deinem Windows-Rechner

### 1. Obsidian-Plugin installieren

In Obsidian:

1. **Settings → Community plugins → Browse**
2. Suche nach **"Obsidian Claude Code"** (Author: iansinnott) → **Install** → **Enable**

Falls das Plugin nicht im Community-Browser auftaucht, manuell via
[BRAT](https://github.com/TfTHacker/obsidian42-brat) hinzufügen:

- Repo: `iansinnott/obsidian-claude-code-mcp`

### 2. Port prüfen / vergeben

- **Default-Port**: `22360`
- Falls du **mehrere Vaults** parallel nutzt: pro Vault einen anderen Port in
  den Plugin-Settings vergeben und in `.mcp.json` (Zeile mit `localhost:22360`)
  entsprechend anpassen.

### 3. Voraussetzungen

- **Node.js ≥ 18** im PATH (`mcp-remote` läuft via `npx`).
- **Obsidian muss offen sein**, wenn du Claude Code startest — sonst
  scheitert der MCP-Server-Start.

### 4. Verbindung testen

In Claude Code (in diesem Repo):

```text
/mcp
```

→ Der `obsidian`-Server muss als verbunden auftauchen.

Schnelltest:

> "Liste die ersten fünf Notizen in meinem Obsidian-Vault."

## Nutzung

Sobald der Server läuft, sind unter anderem diese Tools verfügbar
(Plugin-spezifisch, prüfe via `/mcp` oder ToolSearch in der Session):

- **Notizen lesen** (Pfad / Title)
- **Suchen** über Vault-Inhalt und Frontmatter
- **Erstellen / Bearbeiten** von Notizen
- **Tags** und Backlinks abfragen

> ⚠️ **Sicherheit**: Das Plugin hat **Schreibrechte** auf den Vault. Vor erstem
> Einsatz Vault-Backup machen (Obsidian Sync, Git, Nextcloud) und nur in
> vertrauenswürdigen Vaults aktivieren. Bei sensiblen Notizen empfiehlt sich
> ein dedizierter "Claude-Vault" statt der Hauptvault.

## Troubleshooting

| Symptom | Ursache | Fix |
|---|---|---|
| `mcp-remote` Connection-refused | Obsidian zu, oder Plugin nicht aktiviert | Obsidian öffnen, Plugin enablen |
| Port belegt | anderer Dienst auf 22360 | Plugin-Port ändern, `.mcp.json` nachziehen |
| Server taucht nach Restart nicht auf | Cache | `npx -y mcp-remote@0.1.38 http://localhost:22360/sse` einmal manuell laufen lassen |
| Mehrere Claude Code-Instanzen | Plugin bedient nur eine | pro Vault einen Port vergeben |

## Web-Sessions / VPS

Diese Konfiguration funktioniert **nur** wenn Claude Code auf demselben
Rechner läuft, auf dem auch Obsidian offen ist. Auf der VPS / in
Web-Claude-Code-Sessions ist die Integration **inaktiv** — `localhost:22360`
existiert dort nicht. Das ist okay; der `obsidian`-Server bleibt einfach
disconnected, blockiert aber keine andere MCP-Funktionalität.
