/**
 * slot-generator.js — Fahrzeit-bewusste Slot-Generierung
 *
 * Berücksichtigt:
 *  - Same-day proximity: letzter Tageseinsatz-Standort statt Heimatort
 *  - Fahrzeit zwischen Kunde A und Kunde B (Google Maps / OSRM / Haversine)
 *  - Mindestpuffer zwischen Einsätzen (scheduling.minBufferMinutes)
 *  - Arbeitszeit-Fenster pro Mitarbeiter (work_start / work_end)
 *  - Früheste Abfahrtszeit (earliest_departure)
 *
 * Voraussetzung: booking.orders enthält address_lat / address_lon.
 */

const db      = require("./db");
const travel  = require("./travel");
const { getSetting } = require("./settings-resolver");

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** "HH:MM" → Minuten seit Mitternacht */
function timeToMin(t) {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Minuten seit Mitternacht → "HH:MM" */
function minToTime(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** ISO-Datum + "HH:MM" → JS Date (Europe/Zurich) */
function toDate(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00+01:00`);
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

/**
 * Verfügbare Slots für einen Fotografen an einem bestimmten Tag.
 *
 * @param {object} params
 * @param {string} params.photographerKey        z.B. "ivan"
 * @param {object} params.photographerSettings   aus db.getAllPhotographerSettings()
 * @param {string} params.date                   "YYYY-MM-DD"
 * @param {{ lat: number, lon: number }} params.bookingCoords  Koordinaten der neuen Buchung
 * @param {number} params.durationMinutes        Shooting-Dauer in Minuten
 * @param {number} [params.slotIntervalMinutes]  Raster (default 30)
 * @returns {Promise<Array<{ time: string, travelMinutes: number, fromLabel: string }>>}
 */
async function generateAvailableSlots({
  photographerKey,
  photographerSettings,
  date,
  bookingCoords,
  durationMinutes,
  slotIntervalMinutes = 30,
}) {
  const settings = photographerSettings || {};

  // Arbeitsfenster aus Mitarbeiter-Settings
  // DB-Spalten: work_start / work_end / earliest_departure
  const workStartMin      = timeToMin(settings.work_start)         ?? timeToMin("08:00");
  const workEndMin        = timeToMin(settings.work_end)           ?? timeToMin("18:00");
  const earliestDeptMin   = timeToMin(settings.earliest_departure) ?? timeToMin("07:00");
  const homeCoord         = settings.home_lat && settings.home_lon
    ? { lat: Number(settings.home_lat), lon: Number(settings.home_lon) }
    : null;

  // Tagesbuchungen laden (sortiert nach Startzeit)
  const dayOrders = await db.getOrdersByPhotographerAndDate(photographerKey, date, [
    "confirmed", "provisional",
  ]);

  // Lücken zwischen Buchungen (inkl. vor erster / nach letzter)
  const segments = buildSegments(dayOrders, workStartMin, workEndMin);
  const slots = [];

  for (const seg of segments) {
    const { gapStartMin, gapEndMin, prevEndCoord, nextStartMin, nextStartCoord, isFirst } = seg;

    // startCoord: same-day proximity oder Heimat
    const startCoord = prevEndCoord ?? homeCoord;
    if (!startCoord || !bookingCoords) continue;

    // Fahrzeit zur neuen Buchung
    const deptDateTo = toDate(date, minToTime(gapStartMin));
    const travelTo   = await travel.routeMinutes(startCoord, bookingCoords, deptDateTo);
    const bufferTo   = await travel.travelBuffer(travelTo);

    // Frühestens: max(Lückenbeginn + Buffer, work_start, [erster Slot: earliest_departure + travelTo])
    let earliest = gapStartMin + bufferTo;
    if (isFirst) {
      earliest = Math.max(earliest, earliestDeptMin + travelTo);
    }
    earliest = Math.max(earliest, workStartMin);

    // Spätestens: Lückenende − Dauer (+ ggf. Buffer zur nächsten Buchung)
    let latest = gapEndMin - durationMinutes;
    if (nextStartCoord && nextStartMin != null) {
      const deptDateFrom = toDate(date, minToTime(earliest + durationMinutes));
      const travelFrom   = await travel.routeMinutes(bookingCoords, nextStartCoord, deptDateFrom);
      const bufferFrom   = await travel.travelBuffer(travelFrom);
      latest = Math.min(latest, nextStartMin - bufferFrom - durationMinutes);
    }

    if (earliest > latest) continue;

    // Slots im Raster
    let t = Math.ceil(earliest / slotIntervalMinutes) * slotIntervalMinutes;
    while (t <= latest) {
      slots.push({
        time:          minToTime(t),
        travelMinutes: travelTo,
        fromLabel:     prevEndCoord ? "letzter Einsatz (heute)" : "Heimatort",
      });
      t += slotIntervalMinutes;
    }
  }

  return slots;
}

// ── Segment-Aufbau ────────────────────────────────────────────────────────────

function buildSegments(dayOrders, workStartMin, workEndMin) {
  const segments = [];
  const orders   = [...dayOrders].sort((a, b) =>
    timeToMin(a.schedule_time) - timeToMin(b.schedule_time)
  );

  // Vor dem ersten Einsatz
  const first = orders[0];
  segments.push({
    isFirst:       true,
    gapStartMin:   workStartMin,
    gapEndMin:     first ? timeToMin(first.schedule_time) : workEndMin,
    prevEndCoord:  null,
    nextStartMin:  first ? timeToMin(first.schedule_time) : null,
    nextStartCoord: coordOf(first),
  });

  // Zwischen Einsätzen
  for (let i = 0; i < orders.length - 1; i++) {
    const cur  = orders[i];
    const next = orders[i + 1];
    const curEndMin = timeToMin(cur.schedule_time) + (cur.duration_minutes || 60);
    segments.push({
      isFirst:        false,
      gapStartMin:    curEndMin,
      gapEndMin:      timeToMin(next.schedule_time),
      prevEndCoord:   coordOf(cur),
      nextStartMin:   timeToMin(next.schedule_time),
      nextStartCoord: coordOf(next),
    });
  }

  // Nach dem letzten Einsatz
  const last = orders[orders.length - 1];
  if (last) {
    const lastEndMin = timeToMin(last.schedule_time) + (last.duration_minutes || 60);
    segments.push({
      isFirst:        false,
      gapStartMin:    lastEndMin,
      gapEndMin:      workEndMin,
      prevEndCoord:   coordOf(last),
      nextStartMin:   null,
      nextStartCoord: null,
    });
  }

  return segments.filter(s => s.gapEndMin > s.gapStartMin);
}

function coordOf(order) {
  if (!order) return null;
  const lat = Number(order.address_lat);
  const lon = Number(order.address_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

module.exports = { generateAvailableSlots };
