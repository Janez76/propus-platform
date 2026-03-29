# Buchungs-Assets (statisch)

- `brand/` – Logo/Favicon (im Repo).
- `landing/packages/` – Paket-Kacheln auf der Landing-Page (`package-*.png`). Fehlen die Dateien, blendet die UI die Bilder per `onError` aus.
- `photographers/` – Porträts gemäß `booking/photographers.config.js` (`assets/photographers/…` → hier ohne Präfix `assets/`).

Bei Deploy fehlender Binärdateien: PNGs vom bisherigen Legacy-`booking/`-Standort hierher kopieren.
