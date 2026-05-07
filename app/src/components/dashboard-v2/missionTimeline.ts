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

export function extractZip(addr: string | undefined | null): string | null {
  if (!addr) return null;
  const m = ZIP_RE.exec(addr);
  return m?.[1] ?? null;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(zipA: string, zipB: string): number | null {
  const a = ZIP_COORDS[zipA];
  const b = ZIP_COORDS[zipB];
  if (!a || !b) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateDriveMinutes(zipFrom: string, zipTo: string): number | null {
  const km = haversineKm(zipFrom, zipTo);
  if (km === null) return null;
  return Math.round((km / AVG_SPEED_KMH) * 60 + SETUP_BUFFER_MIN);
}

export type MissionStatus = "done" | "next" | "planned" | "todo";

export interface MissionItem {
  order: Order;
  zip: string | null;
  driveMinFromPrev: number | null;
  status: MissionStatus;
}

/** Reichert sortierte Heute-Termine mit Drive-Time + Status-Pille an.
 * `now` bestimmt, welcher Slot „next" ist (erster nicht-erledigter ab jetzt). */
export function buildMissionTimeline(orders: Order[], now: Date): MissionItem[] {
  const nowMs = now.getTime();
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
    if (zip) prevZip = zip;
    return { order, zip, driveMinFromPrev, status };
  });
}
