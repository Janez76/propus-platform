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
 * API liefert z. B. `assets/photographers/Janez.png` (wie photographers.config.js).
 */
export function photographerPortraitUrl(image: string): string {
  const t = image.replace(/^\.?\//, "");
  if (t.startsWith("assets/")) return `${BASE}/${t.slice("assets/".length)}`;
  return `${BASE}/${t}`;
}
