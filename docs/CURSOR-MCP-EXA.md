# Cursor MCP — Exa Web-Search

[Exa](https://exa.ai) liefert über das **MCP-Protokoll** Web-Suche, Code-Kontext, Crawling und Deep-Research direkt in Cursor (Desktop, IDE, Cloud-Agenten).

Diese Doku beschreibt, wie der Exa-MCP-Server für **dieses Repo** und für den **lokalen Cursor** aktiviert wird.

---

## Aktivierungs-Optionen

Cursor unterstützt zwei Speicherorte für MCP-Server. Beide sind gleichwertig, summieren sich (alle Server aus beiden Dateien werden geladen).

| Datei                | Geltungsbereich         | Versioniert?            |
|----------------------|------------------------|-------------------------|
| `~/.cursor/mcp.json` | Alle Projekte (User)   | Nein (lokal)            |
| `.cursor/mcp.json`   | Nur dieses Repo        | **Nein** — gitignored¹  |

¹ `.cursor/mcp.json` ist in diesem Repo per `.gitignore` ausgeschlossen, weil MCP-Konfigurationen häufig benutzerspezifisch sind oder Secrets enthalten. Stattdessen liegt eine **Vorlage** unter [`.cursor/mcp.example.json`](../.cursor/mcp.example.json), die per Copy-Paste übernommen werden kann.

---

## Setup für Cursor Desktop / IDE

### Variante A — Global (empfohlen, gilt für alle Projekte)

```bash
# macOS / Linux
mkdir -p ~/.cursor
cp .cursor/mcp.example.json ~/.cursor/mcp.json
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$HOME\.cursor" | Out-Null
Copy-Item .cursor\mcp.example.json "$HOME\.cursor\mcp.json"
```

### Variante B — Nur für dieses Repo

```bash
cp .cursor/mcp.example.json .cursor/mcp.json
```

Beide Varianten enthalten dieselbe Konfiguration:

```json
{
  "mcpServers": {
    "exa": {
      "url": "https://mcp.exa.ai/mcp?tools=web_search_exa,get_code_context_exa,crawling_exa,deep_researcher_start,deep_researcher_check"
    }
  }
}
```

### Nach dem Anlegen

1. **Cursor neu starten** (oder: `Cmd/Ctrl+Shift+P` → `MCP: Reload Servers`).
2. Beim ersten Tool-Aufruf öffnet Exa den Browser für **OAuth** — kein API-Key nötig.
3. Account-Verwaltung: <https://dashboard.exa.ai>.

---

## Aktivierte Tools

Der konfigurierte URL-Parameter `tools=` aktiviert gezielt die für **Coding-Agenten + Deep-Research** relevanten Tools:

| Tool                     | Zweck                                                                |
|--------------------------|----------------------------------------------------------------------|
| `web_search_exa`         | Klassische Web-Suche (relevanteste Quellen)                          |
| `get_code_context_exa`   | Sucht Code-Snippets, Doku-Seiten, API-Beispiele                      |
| `crawling_exa`           | Holt Inhalt für eine konkrete URL (Doku, GitHub-Issues, Blogposts)   |
| `deep_researcher_start`  | Startet einen Multi-Step-Research-Job (asynchron, ~Minuten)          |
| `deep_researcher_check`  | Pollt Ergebnis eines laufenden Research-Jobs                         |

### Alle Tools aktivieren (optional)

Die kompletten verfügbaren Tools laut Exa-Doku:

```
web_search_exa, web_search_advanced_exa, get_code_context_exa, crawling_exa,
company_research_exa, people_search_exa, deep_researcher_start, deep_researcher_check
```

URL dafür:

```
https://mcp.exa.ai/mcp?tools=web_search_exa,web_search_advanced_exa,get_code_context_exa,crawling_exa,company_research_exa,people_search_exa,deep_researcher_start,deep_researcher_check
```

`company_research_exa` und `people_search_exa` sind nur sinnvoll, wenn man tatsächlich Firmen-/Personen-Daten anreichert — für reines Coding kosten sie nur Aufmerksamkeit ohne Nutzen.

---

## Cloud-Agenten / CI

Cursor-Cloud-Agenten lesen MCP-Konfigurationen ebenfalls aus `~/.cursor/mcp.json` der VM. Da die VM bei jedem Lauf neu provisioniert wird, gibt es zwei Pfade:

1. **Pro-Agent-Bootstrap** im Env-Setup (`cursor.com/onboard`): kleiner Setup-Step kopiert `.cursor/mcp.example.json` → `~/.cursor/mcp.json`.
2. **Manueller Lauf**: vor dem ersten MCP-Tool-Call im Agent-Run die Datei selbst anlegen.

Für reine Code-Tasks ohne Web-Search ist Exa-MCP in Cloud-Agenten **nicht zwingend** — die Agenten haben bereits `WebSearch`/`WebFetch` direkt zur Verfügung.

---

## Troubleshooting

**Tools tauchen nicht auf?**
- Cursor neu starten.
- `Cmd/Ctrl+Shift+P` → `MCP: Show Logs` → Verbindungsfehler prüfen.
- Browser-OAuth abgeschlossen? Falls Cookie/Session abgelaufen: `https://dashboard.exa.ai` neu einloggen, dann Tool nochmal aufrufen.

**OAuth-Browser öffnet sich nicht?**
- Manuelles Login bei <https://dashboard.exa.ai>, danach Cursor neu starten.

**Welche Such-API-Parameter unterstützt der MCP-Server?**
- Quelle der Wahrheit: <https://docs.exa.ai/reference/search-api-guide-for-coding-agents>.
- Tool-spezifische Parameter (z. B. `type`, `numResults`, `outputSchema`) werden vom MCP-Server akzeptiert und 1:1 an die Exa-API durchgereicht.

---

## Direkte API-Nutzung (ohne MCP)

Für Skripte oder eigene Backend-Aufrufe kann auch die HTTP-API direkt verwendet werden:

```bash
export EXA_API_KEY="…"  # aus https://dashboard.exa.ai/api-keys

curl -X POST 'https://api.exa.ai/search' \
  -H 'x-api-key: '"$EXA_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "React hooks best practices 2024",
    "type": "deep",
    "numResults": 10,
    "contents": { "highlights": true }
  }'
```

**Wichtig** (häufige Fallstricke laut Exa-Doku):
- `useAutoprompt`, `numSentences`, `highlightsPerUrl`, `tokensNum` → **deprecated**, nicht mehr verwenden.
- `text`, `summary`, `highlights` müssen bei `/search` **innerhalb** von `contents` liegen, bei `/contents` sind sie top-level.
- `livecrawl: "always"` → ersetzt durch `contents.maxAgeHours: 0`.
- `excludeDomains` ist mit `category: "company" | "people"` **nicht** kombinierbar (400er-Fehler).
