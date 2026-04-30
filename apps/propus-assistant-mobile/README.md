# Propus Assistant — Mobile

Expo / React-Native-App (Voice + Text-Chat) gegen das Propus-Backend
(`/api/assistant`, `/api/assistant/transcribe`).

## APK bauen

### Variante A — EAS Cloud (empfohlen, kein lokales Android SDK nötig)

Einmalig:

```bash
npm install -g eas-cli
eas login                       # Expo-Account
cd apps/propus-assistant-mobile
npm install
eas init                        # legt projectId in app.json an
```

APK bauen (Profil `preview` aus `eas.json`):

```bash
eas build --platform android --profile preview
```

Die fertige `.apk` erscheint im EAS-Dashboard und als Download-Link
in der Konsole. Direkt auf ein Android-Gerät installieren.

Play-Store-Release als `.aab`:

```bash
eas build --platform android --profile production
```

### Variante B — GitHub Actions

Der Workflow `.github/workflows/assistant-mobile-build.yml` triggert
einen EAS-Build bei Push auf `main` (Pfad `apps/propus-assistant-mobile/**`)
oder manuell via "Run workflow".

Voraussetzung: Repo-Secret `EXPO_TOKEN`
(in Expo unter *Account Settings → Access Tokens* erzeugen).

### Variante C — Lokal (benötigt Android Studio + JDK 17)

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

## Entwicklung

```bash
npm install
npm run start          # Expo Dev Server
npm run android        # auf angeschlossenes Gerät / Emulator
```

## Konfiguration

Backend-URL in `app.json` unter `expo.extra.apiBaseUrl` setzen
(aktuell `https://ki.propus.ch`).
