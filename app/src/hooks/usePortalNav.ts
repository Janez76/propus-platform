/**
 * Gibt den korrekten Basispfad für Portal-Navigationen zurück.
 * Im Embed-Modus (/embed/portal/*) wird "/embed/portal" verwendet,
 * sonst "/portal".
 */
export function usePortalNav() {
  const isEmbed =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/embed/portal");

  const base = isEmbed ? "/embed/portal" : "/portal";

  function portalPath(sub: string) {
    const clean = sub.startsWith("/") ? sub : `/${sub}`;
    return `${base}${clean}`;
  }

  return { base, portalPath, isEmbed };
}
