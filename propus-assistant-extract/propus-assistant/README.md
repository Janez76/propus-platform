# Propus Assistant

Sprachgesteuerter persönlicher Assistent für Propus GmbH — Web (in `propus-platform` integriert) + Mobile (Expo).

## Was kann er?

- **Sprachsteuerung** via Whisper (Deutsch + Schweizerdeutsch)
- **Tool-Use** mit Claude Opus 4.7: `get_open_orders`, `create_order_draft`, `update_order_status`, `get_today_schedule`, `get_tours_expiring_soon`, `search_emails`, `send_email_draft`, `create_calendar_event`, `mailerlite_*`, `ha_call_service`, `paperless_search` …
- **Bestätigungsflow** für alle schreibenden Aktionen
- **Audit-Log** in PostgreSQL
- **Web-UI** im Admin-Panel als Floating-Button + dedizierte Route `/assistant`
- **Mobile-App** (iOS / Android) mit Push-to-Talk, Haptik, TTS

## Verzeichnisstruktur

```
propus-assistant/
├── platform-integration/        # In Janez76/propus-platform einfügen
│   ├── migrations/              # SQL-Migration für Postgres
│   ├── app/api/assistant/       # Next.js API-Routen
│   ├── app/(admin)/assistant/   # Web-UI + Komponenten
│   ├── components/global/       # Floating Voice Button
│   └── lib/assistant/           # Backend-Logik (Claude, Whisper, Tools)
├── mobile/                      # Eigenständige Expo-App
└── docs/                        # Setup, Tools, Deployment, Phase 5
```

## Schnellstart

1. **[docs/SETUP.md](docs/SETUP.md)** — Schritt-für-Schritt: ENV, Migration, erstes Deployment
2. **[docs/TOOLS.md](docs/TOOLS.md)** — Tool-Referenz und wie du eigene hinzufügst
3. **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Web-Deploy (existing Pipeline) + Mobile (EAS Build)
4. **[docs/PHASE-5-FUTURE.md](docs/PHASE-5-FUTURE.md)** — Wake-Word, proaktive Notifications, Offline

## Kosten (geschätzt)

| Posten | Monatlich |
|---|---|
| Whisper API | ~10 CHF |
| Claude API (Opus 4.7) | ~30–50 CHF |
| ElevenLabs (optional, sonst Browser-TTS) | ~20 CHF |
| EAS Build (Free-Tier reicht) | 0 CHF |
| **Total** | **~40–80 CHF** |

## Offene TODOs (du)

- [ ] OpenAI + Anthropic API-Keys in `.env` eintragen
- [ ] DB-Client in `lib/assistant/tools/orders.ts`, `tours.ts` und `audit.ts` einsetzen (siehe TODO-Kommentare)
- [ ] Auth-Helper in `app/api/assistant/route.ts` an dein bestehendes System anbinden
- [ ] SQL-Schema-Spalten gegen dein tatsächliches Schema abgleichen
- [ ] Tool-Registry kürzen oder erweitern, je nach Bedarf
- [ ] Mobile: EAS-Account einrichten + erstes TestFlight-Build
- [ ] System-Prompt nach ein paar Tagen Nutzung verfeinern
