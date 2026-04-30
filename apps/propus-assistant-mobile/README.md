# Propus Assistant Mobile

Expo-App für den Propus Assistant mit Voice-first UI.

## API

Die App spricht gegen:

```text
https://ki.propus.ch
```

Die Domain muss auf dem VPS auf die Assistant-API weiterleiten.

## Lokal testen mit Expo Go

```bash
cd apps/propus-assistant-mobile
npm install
npx expo start
```

Dann QR-Code mit Expo Go scannen.

## Android APK bauen

Einmalig anmelden:

```bash
npx eas login
```

Preview-APK bauen:

```bash
cd apps/propus-assistant-mobile
npx eas build --platform android --profile preview
```

EAS gibt am Ende einen Download-Link aus. Die APK kann direkt auf Android installiert werden
(„unbekannte Quellen“ erlauben).

## Token

1. In der Admin-App `/assistant` öffnen.
2. Abschnitt „Mobile-Zugang“ öffnen.
3. Neuen Token erstellen und einmalig kopieren.
4. In der Mobile-App beim Login einfügen.
