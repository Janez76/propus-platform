/**
 * Schweizer Nationalfeiertage
 * Berechnet für ein gegebenes Jahr die fixen und beweglichen Feiertage.
 */

function easterSunday(year) {
  // Gauss'sche Osterformel
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * CH-Feiertage fuer Verfuegbarkeit (global): fixe Bundesfeiertage Klasse 1/2
 * plus Ostersonntag und Auffahrt. Keine kantonalen Teiltage, kein Karfreitag/
 * Ostermontag/Pfingstmontag/Stephanstag (vgl. Buchungs-Plan 2026/2027).
 */
function getHolidaysForYear(year) {
  const easter = easterSunday(year);
  const dates = [
    `${year}-01-01`,
    toISO(easter),
    toISO(addDays(easter, 39)),
    `${year}-08-01`,
    `${year}-12-25`,
  ];
  return new Set(dates);
}

// Cache pro Jahr
const _cache = new Map();

function getHolidaySet(year) {
  if (!_cache.has(year)) {
    _cache.set(year, getHolidaysForYear(year));
  }
  return _cache.get(year);
}

/**
 * Gibt true zurück wenn das Datum (YYYY-MM-DD) ein CH-Nationalfeiertag ist.
 */
function isHoliday(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!Number.isFinite(year)) return false;
  return getHolidaySet(year).has(dateStr);
}

/**
 * Gibt alle Feiertage eines Jahres als Array von YYYY-MM-DD zurück.
 */
function getHolidaysArray(year) {
  return [...getHolidaySet(year)].sort();
}

module.exports = { isHoliday, getHolidaysArray };
