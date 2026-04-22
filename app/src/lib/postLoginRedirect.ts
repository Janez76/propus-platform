import type { Role } from "../types";

/** Rollen, die zum Kunden-Portal gehören – kein Zugriff auf das Admin-Panel. */
const PORTAL_ONLY_ROLES: Set<string> = new Set(["customer_admin", "customer_user"]);

/**
 * Externe URL des Kunden-Portals.
 * Wird in der .env als NEXT_PUBLIC_PORTAL_URL gesetzt; Fallback: portal.propus.ch.
 */
export function getPortalUrl(): string {
  return (
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PORTAL_URL) ||
    "https://portal.propus.ch"
  );
}

/** Hostname des Kunden-Portals (z. B. portal.propus.ch) – für `window.location`-Vergleiche. */
export function getPortalHostname(): string {
  try {
    return new URL(getPortalUrl().replace(/\/$/, "")).hostname.toLowerCase();
  } catch {
    return "portal.propus.ch";
  }
}

/** Gibt true zurück, wenn die Rolle zum Kunden-Portal gehört (kein Admin). */
export function isPortalOnlyRole(role: string): boolean {
  return PORTAL_ONLY_ROLES.has(String(role || ""));
}

function isSafeInternalPath(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

/**
 * Bestimmt das Login-Ziel.
 * Kunden-Rollen → Portal-URL (extern).
 * Interne Rollen → returnTo oder /dashboard.
 */
export function resolvePostLoginTarget(role: Role | string, returnTo?: string | null): string {
  if (isPortalOnlyRole(role)) return getPortalUrl();
  if (returnTo && isSafeInternalPath(returnTo)) return returnTo;
  return "/dashboard";
}
