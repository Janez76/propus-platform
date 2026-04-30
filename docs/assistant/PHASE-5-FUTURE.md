# Phase 5 — Future / Optional

Erweiterungen, die nicht im Initial-Lieferumfang sind, aber gut anschliessen.

## Wake-Word „Hey Propus"

**Library:** [Picovoice Porcupine](https://picovoice.ai/platform/porcupine/)

- Custom Wake-Word in deren Console trainieren (~5 Min)
- Web: `@picovoice/porcupine-web` einbinden
- Mobile: `@picovoice/porcupine-react-native`

Free-Tier: 3 Nutzer, kommerzielle Lizenz nötig für Propus-Mitarbeitende. ~50 USD/Monat.

Alternative: VAD (Voice Activity Detection) statt Wake-Word — User drückt Button einmal, App startet/stoppt automatisch je nach Sprechpausen. Einfacher, kein extra Service.

## Proaktive Notifications

Nicht der User fragt, sondern der Assistant meldet sich.

**Beispiele:**
- „Tour von Müller läuft in 7 Tagen ab. Renewal-Mail schicken?"
- „Du hast morgen 3 Shootings, erstes um 9:00 in Zug. Soll ich die Route rausschicken?"
- „Neue Anfrage von Häsler im Posteingang."

**Umsetzung:**
- Cron-Job (z.B. täglich 7:00) → Backend prüft Bedingungen → schickt Push via Expo Notifications
- Web: Service Worker + Web Push API
- Mobile: `expo-notifications` + Expo Push Tokens

```typescript
// Beispiel: täglicher Tour-Check
async function checkExpiringTours() {
  const tours = await getToursExpiringIn(7);
  if (tours.length === 0) return;
  await sendPush({
    title: `${tours.length} Tour(en) laufen in 7 Tagen ab`,
    body: tours.map((t) => t.customer_name).join(', '),
    data: { action: 'open_tours' },
  });
}
```

## Bessere TTS

**Browser-TTS** (jetzt) ist robotic, vor allem auf Chrome.

**Upgrade:** ElevenLabs

- Deutsche Stimmen mit natürlicher Prosodie
- API-Call statt Browser
- ~20 CHF/Monat bei mässiger Nutzung
- Code-Änderung: in `ConversationView.tsx` und `mobile/app/(app)/index.tsx`

```typescript
async function speakElevenLabs(text: string) {
  const res = await fetch('/api/assistant/tts', {
    method: 'POST',
    body: JSON.stringify({ text, voice: 'rachel-de' }),
  });
  const blob = await res.blob();
  const audio = new Audio(URL.createObjectURL(blob));
  audio.play();
}
```

Backend-Route: einfacher Proxy zu `https://api.elevenlabs.io/v1/text-to-speech/...`.

## Mehrere Mitarbeiter

Aktuell: Single-User (Janez).

**Erweiterung:**
- `assistant_user_settings` Tabelle: pro User Tools-Whitelist
- Rollen: Admin (alle Tools), Mitarbeiter (nur read + eigene Aufträge)
- Tool-Filter im Backend: `allTools.filter(t => userPermissions.allows(t.name))`

## Offline-Modus

**Whisper offline:** [whisper.cpp](https://github.com/ggerganov/whisper.cpp) als WASM im Browser oder als nativer Cross-Compile auf der UGREEN NAS. Modell `base` (~140 MB) reicht für Deutsch.

**Claude offline:** geht nicht — aber bei Verbindungsverlust kann ein simpler Fallback-Modus mit Befehls-Pattern-Matching die wichtigsten Read-Aktionen liefern.

## Slack-Integration

Statt nur Web/Mobile: Assistant in Slack ansprechbar.

- Slack-App registrieren, `app_mention`-Event abonnieren
- Endpoint `/api/assistant/slack` erstellt → ruft `runAssistantTurn` auf
- Antwort als Slack-Message posten
- Bonus: Tool-Calls zeigen schöne Slack-Block-Kit-Karten

## Voice-Cloning für Auftragsbestätigungen

Ausgehende Sprachnachrichten an Kunden mit deiner Stimme — z.B. Terminbestätigungen via WhatsApp.

ElevenLabs Voice Cloning + Twilio. Eher Spielerei als produktiv nötig.

## Home Assistant Voice

Du hast bereits HA. HA hat ab 2024 native Voice-Pipelines. Idee: Propus-Assistant als HA-Pipeline einbinden, dann reden direkt mit dem Smart Display in der Wohnung.

```yaml
# configuration.yaml
conversation:
  custom_agents:
    - name: "Propus"
      url: "https://admin-booking.propus.ch/api/assistant/ha-pipeline"
```

Erfordert minimalen Adapter-Endpoint, der HA-Voice-Format zu Anthropic-Format übersetzt.

## Telemetrie & Analytics

Was funktioniert, was nicht?

- Welche Tools werden am häufigsten genutzt?
- Wo bricht der Assistant ab?
- Wie lang dauern Turns?
- Welche User-Inputs scheitern an der Transkription?

→ Sentry für Errors, simples PostHog/Plausible-Setup für Tool-Stats.

## Video-Calls auswerten

Du nimmst Calls mit Kunden auf → Whisper transkribiert → Claude fasst zusammen → Action-Items kommen automatisch in die Auftrags-Notizen.

```typescript
async function processCallRecording(audioFile: File, orderId: string) {
  const text = await transcribe(audioFile);
  const summary = await summarizeWithClaude(text, { context: 'kundengespraech' });
  await updateOrderNotes(orderId, summary);
}
```
