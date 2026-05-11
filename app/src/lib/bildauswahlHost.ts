/**
 * Vanity-Host für die Kunden-Bildauswahl.
 *
 * Production: `selekto.propus.ch/<slug>` (kurze URL, eigene Domain).
 * Dev/Preview: window.location.origin + `/bildauswahl/<slug>` (auf
 * admin-booking oder localhost, damit lokales Testen ohne DNS klappt).
 *
 * Override via env (`NEXT_PUBLIC_SELEKTO_HOST`) — leerer Wert deaktiviert
 * den Vanity-Host und fällt zurück auf `/bildauswahl/<slug>`.
 */

const DEFAULT_SELEKTO_HOST = "selekto.propus.ch";

function selektoHostFromEnv(): string {
  const raw = (process.env.NEXT_PUBLIC_SELEKTO_HOST as string | undefined)?.trim();
  if (raw === "") return ""; // explizit leer = aus
  return raw || DEFAULT_SELEKTO_HOST;
}

/** Wahr, wenn die aktuelle Seite unter dem Vanity-Host (selekto.propus.ch) läuft. */
export function isOnSelektoHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  const target = selektoHostFromEnv().toLowerCase();
  if (!target) return false;
  return h === target || h === `www.${target}`;
}

/** Baut die öffentliche Kunden-URL für eine Bildauswahl-Galerie. */
export function buildBildauswahlPublicUrl(slug: string): string {
  const target = selektoHostFromEnv();
  if (target) {
    return `https://${target}/${encodeURIComponent(slug)}`;
  }
  /** Fallback: gleiche Origin + Pfad, damit Dev/Preview ohne extra Host läuft. */
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/bildauswahl/${encodeURIComponent(slug)}`;
}
