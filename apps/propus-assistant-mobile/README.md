# Propus Assistant (Mobile)

Expo-App für Sprach-/Text-Zugriff auf den Propus Assistant (`/api/assistant`).

## API-Basis-URL (Single Source of Truth)

Die Base-URL kommt aus **`app.config.ts`** → `extra.apiBaseUrl`:

1. **`EXPO_PUBLIC_API_BASE_URL`** (Build-Zeit), falls gesetzt — z. B. in `eas.json` unter `build.*.env` oder lokal via `dotenv-cli`.
2. Sonst Fallback aus **`app.json`** → `expo.extra.apiBaseUrl` (Standard: `https://ki.propus.ch`).
3. Der Client liest zur Laufzeit: `expo-constants` → `Constants.expoConfig?.extra?.apiBaseUrl` (siehe `lib/api.ts`).

Lokale Overrides **nicht** committen: `.env.expo.local` ist gitignored.

## EAS Build (Android APK / Preview)

Preview-Profil in `eas.json` setzt `EXPO_PUBLIC_API_BASE_URL` auf `https://ki.propus.ch`. Bei lokaler `.env.expo.local`:

```bash
cd apps/propus-assistant-mobile
npm install
npx dotenv-cli -e .env.expo.local -- eas build --platform android --profile preview
```

oder npm-Script:

```bash
npm run eas:android:preview:env
```

Ohne lokale Env-Datei reicht:

```bash
eas build --platform android --profile preview
```

**Hinweis:** `eas build` benötigt Expo-Account und ggf. Credentials; ohne Zugriff nur die Befehle dokumentiert ausführen.

## Auth

Bearer-Token aus dem Assistant unter „Mobile-Zugang“ erstellen; die App speichert ihn in `expo-secure-store`.
