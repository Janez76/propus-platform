/**
 * Abfahrts-Logik fuer Mobile-Orders-Redesign (Phase 1).
 *
 * Berechnet Abfahrtszeit + Eskalationszustand basierend auf:
 *   - Termin-Zeit (appointmentDate)
 *   - Fahrzeit (Live-Fahrt aus Drive-Times-API ODER Schaetzung aus
 *     `missionTimeline.estimateDriveMinutes`)
 *   - Puffer (default 15 min, einheitlich mit Desktop-Mockup)
 *
 * Eskalation:
 *   - now    : Abfahrt in <= 15 min (rote Pulse-Pille)
 *   - soon   : Abfahrt in <= 60 min (gelbe Pille mit "in X min")
 *   - ok     : > 60 min (gruene Pille)
 *   - passed : Abfahrtszeit war > 2 min vor "jetzt" (durchgestrichen)
 */

export const DEFAULT_BUFFER_MIN = 15;

export type DepartureStatus = "now" | "soon" | "ok" | "passed" | "unknown";

export interface DepartureInfo {
  status: DepartureStatus;
  /** "13:39" – HH:MM-String oder "—" wenn keine Berechnung moeglich. */
  leaveAtText: string;
  /** Minuten bis zur Abfahrt (negativ = Abfahrt liegt zurueck). null wenn unbekannt. */
  minutesUntilLeave: number | null;
}

export interface ComputeDepartureOptions {
  /** Termin-Zeit als ISO oder Date. */
  appointmentDate: string | Date | null | undefined;
  /** Geschaetzte Fahrzeit in Minuten (Live > Schaetzung). null wenn nicht verfuegbar. */
  travelMin: number | null | undefined;
  /** Vorbereitungs-Puffer in min. Default 15. */
  bufferMin?: number;
  /** "Jetzt"-Override fuer Tests. */
  now?: Date;
}

export function computeDeparture(opts: ComputeDepartureOptions): DepartureInfo {
  const buffer = opts.bufferMin ?? DEFAULT_BUFFER_MIN;
  const now = opts.now ?? new Date();
  const apptMs = opts.appointmentDate
    ? typeof opts.appointmentDate === "string"
      ? new Date(opts.appointmentDate).getTime()
      : opts.appointmentDate.getTime()
    : 0;

  if (
    !apptMs ||
    Number.isNaN(apptMs) ||
    opts.travelMin == null ||
    !Number.isFinite(opts.travelMin) ||
    opts.travelMin < 0
  ) {
    return { status: "unknown", leaveAtText: "—", minutesUntilLeave: null };
  }

  const leaveMs = apptMs - opts.travelMin * 60_000 - buffer * 60_000;
  const leaveAt = new Date(leaveMs);
  const leaveAtText = leaveAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const minutesUntilLeave = Math.round((leaveMs - now.getTime()) / 60_000);

  let status: DepartureStatus;
  if (minutesUntilLeave < -2) status = "passed";
  else if (minutesUntilLeave <= 15) status = "now";
  else if (minutesUntilLeave <= 60) status = "soon";
  else status = "ok";

  return { status, leaveAtText, minutesUntilLeave };
}

/** Parst eine Drive-Time-Duration aus dem Backend (Google Maps liefert "12 mins"
 *  oder "1 hour 5 mins") in Minuten zurueck. Liefert null wenn nicht parsbar. */
export function parseDurationToMin(durationText: string | null | undefined): number | null {
  if (!durationText) return null;
  const txt = durationText.toLowerCase();
  let total = 0;
  const hMatch = /(\d+)\s*h(?:our)?/.exec(txt);
  const mMatch = /(\d+)\s*m(?:in)?/.exec(txt);
  if (hMatch) total += parseInt(hMatch[1], 10) * 60;
  if (mMatch) total += parseInt(mMatch[1], 10);
  if (total > 0) return total;
  const numOnly = /^(\d+)$/.exec(txt.trim());
  if (numOnly) return parseInt(numOnly[1], 10);
  return null;
}

/** Tour-Gap zwischen zwei aufeinanderfolgenden Heute/Morgen-Terminen.
 *  `gapMin` = (next.appt - cur.appt) in min. Tight wenn nach Abzug der
 *  Fahrzeit + Puffer weniger als 30 min bleiben. */
export interface TourGapInfo {
  /** Pause in min (auf 1 min gerundet). */
  gapMin: number;
  /** Formatierter String "2 h 30 min" oder "45 min". */
  gapText: string;
  /** Engpass-Flag: nach Abzug Fahrt+Puffer weniger als 30 min Spielraum. */
  tight: boolean;
}

export function computeTourGap(
  currentApptIso: string | undefined | null,
  nextApptIso: string | undefined | null,
  nextTravelMin: number | null | undefined,
  bufferMin: number = DEFAULT_BUFFER_MIN,
): TourGapInfo | null {
  if (!currentApptIso || !nextApptIso) return null;
  const a = new Date(currentApptIso).getTime();
  const b = new Date(nextApptIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;

  const gapMin = Math.round((b - a) / 60_000);
  const travel = nextTravelMin && Number.isFinite(nextTravelMin) ? nextTravelMin : 0;
  const slack = gapMin - travel - bufferMin;
  const tight = slack < 30;

  const gapText =
    gapMin >= 60 ? `${Math.floor(gapMin / 60)} h ${gapMin % 60} min` : `${gapMin} min`;
  return { gapMin, gapText, tight };
}
