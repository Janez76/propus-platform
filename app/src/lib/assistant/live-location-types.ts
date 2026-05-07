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

/**
 * Ein Absatz für den System-Prompt (Code-Default und appendDynamicContext bei DB-Prompt).
 *
 * Bug-Hunt HIGH-4: Die rohen GPS-Koordinaten gehen NICHT mehr in den
 * System-Prompt. Sie bleiben serverseitig in `ctx.liveLocation` und werden
 * erst in `tools/maps.ts:resolveGeoString` an Google Maps weitergegeben, wenn
 * das Modell tatsaechlich `get_route` / `get_distance_matrix` /
 * `get_travel_time_for_orders` mit dem Platzhalter aufruft. Damit landen
 * Lat/Lng nicht im Anthropic-Kontext (DSGVO Art. 6/9, "data minimisation"
 * principle) — der Routing-Use-Case funktioniert unveraendert, weil der
 * Maps-Resolver schon immer ueber `ctx.liveLocation` lief, nicht ueber den
 * Prompt-Text.
 *
 * Trade-off: Modell kann nicht mehr aus Lat/Lng inferieren ("Du bist
 * vermutlich in Zuerich"). Fuer Routing irrelevant, weil das Tool die
 * Adressen liefert. Fuer "creative" location-aware Antworten ohne Tool
 * (z. B. Wetter ohne `get_weather_for_order`) ist das ein bewusster Verzicht
 * — Kompensation: Wetter-Tool akzeptiert weiterhin lat/lng.
 */
export function buildLiveLocationSystemPromptBlock(loc: AssistantLiveLocation): string {
  // Wert nicht im Prompt verwenden — die Signatur dokumentiert nur, dass
  // dieser Block ueberhaupt nur gebaut wird, wenn serverseitig ein
  // Standort vorliegt. Der Caller (system-prompt[-resolved].ts) entscheidet
  // ueber Praesenz, dieser Renderer redaktiert ihn vollstaendig.
  void loc;
  return [
    "",
    "LIVE-STANDORT VERFÜGBAR (serverseitig, nicht im Prompt enthüllt):",
    `Der Nutzer hat seinen Standort fuer diese Anfrage geteilt. Die Koordinaten siehst du absichtlich nicht — sie werden serverseitig aufgeloest, sobald du den Platzhalter "${LIVE_ORIGIN_PLACEHOLDER}" benutzt.`,
    `Wenn der Nutzer von «hier», «meinem Standort», «aktueller Position» oder «von mir aus» spricht: bei get_route als Parameter origin, bei get_distance_matrix in der Liste origins, bei get_travel_time_for_orders als start_address exakt den Platzhalter "${LIVE_ORIGIN_PLACEHOLDER}" angeben. Niemals nach den Koordinaten fragen — der Server kennt sie.`,
    "Liegt dieser Abschnitt nicht vor oder der Nutzer hat den Standort nicht geteilt, existiert kein Live-Standort — dann eine konkrete Startadresse erfragen.",
  ].join("\n");
}
