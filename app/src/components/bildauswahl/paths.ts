export const PATH_BILDAUSWAHL_ADMIN = "/admin/bildauswahl";

export function pathClientBildauswahl(slug: string): string {
  return `/bildauswahl/${encodeURIComponent(slug)}`;
}

/**
 * Routen in ClientShell: `/admin/bildauswahl`, `/admin/bildauswahl/templates`,
 * `/admin/bildauswahl/:id` (inkl. `new`). Kein `galleries/`-Präfix — ein Segment
 * nach `/admin/bildauswahl/` entspricht genau `:id`.
 */
export function pathBildauswahlAdmin(subPath?: string): string {
  if (subPath == null || subPath === "") return PATH_BILDAUSWAHL_ADMIN;
  return `${PATH_BILDAUSWAHL_ADMIN}/${subPath.replace(/^\//, "")}`;
}
