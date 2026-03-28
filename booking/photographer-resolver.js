const db = require("./db");
const travel = require("./travel");
const { resolveEffectiveSqm } = require("./product-meta");
const { isHoliday } = require("./holidays");
const { getSetting } = require("./settings-resolver");

const PRODUCT_SKILL_IDS = new Set(["foto", "matterport", "drohne", "drohne_foto", "drohne_video", "video"]);

function addSkill(skillSet, skill) {
  const key = String(skill || "").trim().toLowerCase();
  if (PRODUCT_SKILL_IDS.has(key)) skillSet.add(key);
}

function collectProductSkillKeys(product) {
  const skillSet = new Set();
  const rs = Array.isArray(product?.required_skills) ? product.required_skills : [];
  for (const item of rs) addSkill(skillSet, item);

  const skillKey = String(product?.skill_key || "").trim().toLowerCase();
  if (skillKey === "drohne") {
    addSkill(skillSet, "drohne_foto");
  } else if (skillKey === "dronephoto") {
    addSkill(skillSet, "drohne_foto");
  } else if (skillKey === "dronevideo") {
    addSkill(skillSet, "drohne_foto");
    addSkill(skillSet, "drohne_video");
    addSkill(skillSet, "video");
  } else {
    addSkill(skillSet, skillKey);
  }

  const groupKey = String(product?.group_key || "").trim().toLowerCase();
  const productCode = String(product?.code || "").trim().toLowerCase();
  if (groupKey === "groundvideo") addSkill(skillSet, "video");
  if (groupKey === "dronephoto") addSkill(skillSet, "drohne_foto");
  if (groupKey === "dronevideo") {
    addSkill(skillSet, "drohne_foto");
    addSkill(skillSet, "drohne_video");
    addSkill(skillSet, "video");
  }
  if (groupKey === "tour" || productCode === "floorplans:tour") addSkill(skillSet, "matterport");
  return skillSet;
}

/**
 * Produktcodes aus Buchungs-Payload (Paket + Addons).
 * @param {object} services
 * @returns {string[]}
 */
function collectBookedProductCodes(services) {
  const codes = [];
  const pkg = services?.package;
  const pkgKey = pkg && typeof pkg === "object" ? String(pkg.key || "").trim() : String(pkg || "").trim();
  if (pkgKey) codes.push(pkgKey);
  const addons = Array.isArray(services?.addons) ? services.addons : [];
  for (const a of addons) {
    const id = String(a?.id || a?.code || "").trim();
    if (id) codes.push(id);
  }
  return codes;
}

/**
 * Skill-Anforderungen aus DB-Produkten (required_skills, skill_key) für gebuchte Codes.
 * Level stets aus assignment.requiredSkillLevels (+ Matterport-Flächenregel bei Bedarf).
 * @param {Map<string, object>} productsByCode code -> Produktzeile
 */
function requiredSkillsFromProducts(productsByCode, services, sqm, config = {}) {
  const codes = collectBookedProductCodes(services);
  const skillSet = new Set();
  for (const code of codes) {
    const p = productsByCode.get(code);
    if (!p) continue;
    for (const skill of collectProductSkillKeys(p)) {
      skillSet.add(skill);
    }
  }
  if (!skillSet.size) return {};

  const defaults = config.requiredSkillLevels || {};
  const matterportLargeSqmThreshold = Number(config.matterportLargeSqmThreshold || 300);
  const matterportLargeSqmMinLevel = Number(config.matterportLargeSqmMinLevel || 7);
  const matterportSmallSqmReduction = Math.max(0, Number(config.matterportSmallSqmReduction ?? 2));
  const needed = {};

  for (const skill of skillSet) {
    if (skill === "foto") {
      needed.foto = Number(defaults.foto ?? 5);
    } else if (skill === "matterport") {
      const base = Number(defaults.matterport ?? 5);
      needed.matterport = sqm && Number(sqm) >= matterportLargeSqmThreshold
        ? Math.max(base, matterportLargeSqmMinLevel)
        : Math.max(1, base - matterportSmallSqmReduction);
    } else if (skill === "drohne" || skill === "drohne_foto") {
      needed.drohne_foto = Number(defaults.drohne_foto ?? defaults.drohne ?? 5);
    } else if (skill === "drohne_video") {
      needed.drohne_video = Number(defaults.drohne_video ?? defaults.drohne ?? 5);
    } else if (skill === "video") {
      needed.video = Number(defaults.video ?? 5);
    }
  }
  return needed;
}

/**
 * Pro Skill das höhere Mindest-Level behalten (Legacy-Payload + Produkt-DB).
 */
function mergeNeededSkills(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = Math.max(Number(out[k] || 0), Number(v || 0));
  }
  return out;
}

/**
 * Ermittelt welche Skills für die gebuchten Services benötigt werden.
 * services: das services-Objekt aus dem Booking-Payload
 * sqm: Quadratmeter (für Matterport-Sonderregel)
 */
function requiredSkills(services, sqm, config = {}) {
  const needed = {};
  const s = services || {};
  const defaults = config.requiredSkillLevels || {};
  const matterportLargeSqmThreshold = Number(config.matterportLargeSqmThreshold || 300);
  const matterportLargeSqmMinLevel = Number(config.matterportLargeSqmMinLevel || 7);
  const matterportSmallSqmReduction = Math.max(0, Number(config.matterportSmallSqmReduction ?? 2));

  needed.foto = Number(defaults.foto ?? 5);

  // Matterport / Grundriss
  if (s.matterport || s.grundriss || s.floorplan || s.tour) {
    const baseMatterport = Number(defaults.matterport ?? 5);
    needed.matterport = sqm && Number(sqm) >= matterportLargeSqmThreshold
      ? Math.max(baseMatterport, matterportLargeSqmMinLevel)
      : Math.max(1, baseMatterport - matterportSmallSqmReduction);
  }

  // Drohne
  if (s.drohne || s.drone) {
    needed.drohne_foto = Number(defaults.drohne_foto ?? defaults.drohne ?? 5);
  }

  // Video
  if (s.video) {
    needed.video = Number(defaults.video ?? 5);
  }

  return needed;
}

/**
 * Kombiniert Legacy-Flags auf services mit Produkt-required_skills aus der DB.
 */
function buildNeededSkills(services, sqm, config, productsByCode) {
  const legacy = requiredSkills(services, sqm, config);
  const fromProducts = requiredSkillsFromProducts(productsByCode, services, sqm, config);
  return mergeNeededSkills(legacy, fromProducts);
}

/**
 * Prüft ob ein Fotograf alle benötigten Skills hat.
 */
/** Abwesenheit: Einzeldatum (string) oder Bereich { von, bis } (YYYY-MM-DD). */
function isDateBlocked(blockedDates, date) {
  const d = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  for (const item of blockedDates) {
    if (typeof item === "string") {
      if (item.slice(0, 10) === d) return true;
      continue;
    }
    if (item && typeof item === "object") {
      const von = String(item.von || "").slice(0, 10);
      const bis = String(item.bis || item.von || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(von) && /^\d{4}-\d{2}-\d{2}$/.test(bis) && d >= von && d <= bis) {
        return true;
      }
    }
  }
  return false;
}

function resolveSkillLevel(photographerSkills, skill) {
  const fallbackDrone = (skill === "drohne_foto" || skill === "drohne_video")
    ? photographerSkills?.drohne
    : undefined;
  const level = Number(photographerSkills?.[skill] ?? fallbackDrone ?? 0);
  return Number.isFinite(level) ? level : 0;
}

function resolveAbsoluteMinimum(absoluteMinimums, skill) {
  const fallbackDrone = (skill === "drohne_foto" || skill === "drohne_video")
    ? absoluteMinimums?.drohne
    : undefined;
  const level = Number(absoluteMinimums?.[skill] ?? fallbackDrone ?? 0);
  return Number.isFinite(level) ? level : 0;
}

function evaluateSkillEligibility(photographerSkills, needed, relaxedBy = 0, absoluteMinimums = {}) {
  for (const [skill, minLevel] of Object.entries(needed || {})) {
    const level = resolveSkillLevel(photographerSkills, skill);
    // Business-Regel: Skill 0 bedeutet "nicht geeignet/kein Equipment" und bleibt immer ausgeschlossen.
    if (level <= 0) return { ok: false, reason: "skill_zero" };
    const absoluteMin = resolveAbsoluteMinimum(absoluteMinimums, skill);
    const effectiveMin = Math.max(absoluteMin, Number(minLevel) - Number(relaxedBy || 0));
    if (level < effectiveMin) return { ok: false, reason: "skills" };
  }
  return { ok: true, reason: null };
}

function isWithinRadiusLimit(estimatedKm, radiusLimit) {
  if (!Number.isFinite(radiusLimit) || Number(radiusLimit) <= 0) return true;
  if (!Number.isFinite(estimatedKm)) return true;
  return Number(estimatedKm) <= Number(radiusLimit);
}

function normalizePositiveRadius(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function getRelaxationPlan(needed, absoluteSkillMinimums, enabled) {
  if (!enabled) return [0];
  let maxGap = 0;
  for (const [skill, minLevel] of Object.entries(needed || {})) {
    const absoluteMin = resolveAbsoluteMinimum(absoluteSkillMinimums, skill);
    const gap = Math.max(0, Number(minLevel || 0) - absoluteMin);
    if (gap > maxGap) maxGap = gap;
  }
  const boundedGap = Math.min(5, maxGap);
  if (boundedGap <= 0) return [0];
  return Array.from({ length: boundedGap + 1 }, (_, idx) => idx);
}

function selectStageCandidates(candidates, { needed, skillReduction, absoluteSkillMinimums }) {
  const prioritized = [];
  const stageRejections = new Map();

  for (const candidate of candidates) {
    const skillCheck = evaluateSkillEligibility(candidate.skills, needed, skillReduction, absoluteSkillMinimums);
    if (!skillCheck.ok) {
      stageRejections.set(candidate.key, skillCheck.reason);
      continue;
    }

    const prioritizedLimit = normalizePositiveRadius(candidate.maxRadius);
    if (isWithinRadiusLimit(candidate.estimatedKm, prioritizedLimit)) {
      prioritized.push(candidate);
      continue;
    }
    stageRejections.set(candidate.key, "radius_employee");
  }

  const selectedMode = prioritized.length ? "employee_radius" : "none";
  return {
    matches: prioritized,
    selectedMode,
    stageRejections,
  };
}

function hasRequiredSkills(photographerSkills, needed) {
  return evaluateSkillEligibility(photographerSkills, needed, 0, {}).ok;
}

function hasRequiredSkillsWithRelaxation(photographerSkills, needed, relaxedBy, absoluteMinimums = {}) {
  return evaluateSkillEligibility(photographerSkills, needed, relaxedBy, absoluteMinimums).ok;
}

/**
 * Berechnet Skill-Score (höher = besser geeignet).
 * Summe der relevanten Skill-Werte.
 */
function skillScore(photographerSkills, needed) {
  let score = 0;
  for (const skill of Object.keys(needed)) {
    score += resolveSkillLevel(photographerSkills, skill);
  }
  return score;
}

/**
 * Hauptfunktion: Löst "any" Fotografen auf.
 *
 * @param {object} params
 * @param {Array}  params.photographersConfig  - PHOTOGRAPHERS_CONFIG Array
 * @param {object} params.availabilityMap      - { key: [freeSlots] } – bereits abgerufen
 * @param {string} params.date                 - YYYY-MM-DD
 * @param {string} params.time                 - HH:MM
 * @param {object} params.services             - services aus Booking-Payload
 * @param {number} params.sqm                  - Quadratmeter
 * @param {object|null} params.bookingCoords   - { lat, lon } der Buchungsadresse (optional)
 * @param {object|null} params.assignmentSettingsOverride - flache Keys wie assignment.fallbackPolicy (Simulation)
 * @returns {{ key: string, name: string } | null}
 */
async function resolveAnyPhotographer({
  photographersConfig,
  availabilityMap,
  date,
  time,
  services,
  sqm,
  bookingCoords,
  withDecisionTrace = false,
  anySlotMode = false,
  assignmentSettingsOverride = null,
}) {
  const override = assignmentSettingsOverride && typeof assignmentSettingsOverride === "object"
    ? assignmentSettingsOverride
    : null;

  async function pickAssignment(key) {
    if (override && Object.prototype.hasOwnProperty.call(override, key)) {
      return override[key];
    }
    return (await getSetting(key)).value;
  }

  const requiredSkillLevels = (await pickAssignment("assignment.requiredSkillLevels")) || {};
  const matterportLargeSqmThreshold = (await pickAssignment("assignment.matterportLargeSqmThreshold")) || 300;
  const matterportLargeSqmMinLevel = (await pickAssignment("assignment.matterportLargeSqmMinLevel")) || 7;
  const matterportSmallSqmReduction = (await pickAssignment("assignment.matterportSmallSqmReduction")) ?? 2;
  const fallbackPolicy = String((await pickAssignment("assignment.fallbackPolicy")) || "radius_expand_then_no_auto_assign");
  const allowSkillRelaxation = !!(await pickAssignment("assignment.allowSkillRelaxation"));
  const absoluteSkillMinimums = (await pickAssignment("assignment.absoluteSkillMinimums")) || {};

  const skillConfig = {
    requiredSkillLevels,
    matterportLargeSqmThreshold,
    matterportLargeSqmMinLevel,
    matterportSmallSqmReduction,
  };

  let productsByCode = new Map();
  try {
    const products = await db.listProductsWithRules({ includeInactive: false });
    productsByCode = new Map((Array.isArray(products) ? products : []).map((p) => [String(p.code || ""), p]));
  } catch {
    productsByCode = new Map();
  }

  const parsedSqm = sqm != null && Number.isFinite(Number(sqm)) && Number(sqm) > 0 ? Number(sqm) : null;
  const effectiveSqm = resolveEffectiveSqm(parsedSqm, services, productsByCode);
  const needed = buildNeededSkills(services, effectiveSqm, skillConfig, productsByCode);
  const stagePlan = getRelaxationPlan(
    needed,
    absoluteSkillMinimums,
    allowSkillRelaxation || fallbackPolicy === "allow_skill_relax",
  ).map((skillReduction) => ({ skillReduction }));

  // Alle Settings aus DB laden
  const allSettings = await db.getAllPhotographerSettings();
  const settingsMap = {};
  for (const s of allSettings) {
    settingsMap[s.key] = s;
  }

  const eligible = [];
  const excluded = [];
  const excludedReasonMap = new Map();
  const pushExcludedReason = (key, reason) => {
    if (!key || !reason) return;
    const prev = excludedReasonMap.get(key) || new Set();
    prev.add(reason);
    excludedReasonMap.set(key, prev);
  };
  const nationalHolidayBlock = (await getSetting("scheduling.nationalHolidaysEnabled")).value !== false;

  for (const p of photographersConfig) {
    const key = p.key;
    const free = availabilityMap[key] || [];
    // anySlotMode: Fotograf gilt als verfügbar wenn er irgendeinen freien Slot hat (kein Zeitfilter)
    const isAvailable = anySlotMode ? free.length > 0 : free.includes(time);
    if (!isAvailable) {
      excluded.push({ key, reasons: ["not_available"] });
      pushExcludedReason(key, "not_available");
      continue;
    }

    const settings = settingsMap[key] || {};
    const skills = settings.skills || {};
    const blockedDates = Array.isArray(settings.blocked_dates) ? settings.blocked_dates : [];

    // Feiertags-Check (nur globale Systemeinstellung)
    if (nationalHolidayBlock && isHoliday(date)) {
      excluded.push({ key, reasons: ["holiday_blocked"] });
      pushExcludedReason(key, "holiday_blocked");
      continue;
    }

    // Abwesenheits-Check (einzelne Tage oder Von–Bis aus Admin)
    if (isDateBlocked(blockedDates, date)) {
      excluded.push({ key, reasons: ["blocked_date"] });
      pushExcludedReason(key, "blocked_date");
      continue;
    }

    const maxRadius = normalizePositiveRadius(settings.max_radius_km ?? settings.radius_km);
    let travelMinutes = null;
    let estimatedKm = null;

    if (maxRadius && bookingCoords) {
      const homeCoord = settings.home_lat && settings.home_lon
        ? { lat: Number(settings.home_lat), lon: Number(settings.home_lon) }
        : null;

      if (homeCoord) {
        travelMinutes = await travel.routeMinutes(homeCoord, bookingCoords);
        // Grobe Umrechnung: ~1km ≈ 1 Fahrminute bei Stadtverkehr (konservativ)
        // Wir nutzen direkt km-Distanz via Nominatim-Fallback wenn OSRM keine Distanz liefert
        // Stattdessen: Luftlinie als Näherung wenn OSRM ausfällt
        if (travelMinutes == null) {
          const dLat = (bookingCoords.lat - homeCoord.lat) * Math.PI / 180;
          const dLon = (bookingCoords.lon - homeCoord.lon) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(homeCoord.lat * Math.PI / 180) *
            Math.cos(bookingCoords.lat * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
          estimatedKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        } else {
          estimatedKm = travelMinutes / 0.8;
        }
      }
    }

    const score = skillScore(skills, needed);
    eligible.push({ key, name: p.name, settings, skills, score, travelMinutes, estimatedKm, maxRadius });
  }

  const decisionTrace = {
    needed,
    fallbackPolicy,
    stagesTried: [],
    candidatesEvaluated: [],
    excluded: [],
    selected: null,
    reason: "needs_admin",
  };

  for (let stageIndex = 0; stageIndex < stagePlan.length; stageIndex += 1) {
    const stage = stagePlan[stageIndex] || {};
    const skillReduction = Number(stage.skillReduction || 0);
    const stageSelection = selectStageCandidates(eligible, {
      needed,
      skillReduction,
      absoluteSkillMinimums,
    });
    const matches = stageSelection.matches;

    for (const [candidateKey, reason] of stageSelection.stageRejections.entries()) {
      pushExcludedReason(candidateKey, reason);
    }

    decisionTrace.stagesTried.push({
      stage: stageIndex + 1,
      radiusOverride: null,
      skillReduction,
      selectionMode: stageSelection.selectedMode,
      candidates: matches.map((c) => c.key),
    });

    if (!matches.length) continue;

    matches.sort((a, b) => {
      const tA = a.travelMinutes ?? 9999;
      const tB = b.travelMinutes ?? 9999;
      if (tA !== tB) return tA - tB;
      return b.score - a.score;
    });

    const selected = matches[0];
    decisionTrace.selected = { key: selected.key, name: selected.name };
    decisionTrace.reason = `stage_${stageIndex + 1}`;
    decisionTrace.candidatesEvaluated = matches.map((c) => ({
      key: c.key,
      score: c.score,
      travelMinutes: c.travelMinutes,
      estimatedKm: c.estimatedKm,
      selected: c.key === selected.key,
      stage: stageIndex + 1,
    }));
    if (withDecisionTrace) {
      return { selected: { key: selected.key, name: selected.name }, decisionTrace };
    }
    return { key: selected.key, name: selected.name };
  }

  decisionTrace.excluded = Array.from(excludedReasonMap.entries()).map(([key, reasons]) => ({
    key,
    reasons: Array.from(reasons),
  }));

  return withDecisionTrace ? { selected: null, decisionTrace } : null;
}

module.exports = {
  resolveAnyPhotographer,
  requiredSkills,
  buildNeededSkills,
  collectBookedProductCodes,
  requiredSkillsFromProducts,
  mergeNeededSkills,
  hasRequiredSkills,
  hasRequiredSkillsWithRelaxation,
  skillScore,
  resolveSkillLevel,
  evaluateSkillEligibility,
  selectStageCandidates,
};
