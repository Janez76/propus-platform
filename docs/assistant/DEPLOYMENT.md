# Deployment

## Web (propus-platform)

Deine bestehende Pipeline funktioniert ohne Änderung — die Assistant-Files sind regulärer Next.js-Code in der gleichen App.

### Vor dem Deploy

```bash
cd app
npx tsc --noEmit         # TypeScript-Check (deine Baseline)
npm run build            # Build muss durchlaufen
```

### Deploy

Über deinen `workflow_dispatch`-Trigger in GitHub Actions wie gewohnt.

### Smoke-Test produktiv

1. `https://admin-booking.propus.ch/assistant` öffnen
2. Mikro-Berechtigung erteilen
3. Sagen: „Welche Aufträge habe ich heute?"
4. Antwort sollte innerhalb 5–8 Sekunden kommen
5. In der DB-Tabelle `assistant_audit_log` schauen, ob keine Write-Aktion fälschlich auditiert wurde
6. Floating-Button (rechts unten) testen, falls aktiviert

## Mobile (Expo)

### Voraussetzungen

- Expo-Account: https://expo.dev/signup (gratis)
- EAS CLI: `npm install -g eas-cli`
- Apple Developer Account (99 USD/Jahr) für TestFlight + App Store
- Google Play Console (25 USD einmalig) für Android

### Erstes Setup

```bash
cd mobile
npm install
eas login
eas build:configure
```

EAS legt eine `eas.json` an. Empfohlene Konfiguration:

```json
{
  "cli": { "version": ">= 13.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

### Lokales Testen

```bash
npx expo start
```

Expo Go auf dem Handy installieren, QR-Code scannen → App lädt.

> **Achtung:** Expo Go unterstützt `expo-secure-store` nicht voll. Für richtigen Auth-Test einen Development-Build erzeugen:
> ```bash
> eas build --profile development --platform ios
> ```

### TestFlight (iOS)

```bash
eas build --profile preview --platform ios
```

Nach ~15 Min ist der Build fertig. Dann:

```bash
eas submit --platform ios --latest
```

In App Store Connect → TestFlight → interne Tester einladen (du selbst).

### Android APK (sideload)

```bash
eas build --profile preview --platform android
```

Liefert eine APK-URL. Direkt aufs Handy laden und installieren.

### Production (App Store / Play Store)

Wenn du wirklich publishen willst (eher Phase 5):

```bash
eas build --profile production --platform all
eas submit --platform all --latest
```

App-Store-Reviews dauern bei Voice-Apps typisch 1–3 Tage.

## ENV in Mobile

Die Mobile-App ruft nur dein Backend an — sie braucht selber **keine** API-Keys. Whisper und Claude liegen serverseitig.

In `app.json` ist die Backend-URL als `extra.apiBaseUrl` hinterlegt:

```json
"extra": { "apiBaseUrl": "https://admin-booking.propus.ch" }
```

Ändern, falls du Production-Backend wechselst.

## Auth-Brücke Mobile ↔ Web

Phase 3 (initial): User klebt manuell einen Token rein (siehe `app/(auth)/login.tsx`).

Phase 4 (besser): Endpoint `POST /api/assistant/auth/mobile-login` mit Email/Passwort, der einen langlebigen JWT zurückgibt. Das ist nicht im Lieferumfang dieses Pakets — ergänzt du selbst, abgestimmt auf dein Auth-System.

## Backup-Plan

Wenn Whisper oder Claude API ausfällt:
- API-Endpoint gibt `500` zurück mit klarer Fehlermeldung
- Web-UI zeigt den Fehler an, blockiert nicht
- User kann immer noch per Text tippen
- Audit-Log enthält die Fehler für späteres Debugging
