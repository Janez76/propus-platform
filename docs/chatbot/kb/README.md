# Chatbot Knowledge Base

Diese Knowledge Base (KB) versorgt den Propus-Buchungsassistenten mit allem
faktischen Wissen, das nicht in der Datenbank lebt. Preise, Verfügbarkeiten und
Reisezonen kommen über Tool-Calls aus Postgres — die KB beschreibt **das Was
und Warum**, nicht die Tagespreise.

## Verzeichnisstruktur

```
docs/chatbot/kb/
├── README.md                    ← diese Datei
├── _index.json                  ← Manifest, vom Loader gelesen
├── _loader.example.ts           ← Beispiel-Loader für platform/chat/
├── company/                     ← Firmenkontext, Team, Positionierung
├── services/                    ← Pro Leistung ein File (Foto, Matterport, Drohne, Video, Grundriss)
├── operations/                  ← Reisezonen, Lieferzeiten, Wetter, Umterminierung
├── matterport-lifecycle/        ← Renewals (CHF 59), Reactivation (CHF 74), Archivierung
├── billing/                     ← Rechnung, Zahlungsfristen, Bildnutzungsrechte
└── qa-patterns/                 ← Strukturierte Q&A-Patterns (JSON, kein Markdown)
```

Jeder Markdown-Inhalt existiert zweimal: `*.de.md` für Schweizer Hochdeutsch
und `*.en.md` für Englisch. Der Loader wählt anhand
`chat_conversations.locale`.

## Loader-Strategie

Beim Start des Chat-Servers wird die KB **einmalig** in den Speicher geladen
(kein RAG, kein Vector-Store — das Volumen ist klein genug, ~30–50 KB Text pro
Sprache). Cache-Invalidierung via SIGHUP oder durch Re-Deploy.

Der Loader baut zwei Strings:

1. **`kb_summary`** (immer im System-Prompt) — kompakte Übersicht mit
   1–2-Zeilen-Pitches pro Leistung, Reisezonen-Konzept, Liefer-Standardzeiten.
   Ziel: <2'000 Tokens.
2. **`kb_full`** (nur bei Bedarf via Tool `lookup_kb(topic)`) — der volle
   Inhalt zu einem Topic, wenn der Bot eine Detailfrage beantwortet.

Vorteil dieses Splits: Der System-Prompt bleibt schlank, der Bot greift nur
auf Details zu, wenn er sie wirklich braucht — und die Topic-Aufrufe landen im
Audit-Log.

Siehe `_loader.example.ts` für die Implementierungsskizze.

## Pflege-Regeln

1. **Keine Preise als Zahlen in die KB.** Ausnahme: Renewal-Preise im
   `matterport-lifecycle/` Ordner, weil sie konstant sind und im Lebenszyklus
   strukturell verankert. Alle anderen Preise kommen aus
   `estimate_total` oder `get_services`.
2. **Eine Aussage pro Absatz, kurz.** Der Bot zerlegt Absätze beim Antworten —
   lange Schachtelsätze produzieren schlechte Replies.
3. **Klartext, keine Floskeln.** "Wir liefern in 24–48 h" statt "innert
   nützlicher Frist".
4. **DE und EN müssen synchron bleiben.** Wenn du `photography.de.md`
   änderst, ändere `photography.en.md` im selben Commit. Sonst halluziniert
   der Bot in einer Sprache.
5. **`_index.json` aktualisieren**, sobald du ein File hinzufügst, sonst lädt
   es der Loader nicht.
6. **Q&A-Patterns sind keine Skripte.** Sie geben dem Bot ein
   Antwort-_Skelett_ — er formuliert es im Konversations-Kontext aus, nie 1:1.

## Wann KB, wann Datenbank?

| Faktum | Quelle |
|---|---|
| Was ist Matterport? | KB (`services/matterport.*`) |
| Wie viel kostet Matterport für 4.5-Zi-Wohnung in Bern? | DB (`estimate_total`) |
| Wie lange hält ein Matterport-Hosting? | KB (`matterport-lifecycle/renewals.*`) |
| Verlängerung jetzt CHF 59? | KB (Wert ist konstant) |
| Sind am 12. Mai noch Slots frei? | DB (`check_availability`) |
| Wie funktioniert die Drohnen-Bewilligung? | KB (`services/drone.*`) |
| Welcher Kanton liegt in welcher Reisezone? | DB (Reisezonen-Tabelle) |
| Wie wird die Reisezone berechnet? | KB (`operations/travel-zones.*`) |

## Validierung

Vor jedem Deploy:

```bash
node scripts/validate-kb.js
```

Das Skript prüft:

- Jedes File aus `_index.json` existiert.
- Jedes `*.de.md` hat ein Paar `*.en.md`.
- Keine Markdown-Datei ist >8 KB (Token-Budget).
- `qa-patterns/*.json` parst sauber und alle Patterns haben `id`, `intent`,
  `answer_de`, `answer_en`.
