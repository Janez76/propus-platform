/**
 * Öffentliche URLs unter `/listing/…`
 * - Kunde (Magic Link): `/listing/:slug` — nur der Link-Code, z. B. `/listing/fbj6qa0p3824v1o1zfqirz`
 * - Backpanel: `/bilder-auswahl` (Übersicht, Zugang per Magic-Link `?key=…` wenn konfiguriert)
 */

export const PATH_LISTING_ADMIN = "/bilder-auswahl";

export function pathClientGallery(slug: string): string {
  return `/listing/${encodeURIComponent(slug)}`;
}

/** z. B. `galleries` → Übersicht `/bilder-auswahl`; `galleries/xyz`, `templates` … */
export function pathListingAdmin(subPath?: string): string {
  const base = PATH_LISTING_ADMIN;
  if (subPath == null || subPath === "") return base;
  const p = subPath.replace(/^\//, "");
  if (p === "galleries") return base;
  return `${base}/${p}`;
}
