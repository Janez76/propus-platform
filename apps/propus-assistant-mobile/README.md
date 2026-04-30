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
# oder:
npm run build:android:preview
```

**Headless / CI:** Token aus Expo unter *Access Tokens* als `EXPO_TOKEN` setzen, dann z. B. unter Linux/macOS `export EXPO_TOKEN=...` vor dem `eas build`.

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
npm install
npm run prebuild:android
cd android && ./gradlew assembleRelease          # Linux/macOS
# Windows: .\gradlew.bat assembleRelease (JDK: JAVA_HOME auf JDK 17)
# → android/app/build/outputs/apk/release/app-release.apk
```

Auf SMB-/NAS-Workspaces können Gradle-File-Locks langsamer oder fehleranfällig sein — ggf. Projekt auf lokale Platte klonen.

## Troubleshooting (EAS)

| Thema | Hinweis |
|--------|---------|
| **Signing / Keystore** | `eas credentials -p android` — EAS verwaltet oder importiert Keystores; Play App Signing beachten. |
| **Build nur remote rot** | EAS-Log lesen; `npx expo install --fix` für Abgleich mit Expo 52; Env-Variablen mit `eas.json` → `build.<profile>.env` prüfen. |
| **Lokal kein `expo` in PATH** | In diesem Projekt: `npm run prebuild:android` bzw. `node ./node_modules/expo/bin/cli …`. |

## Entwicklung

```bash
npm install
npm run start          # Expo Dev Server
npm run android        # auf angeschlossenes Gerät / Emulator
```

## Konfiguration

Backend-URL in `app.json` unter `expo.extra.apiBaseUrl` setzen
(aktuell `https://ki.propus.ch`).
