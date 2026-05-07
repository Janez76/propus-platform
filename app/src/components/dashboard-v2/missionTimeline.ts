/**
 * Mission-Control-Timeline Helper.
 *
 * Pragmatische Drive-Time-Schätzung zwischen Schweizer PLZ via Haversine
 * (siehe `zipCoords.ts`) — kein externer Routing-Call. Für die Dashboard-
 * Vorschau reicht eine grobe Annahme (28 km/h Stadt-/Agglo-Schnitt + 5min
 * Park-/Aufbau-Puffer). Für echte Routings nutzt der Assistant ohnehin
 * `get_route` / `get_distance_matrix`.
 */
import type { Order } from "../../api/orders";
import { ZIP_COORDS } from "./zipCoords";

const STUDIO_ZIP = "8005";
const AVG_SPEED_KMH = 28;
const SETUP_BUFFER_MIN = 5;
const EARTH_R_KM = 6371;

const ZIP_RE = /\b(\d{4})\b/;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function extractZip(addr: string | undefined | null): string | null {
  if (!addr) return null;
  const m = ZIP_RE.exec(addr);
  return m?.[1] ?? null;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKmCoords(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Regional-Centroid pro PLZ-Anfangsziffer (CH, grobe Schaetzung). Fallback,
 * wenn eine PLZ nicht in `ZIP_COORDS` enthalten ist — sonst zeigt die UI „—"
 * statt einer Naeherung. Genauigkeit: Region (±30 km), reicht fuer eine
 * Tagesplan-Vorschau.
 */
const REGION_CENTROIDS: Record<string, GeoPoint> = {
  "1": { lat: 46.52, lng: 6.63 }, // Lausanne / Westschweiz
  "2": { lat: 47.00, lng: 6.93 }, // Neuchatel / Jura
  "3": { lat: 46.95, lng: 7.45 }, // Bern / Wallis-Nord
  "4": { lat: 47.55, lng: 7.60 }, // Basel / Fricktal
  "5": { lat: 47.39, lng: 8.05 }, // Aargau
  "6": { lat: 47.05, lng: 8.31 }, // Zentralschweiz / Tessin-Nord
  "7": { lat: 46.85, lng: 9.53 }, // Graubuenden
  "8": { lat: 47.37, lng: 8.55 }, // Zuerich / Schaffhausen / Zug
  "9": { lat: 47.42, lng: 9.37 }, // Ostschweiz
};

function coordsForZip(zip: string): GeoPoint | null {
  const exact = ZIP_COORDS[zip];
  if (exact) return exact;
  if (zip.length >= 1) {
    const region = REGION_CENTROIDS[zip[0]];
    if (region) return region;
  }
  return null;
}

export function haversineKm(zipA: string, zipB: string): number | null {
  const a = coordsForZip(zipA);
  const b = coordsForZip(zipB);
  if (!a || !b) return null;
  return haversineKmCoords(a, b);
}

function kmToDriveMinutes(km: number): number {
  return Math.round((km / AVG_SPEED_KMH) * 60 + SETUP_BUFFER_MIN);
}

export function estimateDriveMinutes(zipFrom: string, zipTo: string): number | null {
  const km = haversineKm(zipFrom, zipTo);
  if (km === null) return null;
  return kmToDriveMinutes(km);
}

/** Drive-Time-Schätzung von einem Live-Geo-Punkt (z. B. `useGeolocation`-Position)
 *  zu einer PLZ. Faellt bei unbekannter exakter PLZ auf den Regional-Centroid
 *  zurueck — sonst zeigt die UI „—" statt einer Naeherung. */
export function estimateDriveMinutesFromGeo(from: GeoPoint, toZip: string): number | null {
  const target = coordsForZip(toZip);
  if (!target) return null;
  return kmToDriveMinutes(haversineKmCoords(from, target));
}

export type MissionStatus = "done" | "next" | "planned" | "todo";

export interface MissionItem {
  order: Order;
  zip: string | null;
  /** ZIP-zu-ZIP-Schätzung relativ zum vorigen Termin (oder Studio, falls erster). */
  driveMinFromPrev: number | null;
  /** Drive-Time vom aktuellen Live-Standort zu diesem Termin — nur gesetzt für
   *  den `next`-Slot, wenn dem Aufruf eine `liveOrigin` übergeben wurde. */
  driveMinFromLive: number | null;
  /** Empfohlene Abfahrtszeit (= appointmentDate − driveMin). Bevorzugt
   *  `driveMinFromLive`, fällt auf `driveMinFromPrev` zurück. */
  departAt: Date | null;
  status: MissionStatus;
}

export interface BuildMissionTimelineOptions {
  /** Aktuelle Live-Position (z. B. aus `useGeolocation`). Wird für den `next`-Slot
   *  als Drive-Time-Quelle bevorzugt — UI zeigt dann „🚗 Live · 18 Min" statt
   *  der ZIP-zu-ZIP-Schätzung ab Studio/Vortermin. */
  liveOrigin?: GeoPoint | null;
}

/** Reichert sortierte Heute-Termine mit Drive-Time + Status-Pille an.
 * `now` bestimmt, welcher Slot „next" ist (erster nicht-erledigter ab jetzt). */
export function buildMissionTimeline(
  orders: Order[],
  now: Date,
  options: BuildMissionTimelineOptions = {},
): MissionItem[] {
  const nowMs = now.getTime();
  const liveOrigin = options.liveOrigin ?? null;
  let nextMarked = false;
  let prevZip: string | null = STUDIO_ZIP;

  return orders.map((order) => {
    const zip = extractZip(order.address) ?? extractZip(order.customerZipcity);
    const driveMinFromPrev = prevZip && zip ? estimateDriveMinutes(prevZip, zip) : null;
    const apptMs = order.appointmentDate ? new Date(order.appointmentDate).getTime() : 0;
    const isPast = apptMs > 0 && apptMs < nowMs - 90 * 60_000; /* 90min Termin-Standardlänge */
    let status: MissionStatus;
    if (isPast || /done|completed/i.test(order.status)) {
      status = "done";
    } else if (!nextMarked) {
      status = "next";
      nextMarked = true;
    } else {
      status = "planned";
    }
    /* Live-Geo-Drive nur für den `next`-Slot — für andere ist die Live-Position
     * schon obsolet (man fährt ja nicht erst zu Termin 3, ohne 2 zu durchlaufen). */
    const driveMinFromLive =
      status === "next" && liveOrigin && zip ? estimateDriveMinutesFromGeo(liveOrigin, zip) : null;
    const driveForDepart = driveMinFromLive ?? driveMinFromPrev;
    const departAt =
      apptMs > 0 && driveForDepart != null && status !== "done"
        ? new Date(apptMs - driveForDepart * 60_000)
        : null;
    if (zip) prevZip = zip;
    return { order, zip, driveMinFromPrev, driveMinFromLive, departAt, status };
  });
}
