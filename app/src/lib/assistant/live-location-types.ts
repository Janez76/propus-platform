/**
 * Geteilter Gerätestandort für Assistant-Routing (Google Directions/Matrix).
 * Wird pro Anfrage vom Client gesendet, nicht in der Nachrichten-Historie persistiert.
 */

/** Exakter String für Tool-Parameter origin / origins / start_address — wird serverseitig in lat,lng aufgelöst. */
export const LIVE_ORIGIN_PLACEHOLDER = "PROPUS_ASSISTANT_LIVE_ORIGIN";

export type AssistantLiveLocation = {
  lat: number;
  lng: number;
  accuracyM?: number;
  /** ISO-Zeitpunkt der Messung (Client). */
  capturedAt: string;
};

export function parseClientLiveLocation(raw: unknown): AssistantLiveLocation | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;

  let accuracyM: number | undefined;
  if (o.accuracyM != null && Number.isFinite(Number(o.accuracyM))) {
    const a = Number(o.accuracyM);
    if (a >= 0 && a < 50_000) accuracyM = a;
  }

  // Strikt: capturedAt landet im System-Prompt (Bug-Hunt HIGH-2). Roh-Strings
  // koennten Newlines/Steuerzeichen enthalten und damit aus dem
  // LIVE-STANDORT-Block ausbrechen → Prompt-Injection. Wir parsen den Wert
  // als Date und re-serialisieren ueber toISOString() — damit ist das Format
  // garantiert ASCII-only und ohne CR/LF.
  const capturedAt = parseCapturedAt(o.capturedAt);

  return { lat, lng, accuracyM, capturedAt };
}

function parseCapturedAt(raw: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim().slice(0, 64);
    if (trimmed) {
      const t = Date.parse(trimmed);
      if (Number.isFinite(t)) return new Date(t).toISOString();
    }
  }
  return new Date().toISOString();
}

export function liveCoordsForGoogle(loc: AssistantLiveLocation): string {
  return `${loc.lat},${loc.lng}`;
}

/** Ein Absatz für den System-Prompt (Code-Default und appendDynamicContext bei DB-Prompt). */
export function buildLiveLocationSystemPromptBlock(loc: AssistantLiveLocation): string {
  const coords = liveCoordsForGoogle(loc);
  const acc =
    loc.accuracyM != null && Number.isFinite(loc.accuracyM)
      ? ` (GPS-Genauigkeit ca. ±${Math.round(loc.accuracyM)} m)`
      : "";
  return [
    "",
    "LIVE-STANDORT (nur diese Anfrage — für Routing nutzen):",
    `Koordinaten WGS84: ${coords}${acc}. Erfasst (Client): ${loc.capturedAt}.`,
    `Wenn der Nutzer von «hier», «meinem Standort», «aktueller Position» oder «von mir aus» spricht: bei get_route als Parameter origin, bei get_distance_matrix in der Liste origins, bei get_travel_time_for_orders als start_address exakt den Platzhalter "${LIVE_ORIGIN_PLACEHOLDER}" angeben — nicht die Koordinaten manuell abschreiben.`,
    "Liegt dieser Abschnitt nicht vor oder der Nutzer hat den Standort nicht geteilt, existiert kein Live-Standort — dann eine konkrete Startadresse erfragen.",
  ].join("\n");
}
