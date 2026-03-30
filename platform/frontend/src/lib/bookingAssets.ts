/** Statische Buchungs-Assets (Vite `public/assets/booking/...`). */
const BASE = "/assets/booking";

export function bookingBrandLogoUrl(): string {
  return `${BASE}/brand/logopropus.png`;
}

/** z. B. `landing/packages/package-bestseller.png` */
export function bookingPublicAssetUrl(relativePath: string): string {
  return `${BASE}/${relativePath.replace(/^\//, "")}`;
}

/**
 * Öffentliche Porträt-URL für den Buchungs-Wizard.
 * Backend: `booking/server.js` → `app.use("/assets/photographers", express.static(PHOTOGRAPHER_PORTRAIT_DIR))`.
 * API liefert z. B. `assets/photographers/Janez.png` (siehe `photographers.config.js`), optional absolute http(s)-URLs.
 */
export function photographerPortraitUrl(image: string): string {
  const raw = String(image || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;

  const t = raw.replace(/^\.?\//, "");
  if (t.startsWith("assets/photographers/")) return `/${t}`;
  if (t.startsWith("photographers/")) return `/assets/${t}`;
  if (t.startsWith("assets/")) return `${BASE}/${t.slice("assets/".length)}`;
  return `${BASE}/${t}`;
}
