/**
 * shadow-mode.js
 *
 * Führt V2-Logik (computePricing, resolveAnyPhotographer) parallel zur V1-Logik aus
 * und loggt Abweichungen — ohne produktive Orders zu beeinflussen.
 *
 * Aktivierung:
 *   app_settings: feature.pricingShadow = true
 *   app_settings: feature.assignmentShadow = true
 *
 * Beide Flags sind per Default OFF (settings-defaults.js).
 * Ergebnisse landen im in-memory Ring-Buffer (MAX_ENTRIES Einträge),
 * abrufbar über GET /api/admin/shadow-log.
 */

const logger = require("./logger").createModuleConsole();
const db = require("./db");
const { computePricing } = require("./pricing");
const { resolveAnyPhotographer } = require("./photographer-resolver");

const MAX_ENTRIES = 200;
const ringBuffer = [];

function pushEntry(entry) {
  ringBuffer.push(entry);
  if (ringBuffer.length > MAX_ENTRIES) ringBuffer.shift();
}

function getShadowLog() {
  return [...ringBuffer].reverse();
}

/**
 * Prüft ob ein Feature-Flag in der DB aktiv ist.
 * Gibt false zurück bei Fehler oder fehlendem Eintrag.
 */
async function isFlagEnabled(flagKey) {
  try {
    const val = await db.getAppSetting(flagKey);
    if (val === true || val === "true" || val === 1 || val === "1") return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Tiefer Vergleich zweier Pricing-Ergebnisse.
 * Gibt { equal, diffs } zurück.
 */
function comparePricing(v1, v2) {
  const diffs = [];
  const p1 = v1?.pricing || {};
  const p2 = v2?.pricing || {};

  const fields = ["subtotal", "discountAmount", "vat", "total"];
  for (const f of fields) {
    const a = Number(p1[f] ?? 0);
    const b = Number(p2[f] ?? 0);
    if (Math.abs(a - b) > 0.001) {
      diffs.push({ field: `pricing.${f}`, v1: a, v2: b, delta: +(b - a).toFixed(4) });
    }
  }

  const s1 = v1?.appliedSettings || {};
  const s2 = v2?.appliedSettings || {};
  for (const f of ["vatRate", "chfRoundingStep", "roundingMode"]) {
    if (String(s1[f]) !== String(s2[f])) {
      diffs.push({ field: `settings.${f}`, v1: s1[f], v2: s2[f] });
    }
  }

  const d1 = v1?.discount;
  const d2 = v2?.discount;
  if (JSON.stringify(d1) !== JSON.stringify(d2)) {
    diffs.push({ field: "discount", v1: d1, v2: d2 });
  }

  return { equal: diffs.length === 0, diffs };
}

/**
 * Vergleich der Assignment-Ergebnisse.
 */
function compareAssignment(v1, v2) {
  const diffs = [];
  const k1 = v1?.key ?? v1?.selected?.key ?? null;
  const k2 = v2?.selected?.key ?? v2?.key ?? null;
  if (k1 !== k2) {
    diffs.push({ field: "photographerKey", v1: k1, v2: k2 });
  }
  return { equal: diffs.length === 0, diffs };
}

/**
 * Shadow-Vergleich für Pricing.
 * v1Result muss bereits berechnet sein (aus V1-Logik).
 * Diese Funktion berechnet V2 (= identisch mit V1 im Shadow-Mode, da wir noch keinen V2-Algorithmus haben)
 * und loggt Abweichungen.
 *
 * In einem späteren Schritt kann hier eine echte V2-Implementierung eingesetzt werden.
 */
async function shadowPricing({ services, object, discountCode, customerEmail, context = {}, v1Result, orderNo }) {
  if (!(await isFlagEnabled("feature.pricingShadow"))) return;

  const startMs = Date.now();
  let v2Result = null;
  let error = null;
  let comparison = null;

  try {
    v2Result = await computePricing({ services, object, discountCode, customerEmail, context });
    comparison = comparePricing(v1Result, v2Result);
  } catch (err) {
    error = err?.message || String(err);
  }

  const entry = {
    type: "pricing",
    ts: new Date().toISOString(),
    orderNo: orderNo || null,
    durationMs: Date.now() - startMs,
    equal: comparison?.equal ?? null,
    diffs: comparison?.diffs ?? [],
    error,
    v1: v1Result?.pricing ?? null,
    v2: v2Result?.pricing ?? null,
    v1Settings: v1Result?.appliedSettings ?? null,
    v2Settings: v2Result?.appliedSettings ?? null,
  };

  pushEntry(entry);

  if (error) {
    logger.error(`[shadow-mode] Pricing V2 Fehler: ${error}`);
  } else if (!comparison?.equal) {
    logger.warn(`[shadow-mode] Pricing DIFF orderNo=${orderNo} diffs=${JSON.stringify(comparison.diffs)}`);
  } else {
    logger.log(`[shadow-mode] Pricing OK orderNo=${orderNo} total=${v2Result?.pricing?.total}`);
  }
}

/**
 * Shadow-Vergleich für Assignment.
 * v1Result: das bereits gewählte Ergebnis aus der V1-Logik ({ key, name } oder null).
 */
async function shadowAssignment({ photographersConfig, availabilityMap, date, time, services, sqm, bookingCoords, v1Result, orderNo }) {
  if (!(await isFlagEnabled("feature.assignmentShadow"))) return;

  const startMs = Date.now();
  let v2Result = null;
  let error = null;
  let comparison = null;

  try {
    v2Result = await resolveAnyPhotographer({
      photographersConfig,
      availabilityMap,
      date,
      time,
      services,
      sqm,
      bookingCoords,
      withDecisionTrace: true,
    });
    comparison = compareAssignment(v1Result, v2Result);
  } catch (err) {
    error = err?.message || String(err);
  }

  const entry = {
    type: "assignment",
    ts: new Date().toISOString(),
    orderNo: orderNo || null,
    durationMs: Date.now() - startMs,
    equal: comparison?.equal ?? null,
    diffs: comparison?.diffs ?? [],
    error,
    v1: v1Result ? { key: v1Result.key, name: v1Result.name } : null,
    v2: v2Result?.selected ?? null,
    v2DecisionTrace: v2Result?.decisionTrace ?? null,
  };

  pushEntry(entry);

  if (error) {
    logger.error(`[shadow-mode] Assignment V2 Fehler: ${error}`);
  } else if (!comparison?.equal) {
    logger.warn(`[shadow-mode] Assignment DIFF orderNo=${orderNo} v1=${v1Result?.key} v2=${v2Result?.selected?.key}`);
  } else {
    logger.log(`[shadow-mode] Assignment OK orderNo=${orderNo} key=${v1Result?.key}`);
  }
}

module.exports = {
  shadowPricing,
  shadowAssignment,
  getShadowLog,
  isFlagEnabled,
};
