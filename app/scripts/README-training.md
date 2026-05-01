# Propus Assistant — Training & Eval

Workflow für Few-Shots, Eval, Memory-Seeds und Produktions-Replay — **ohne** Secrets im Repo.

## Empfohlener Ablauf

1. **Eval** (`eval:assistant`) — Regression gegen gemockte Tools.
2. **Tune** (`tune:assistant`) — bei Rot: Opus schlägt JSON-Patches vor; Reports unter `scripts/tuning-report-*`.
3. **Manuell** — Prompt anpassen oder einen Patch mit `--apply <id>` nach Bestätigung anwenden.
4. **Eval erneut** — bis grün.
5. **Optional Few-Shots** — `few-shot-examples.ts` bei wiederkehrenden Mustern.
6. **Seed** (`seed:memories`) — staged Memories aus YAML.
7. **Replay harvest** (`replay:conversations`) — `replay-cases.json` aus Produktion.
8. **Eval mit Replay** — `eval:assistant -- --replay` gegen gemischte Fälle.

## Voraussetzungen

- `ANTHROPIC_API_KEY` in der Umgebung oder in **`app/.env.local`** / **`app/.env`** (wie beim Next-Server; Eval/Tune laden diese Dateien automatisch). Nicht committen.
- Datenbank: `DATABASE_URL` (o. ä.) für Seeds und Replay-Harvest.
- Optional: `ASSISTANT_SEED_USER_ID` — UUID des Ziel-Users für YAML mit `userId: admin` (o. ä. Platzhalter).
- Replay-Harvest: `ASSISTANT_REPLAY_USER_ID` — UUID des Users, dessen Konversationen exportiert werden.

## 1) Eval (regression)

```bash
cd app
npm run eval:assistant
```

- `--json` — maschinenlesbare Ausgabe inkl. `failedCases`.
- `--replay` — lädt `scripts/replay-cases.json` (wenn vorhanden) und merged Zusatzfälle; Drift: `observedTools` muss Teilfolge der Eval-Tools sein.
- `--case=<id>` — nur ein Fall (z. B. für schnelle Iteration).

**Wetter & Routing:** Im Chat gibt es keine Live-Wetter- oder Routing-APIs — Verhalten ist in `src/lib/assistant/system-prompt.ts` und bei Bedarf in `src/lib/assistant/few-shot-examples.ts` festgelegt (Schweiz: MeteoSchweiz; Fahrzeiten: grobe Schätzung + Karten-App). Regression: Eval-Fälle `weather-honest` und `routing-honest` in `scripts/eval-assistant.ts`.

## 2) Replay-Harvest (Produktion → JSON)

```bash
ASSISTANT_REPLAY_USER_ID=<uuid> npm run replay:conversations
```

Erzeugt `scripts/replay-cases.json` (gitignored). Anschließend Eval mit `--replay` ausführen.

## 3) Auto-Tuner (Patch-Vorschläge)

```bash
npm run tune:assistant
```

- Führt Eval aus, schlägt bei Fehlern per Claude Opus Text-Patches für `src/lib/assistant/system-prompt.ts` vor.
- Schreibt `scripts/tuning-report-<timestamp>.json` und `.md` — **kein** automatisches Überschreiben der Prompt-Datei.

Einzelner Fall:

```bash
npm run tune:assistant -- --case=tippfehler-fuzzy
```

Patch manuell anwenden (letzter Report, **ein** Patch):

```bash
npm run tune:assistant -- --apply p1
```

## 4) Memory-Seed (Staging)

```bash
ASSISTANT_SEED_USER_ID=<uuid> npm run seed:memories
```

- `--dry-run` — nur anzeigen.
- `--file=pfad/zur.yaml` — andere Datei als `scripts/seed-memories.yaml`.

Idempotent: gleiche `body` + `user_id` wird übersprungen.

## 5) Qualitätssicherung

```bash
npx tsc --noEmit
npm test
```

Vitest deckt Few-Shot-Ranking, Anonymisierung und YAML-Parsing ab — **keine** Live-Anthropic-Calls in Tests.
