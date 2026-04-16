/**
 * Öffentliche & interne URLs für das Selekto-Modul (Bildauswahl).
 * - Kunde (Magic Link): `/selekto/:slug`
 * - Backpanel: `/admin/selekto`
 */

export const PATH_SELEKTO_ADMIN = "/admin/selekto";

export function pathClientSelekto(slug: string): string {
  return `/selekto/${encodeURIComponent(slug)}`;
}

/** z. B. `galleries` → Übersicht `/admin/selekto`; `galleries/xyz`, `templates` … */
export function pathSelektoAdmin(subPath?: string): string {
  const base = PATH_SELEKTO_ADMIN;
  if (subPath == null || subPath === "") return base;
  const p = subPath.replace(/^\//, "");
  if (p === "galleries") return base;
  if (p.startsWith("galleries/")) return `${base}/${p.slice("galleries/".length)}`;
  return `${base}/${p}`;
}
