const db = require("./db");
const { DEFAULT_APP_SETTINGS, getDefaultSetting } = require("./settings-defaults");

function normalizeKey(key) {
  return String(key || "").trim();
}

function readPath(obj, dottedKey) {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = String(dottedKey || "").split(".").filter(Boolean);
  let cursor = obj;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function getEmployeeOverrideValue(key, employeeSettings) {
  const map = {
    "scheduling.workStart": "work_start",
    "scheduling.workEnd": "work_end",
    "scheduling.workdays": "workdays",
    "scheduling.workHoursByDay": "work_hours_by_day",
    "scheduling.bufferMinutes": "buffer_minutes",
    "scheduling.slotMinutes": "slot_minutes",
  };
  const col = map[key];
  if (!col || !employeeSettings) return undefined;
  const value = employeeSettings[col];
  if (value == null || value === "") return undefined;
  return value;
}

async function getSetting(key, context = {}) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return { key: normalizedKey, value: null, source: "missing_key" };

  const fromOrder = readPath(context.orderOverride, normalizedKey);
  if (fromOrder !== undefined) return { key: normalizedKey, value: fromOrder, source: "orderOverride" };

  const fromProduct = readPath(context.productOverride, normalizedKey);
  if (fromProduct !== undefined) return { key: normalizedKey, value: fromProduct, source: "productOverride" };

  const employeeSettings = context.employeeOverride
    || (context.employeeKey ? await db.getPhotographerSettings(context.employeeKey) : null);
  const fromEmployee = getEmployeeOverrideValue(normalizedKey, employeeSettings);
  if (fromEmployee !== undefined) return { key: normalizedKey, value: fromEmployee, source: "employeeOverride" };

  const dbValue = await db.getAppSetting(normalizedKey);
  if (dbValue !== undefined) return { key: normalizedKey, value: dbValue, source: "global" };

  const fallback = getDefaultSetting(normalizedKey, context.defaultValue);
  return { key: normalizedKey, value: fallback, source: "default" };
}

async function getSettingsMap(keys, context = {}) {
  const out = {};
  for (const key of Array.isArray(keys) ? keys : []) {
    const resolved = await getSetting(key, context);
    out[key] = resolved.value;
  }
  return out;
}

async function listEffectiveDefaults() {
  const rows = await db.getAllAppSettings();
  return { ...DEFAULT_APP_SETTINGS, ...rows };
}

async function setSystemSettings(updates = {}) {
  const entries = Object.entries(updates || {})
    .filter(([key]) => !!normalizeKey(key))
    .map(([key, value]) => ({ key: normalizeKey(key), value }));
  if (!entries.length) return { updated: 0 };
  await db.upsertAppSettings(entries);
  return { updated: entries.length };
}

async function seedDefaultSettings() {
  const existing = await db.getAllAppSettings();
  const missingEntries = Object.entries(DEFAULT_APP_SETTINGS)
    .filter(([key]) => existing[key] === undefined)
    .map(([key, value]) => ({ key, value }));
  if (!missingEntries.length) return { inserted: 0 };
  await db.upsertAppSettings(missingEntries);
  return { inserted: missingEntries.length };
}

module.exports = {
  getSetting,
  getSettingsMap,
  listEffectiveDefaults,
  setSystemSettings,
  seedDefaultSettings,
  readPath,
};
