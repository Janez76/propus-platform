/**
 * Öffentlicher Buchungs-Host (z. B. booking.propus.ch): Root `/` zeigt den Buchungs-Wizard.
 * Muss zur Server-Variable FRONTEND_URL / booking.propus.ch passen.
 */
function hostnameFromEnv(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = t.startsWith("http") ? new URL(t) : new URL(`https://${t}`);
    return u.hostname.toLowerCase();
  } catch {
    return t.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  }
}

export function publicBookingHostname(): string {
  const fromVite = String(import.meta.env.VITE_PUBLIC_BOOKING_HOSTNAME || "").trim();
  if (fromVite) return hostnameFromEnv(fromVite);
  return "booking.propus.ch";
}

export function isPublicBookingHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.toLowerCase() === publicBookingHostname();
}
