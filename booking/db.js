/**
 * PostgreSQL Datenbankverbindung und Hilfsfunktionen
 * Fällt auf JSON-Datei zurück wenn DATABASE_URL nicht gesetzt ist.
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const console = logger.createModuleConsole();
const { normalizeTextDeep } = require("./text-normalization");
const {
  PACKAGE_PRICES,
  ADDON_PRICES,
  FLOORPLAN_UNIT,
  STAGING_UNIT,
} = require("./pricing.config.js");
const { DEFAULT_APP_SETTINGS } = require("./settings-defaults");
const { formatPhoneCH } = require("./phone-format");

const DATABASE_URL = process.env.DATABASE_URL || "";
const DB_SEARCH_PATH = process.env.DB_SEARCH_PATH || "booking,core,public";
let pool = null;

function getPool() {
  if (!pool && DATABASE_URL) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      options: `-c search_path=${DB_SEARCH_PATH}`,
    });
    pool.on("error", (err) => {
      console.error("[db] pool error", err.message);
    });
  }
  return pool;
}

/** Pool schliessen (z. B. nach migrate.js), damit der Node-Prozess beenden kann. */
async function closePool() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

async function query(sql, params = []) {
  const p = getPool();
  if (!p) throw new Error("No database connection");
  return p.query(sql, params);
}

/** Spalten der per search_path aufgelösten Tabelle (wie unqualifizierte SQL-Namen). */
const regclassColumnSetCache = new Map(); // tableName -> { set: Set<string>, at: number }
const REGCLASS_COL_CACHE_MS = 5 * 60 * 1000;

async function getRegclassColumnSet(tableName) {
  const now = Date.now();
  const hit = regclassColumnSetCache.get(tableName);
  if (hit && now - hit.at < REGCLASS_COL_CACHE_MS) return hit.set;
  const { rows } = await query(
    `SELECT a.attname::text AS column_name
     FROM pg_catalog.pg_attribute a
     JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
     WHERE c.oid = ($1::text)::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped`,
    [tableName]
  );
  const set = new Set(rows.map((r) => r.column_name));
  regclassColumnSetCache.set(tableName, { set, at: now });
  return set;
}

let productSeedChecked = false;

function safeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

function pushUniqueSkill(out, skill) {
  if (!out.includes(skill)) out.push(skill);
}

function normalizeRequiredSkills(input) {
  const raw = Array.isArray(input) ? input : [];
  const allowed = new Set(["foto", "drohne", "drohne_foto", "drohne_video", "video", "matterport"]);
  const out = [];
  for (const item of raw) {
    const key = String(item || "").trim().toLowerCase();
    if (key === "drohne") {
      pushUniqueSkill(out, "drohne_foto");
      continue;
    }
    if (key === "dronephoto") {
      pushUniqueSkill(out, "drohne_foto");
      continue;
    }
    if (key === "dronevideo") {
      pushUniqueSkill(out, "drohne_foto");
      pushUniqueSkill(out, "drohne_video");
      pushUniqueSkill(out, "video");
      continue;
    }
    if (!allowed.has(key)) continue;
    pushUniqueSkill(out, key);
  }
  return out;
}

function inferRequiredSkillsFromLegacy(code, groupKey, skillKey = "") {
  const out = normalizeRequiredSkills(skillKey ? [skillKey] : []);
  const group = String(groupKey || "").toLowerCase();
  const productCode = String(code || "").toLowerCase();
  if (group === "groundvideo") {
    pushUniqueSkill(out, "video");
  }
  if (group === "dronephoto") {
    pushUniqueSkill(out, "drohne_foto");
  }
  if (group === "dronevideo") {
    pushUniqueSkill(out, "drohne_foto");
    pushUniqueSkill(out, "drohne_video");
    pushUniqueSkill(out, "video");
  }
  if (group === "tour" || productCode === "floorplans:tour") {
    pushUniqueSkill(out, "matterport");
  }
  return out;
}

function buildDefaultServiceCategories() {
  return [
    { key: "package", name: "Pakete", description: "Komplette Leistungspakete", kind_scope: "package", sort_order: 10, active: true, show_in_frontpanel: false },
    { key: "camera", name: "Camera Shooting", description: "Professionelle HDR-Immobilienfotos, bearbeitet und geliefert in Web- & Fullsize.", kind_scope: "addon", sort_order: 110, active: true, show_in_frontpanel: true },
    { key: "dronePhoto", name: "Drone Shooting", description: "Luftaufnahmen per Drohne für eindrucksvolle Aussenansichten.", kind_scope: "addon", sort_order: 210, active: true, show_in_frontpanel: true },
    { key: "tour", name: "360° Tour", description: "Interaktive 360°-Rundgänge — Preis je nach Wohnfläche.", kind_scope: "addon", sort_order: 310, active: true, show_in_frontpanel: true },
    { key: "keypickup", name: "Schlüsselabholung", description: "", kind_scope: "addon", sort_order: 320, active: true, show_in_frontpanel: true },
    { key: "floorplans", name: "Floor Plans", description: "Maßstabgetreue 2D-Grundrisse nach Tour-Daten oder eigener Skizze.", kind_scope: "addon", sort_order: 410, active: true, show_in_frontpanel: true },
    { key: "groundVideo", name: "Ground Video", description: "Professioneller Videoclip mit Innen- & Aussenaufnahmen, inkl. Schnitt & Musik.", kind_scope: "addon", sort_order: 510, active: true, show_in_frontpanel: true },
    { key: "droneVideo", name: "Drone Video", description: "Cineastische Drohnenaufnahmen als Reel oder Clip, fertig geschnitten.", kind_scope: "addon", sort_order: 530, active: true, show_in_frontpanel: true },
    { key: "staging", name: "Staging", description: "Virtuelles Home-Staging — leere Räume digital möbliert.", kind_scope: "addon", sort_order: 610, active: true, show_in_frontpanel: true },
    { key: "express", name: "Express", description: "Expresslieferung innerhalb von 24 h für ausgewählte Leistungen.", kind_scope: "addon", sort_order: 710, active: true, show_in_frontpanel: true },
  ];
}

function buildLegacySeedProducts() {
  return [
    { code: "bestseller", name: "BESTSELLER", kind: "package", group_key: "package", sort_order: 10, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(PACKAGE_PRICES.bestseller || 0) }, priority: 10, active: true }] },
    { code: "cinematic", name: "CINEMATIC DUO", kind: "package", group_key: "package", sort_order: 20, affects_travel: true, affects_duration: true, duration_minutes: 30, rules: [{ rule_type: "fixed", config_json: { price: Number(PACKAGE_PRICES.cinematic || 0) }, priority: 10, active: true }] },
    { code: "fullview", name: "THE FULL VIEW", kind: "package", group_key: "package", sort_order: 30, affects_travel: true, affects_duration: true, duration_minutes: 30, rules: [{ rule_type: "fixed", config_json: { price: Number(PACKAGE_PRICES.fullview || 0) }, priority: 10, active: true }] },
    { code: "camera:foto10", name: "10 Bodenfotos", kind: "addon", group_key: "camera", sort_order: 110, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.camera?.foto10 || 0) }, priority: 10, active: true }] },
    { code: "camera:foto20", name: "20 Bodenfotos", kind: "addon", group_key: "camera", sort_order: 120, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.camera?.foto20 || 0) }, priority: 10, active: true }] },
    { code: "camera:foto30", name: "30 Bodenfotos", kind: "addon", group_key: "camera", sort_order: 130, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.camera?.foto30 || 0) }, priority: 10, active: true }] },
    { code: "dronePhoto:foto4", name: "4 Luftaufnahmen", kind: "addon", group_key: "dronePhoto", sort_order: 210, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.dronePhoto?.foto4 || 0) }, priority: 10, active: true }] },
    { code: "dronePhoto:foto8", name: "8 Luftaufnahmen", kind: "addon", group_key: "dronePhoto", sort_order: 220, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.dronePhoto?.foto8 || 0) }, priority: 10, active: true }] },
    { code: "dronePhoto:foto12", name: "12 Luftaufnahmen", kind: "addon", group_key: "dronePhoto", sort_order: 230, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.dronePhoto?.foto12 || 0) }, priority: 10, active: true }] },
    { code: "tour:main", name: "360° Tour", kind: "addon", group_key: "tour", sort_order: 310, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "area_tier", config_json: { tiers: [{ maxArea: 99, price: 199 }, { maxArea: 199, price: 299 }, { maxArea: 299, price: 399 }], basePrice: 399, incrementArea: 100, incrementPrice: 79 }, priority: 10, active: true }] },
    { code: "floorplans:tour", name: "2D Grundriss von Tour", kind: "addon", group_key: "floorplans", sort_order: 410, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "per_floor", config_json: { unitPrice: Number(FLOORPLAN_UNIT.tour || 0) }, priority: 10, active: true }] },
    { code: "floorplans:notour", name: "2D Grundriss ohne Tour", kind: "addon", group_key: "floorplans", sort_order: 420, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "per_floor", config_json: { unitPrice: Number(FLOORPLAN_UNIT.notour || 0) }, priority: 10, active: true }] },
    { code: "floorplans:sketch", name: "2D Grundriss nach Skizze", kind: "addon", group_key: "floorplans", sort_order: 430, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "per_floor", config_json: { unitPrice: Number(FLOORPLAN_UNIT.sketch || 0) }, priority: 10, active: true }] },
    { code: "groundVideo:reel30", name: "Bodenvideo - Reel 30s", kind: "addon", group_key: "groundVideo", sort_order: 510, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.groundVideo?.reel30 || 0) }, priority: 10, active: true }] },
    { code: "groundVideo:clip12", name: "Bodenvideo - Clip 1-2 Min", kind: "addon", group_key: "groundVideo", sort_order: 520, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.groundVideo?.clip12 || 0) }, priority: 10, active: true }] },
    { code: "droneVideo:reel30", name: "Drohnenvideo - Reel 30s", kind: "addon", group_key: "droneVideo", sort_order: 530, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.droneVideo?.reel30 || 0) }, priority: 10, active: true }] },
    { code: "droneVideo:clip12", name: "Drohnenvideo - Clip 1-2 Min", kind: "addon", group_key: "droneVideo", sort_order: 540, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.droneVideo?.clip12 || 0) }, priority: 10, active: true }] },
    { code: "staging:stLiving", name: "Staging - Wohnbereich", kind: "addon", group_key: "staging", sort_order: 610, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "per_room", config_json: { unitPrice: Number(STAGING_UNIT.stLiving || 0) }, priority: 10, active: true }] },
    { code: "staging:stBusiness", name: "Staging - Gewerbe", kind: "addon", group_key: "staging", sort_order: 620, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "per_room", config_json: { unitPrice: Number(STAGING_UNIT.stBusiness || 0) }, priority: 10, active: true }] },
    { code: "staging:stRenov", name: "Staging - Renovation", kind: "addon", group_key: "staging", sort_order: 630, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "per_room", config_json: { unitPrice: Number(STAGING_UNIT.stRenov || 0) }, priority: 10, active: true }] },
    { code: "express:24h", name: "Express 24h Lieferung", kind: "addon", group_key: "express", sort_order: 710, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "conditional", config_json: { price: Number(ADDON_PRICES.express?.["24h"] || 0), requireAnyPackageCodes: ["bestseller", "fullview"], requireAnyGroupKeys: ["camera", "dronePhoto", "tour", "floorplans"] }, priority: 10, active: true }] },
    { code: "keypickup:main", name: "Schlüsselabholung", kind: "addon", group_key: "keypickup", sort_order: 810, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.keypickup?.main || 0) }, priority: 10, active: true }] },
  ];
}

function buildLegacyCatalogRows({ includeInactive = false, kind = "", showOnWebsiteOnly = false } = {}) {
  let rows = buildLegacySeedProducts().map((p, idx) => ({
    id: idx + 1,
    code: p.code,
    name: p.name,
    kind: p.kind,
    group_key: p.group_key || "",
    category_key: p.category_key || p.group_key || "",
    description: p.description || "",
    affects_travel: p.affects_travel !== false,
    affects_duration: !!p.affects_duration,
    duration_minutes: Number(p.duration_minutes || 0),
    skill_key: String(p.skill_key || ""),
    required_skills: inferRequiredSkillsFromLegacy(p.code, p.group_key, p.skill_key),
    active: p.active !== false,
    show_on_website: p.show_on_website !== false,
    sort_order: Number(p.sort_order || 0),
    rules: safeJson(p.rules, []),
  }));
  if (!includeInactive) rows = rows.filter((p) => p.active);
  if (kind) rows = rows.filter((p) => p.kind === String(kind));
  if (showOnWebsiteOnly) rows = rows.filter((p) => p.show_on_website !== false);
  rows.sort((a, b) => {
    if (a.kind !== b.kind) return String(a.kind).localeCompare(String(b.kind));
    if (Number(a.sort_order || 0) !== Number(b.sort_order || 0)) return Number(a.sort_order || 0) - Number(b.sort_order || 0);
    return Number(a.id) - Number(b.id);
  });
  return rows;
}

// ─── Schema initialisieren ───────────────────────────────────────────────────

async function initSchema() {
  const sp = DB_SEARCH_PATH;
  await query(`SET search_path TO ${sp}`);
  console.log(`[db] search_path set to ${sp} (tables managed by core/migrations)`);
}

/**
 * Führt alle .sql-Dateien aus dem migrations/-Ordner in alphabetischer Reihenfolge aus.
 * Jede Migration wird nur einmal ausgeführt (via applied_migrations-Tabelle).
 * Ist vollständig idempotent.
 */
async function runMigrations() {
  // Tracking-Tabelle anlegen
  await query(`
    CREATE TABLE IF NOT EXISTS applied_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[db] migrations/ Ordner nicht gefunden – uebersprungen");
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  if (!files.length) {
    console.log("[db] keine Migrations-Dateien gefunden");
    return;
  }

  for (const file of files) {
    const { rows } = await query(
      "SELECT 1 FROM applied_migrations WHERE filename = $1",
      [file]
    );
    if (rows.length) {
      console.log("[db] migration bereits angewendet:", file);
      continue;
    }

    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, "utf8");

    try {
      await query(sql);
      await query(
        "INSERT INTO applied_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
        [file]
      );
      console.log("[db] migration angewendet:", file);
    } catch (err) {
      console.error("[db] migration fehlgeschlagen:", file, err.message);
      throw err;
    }
  }

  console.log("[db] alle Migrations abgeschlossen");
}

function validatePricingRule(rule) {
  const normalized = {
    rule_type: String(rule?.rule_type || "").trim(),
    config_json: safeJson(rule?.config_json, {}),
    priority: Number(rule?.priority ?? 100) || 100,
    valid_from: rule?.valid_from || null,
    valid_to: rule?.valid_to || null,
    active: rule?.active !== false,
  };
  const cfg = normalized.config_json || {};

  if (!["fixed", "per_floor", "per_room", "area_tier", "conditional"].includes(normalized.rule_type)) {
    throw new Error(`Ungültiger rule_type: ${normalized.rule_type || "(leer)"}`);
  }
  if (normalized.rule_type === "fixed" && !Number.isFinite(Number(cfg.price))) {
    throw new Error("fixed Regel benötigt config_json.price");
  }
  if ((normalized.rule_type === "per_floor" || normalized.rule_type === "per_room") && !Number.isFinite(Number(cfg.unitPrice))) {
    throw new Error(`${normalized.rule_type} Regel benötigt config_json.unitPrice`);
  }
  if (normalized.rule_type === "area_tier" && !Array.isArray(cfg.tiers)) {
    throw new Error("area_tier Regel benötigt config_json.tiers[]");
  }
  return normalized;
}

async function ensureServiceCategoriesSeeded() {
  const p = getPool();
  if (!p) return;
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM service_categories");
  if (Number(rows?.[0]?.count || 0) > 0) return;
  const defaults = buildDefaultServiceCategories();
  for (const c of defaults) {
    await query(
      `INSERT INTO service_categories (key, name, description, kind_scope, sort_order, active, show_in_frontpanel)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (key) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           kind_scope = EXCLUDED.kind_scope,
           sort_order = EXCLUDED.sort_order,
           active = EXCLUDED.active,
           show_in_frontpanel = EXCLUDED.show_in_frontpanel,
           updated_at = NOW()`,
      [
        c.key,
        c.name,
        c.description || "",
        c.kind_scope || "addon",
        Number(c.sort_order || 0),
        c.active !== false,
        c.show_in_frontpanel === true,
      ]
    );
  }
}

async function ensureProductCatalogSeeded() {
  if (productSeedChecked) return;
  const p = getPool();
  if (!p) return;
  await ensureServiceCategoriesSeeded();
  const { rows: countRows } = await query("SELECT COUNT(*)::int AS count FROM products");
  if (Number(countRows?.[0]?.count || 0) > 0) {
    productSeedChecked = true;
    return;
  }

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const seedProducts = [
      { code: "bestseller", name: "BESTSELLER", kind: "package", group_key: "package", sort_order: 10, affects_travel: true, affects_duration: false, duration_minutes: 0, rules: [{ rule_type: "fixed", config_json: { price: Number(PACKAGE_PRICES.bestseller || 0) }, priority: 10 }] },
      { code: "cinematic", name: "CINEMATIC DUO", kind: "package", group_key: "package", sort_order: 20, affects_travel: true, affects_duration: true, duration_minutes: 30, rules: [{ rule_type: "fixed", config_json: { price: Number(PACKAGE_PRICES.cinematic || 0) }, priority: 10 }] },
      { code: "fullview", name: "THE FULL VIEW", kind: "package", group_key: "package", sort_order: 30, affects_travel: true, affects_duration: true, duration_minutes: 30, rules: [{ rule_type: "fixed", config_json: { price: Number(PACKAGE_PRICES.fullview || 0) }, priority: 10 }] },

      { code: "camera:foto10", name: "10 Bodenfotos", kind: "addon", group_key: "camera", sort_order: 110, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.camera?.foto10 || 0) }, priority: 10 }] },
      { code: "camera:foto20", name: "20 Bodenfotos", kind: "addon", group_key: "camera", sort_order: 120, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.camera?.foto20 || 0) }, priority: 10 }] },
      { code: "camera:foto30", name: "30 Bodenfotos", kind: "addon", group_key: "camera", sort_order: 130, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.camera?.foto30 || 0) }, priority: 10 }] },

      { code: "dronePhoto:foto4", name: "4 Luftaufnahmen", kind: "addon", group_key: "dronePhoto", sort_order: 210, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.dronePhoto?.foto4 || 0) }, priority: 10 }] },
      { code: "dronePhoto:foto8", name: "8 Luftaufnahmen", kind: "addon", group_key: "dronePhoto", sort_order: 220, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.dronePhoto?.foto8 || 0) }, priority: 10 }] },
      { code: "dronePhoto:foto12", name: "12 Luftaufnahmen", kind: "addon", group_key: "dronePhoto", sort_order: 230, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.dronePhoto?.foto12 || 0) }, priority: 10 }] },

      { code: "tour:main", name: "360° Tour", kind: "addon", group_key: "tour", sort_order: 310, rules: [{ rule_type: "area_tier", config_json: { tiers: [{ maxArea: 99, price: 199 }, { maxArea: 199, price: 299 }, { maxArea: 299, price: 399 }], basePrice: 399, incrementArea: 100, incrementPrice: 79 }, priority: 10 }] },

      { code: "floorplans:tour", name: "2D Grundriss von Tour", kind: "addon", group_key: "floorplans", sort_order: 410, rules: [{ rule_type: "per_floor", config_json: { unitPrice: Number(FLOORPLAN_UNIT.tour || 0) }, priority: 10 }] },
      { code: "floorplans:notour", name: "2D Grundriss ohne Tour", kind: "addon", group_key: "floorplans", sort_order: 420, rules: [{ rule_type: "per_floor", config_json: { unitPrice: Number(FLOORPLAN_UNIT.notour || 0) }, priority: 10 }] },
      { code: "floorplans:sketch", name: "2D Grundriss nach Skizze", kind: "addon", group_key: "floorplans", sort_order: 430, rules: [{ rule_type: "per_floor", config_json: { unitPrice: Number(FLOORPLAN_UNIT.sketch || 0) }, priority: 10 }] },

      { code: "groundVideo:reel30", name: "Bodenvideo · Reel 30s", kind: "addon", group_key: "groundVideo", sort_order: 510, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.groundVideo?.reel30 || 0) }, priority: 10 }] },
      { code: "groundVideo:clip12", name: "Bodenvideo · Clip 1–2 Min", kind: "addon", group_key: "groundVideo", sort_order: 520, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.groundVideo?.clip12 || 0) }, priority: 10 }] },
      { code: "droneVideo:reel30", name: "Drohnenvideo · Reel 30s", kind: "addon", group_key: "droneVideo", sort_order: 530, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.droneVideo?.reel30 || 0) }, priority: 10 }] },
      { code: "droneVideo:clip12", name: "Drohnenvideo · Clip 1–2 Min", kind: "addon", group_key: "droneVideo", sort_order: 540, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.droneVideo?.clip12 || 0) }, priority: 10 }] },

      { code: "staging:stLiving", name: "Staging – Wohnbereich", kind: "addon", group_key: "staging", sort_order: 610, rules: [{ rule_type: "per_room", config_json: { unitPrice: Number(STAGING_UNIT.stLiving || 0) }, priority: 10 }] },
      { code: "staging:stBusiness", name: "Staging – Gewerbe", kind: "addon", group_key: "staging", sort_order: 620, rules: [{ rule_type: "per_room", config_json: { unitPrice: Number(STAGING_UNIT.stBusiness || 0) }, priority: 10 }] },
      { code: "staging:stRenov", name: "Staging – Renovation", kind: "addon", group_key: "staging", sort_order: 630, rules: [{ rule_type: "per_room", config_json: { unitPrice: Number(STAGING_UNIT.stRenov || 0) }, priority: 10 }] },

      { code: "express:24h", name: "Express 24h Lieferung", kind: "addon", group_key: "express", sort_order: 710, rules: [{ rule_type: "conditional", config_json: { price: Number(ADDON_PRICES.express?.["24h"] || 0), requireAnyPackageCodes: ["bestseller", "fullview"], requireAnyGroupKeys: ["camera", "dronePhoto", "tour", "floorplans"] }, priority: 10 }] },
      { code: "keypickup:main", name: "Schlüsselabholung", kind: "addon", group_key: "keypickup", sort_order: 810, rules: [{ rule_type: "fixed", config_json: { price: Number(ADDON_PRICES.keypickup?.main || 0) }, priority: 10 }] },
    ];

    for (const seed of seedProducts) {
      const inserted = await client.query(
        `INSERT INTO products (code, name, kind, group_key, category_key, description, affects_travel, affects_duration, duration_minutes, active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10)
         RETURNING id`,
        [seed.code, seed.name, seed.kind, seed.group_key, String(seed.category_key || seed.group_key || ""), "", seed.affects_travel !== false, !!seed.affects_duration, Number(seed.duration_minutes || 0), seed.sort_order]
      );
      const productId = inserted.rows[0]?.id;
      if (!productId) continue;
      for (const rawRule of seed.rules || []) {
        const rule = validatePricingRule(rawRule);
        await client.query(
          `INSERT INTO pricing_rules (product_id, rule_type, config_json, priority, valid_from, valid_to, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [productId, rule.rule_type, JSON.stringify(rule.config_json || {}), rule.priority, rule.valid_from, rule.valid_to, rule.active]
        );
      }
    }
    await client.query("COMMIT");
    productSeedChecked = true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listProductsWithRules({ includeInactive = false, kind = "", showOnWebsiteOnly = false } = {}) {
  if (!getPool()) {
    return normalizeTextDeep(buildLegacyCatalogRows({ includeInactive, kind, showOnWebsiteOnly }));
  }
  await ensureProductCatalogSeeded();
  const clauses = [];
  const params = [];
  if (!includeInactive) {
    params.push(true);
    clauses.push(`p.active = $${params.length}`);
  }
  if (kind) {
    params.push(String(kind));
    clauses.push(`p.kind = $${params.length}`);
  }
  if (showOnWebsiteOnly) {
    params.push(true);
    clauses.push(`p.show_on_website = $${params.length}`);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT p.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', r.id,
                  'rule_type', r.rule_type,
                  'config_json', r.config_json,
                  'priority', r.priority,
                  'valid_from', r.valid_from,
                  'valid_to', r.valid_to,
                  'active', r.active
                )
                ORDER BY r.priority ASC, r.id ASC
              ) FILTER (WHERE r.id IS NOT NULL),
              '[]'::json
            ) AS rules
     FROM products p
     LEFT JOIN pricing_rules r ON r.product_id = p.id
     ${whereSql}
     GROUP BY p.id
     ORDER BY p.kind ASC, p.sort_order ASC, p.id ASC`,
    params
  );
  return normalizeTextDeep(rows.map((row) => ({ ...row, rules: safeJson(row.rules, []) })));
}

async function listServiceCategories({ includeInactive = false, kindScope = "" } = {}) {
  if (!getPool()) {
    let rows = buildDefaultServiceCategories();
    if (!includeInactive) rows = rows.filter((c) => c.active !== false);
    if (kindScope) {
      const ks = String(kindScope || "").trim();
      rows = rows.filter((c) => c.kind_scope === ks || c.kind_scope === "both");
    }
    return normalizeTextDeep(rows);
  }
  await ensureServiceCategoriesSeeded();
  const params = [];
  const clauses = [];
  if (!includeInactive) {
    params.push(true);
    clauses.push(`active = $${params.length}`);
  }
  if (kindScope) {
    params.push(String(kindScope));
    clauses.push(`(kind_scope = $${params.length} OR kind_scope = 'both')`);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT key, name, description, kind_scope, sort_order, active, show_in_frontpanel
     FROM service_categories
     ${whereSql}
     ORDER BY sort_order ASC, key ASC`,
    params
  );
  return normalizeTextDeep(rows);
}

async function createServiceCategory(payload) {
  if (!getPool()) throw new Error("No database connection");
  const normalizedPayload = normalizeTextDeep(payload || {});
  const key = String(normalizedPayload?.key || "").trim();
  const name = String(normalizedPayload?.name || "").trim();
  if (!key) throw new Error("key ist erforderlich");
  if (!name) throw new Error("name ist erforderlich");
  const kindScope = String(normalizedPayload?.kind_scope || "addon").trim();
  if (!["package", "addon", "service", "extra", "both"].includes(kindScope)) throw new Error("kind_scope muss package, addon, service, extra oder both sein");
  const showFp = normalizedPayload?.show_in_frontpanel === true;
  const { rows } = await query(
    `INSERT INTO service_categories (key, name, description, kind_scope, sort_order, active, show_in_frontpanel, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
     RETURNING key, name, description, kind_scope, sort_order, active, show_in_frontpanel`,
    [key, name, String(normalizedPayload?.description || ""), kindScope, Number(normalizedPayload?.sort_order || 0), normalizedPayload?.active !== false, showFp]
  );
  return normalizeTextDeep(rows[0] || null);
}

async function updateServiceCategory(key, payload) {
  if (!getPool()) throw new Error("No database connection");
  const normalizedPayload = normalizeTextDeep(payload || {});
  const current = await query("SELECT * FROM service_categories WHERE key = $1 LIMIT 1", [String(key || "")]);
  if (!current.rows[0]) throw new Error("Kategorie nicht gefunden");
  const existing = current.rows[0];
  const next = {
    key: normalizedPayload?.key != null ? String(normalizedPayload.key || "").trim() : String(existing.key || ""),
    name: normalizedPayload?.name != null ? String(normalizedPayload.name || "").trim() : String(existing.name || ""),
    description: normalizedPayload?.description != null ? String(normalizedPayload.description || "") : String(existing.description || ""),
    kind_scope: normalizedPayload?.kind_scope != null ? String(normalizedPayload.kind_scope || "").trim() : String(existing.kind_scope || "addon"),
    sort_order: normalizedPayload?.sort_order != null ? Number(normalizedPayload.sort_order || 0) : Number(existing.sort_order || 0),
    active: normalizedPayload?.active != null ? !!normalizedPayload.active : existing.active !== false,
    show_in_frontpanel: normalizedPayload?.show_in_frontpanel != null ? normalizedPayload.show_in_frontpanel === true : existing.show_in_frontpanel === true,
  };
  if (!next.key) throw new Error("key ist erforderlich");
  if (!next.name) throw new Error("name ist erforderlich");
  if (!["package", "addon", "service", "extra", "both"].includes(next.kind_scope)) throw new Error("kind_scope muss package, addon, service, extra oder both sein");

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE service_categories
       SET key=$1, name=$2, description=$3, kind_scope=$4, sort_order=$5, active=$6, show_in_frontpanel=$7, updated_at=NOW()
       WHERE key=$8`,
      [next.key, next.name, next.description, next.kind_scope, next.sort_order, next.active, next.show_in_frontpanel, String(key || "")]
    );
    if (next.key !== String(key || "")) {
      await client.query(
        `UPDATE products SET category_key = $1, updated_at = NOW()
         WHERE category_key = $2`,
        [next.key, String(key || "")]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  const { rows } = await query(
    "SELECT key, name, description, kind_scope, sort_order, active, show_in_frontpanel FROM service_categories WHERE key = $1 LIMIT 1",
    [next.key]
  );
  return normalizeTextDeep(rows[0] || null);
}

async function deleteServiceCategory(key, { fallbackKey = "" } = {}) {
  if (!getPool()) throw new Error("No database connection");
  const normKey = String(key || "").trim();
  if (!normKey) throw new Error("key ist erforderlich");
  const fallback = String(fallbackKey || "").trim();
  const targetFallback = fallback && fallback !== normKey ? fallback : "";
  if (targetFallback) {
    const exists = await query("SELECT 1 FROM service_categories WHERE key = $1 LIMIT 1", [targetFallback]);
    if (!exists.rows[0]) throw new Error("Fallback-Kategorie nicht gefunden");
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE products
       SET category_key = $1, updated_at = NOW()
       WHERE category_key = $2`,
      [targetFallback, normKey]
    );
    const deleted = await client.query("DELETE FROM service_categories WHERE key = $1", [normKey]);
    if (!deleted.rowCount) throw new Error("Kategorie nicht gefunden");
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getProductById(id) {
  const rows = await listProductsWithRules({ includeInactive: true });
  return rows.find((x) => Number(x.id) === Number(id)) || null;
}

async function setRulesForProduct(client, productId, rules) {
  await client.query("DELETE FROM pricing_rules WHERE product_id = $1", [productId]);
  for (const rawRule of Array.isArray(rules) ? rules : []) {
    const rule = validatePricingRule(rawRule);
    await client.query(
      `INSERT INTO pricing_rules (product_id, rule_type, config_json, priority, valid_from, valid_to, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [productId, rule.rule_type, JSON.stringify(rule.config_json || {}), rule.priority, rule.valid_from, rule.valid_to, rule.active]
    );
  }
}

async function createProduct(payload) {
  await ensureProductCatalogSeeded();
  const p = getPool();
  if (!p) throw new Error("No database connection");
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const normalizedPayload = normalizeTextDeep(payload || {});
    const code = String(normalizedPayload?.code || "").trim();
    const name = String(normalizedPayload?.name || "").trim();
    const kind = String(normalizedPayload?.kind || "").trim();
    const groupKey = String(normalizedPayload?.group_key || "").trim();
    const skillKey = String(normalizedPayload?.skill_key || "").trim();
    const requiredSkills = inferRequiredSkillsFromLegacy(code, groupKey, skillKey);
    for (const skill of normalizeRequiredSkills(normalizedPayload?.required_skills || [])) {
      pushUniqueSkill(requiredSkills, skill);
    }
    if (!code) throw new Error("code ist erforderlich");
    if (!name) throw new Error("name ist erforderlich");
    if (!["package", "addon", "service", "extra"].includes(kind)) throw new Error("kind muss package, addon, service oder extra sein");
    const inserted = await client.query(
      `INSERT INTO products (code, name, kind, group_key, category_key, description, affects_travel, affects_duration, duration_minutes, active, show_on_website, sort_order, skill_key, required_skills)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
       RETURNING id`,
      [
        code,
        name,
        kind,
        groupKey,
        String(normalizedPayload?.category_key || normalizedPayload?.group_key || "").trim(),
        String(normalizedPayload?.description || ""),
        normalizedPayload?.affects_travel !== false,
        !!normalizedPayload?.affects_duration,
        Number(normalizedPayload?.duration_minutes || 0),
        normalizedPayload?.active !== false,
        normalizedPayload?.show_on_website !== false,
        Number(normalizedPayload?.sort_order || 0),
        skillKey,
        JSON.stringify(requiredSkills),
      ]
    );
    const productId = inserted.rows[0]?.id;
    await setRulesForProduct(client, productId, normalizedPayload?.rules || []);
    await client.query("COMMIT");
    return await getProductById(productId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateProduct(id, payload) {
  await ensureProductCatalogSeeded();
  const p = getPool();
  if (!p) throw new Error("No database connection");
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const normalizedPayload = normalizeTextDeep(payload || {});
    const current = await client.query("SELECT * FROM products WHERE id = $1", [Number(id)]);
    if (!current.rows[0]) throw new Error("Produkt nicht gefunden");
    const existing = current.rows[0];
    const nextCode = normalizedPayload?.code != null ? String(normalizedPayload.code).trim() : existing.code;
    const nextGroupKey = normalizedPayload?.group_key != null ? String(normalizedPayload.group_key).trim() : existing.group_key;
    const nextSkillKey = normalizedPayload?.skill_key != null ? String(normalizedPayload.skill_key || "").trim() : String(existing.skill_key || "");
    const nextRequiredSkills = inferRequiredSkillsFromLegacy(nextCode, nextGroupKey, nextSkillKey);
    const explicitSkills = normalizedPayload?.required_skills != null
      ? normalizeRequiredSkills(normalizedPayload.required_skills || [])
      : normalizeRequiredSkills(safeJson(existing.required_skills, []));
    for (const skill of explicitSkills) {
      pushUniqueSkill(nextRequiredSkills, skill);
    }
    const next = {
      code: nextCode,
      name: normalizedPayload?.name != null ? String(normalizedPayload.name).trim() : existing.name,
      kind: normalizedPayload?.kind != null ? String(normalizedPayload.kind).trim() : existing.kind,
      group_key: nextGroupKey,
      category_key: normalizedPayload?.category_key != null ? String(normalizedPayload.category_key).trim() : String(existing.category_key || existing.group_key || ""),
      description: normalizedPayload?.description != null ? String(normalizedPayload.description) : existing.description,
      affects_travel: normalizedPayload?.affects_travel != null ? !!normalizedPayload.affects_travel : existing.affects_travel,
      affects_duration: normalizedPayload?.affects_duration != null ? !!normalizedPayload.affects_duration : existing.affects_duration,
      duration_minutes: normalizedPayload?.duration_minutes != null ? Number(normalizedPayload.duration_minutes || 0) : Number(existing.duration_minutes || 0),
      active: normalizedPayload?.active != null ? !!normalizedPayload.active : existing.active,
      show_on_website: normalizedPayload?.show_on_website != null ? !!normalizedPayload.show_on_website : existing.show_on_website !== false,
      sort_order: normalizedPayload?.sort_order != null ? Number(normalizedPayload.sort_order || 0) : existing.sort_order,
      skill_key: nextSkillKey,
      required_skills: nextRequiredSkills,
    };
    if (!["package", "addon", "service", "extra"].includes(next.kind)) throw new Error("kind muss package, addon, service oder extra sein");
    await client.query(
      `UPDATE products
       SET code=$1, name=$2, kind=$3, group_key=$4, category_key=$5, description=$6, affects_travel=$7, affects_duration=$8, duration_minutes=$9, active=$10, show_on_website=$11, sort_order=$12, skill_key=$13, required_skills=$14::jsonb, updated_at=NOW()
       WHERE id=$15`,
      [next.code, next.name, next.kind, next.group_key, next.category_key, next.description, next.affects_travel, next.affects_duration, next.duration_minutes, next.active, next.show_on_website, next.sort_order, next.skill_key, JSON.stringify(next.required_skills), Number(id)]
    );
    if (Array.isArray(normalizedPayload?.rules)) {
      await setRulesForProduct(client, Number(id), normalizedPayload.rules);
    }
    await client.query("COMMIT");
    return await getProductById(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function setProductActive(id, active) {
  await ensureProductCatalogSeeded();
  await query("UPDATE products SET active=$1, updated_at=NOW() WHERE id=$2", [!!active, Number(id)]);
  return await getProductById(id);
}

async function getProductByCode(code) {
  const all = await listProductsWithRules({ includeInactive: true });
  return all.find((p) => p.code === String(code || "")) || null;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

async function getAllAppSettings() {
  if (!getPool()) return { ...DEFAULT_APP_SETTINGS };
  const { rows } = await query("SELECT key, value_json FROM app_settings");
  const out = {};
  for (const row of rows) {
    out[String(row.key)] = safeJson(row.value_json, row.value_json);
  }
  return out;
}

async function getAppSetting(key) {
  if (!key) return undefined;
  if (!getPool()) return DEFAULT_APP_SETTINGS[key];
  const { rows } = await query("SELECT value_json FROM app_settings WHERE key = $1 LIMIT 1", [String(key)]);
  if (!rows[0]) return undefined;
  return safeJson(rows[0].value_json, rows[0].value_json);
}

async function setAppSetting(key, value) {
  if (!getPool()) return { key, value };
  await query(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [String(key), JSON.stringify(value)]
  );
  return { key, value };
}

async function upsertAppSettings(entries) {
  const list = Array.isArray(entries) ? entries : [];
  for (const entry of list) {
    if (!entry || !entry.key) continue;
    await setAppSetting(entry.key, entry.value);
  }
}

// ─── Discount Codes ───────────────────────────────────────────────────────────

function mapDiscountRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    code: String(row.code || ""),
    type: String(row.type || "percent"),
    amount: Number(row.amount || 0),
    active: row.active !== false,
    validFrom: row.valid_from || null,
    validTo: row.valid_to || null,
    maxUses: row.max_uses == null ? null : Number(row.max_uses),
    usesCount: Number(row.uses_count || 0),
    usesPerCustomer: row.uses_per_customer == null ? null : Number(row.uses_per_customer),
    conditions: safeJson(row.conditions_json, {}),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function listDiscountCodes({ includeInactive = true } = {}) {
  if (!getPool()) return [];
  const params = [];
  let whereSql = "";
  if (!includeInactive) {
    params.push(true);
    whereSql = `WHERE active = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT * FROM discount_codes
     ${whereSql}
     ORDER BY code ASC`,
    params
  );
  return rows.map(mapDiscountRow);
}

async function getDiscountCodeByCode(code) {
  if (!getPool()) return null;
  const { rows } = await query(
    `SELECT * FROM discount_codes WHERE UPPER(code) = UPPER($1) LIMIT 1`,
    [String(code || "")]
  );
  return mapDiscountRow(rows[0]);
}

async function getDiscountCodeById(id) {
  if (!getPool()) return null;
  const { rows } = await query("SELECT * FROM discount_codes WHERE id = $1 LIMIT 1", [Number(id)]);
  return mapDiscountRow(rows[0]);
}

async function createDiscountCode(payload) {
  if (!getPool()) throw new Error("No database connection");
  const code = String(payload?.code || "").trim().toUpperCase();
  if (!code) throw new Error("code ist erforderlich");
  const type = String(payload?.type || "percent");
  if (!["percent", "fixed"].includes(type)) throw new Error("type muss percent oder fixed sein");
  const amount = Number(payload?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount muss > 0 sein");
  const { rows } = await query(
    `INSERT INTO discount_codes
      (code, type, amount, active, valid_from, valid_to, max_uses, uses_per_customer, conditions_json, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW(),NOW())
     RETURNING *`,
    [
      code,
      type,
      amount,
      payload?.active !== false,
      payload?.validFrom || null,
      payload?.validTo || null,
      payload?.maxUses ?? null,
      payload?.usesPerCustomer ?? null,
      JSON.stringify(payload?.conditions || {}),
    ]
  );
  return mapDiscountRow(rows[0]);
}

async function updateDiscountCode(id, payload) {
  if (!getPool()) throw new Error("No database connection");
  const current = await getDiscountCodeById(id);
  if (!current) throw new Error("Discount code nicht gefunden");
  const next = {
    code: payload?.code != null ? String(payload.code).trim().toUpperCase() : current.code,
    type: payload?.type != null ? String(payload.type) : current.type,
    amount: payload?.amount != null ? Number(payload.amount) : current.amount,
    active: payload?.active != null ? !!payload.active : current.active,
    validFrom: payload?.validFrom !== undefined ? (payload?.validFrom || null) : current.validFrom,
    validTo: payload?.validTo !== undefined ? (payload?.validTo || null) : current.validTo,
    maxUses: payload?.maxUses !== undefined ? payload.maxUses : current.maxUses,
    usesPerCustomer: payload?.usesPerCustomer !== undefined ? payload.usesPerCustomer : current.usesPerCustomer,
    conditions: payload?.conditions !== undefined ? (payload.conditions || {}) : current.conditions,
  };
  if (!["percent", "fixed"].includes(next.type)) throw new Error("type muss percent oder fixed sein");
  if (!Number.isFinite(next.amount) || next.amount <= 0) throw new Error("amount muss > 0 sein");
  const { rows } = await query(
    `UPDATE discount_codes
     SET code=$1, type=$2, amount=$3, active=$4, valid_from=$5, valid_to=$6, max_uses=$7, uses_per_customer=$8, conditions_json=$9::jsonb, updated_at=NOW()
     WHERE id=$10
     RETURNING *`,
    [next.code, next.type, next.amount, next.active, next.validFrom, next.validTo, next.maxUses, next.usesPerCustomer, JSON.stringify(next.conditions), Number(id)]
  );
  return mapDiscountRow(rows[0]);
}

async function deleteDiscountCode(id) {
  if (!getPool()) throw new Error("No database connection");
  await query("UPDATE discount_codes SET active = FALSE, updated_at = NOW() WHERE id = $1", [Number(id)]);
}

async function getDiscountCodeUsageCount(discountCodeId, customerEmail) {
  if (!getPool()) return 0;
  const email = String(customerEmail || "").trim().toLowerCase();
  if (!email) return 0;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
     FROM discount_code_usages
     WHERE discount_code_id = $1 AND customer_email = $2`,
    [Number(discountCodeId), email]
  );
  return Number(rows[0]?.count || 0);
}

async function markDiscountCodeUsed(discountCodeId, customerEmail, orderId = null) {
  if (!getPool()) return;
  await query("UPDATE discount_codes SET uses_count = uses_count + 1, updated_at = NOW() WHERE id = $1", [Number(discountCodeId)]);
  const email = String(customerEmail || "").trim().toLowerCase();
  if (email) {
    await query(
      "INSERT INTO discount_code_usages (discount_code_id, customer_email, order_id, used_at) VALUES ($1,$2,$3,NOW())",
      [Number(discountCodeId), email, orderId == null ? null : Number(orderId)]
    );
  }
}

async function listDiscountCodeUsages(discountCodeId, { limit = 200 } = {}) {
  if (!getPool()) return [];
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const { rows } = await query(
    `SELECT id, discount_code_id, customer_email, order_id, used_at
     FROM discount_code_usages
     WHERE discount_code_id = $1
     ORDER BY used_at DESC
     LIMIT $2`,
    [Number(discountCodeId), safeLimit]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    discountCodeId: Number(row.discount_code_id),
    customerEmail: String(row.customer_email || ""),
    orderId: row.order_id == null ? null : Number(row.order_id),
    usedAt: row.used_at || null,
  }));
}

// ─── Kunden ──────────────────────────────────────────────────────────────────

async function upsertCustomer(billing) {
  const normalizedBilling = normalizeTextDeep(billing || {});
  const email = (normalizedBilling.email || "").toLowerCase().trim();
  if (!email) return null;

  const { rows } = await query(
    `INSERT INTO customers (email, name, company, phone, street, zipcity)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) WHERE email <> '' DO UPDATE SET
       name    = EXCLUDED.name,
       company = EXCLUDED.company,
       phone   = EXCLUDED.phone,
       street  = EXCLUDED.street,
       zipcity = EXCLUDED.zipcity,
       updated_at = NOW()
     RETURNING id`,
    [
      email,
      normalizedBilling.name || "",
      normalizedBilling.company || "",
      normalizedBilling.phone || "",
      normalizedBilling.street || "",
      normalizedBilling.zipcity || "",
    ]
  );
  return rows[0]?.id || null;
}

async function getCustomerByEmail(email) {
  const normEmail = (email || "").toLowerCase().trim();
  if (!normEmail) return null;
  const { rows } = await query(
    "SELECT * FROM customers WHERE email = $1",
    [normEmail]
  );
  return rows[0] || null;
}

async function createCustomer({ email, passwordHash, name = "", company = "", phone = "", street = "", zipcity = "", authSub = null }) {
  const normEmail = (email || "").toLowerCase().trim();
  if (!normEmail) throw new Error("email required");

  const { rows } = await query(
    `INSERT INTO customers (email, password_hash, name, company, phone, street, zipcity, auth_sub)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (email) WHERE email <> '' DO NOTHING
     RETURNING id, email`,
    [normEmail, passwordHash || null, name || "", company || "", phone || "", street || "", zipcity || "", authSub || null]
  );
  return rows[0] || null;
}

async function getCustomerByAuthSub(authSub) {
  const sub = String(authSub || "").trim();
  if (!sub) return null;
  const { rows } = await query(
    "SELECT * FROM customers WHERE auth_sub = $1",
    [sub]
  );
  return rows[0] || null;
}

async function updateCustomerAuthSub(customerId, authSub) {
  await query(
    "UPDATE customers SET auth_sub = $1, updated_at = NOW() WHERE id = $2",
    [String(authSub || ""), customerId]
  );
}

async function setCustomerPasswordHash(email, passwordHash) {
  const normEmail = (email || "").toLowerCase().trim();
  if (!normEmail) return;
  await query(
    "UPDATE customers SET password_hash = $1, updated_at = NOW() WHERE email = $2",
    [passwordHash || null, normEmail]
  );
}

async function setCustomerPasswordById(customerId, passwordHash) {
  await query(
    "UPDATE customers SET password_hash = $1, updated_at = NOW() WHERE id = $2",
    [passwordHash || null, customerId]
  );
}

function toCompanySlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

let coreCompaniesColumnAvailabilityPromise = null;
let coreCompanyMembersColumnAvailabilityPromise = null;

async function getCoreCompaniesColumnAvailability() {
  if (!coreCompaniesColumnAvailabilityPromise) {
    coreCompaniesColumnAvailabilityPromise = query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'core'
         AND table_name = 'companies'
         AND column_name = ANY($1::text[])`,
      [["standort", "notiz", "status"]]
    )
      .then(({ rows }) => {
        const names = new Set((rows || []).map((row) => String(row.column_name || "").toLowerCase()));
        return {
          hasStandort: names.has("standort"),
          hasNotiz: names.has("notiz"),
          hasStatus: names.has("status"),
        };
      })
      .catch((err) => {
        coreCompaniesColumnAvailabilityPromise = null;
        throw err;
      });
  }
  return coreCompaniesColumnAvailabilityPromise;
}

async function getCoreCompanyMembersColumnAvailability() {
  if (!coreCompanyMembersColumnAvailabilityPromise) {
    coreCompanyMembersColumnAvailabilityPromise = query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'core'
         AND table_name = 'company_members'
         AND column_name = ANY($1::text[])`,
      [["auth_subject", "keycloak_subject"]]
    )
      .then(({ rows }) => {
        const names = new Set((rows || []).map((row) => String(row.column_name || "").toLowerCase()));
        const subjectColumn = names.has("auth_subject")
          ? "auth_subject"
          : (names.has("keycloak_subject") ? "keycloak_subject" : "auth_subject");
        return {
          hasAuthSubject: names.has("auth_subject"),
          hasKeycloakSubject: names.has("keycloak_subject"),
          subjectColumn,
        };
      })
      .catch((err) => {
        coreCompanyMembersColumnAvailabilityPromise = null;
        throw err;
      });
  }
  return coreCompanyMembersColumnAvailabilityPromise;
}

function buildCoreCompaniesSelect(columns, alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return [
    `${prefix}id`,
    `${prefix}name`,
    `${prefix}slug`,
    `${prefix}billing_customer_id`,
    columns.hasStandort ? `COALESCE(${prefix}standort, '') AS standort` : `''::text AS standort`,
    columns.hasNotiz ? `COALESCE(${prefix}notiz, '') AS notiz` : `''::text AS notiz`,
    columns.hasStatus ? `COALESCE(${prefix}status, 'aktiv') AS status` : `'aktiv'::text AS status`,
    `${prefix}created_at`,
    `${prefix}updated_at`,
  ].join(",\n            ");
}

/** Nur Lesen: Firma nach Name (case-insensitive), ohne Anlage. */
async function findCompanyByName(name) {
  const companyName = String(name || "").trim();
  if (!companyName) return null;
  const columns = await getCoreCompaniesColumnAvailability();
  const { rows } = await query(
    `SELECT ${buildCoreCompaniesSelect(columns)}
     FROM core.companies
     WHERE LOWER(name) = LOWER($1)
     LIMIT 1`,
    [companyName]
  );
  return rows[0] || null;
}

/** Gleiche Rollenlogik wie in syncCompaniesFromCustomersAndContacts (Kontaktfeld role). */
function mapCustomerContactRoleToCompanyMemberRole(roleText) {
  const txt = String(roleText || "").toLowerCase();
  if (txt.includes("haupt") || txt.includes("owner") || txt.includes("admin")) {
    return "company_admin";
  }
  return "company_employee";
}

async function findCompanyMemberByCompanyAndEmail(companyId, email) {
  const cid = Number(companyId);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!Number.isFinite(cid) || !normalizedEmail) return null;
  const { rows } = await query(
    `SELECT *
     FROM core.company_members
     WHERE company_id = $1 AND LOWER(email) = $2
     LIMIT 1`,
    [cid, normalizedEmail]
  );
  return rows[0] || null;
}

async function ensureCompanyByName(name, { billingCustomerId = null } = {}) {
  const companyName = String(name || "").trim();
  if (!companyName) return null;
  const columns = await getCoreCompaniesColumnAvailability();

  const baseSlug = toCompanySlug(companyName) || `company-${Date.now()}`;
  const existing = await query(
    `SELECT ${buildCoreCompaniesSelect(columns)}
     FROM core.companies
     WHERE LOWER(name) = LOWER($1)
     LIMIT 1`,
    [companyName]
  );
  if (existing.rows[0]) return existing.rows[0];

  for (let i = 0; i < 25; i += 1) {
    const suffix = i === 0 ? "" : `-${i + 1}`;
    const slug = `${baseSlug}${suffix}`;
    try {
      const insertColumns = ["name", "slug", "billing_customer_id"];
      const insertValues = ["$1", "$2", "$3"];
      const { rows } = await query(
        `INSERT INTO core.companies (${[
          ...insertColumns,
          ...(columns.hasStatus ? ["status"] : []),
        ].join(", ")})
         VALUES (${[
           ...insertValues,
           ...(columns.hasStatus ? ["'aktiv'"] : []),
         ].join(",")})
         RETURNING ${buildCoreCompaniesSelect(columns)}`,
        [companyName, slug, billingCustomerId]
      );
      return rows[0] || null;
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("duplicate key")) continue;
      throw err;
    }
  }
  throw new Error(`Could not create company slug for '${companyName}'`);
}

async function createCompanyWithMeta({ name, standort = "", notiz = "", status = "aktiv", billingCustomerId = null } = {}) {
  const companyName = String(name || "").trim();
  if (!companyName) throw new Error("company name required");
  const columns = await getCoreCompaniesColumnAvailability();
  const baseSlug = toCompanySlug(companyName) || `company-${Date.now()}`;
  const st = String(standort || "").trim();
  const nt = String(notiz || "").trim();
  const bid = billingCustomerId == null ? null : Number(billingCustomerId);
  const safeStatus = ["aktiv", "ausstehend", "inaktiv"].includes(String(status)) ? String(status) : "aktiv";
  for (let i = 0; i < 25; i += 1) {
    const suffix = i === 0 ? "" : `-${i + 1}`;
    const slug = `${baseSlug}${suffix}`;
    try {
      const insertColumns = ["name", "slug", "billing_customer_id"];
      const insertValues = ["$1", "$2", "$3"];
      const insertParams = [companyName, slug, Number.isFinite(bid) ? bid : null];
      if (columns.hasStandort) {
        insertColumns.push("standort");
        insertValues.push(`$${insertParams.length + 1}`);
        insertParams.push(st);
      }
      if (columns.hasNotiz) {
        insertColumns.push("notiz");
        insertValues.push(`$${insertParams.length + 1}`);
        insertParams.push(nt);
      }
      if (columns.hasStatus) {
        insertColumns.push("status");
        insertValues.push(`$${insertParams.length + 1}`);
        insertParams.push(safeStatus);
      }
      const { rows } = await query(
        `INSERT INTO core.companies (${insertColumns.join(", ")})
         VALUES (${insertValues.join(", ")})
         RETURNING ${buildCoreCompaniesSelect(columns)}`,
        insertParams
      );
      return rows[0] || null;
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("duplicate key")) continue;
      throw err;
    }
  }
  throw new Error(`Could not create company slug for '${companyName}'`);
}

/** Wie bei Neuanlage Firmenverwaltung: Anzeigename = Firma, sonst Kontaktname. */
function deriveCompanyFieldsFromCustomerRow(customerRow) {
  const c = customerRow || {};
  const company = String(c.company || "").trim();
  const personName = String(c.name || "").trim();
  const displayName = company || personName;
  const zip = String(c.zip || "").trim();
  const city = String(c.city || "").trim();
  const zipcity = String(c.zipcity || "").trim();
  const standort = zip && city ? `${zip} ${city}`.trim() : zipcity;
  return { displayName, standort };
}

/**
 * Alle Firmen mit billing_customer_id = Kunde: Name + Standort aus Stammkunde übernehmen.
 * Slug bleibt unverändert (stabile interne Referenz). Notiz wird nicht überschrieben.
 */
async function syncCompaniesLinkedToBillingCustomer(customerRow) {
  const customerId = Number(customerRow?.id);
  if (!Number.isFinite(customerId) || customerId < 1) return { updated: [] };
  const { displayName, standort } = deriveCompanyFieldsFromCustomerRow(customerRow);
  if (!displayName) return { updated: [] };

  const columns = await getCoreCompaniesColumnAvailability();
  const { rows: linked } = await query(
    `SELECT ${buildCoreCompaniesSelect(columns, "c")}
     FROM core.companies c
     WHERE c.billing_customer_id = $1`,
    [customerId]
  );
  if (!linked.length) return { updated: [] };

  const nextStandort = String(standort || "").trim();
  const updated = [];
  for (const comp of linked) {
    const curName = String(comp.name || "").trim();
    const curStandort = String(comp.standort || "").trim();
    if (curName === displayName && curStandort === nextStandort) continue;

    const params = [displayName];
    const setParts = ["name = $1"];
    if (columns.hasStandort) {
      setParts.push("standort = $2");
      params.push(nextStandort);
    }
    setParts.push("updated_at = NOW()");
    const idPlaceholder = params.length + 1;
    params.push(Number(comp.id));

    const { rows: out } = await query(
      `UPDATE core.companies SET ${setParts.join(", ")} WHERE id = $${idPlaceholder}
       RETURNING ${buildCoreCompaniesSelect(columns)}`,
      params
    );
    if (out[0]) updated.push(out[0]);
  }
  return { updated };
}

async function listCompanies({ limit = 200, offset = 0, queryText = "" } = {}) {
  const columns = await getCoreCompaniesColumnAvailability();
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const q = String(queryText || "").trim();
  const params = [];
  let where = "";
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where = `WHERE LOWER(c.name) LIKE $${params.length} OR LOWER(c.slug) LIKE $${params.length}`;
    if (columns.hasStandort) {
      where += ` OR LOWER(COALESCE(c.standort, '')) LIKE $${params.length}`;
    }
  }
  params.push(safeLimit, safeOffset);

  const { rows } = await query(
    `SELECT ${buildCoreCompaniesSelect(columns, "c")},
            COALESCE(m.member_count, 0) AS member_count
     FROM core.companies c
     LEFT JOIN (
       SELECT company_id, COUNT(*)::INT AS member_count
       FROM core.company_members
       GROUP BY company_id
     ) m ON m.company_id = c.id
     ${where}
     ORDER BY c.name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function listCompaniesWithAdminData({ queryText = "", status = "" } = {}) {
  const columns = await getCoreCompaniesColumnAvailability();
  const memberColumns = await getCoreCompanyMembersColumnAvailability();
  const subjectColumn = memberColumns.subjectColumn;
  const q = String(queryText || "").trim().toLowerCase();
  const safeStatus = String(status || "").trim().toLowerCase();
  const params = [];
  const where = [];

  if (q) {
    params.push(`%${q}%`);
    const searchParts = [
      `LOWER(c.name) LIKE $${params.length}`,
      `LOWER(c.slug) LIKE $${params.length}`,
    ];
    if (columns.hasStandort) {
      searchParts.push(`LOWER(COALESCE(c.standort, '')) LIKE $${params.length}`);
    }
    where.push(`(${searchParts.join("\n      OR ")})`);
  }

  if (safeStatus && safeStatus !== "alle") {
    if (columns.hasStatus) {
      params.push(safeStatus);
      where.push(`LOWER(COALESCE(c.status, 'aktiv')) = $${params.length}`);
    } else if (safeStatus !== "aktiv") {
      where.push(`1 = 0`);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows: companies } = await query(
    `SELECT ${buildCoreCompaniesSelect(columns, "c")},
            COALESCE(mc.main_contact_count, 0) AS main_contact_count,
            COALESCE(mc.staff_count, 0) AS staff_count,
            COALESCE(mc.active_count, 0) AS active_count,
            COALESCE(ic.pending_invitation_count, 0) AS pending_invitation_count
     FROM core.companies c
     LEFT JOIN (
       SELECT company_id,
              COUNT(*) FILTER (WHERE role IN ('company_owner', 'company_admin'))::INT AS main_contact_count,
              COUNT(*) FILTER (WHERE role = 'company_employee')::INT AS staff_count,
              COUNT(*) FILTER (WHERE status = 'active')::INT AS active_count
       FROM core.company_members
       GROUP BY company_id
     ) mc ON mc.company_id = c.id
     LEFT JOIN (
       SELECT company_id,
              COUNT(*) FILTER (WHERE accepted_at IS NULL AND expires_at > NOW())::INT AS pending_invitation_count
       FROM core.company_invitations
       GROUP BY company_id
     ) ic ON ic.company_id = c.id
     ${whereSql}
     ORDER BY LOWER(c.name) ASC`,
    params
  );

  if (!companies.length) return [];

  const companyIds = companies.map((row) => Number(row.id));
  const { rows: members } = await query(
    `SELECT cm.id, cm.company_id, cm.${subjectColumn} AS auth_subject, cm.customer_id, cm.email, cm.role, cm.status,
            cm.is_primary_contact, cm.created_at, cm.updated_at,
            cu.name AS customer_name, cu.phone AS customer_phone
     FROM core.company_members cm
     LEFT JOIN customers cu ON cu.id = cm.customer_id
     WHERE cm.company_id = ANY($1::int[])
     ORDER BY
       cm.company_id ASC,
       CASE WHEN cm.role IN ('company_owner', 'company_admin') THEN 0 ELSE 1 END,
       LOWER(cm.email) ASC`,
    [companyIds]
  );

  const { rows: invitations } = await query(
    `SELECT ci.id, ci.company_id, ci.email, ci.role, ci.token, ci.expires_at, ci.accepted_at, ci.invited_by, ci.created_at
     FROM core.company_invitations ci
     WHERE ci.company_id = ANY($1::int[])
       AND ci.accepted_at IS NULL
     ORDER BY ci.company_id ASC, ci.created_at DESC`,
    [companyIds]
  );

  const membersByCompany = new Map();
  const invitationsByCompany = new Map();
  for (const company of companies) {
    membersByCompany.set(Number(company.id), []);
    invitationsByCompany.set(Number(company.id), []);
  }
  for (const member of members) {
    const companyId = Number(member.company_id);
    if (!membersByCompany.has(companyId)) membersByCompany.set(companyId, []);
    membersByCompany.get(companyId).push(member);
  }
  for (const invitation of invitations) {
    const companyId = Number(invitation.company_id);
    if (!invitationsByCompany.has(companyId)) invitationsByCompany.set(companyId, []);
    invitationsByCompany.get(companyId).push(invitation);
  }

  return companies.map((company) => ({
    ...company,
    members: membersByCompany.get(Number(company.id)) || [],
    invitations: invitationsByCompany.get(Number(company.id)) || [],
  }));
}

async function getCompanyById(companyId) {
  const columns = await getCoreCompaniesColumnAvailability();
  const { rows } = await query(
    `SELECT ${buildCoreCompaniesSelect(columns)}
     FROM core.companies
     WHERE id = $1
     LIMIT 1`,
    [Number(companyId)]
  );
  return rows[0] || null;
}

async function getCompanyMemberForIdentity({ authSubject = "", email = "" }) {
  const memberColumns = await getCoreCompanyMembersColumnAvailability();
  const subjectColumn = memberColumns.subjectColumn;
  const subject = String(authSubject || "").trim();
  const mail = String(email || "").trim().toLowerCase();

  const { rows } = await query(
    `SELECT cm.id, cm.company_id, cm.${subjectColumn} AS auth_subject, cm.customer_id, cm.email, cm.role, cm.status,
            cm.is_primary_contact, cm.created_at, cm.updated_at,
            c.name AS company_name, c.slug AS company_slug
     FROM core.company_members cm
     JOIN core.companies c ON c.id = cm.company_id
     WHERE (cm.${subjectColumn} <> '' AND cm.${subjectColumn} = $1)
        OR (LOWER(cm.email) = $2)
     ORDER BY
       CASE WHEN cm.${subjectColumn} = $1 AND $1 <> '' THEN 0 ELSE 1 END,
       CASE WHEN cm.status = 'active' THEN 0 WHEN cm.status = 'invited' THEN 1 ELSE 2 END,
       cm.id ASC
     LIMIT 1`,
    [subject, mail]
  );
  return rows[0] || null;
}

function normalizeCompanyMemberRole(role) {
  const r = String(role || "").trim().toLowerCase().replace(/-/g, "_");
  if (r === "company_owner" || r === "owner") return "company_owner";
  if (r === "company_admin" || r === "admin") return "company_admin";
  return "company_employee";
}

async function listCompanyMembers(companyId) {
  const memberColumns = await getCoreCompanyMembersColumnAvailability();
  const subjectColumn = memberColumns.subjectColumn;
  const { rows } = await query(
    `SELECT cm.id, cm.company_id, cm.${subjectColumn} AS auth_subject, cm.customer_id, cm.email, cm.role, cm.status,
            cm.is_primary_contact, cm.created_at, cm.updated_at,
            cu.name AS customer_name, cu.phone AS customer_phone
     FROM core.company_members cm
     LEFT JOIN customers cu ON cu.id = cm.customer_id
     WHERE cm.company_id = $1
     ORDER BY
       CASE cm.role WHEN 'company_owner' THEN 0 WHEN 'company_admin' THEN 1 ELSE 2 END,
       LOWER(cm.email) ASC`,
    [Number(companyId)]
  );
  return rows;
}

async function upsertCompanyMember({ companyId, authSubject = "", customerId = null, email = "", role = "company_employee", status = "active" }) {
  const memberColumns = await getCoreCompanyMembersColumnAvailability();
  const subjectColumn = memberColumns.subjectColumn;
  const safeRole = normalizeCompanyMemberRole(role);
  const safeStatus = ["invited", "active", "disabled"].includes(String(status)) ? String(status) : "active";
  const subject = String(authSubject || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const safeCustomerId = customerId == null ? null : Number(customerId);

  if (!subject && !normalizedEmail) {
    throw new Error("company member requires auth subject or email");
  }

  const existing = await query(
    `SELECT id
     FROM core.company_members
     WHERE company_id = $1
       AND (
         (${subjectColumn} <> '' AND ${subjectColumn} = $2)
         OR LOWER(email) = $3
       )
     LIMIT 1`,
    [Number(companyId), subject, normalizedEmail]
  );

  if (existing.rows[0]) {
    const { rows } = await query(
      `UPDATE core.company_members
       SET ${subjectColumn} = CASE WHEN $2 <> '' THEN $2 ELSE ${subjectColumn} END,
           customer_id = COALESCE($3, customer_id),
           email = CASE WHEN $4 <> '' THEN $4 ELSE email END,
           role = $5,
           status = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [Number(existing.rows[0].id), subject, safeCustomerId, normalizedEmail, safeRole, safeStatus]
    );
    return rows[0] || null;
  }

  const { rows } = await query(
    `INSERT INTO core.company_members (company_id, ${subjectColumn}, customer_id, email, role, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [Number(companyId), subject, safeCustomerId, normalizedEmail, safeRole, safeStatus]
  );
  return rows[0] || null;
}

async function updateCompanyMemberRole(memberId, role) {
  const safeRole = normalizeCompanyMemberRole(role);
  const { rows } = await query(
    `UPDATE core.company_members
     SET role = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [Number(memberId), safeRole]
  );
  return rows[0] || null;
}

async function updateCompanyMemberStatus(memberId, status) {
  const safeStatus = ["invited", "active", "disabled"].includes(String(status)) ? String(status) : "active";
  const { rows } = await query(
    `UPDATE core.company_members
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [Number(memberId), safeStatus]
  );
  return rows[0] || null;
}

async function createCompanyInvitation({
  companyId,
  email,
  role = "company_employee",
  token,
  expiresAt,
  invitedBy = "",
  givenName = "",
  familyName = "",
  loginName = "",
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("email required");
  if (!token) throw new Error("token required");
  const safeRole = normalizeCompanyMemberRole(role);
  const g = String(givenName || "").trim();
  const f = String(familyName || "").trim();
  const l = String(loginName || "").trim().toLowerCase();

  const { rows } = await query(
    `INSERT INTO core.company_invitations (company_id, email, role, token, expires_at, invited_by, given_name, family_name, login_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [Number(companyId), normalizedEmail, safeRole, String(token), expiresAt, String(invitedBy || ""), g, f, l]
  );
  return rows[0] || null;
}

async function listCompanyInvitations(companyId, { includeExpired = false } = {}) {
  const { rows } = await query(
    `SELECT ci.*
     FROM core.company_invitations ci
     WHERE ci.company_id = $1
       AND ($2::boolean = true OR (ci.expires_at > NOW() AND ci.accepted_at IS NULL))
     ORDER BY ci.created_at DESC`,
    [Number(companyId), !!includeExpired]
  );
  return rows;
}

async function getPendingCompanyInvitationByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { rows } = await query(
    `SELECT ci.*, c.name AS company_name, c.slug AS company_slug
     FROM core.company_invitations ci
     JOIN core.companies c ON c.id = ci.company_id
     WHERE LOWER(ci.email) = $1
       AND ci.accepted_at IS NULL
       AND ci.expires_at > NOW()
     ORDER BY ci.created_at DESC
     LIMIT 1`,
    [normalizedEmail]
  );
  return rows[0] || null;
}

async function getCompanyInvitationByToken(token) {
  const { rows } = await query(
    `SELECT ci.*, c.name AS company_name, c.slug AS company_slug
     FROM core.company_invitations ci
     JOIN core.companies c ON c.id = ci.company_id
     WHERE ci.token = $1
     LIMIT 1`,
    [String(token || "")]
  );
  return rows[0] || null;
}

async function acceptCompanyInvitation({ token, authSubject = "", customerId = null, email = "" }) {
  const invitation = await getCompanyInvitationByToken(token);
  if (!invitation) return null;
  if (invitation.accepted_at) return { invitation, member: null, alreadyAccepted: true };
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return { invitation, member: null, expired: true };
  }

  const member = await upsertCompanyMember({
    companyId: invitation.company_id,
    authSubject,
    customerId,
    email: email || invitation.email,
    role: invitation.role,
    status: "active",
  });

  await query(
    "UPDATE core.company_invitations SET accepted_at = NOW() WHERE id = $1",
    [Number(invitation.id)]
  );
  await query(
    `UPDATE core.companies
     SET status = 'aktiv', updated_at = NOW()
     WHERE id = $1`,
    [Number(invitation.company_id)]
  );

  return { invitation, member, accepted: true };
}

async function listCompanyOrders(companyId, { limit = 200, offset = 0, member = null } = {}) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const params = [Number(companyId)];
  let extraWhere = "";
  const role = String(member?.role || "");
  const mid = member?.id != null ? Number(member.id) : NaN;
  if (role === "company_employee" && Number.isFinite(mid)) {
    // Harte Mandanten-/Benutzertrennung:
    // Mitarbeiter sehen nur selbst erstellte Aufträge.
    params.push(mid);
    extraWhere = " AND o.created_by_member_id = $2";
  }
  params.push(safeLimit, safeOffset);
  const limIdx = params.length - 1;
  const offIdx = params.length;
  const { rows } = await query(
    `SELECT o.*, c.name AS customer_name, c.company AS customer_company, c.email AS customer_email
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE c.id IN (
       SELECT customer_id
       FROM core.company_members
       WHERE company_id = $1
         AND customer_id IS NOT NULL
     )
     ${extraWhere}
     ORDER BY o.order_no DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );
  return rows.map(dbRowToRecord);
}

async function listCompanyCustomers(companyId, { member = null } = {}) {
  const role = String(member?.role || "");
  const mid = member?.id != null ? Number(member.id) : NaN;
  if (role === "company_employee" && Number.isFinite(mid)) {
    const cid = member.customer_id != null ? Number(member.customer_id) : null;
    if (!Number.isFinite(cid)) {
      const { rows } = await query("SELECT c.* FROM customers c WHERE FALSE", []);
      return rows;
    }
    const { rows } = await query(
      `SELECT c.*
       FROM customers c
       WHERE c.id = $1
       ORDER BY LOWER(c.name) ASC, c.id ASC`,
      [cid]
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT c.*
     FROM customers c
     WHERE c.id IN (
       SELECT customer_id
       FROM core.company_members
       WHERE company_id = $1
         AND customer_id IS NOT NULL
     )
     ORDER BY LOWER(c.name) ASC, c.id ASC`,
    [Number(companyId)]
  );
  return rows;
}

async function bootstrapCompaniesFromCustomers({ dryRun = true } = {}) {
  const { rows } = await query(
    `SELECT id, email, name, company, is_admin
     FROM customers
     WHERE TRIM(COALESCE(company, '')) <> ''
     ORDER BY id ASC`
  );

  const byCompany = new Map();
  for (const row of rows) {
    const key = String(row.company || "").trim();
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(row);
  }

  const preview = [];
  for (const [companyName, members] of byCompany.entries()) {
    const adminCandidate = members.find((m) => m.is_admin) || members[0];
    preview.push({
      companyName,
      customerCount: members.length,
      adminCandidateEmail: String(adminCandidate?.email || ""),
      customerIds: members.map((m) => Number(m.id)),
    });
  }

  if (dryRun) return { dryRun: true, companies: preview };

  for (const entry of preview) {
    const company = await ensureCompanyByName(entry.companyName, { billingCustomerId: entry.customerIds[0] || null });
    if (!company) continue;

    for (const customerId of entry.customerIds) {
      const customer = rows.find((r) => Number(r.id) === Number(customerId));
      if (!customer) continue;
      const role = customer.email === entry.adminCandidateEmail ? "company_owner" : "company_employee";
      await upsertCompanyMember({
        companyId: company.id,
        customerId: customer.id,
        email: customer.email,
        role,
        status: "active",
      });
    }
  }

  return { dryRun: false, companies: preview };
}

async function syncCompaniesFromCustomersAndContacts() {
  const bootstrap = await bootstrapCompaniesFromCustomers({ dryRun: false });

  const { rows: contacts } = await query(
    `SELECT cc.id AS contact_id, cc.customer_id, cc.email AS contact_email, cc.role AS contact_role,
            c.company AS company_name
     FROM customer_contacts cc
     JOIN customers c ON c.id = cc.customer_id
     WHERE TRIM(COALESCE(c.company, '')) <> ''
       AND TRIM(COALESCE(cc.email, '')) <> ''
     ORDER BY cc.id ASC`
  );

  let linkedContacts = 0;
  for (const row of contacts) {
    const companyName = String(row.company_name || "").trim();
    const email = String(row.contact_email || "").trim().toLowerCase();
    if (!companyName || !email) continue;
    const company = await ensureCompanyByName(companyName, {
      billingCustomerId: row.customer_id != null ? Number(row.customer_id) : null,
    });
    if (!company) continue;
    const role = mapCustomerContactRoleToCompanyMemberRole(row.contact_role);
    await upsertCompanyMember({
      companyId: Number(company.id),
      customerId: row.customer_id != null ? Number(row.customer_id) : null,
      email,
      role,
      status: "active",
    });
    linkedContacts += 1;
  }

  return {
    bootstrapCompanies: Array.isArray(bootstrap?.companies) ? bootstrap.companies.length : 0,
    linkedContacts,
  };
}

async function logAuthAudit({ actorId, actorRole, action, targetType, targetId, details, ipAddress }) {
  try {
    await query(
      `INSERT INTO auth_audit_log (actor_id, actor_role, action, target_type, target_id, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [
        actorId || null,
        actorRole || null,
        String(action || "unknown"),
        targetType || null,
        targetId != null ? String(targetId) : null,
        JSON.stringify(details && typeof details === "object" ? details : {}),
        ipAddress || null,
      ]
    );
  } catch (e) {
    console.warn("[auth_audit]", e?.message || e);
  }
}

// ─── Admin-Sessions ─────────────────────────────────────────────────────────────
async function createAdminSession({ tokenHash, role, userKey, userName, expiresAt }) {
  await query(
    `INSERT INTO admin_sessions (token_hash, role, user_key, user_name, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [tokenHash, role, userKey || null, userName || null, expiresAt]
  );
}

async function getAdminSessionByTokenHash(tokenHash) {
  const { rows } = await query(
    `SELECT role, user_key, user_name, expires_at FROM admin_sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function deleteAdminSessionByTokenHash(tokenHash) {
  await query("DELETE FROM admin_sessions WHERE token_hash = $1", [tokenHash]);
}

async function getAdminUserByUsername(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return null;
  // Sucht nach Benutzername ODER E-Mail – beides erlaubt
  const { rows } = await query(
    `SELECT id, username, email, name, phone, language, logto_user_id, role, password_hash, active
     FROM admin_users
     WHERE LOWER(username) = $1 OR LOWER(email) = $1
     LIMIT 1`,
    [u]
  );
  return rows[0] || null;
}

async function getAdminUserById(adminUserId) {
  const id = Number(adminUserId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const { rows } = await query(
    `SELECT id, username, email, name, phone, language, logto_user_id, role, password_hash, active
     FROM admin_users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Legt genau einen Admin an, wenn admin_users leer ist fuer diesen Usernamen (Docker/lokaler Erststart).
 * ADMIN_PASS muss mindestens 8 Zeichen haben (gleiche Policy wie customer-auth).
 */
async function bootstrapAdminUserFromEnvIfMissing() {
  if (!DATABASE_URL) return { skipped: true, reason: "no DATABASE_URL" };

  const username = String(process.env.ADMIN_USER || "admin").trim().toLowerCase();
  const passwordPlain = String(process.env.ADMIN_PASS || "");

  if (!username) return { skipped: true, reason: "empty ADMIN_USER" };
  if (passwordPlain.length < 8) {
    return {
      skipped: true,
      reason: "ADMIN_PASS zu kurz (mindestens 8 Zeichen, siehe customer-auth)",
    };
  }

  let existing;
  try {
    existing = await getAdminUserByUsername(username);
  } catch (e) {
    return { skipped: true, reason: e?.message || "getAdminUser failed" };
  }
  const customerAuth = require("./customer-auth");
  let hash;
  try {
    hash = await customerAuth.hashPassword(passwordPlain);
  } catch (e) {
    return { skipped: true, reason: e?.message || "hashPassword failed" };
  }

  const syncPw =
    String(process.env.ADMIN_BOOTSTRAP_SYNC_PASSWORD || "").toLowerCase() === "true" ||
    String(process.env.ADMIN_BOOTSTRAP_SYNC_PASSWORD || "") === "1";

  if (existing) {
    if (!syncPw) {
      return { skipped: true, reason: "admin_users Eintrag existiert bereits", username };
    }
    await query(
      `UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE LOWER(username) = $2`,
      [hash, username]
    );
    return { updated: true, username };
  }

  try {
    await query(
      `INSERT INTO admin_users (username, email, name, role, password_hash, active)
       VALUES ($1, $2, $3, 'admin', $4, TRUE)`,
      [username, `${username}@local.dev`, username, hash]
    );
  } catch (e) {
    if (String(e?.code) === "42P01") {
      return { skipped: true, reason: "admin_users Tabelle fehlt (Migration 032?)" };
    }
    throw e;
  }

  return { created: true, username };
}

// ─── Customer Sessions ───────────────────────────────────────────────────────

async function createCustomerSession({ customerId, tokenHash, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO customer_sessions (customer_id, token_hash, expires_at)
     VALUES ($1,$2,$3)
     RETURNING id`,
    [customerId, tokenHash, expiresAt]
  );
  return rows[0]?.id || null;
}

async function getCustomerBySessionTokenHash(tokenHash) {
  const { rows } = await query(
    `SELECT c.*
     FROM customer_sessions s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function deleteCustomerSessionByTokenHash(tokenHash) {
  await query("DELETE FROM customer_sessions WHERE token_hash = $1", [tokenHash]);
}

// ─── Orders for customer ─────────────────────────────────────────────────────

async function getOrdersForCustomerEmail(email, { limit = 200, offset = 0 } = {}) {
  const normEmail = (email || "").toLowerCase().trim();
  if (!normEmail) return [];
  const { rows } = await query(
    `SELECT o.*, c.email AS customer_email, c.exxas_contact_id
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE (c.email = $1) OR (LOWER(COALESCE(o.billing->>'email','')) = $1)
     ORDER BY o.order_no DESC
     LIMIT $2 OFFSET $3`,
    [normEmail, limit, offset]
  );
  return rows.map(dbRowToRecord);
}

/** Auftraege eines Kunden: customer_id ODER gleiche E-Mail in billing/object (wie order_count in Kundenliste). */
async function getOrdersForCustomerId(customerId, { limit = 200 } = {}) {
  const id = Number(customerId);
  if (!Number.isFinite(id)) return [];
  const { rows: cr } = await query("SELECT LOWER(TRIM(email)) AS em FROM customers WHERE id = $1", [id]);
  if (!cr[0]) return [];
  const em = String(cr[0].em || "").trim();
  const lim = Math.min(500, Math.max(1, Number(limit) || 200));
  const { rows } = await query(
    `SELECT order_no, status, address, schedule
     FROM orders o
     WHERE o.customer_id = $1
        OR ($2 <> '' AND (
             LOWER(TRIM(COALESCE(o.billing->>'email',''))) = $2
          OR LOWER(TRIM(COALESCE(o.object->>'email',''))) = $2
        ))
     ORDER BY order_no DESC
     LIMIT $3`,
    [id, em, lim]
  );
  return rows.map((r) => {
    let sch = r.schedule;
    if (sch && typeof sch === "string") {
      try {
        sch = JSON.parse(sch);
      } catch {
        sch = {};
      }
    }
    if (!sch || typeof sch !== "object") sch = {};
    const date = sch.date || "";
    const time = sch.time || "";
    return {
      orderNo: r.order_no,
      status: r.status || "",
      address: r.address || "",
      appointmentDate: date && time ? `${date} ${time}` : date || "",
    };
  });
}

// ─── Bestellungen ─────────────────────────────────────────────────────────────

async function insertOrder(record, customerId, createdByMemberId = null) {
  const normalizedRecord = normalizeTextDeep(record || {});
  const keyPickupValue = normalizedRecord.keyPickup && typeof normalizedRecord.keyPickup === "object"
    ? normalizedRecord.keyPickup
    : null;
  const mid =
    createdByMemberId != null && Number.isFinite(Number(createdByMemberId)) ? Number(createdByMemberId) : null;
  const sql = `INSERT INTO orders (
      order_no, customer_id, status, address,
      object, services, photographer, schedule, billing, pricing,
      settings_snapshot, discount, key_pickup, ics_uid, photographer_event_id, office_event_id,
      created_at,
      confirmation_token, confirmation_token_expires_at, confirmation_pending_since,
      attendee_emails, onsite_email, onsite_contacts,
      created_by_member_id
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,
      $17,
      $18,$19,$20,
      $21,$22,$23,
      $24
    ) RETURNING id`;
  const baseParams = [
    normalizedRecord.orderNo,
    customerId,
    normalizedRecord.status || "pending",
    normalizedRecord.address || "",
    JSON.stringify(normalizedRecord.object || {}),
    JSON.stringify(normalizedRecord.services || {}),
    JSON.stringify(normalizedRecord.photographer || {}),
    JSON.stringify(normalizedRecord.schedule || {}),
    JSON.stringify(normalizedRecord.billing || {}),
    JSON.stringify(normalizedRecord.pricing || {}),
    JSON.stringify(normalizedRecord.settingsSnapshot || {}),
    normalizedRecord.discount ? JSON.stringify(normalizedRecord.discount) : null,
    null, // key_pickup placeholder
    normalizedRecord.icsUid || null,
    normalizedRecord.photographerEventId || null,
    normalizedRecord.officeEventId || null,
    normalizedRecord.createdAt ? new Date(normalizedRecord.createdAt) : new Date(),
    normalizedRecord.confirmationToken || null,
    normalizedRecord.confirmationTokenExpiresAt ? new Date(normalizedRecord.confirmationTokenExpiresAt) : null,
    normalizedRecord.confirmationPendingSince ? new Date(normalizedRecord.confirmationPendingSince) : null,
    normalizedRecord.attendeeEmails || null,
    normalizedRecord.onsiteEmail || normalizedRecord.billing?.onsiteEmail || null,
    JSON.stringify(Array.isArray(normalizedRecord.onsiteContacts) ? normalizedRecord.onsiteContacts : []),
    mid,
  ];

  const insertWithKeyPickup = async (keyPickupParam) => {
    const params = baseParams.slice();
    params[12] = keyPickupParam;
    return await query(sql, params);
  };

  let rows;
  try {
    // Neuer Schema-Fall (JSONB): volle keyPickup-Daten persistieren.
    ({ rows } = await insertWithKeyPickup(JSON.stringify(keyPickupValue)));
  } catch (err) {
    const msg = String(err?.message || "");
    const isBooleanMismatch = /key_pickup/i.test(msg) && /boolean/i.test(msg);
    if (!isBooleanMismatch) throw err;

    // Kompatibilitäts-Fallback für ältere Installationen mit BOOLEAN-Spalte.
    const keyPickupEnabled = !!keyPickupValue?.enabled;
    ({ rows } = await insertWithKeyPickup(keyPickupEnabled));
  }
  return rows[0]?.id;
}

async function getOrders({ status, limit = 500, offset = 0 } = {}) {
  let sql = `
    SELECT o.*, c.email AS customer_email, c.exxas_contact_id, c.street AS customer_street, c.zipcity AS customer_zipcity,
           c.phone AS customer_phone,
           (to_jsonb(c)->>'nas_customer_folder_base') AS customer_nas_customer_folder_base,
           (to_jsonb(c)->>'nas_raw_folder_base') AS customer_nas_raw_folder_base,
           cc.name AS customer_contact_name, cc.email AS customer_contact_email, cc.phone AS customer_contact_phone
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN LATERAL (
      SELECT x.name, x.email, x.phone
      FROM customer_contacts x
      WHERE x.customer_id = o.customer_id
      ORDER BY x.id ASC
      LIMIT 1
    ) cc ON TRUE
  `;
  const params = [];
  if (status) {
    params.push(status);
    sql += ` WHERE o.status = $${params.length}`;
  }
  sql += ` ORDER BY o.order_no DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const { rows } = await query(sql, params);
  return rows.map(dbRowToRecord);
}

async function getOrderByNo(orderNo) {
  const { rows } = await query(
    `    SELECT o.*, c.email AS customer_email, c.exxas_contact_id, c.street AS customer_street, c.zipcity AS customer_zipcity,
            c.phone AS customer_phone,
            (to_jsonb(c)->>'nas_customer_folder_base') AS customer_nas_customer_folder_base,
            (to_jsonb(c)->>'nas_raw_folder_base') AS customer_nas_raw_folder_base,
            cc.name AS customer_contact_name, cc.email AS customer_contact_email, cc.phone AS customer_contact_phone
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN LATERAL (
       SELECT x.name, x.email, x.phone
       FROM customer_contacts x
       WHERE x.customer_id = o.customer_id
       ORDER BY x.id ASC
       LIMIT 1
     ) cc ON TRUE
      WHERE o.order_no = $1`,
    [Number(orderNo)]
  );
  if (!rows[0]) return null;
  const record = dbRowToRecord(rows[0]);
  const photographerKey = String(record.photographer?.key || "").trim().toLowerCase();
  if (!photographerKey) return record;
  try {
    const photographer = await getPhotographer(photographerKey);
    const settings = await getPhotographerSettings(photographerKey);
    if (photographer) {
      record.photographer = {
        ...record.photographer,
        key: photographer.key || record.photographer?.key || photographerKey,
        name: photographer.name || record.photographer?.name || "",
        email: photographer.email || record.photographer?.email || "",
        phone: photographer.phone || record.photographer?.phone || "",
        phone_mobile: photographer.phone_mobile || record.photographer?.phone_mobile || "",
        whatsapp: photographer.whatsapp || record.photographer?.whatsapp || "",
        initials: photographer.initials || record.photographer?.initials || "",
      };
      if (settings?.max_radius_km != null && record.photographer.max_radius_km == null) {
        record.photographer.max_radius_km = settings.max_radius_km;
      }
    }
  } catch (_) {
    // Falls Lookup fehlschlaegt, die bereits gespeicherten Order-Daten weiterverwenden.
  }
  return record;
}

async function updateCustomerNasStorageBases(customerId, patch = {}) {
  const id = Number(customerId);
  const hasColumnsResult = await query(
    `SELECT
       EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'customers' AND column_name = 'nas_customer_folder_base'
       ) AS has_customer_base,
       EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'customers' AND column_name = 'nas_raw_folder_base'
       ) AS has_raw_base`
  );
  const hasCustomerBase = !!hasColumnsResult.rows?.[0]?.has_customer_base;
  const hasRawBase = !!hasColumnsResult.rows?.[0]?.has_raw_base;
  if (!hasCustomerBase || !hasRawBase) {
    throw new Error("Kunden-NAS-Basis-Spalten fehlen in der Datenbank (Migration 026 ausstehend).");
  }

  const { rows } = await query(
    "SELECT (to_jsonb(customers)->>'nas_customer_folder_base') AS nas_customer_folder_base, (to_jsonb(customers)->>'nas_raw_folder_base') AS nas_raw_folder_base FROM customers WHERE id = $1",
    [id],
  );
  if (!rows[0]) throw new Error("Kunde nicht gefunden");
  let cust = rows[0].nas_customer_folder_base;
  let raw = rows[0].nas_raw_folder_base;
  if (Object.prototype.hasOwnProperty.call(patch, "nasCustomerFolderBase")) {
    const v = patch.nasCustomerFolderBase;
    cust = v != null && String(v).trim() ? String(v).trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "nasRawFolderBase")) {
    const v = patch.nasRawFolderBase;
    raw = v != null && String(v).trim() ? String(v).trim() : null;
  }
  await query(
    `UPDATE customers SET nas_customer_folder_base = $1, nas_raw_folder_base = $2, updated_at = NOW() WHERE id = $3`,
    [cust, raw, id],
  );
}

async function updateOrderFields(orderNo, fields) {
  const sets = [];
  const params = [];
  for (const [key, val] of Object.entries(fields)) {
    params.push(val);
    sets.push(`${key} = $${params.length}`);
  }
  sets.push("updated_at = NOW()");
  params.push(Number(orderNo));
  await query(
    `UPDATE orders SET ${sets.join(", ")} WHERE order_no = $${params.length}`,
    params
  );
}

async function listOrderFolderLinks(orderNo) {
  const { rows } = await query(
    `SELECT *
     FROM order_folder_links
     WHERE order_no = $1
     ORDER BY created_at DESC, id DESC`,
    [Number(orderNo)]
  );
  return rows;
}

async function getOrderFolderLink(orderNo, folderType) {
  const { rows } = await query(
    `SELECT *
     FROM order_folder_links
     WHERE order_no = $1
       AND folder_type = $2
       AND archived_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [Number(orderNo), String(folderType || "")]
  );
  return rows[0] || null;
}

async function upsertOrderFolderLink({
  orderNo,
  folderType,
  rootKind,
  relativePath,
  absolutePath,
  displayName = "",
  companyName = "",
  status = "ready",
  lastError = null,
}) {
  const { rows } = await query(
    `INSERT INTO order_folder_links
       (order_no, folder_type, root_kind, relative_path, absolute_path, display_name, company_name, status, last_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (order_no, folder_type) WHERE archived_at IS NULL
     DO UPDATE SET
       root_kind = EXCLUDED.root_kind,
       relative_path = EXCLUDED.relative_path,
       absolute_path = EXCLUDED.absolute_path,
       display_name = EXCLUDED.display_name,
       company_name = EXCLUDED.company_name,
       status = EXCLUDED.status,
       last_error = EXCLUDED.last_error,
       updated_at = NOW()
     RETURNING *`,
    [
      Number(orderNo),
      String(folderType || ""),
      String(rootKind || ""),
      String(relativePath || ""),
      String(absolutePath || ""),
      String(displayName || ""),
      String(companyName || ""),
      String(status || "ready"),
      lastError ? String(lastError) : null,
    ]
  );
  return rows[0] || null;
}

async function archiveOrderFolderLink(orderNo, folderType, archivedPath, status = "archived") {
  const { rows } = await query(
    `UPDATE order_folder_links
     SET absolute_path = $3,
         status = $4,
         archived_at = NOW(),
         updated_at = NOW()
     WHERE order_no = $1
       AND folder_type = $2
       AND archived_at IS NULL
     RETURNING *`,
    [Number(orderNo), String(folderType || ""), String(archivedPath || ""), String(status || "archived")]
  );
  return rows[0] || null;
}

async function createUploadBatch({
  id,
  orderNo,
  folderType = "customer_folder",
  category,
  uploadMode,
  status = "staged",
  localPath,
  targetRelativePath = null,
  targetAbsolutePath = null,
  batchFolder = null,
  comment = "",
  fileCount = 0,
  totalBytes = 0,
  uploadedBy = "",
  errorMessage = null,
  startedAt = null,
  completedAt = null,
  conflictMode = "skip",
  customFolderName = null,
  uploadGroupId = null,
  uploadGroupTotalParts = 1,
  uploadGroupPartIndex = 1,
}) {
  const commonParams = [
    String(id || ""),
    Number(orderNo),
    String(folderType || "customer_folder"),
    String(category || ""),
    String(uploadMode || "existing"),
    String(status || "staged"),
    String(localPath || ""),
    targetRelativePath ? String(targetRelativePath) : null,
    targetAbsolutePath ? String(targetAbsolutePath) : null,
    batchFolder ? String(batchFolder) : null,
    String(comment || ""),
    Number(fileCount || 0),
    Number(totalBytes || 0),
    String(uploadedBy || ""),
    errorMessage ? String(errorMessage) : null,
    startedAt || null,
    completedAt || null,
  ];
  try {
    const { rows } = await query(
      `INSERT INTO upload_batches
         (id, order_no, folder_type, category, upload_mode, status, local_path, target_relative_path, target_absolute_path, batch_folder, comment, file_count, total_bytes, uploaded_by, error_message, started_at, completed_at, conflict_mode, custom_folder_name, upload_group_id, upload_group_total_parts, upload_group_part_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        ...commonParams,
        String(conflictMode || "skip"),
        customFolderName ? String(customFolderName) : null,
        uploadGroupId ? String(uploadGroupId) : null,
        Math.max(1, Number(uploadGroupTotalParts || 1)),
        Math.max(1, Number(uploadGroupPartIndex || 1)),
      ]
    );
    return rows[0] || null;
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const missingLegacyColumns = message.includes("column") && (
      message.includes("conflict_mode") ||
      message.includes("custom_folder_name") ||
      message.includes("upload_group_id") ||
      message.includes("upload_group_total_parts") ||
      message.includes("upload_group_part_index")
    );
    if (!missingLegacyColumns) throw error;

    const { rows } = await query(
      `INSERT INTO upload_batches
         (id, order_no, folder_type, category, upload_mode, status, local_path, target_relative_path, target_absolute_path, batch_folder, comment, file_count, total_bytes, uploaded_by, error_message, started_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      commonParams
    );
    return rows[0] || null;
  }
}

async function updateUploadBatch(batchId, fields) {
  const entries = Object.entries(fields || {});
  if (!entries.length) return getUploadBatch(batchId);
  const sets = [];
  const params = [];
  for (const [key, value] of entries) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  sets.push("updated_at = NOW()");
  params.push(String(batchId || ""));
  const { rows } = await query(
    `UPDATE upload_batches
     SET ${sets.join(", ")}
     WHERE id = $${params.length}
     RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function getUploadBatch(batchId) {
  const { rows } = await query(
    `SELECT *
     FROM upload_batches
     WHERE id = $1
     LIMIT 1`,
    [String(batchId || "")]
  );
  return rows[0] || null;
}

async function listUploadBatches(orderNo, { limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
  const { rows } = await query(
    `SELECT *
     FROM upload_batches
     WHERE order_no = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [Number(orderNo), safeLimit]
  );
  return rows;
}

async function listUploadBatchesByGroupId(uploadGroupId) {
  const groupId = String(uploadGroupId || "").trim();
  if (!groupId) return [];
  const { rows } = await query(
    `SELECT *
     FROM upload_batches
     WHERE upload_group_id = $1
     ORDER BY upload_group_part_index ASC, created_at ASC`,
    [groupId]
  );
  return rows;
}

async function listPendingUploadBatches() {
  const { rows } = await query(
    `SELECT *
     FROM upload_batches
     WHERE status IN ('staged','transferring','retrying')
     ORDER BY created_at ASC`
  );
  return rows;
}

async function createUploadBatchFiles(batchId, files = []) {
  const created = [];
  for (const file of files) {
    const { rows } = await query(
      `INSERT INTO upload_batch_files
         (batch_id, original_name, stored_name, staging_path, size_bytes, sha256, status, duplicate_of, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        String(batchId || ""),
        String(file.originalName || ""),
        String(file.storedName || ""),
        String(file.stagingPath || ""),
        Number(file.sizeBytes || 0),
        file.sha256 ? String(file.sha256) : null,
        String(file.status || "staged"),
        file.duplicateOf ? String(file.duplicateOf) : null,
        file.errorMessage ? String(file.errorMessage) : null,
      ]
    );
    if (rows[0]) created.push(rows[0]);
  }
  return created;
}

async function listUploadBatchFiles(batchId) {
  const { rows } = await query(
    `SELECT *
     FROM upload_batch_files
     WHERE batch_id = $1
     ORDER BY id ASC`,
    [String(batchId || "")]
  );
  return rows;
}

async function updateUploadBatchFile(fileId, fields) {
  const entries = Object.entries(fields || {});
  if (!entries.length) {
    const { rows } = await query(
      "SELECT * FROM upload_batch_files WHERE id = $1 LIMIT 1",
      [Number(fileId)]
    );
    return rows[0] || null;
  }
  const sets = [];
  const params = [];
  for (const [key, value] of entries) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  sets.push("updated_at = NOW()");
  params.push(Number(fileId));
  const { rows } = await query(
    `UPDATE upload_batch_files
     SET ${sets.join(", ")}
     WHERE id = $${params.length}
     RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function getMaxOrderNo() {
  const { rows } = await query("SELECT MAX(order_no) AS max FROM orders");
  return Number(rows[0]?.max || 0);
}

// ─── E-Mail-Verifikation ──────────────────────────────────────────────────────

async function createEmailVerificationToken({ customerId, tokenHash, expiresAt }) {
  // Alten Token löschen (falls vorhanden)
  await query("DELETE FROM customer_email_verifications WHERE customer_id = $1", [customerId]);
  await query(
    `INSERT INTO customer_email_verifications (customer_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [customerId, tokenHash, expiresAt]
  );
}

async function verifyEmailToken(tokenHash) {
  const { rows } = await query(
    `SELECT cev.customer_id
     FROM customer_email_verifications cev
     WHERE cev.token_hash = $1 AND cev.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows[0]) return null;
  const customerId = rows[0].customer_id;
  await query("UPDATE customers SET email_verified = TRUE, updated_at = NOW() WHERE id = $1", [customerId]);
  await query("DELETE FROM customer_email_verifications WHERE customer_id = $1", [customerId]);
  return customerId;
}

// ─── Passwort-Reset ───────────────────────────────────────────────────────────

async function createPasswordResetToken({ customerId, tokenHash, expiresAt }) {
  await query("DELETE FROM customer_password_resets WHERE customer_id = $1", [customerId]);
  await query(
    `INSERT INTO customer_password_resets (customer_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [customerId, tokenHash, expiresAt]
  );
}

async function verifyPasswordResetToken(tokenHash) {
  const { rows } = await query(
    `SELECT customer_id FROM customer_password_resets
     WHERE token_hash = $1 AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows[0]) return null;
  return rows[0].customer_id;
}

async function deletePasswordResetToken(customerId) {
  await query("DELETE FROM customer_password_resets WHERE customer_id = $1", [customerId]);
}

// ─── Fotografen-Einstellungen ─────────────────────────────────────────────────

async function getPhotographer(key) {
  const { rows } = await query(
    "SELECT key, name, email, phone, phone_mobile, whatsapp, initials, is_admin, bookable, photo_url FROM photographers WHERE key = $1",
    [String(key || "").toLowerCase()]
  );
  return rows[0] || null;
}

async function getPhotographerPhone(key) {
  if (!getPool()) return null;
  try {
    const { rows } = await query(
      "SELECT phone FROM photographers WHERE key = $1",
      [String(key || "").toLowerCase()]
    );
    const phone = rows[0]?.phone;
    return phone && String(phone).trim() ? String(phone).trim() : null;
  } catch (_) {
    return null;
  }
}

async function getPhotographerSettings(key) {
  const { rows } = await query(
    "SELECT * FROM photographer_settings WHERE photographer_key = $1",
    [String(key || "").toLowerCase()]
  );
  return rows[0] || null;
}

async function getAllPhotographerSettings({ includeInactive = false } = {}) {
  const whereClause = includeInactive ? "" : "WHERE p.active = TRUE";
  const [pCols, psCols] = await Promise.all([
    getRegclassColumnSet("photographers"),
    getRegclassColumnSet("photographer_settings"),
  ]);
  const pWanted = [
    "key",
    "name",
    "email",
    "phone",
    "phone_mobile",
    "whatsapp",
    "initials",
    "is_admin",
    "active",
    "bookable",
    "photo_url",
  ];
  const pParts = pWanted.filter((c) => pCols.has(c)).map((c) => `p.${c}`);
  if (!pParts.some((s) => s === "p.key")) {
    pParts.unshift("p.key");
  }
  const psWanted = [
    "home_address",
    "home_lat",
    "home_lon",
    "max_radius_km",
    "skills",
    "blocked_dates",
    "depart_times",
    "national_holidays",
    "work_start",
    "work_end",
    "workdays",
    "work_hours_by_day",
    "buffer_minutes",
    "slot_minutes",
    "languages",
    "native_language",
    "event_color",
  ];
  const psParts = psWanted.filter((c) => psCols.has(c)).map((c) => `ps.${c}`);
  if (psCols.has("updated_at")) {
    psParts.push("ps.updated_at AS settings_updated_at");
  }
  const selectList = [...pParts, ...psParts].join(",\n            ");
  const { rows } = await query(
    `SELECT ${selectList}
     FROM photographers p
     LEFT JOIN photographer_settings ps ON ps.photographer_key = p.key
     ${whereClause}
     ORDER BY p.key`
  );
  return rows;
}

async function upsertPhotographerSettings(key, settings) {
  const normKey = String(key || "").toLowerCase();
  const {
    home_address = "",
    home_lat = null,
    home_lon = null,
    max_radius_km = null,
    skills = {},
    blocked_dates = [],
    depart_times = {},
    work_start = null,
    work_end = null,
    workdays = null,
    work_hours_by_day = null,
    buffer_minutes = null,
    slot_minutes = null,
    national_holidays = true,
    languages = [],
    native_language = "de",
    event_color = "#3b82f6",
  } = settings;

  await query(
    `INSERT INTO photographer_settings
       (photographer_key, home_address, home_lat, home_lon, max_radius_km, skills, blocked_dates, depart_times, work_start, work_end, workdays, work_hours_by_day, buffer_minutes, slot_minutes, national_holidays, languages, native_language, event_color)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (photographer_key) DO UPDATE SET
       home_address      = EXCLUDED.home_address,
       home_lat          = EXCLUDED.home_lat,
       home_lon          = EXCLUDED.home_lon,
       max_radius_km     = EXCLUDED.max_radius_km,
       skills            = EXCLUDED.skills,
       blocked_dates     = EXCLUDED.blocked_dates,
       depart_times      = EXCLUDED.depart_times,
       work_start        = EXCLUDED.work_start,
       work_end          = EXCLUDED.work_end,
       workdays          = EXCLUDED.workdays,
       work_hours_by_day = EXCLUDED.work_hours_by_day,
       buffer_minutes    = EXCLUDED.buffer_minutes,
       slot_minutes      = EXCLUDED.slot_minutes,
       national_holidays = EXCLUDED.national_holidays,
       languages         = EXCLUDED.languages,
       native_language   = EXCLUDED.native_language,
       event_color       = EXCLUDED.event_color,
       updated_at        = NOW()`,
    [
      normKey,
      home_address,
      home_lat,
      home_lon,
      max_radius_km,
      JSON.stringify(skills),
      JSON.stringify(blocked_dates),
      JSON.stringify(depart_times),
      work_start,
      work_end,
      workdays ? JSON.stringify(workdays) : null,
      work_hours_by_day ? JSON.stringify(work_hours_by_day) : null,
      buffer_minutes,
      slot_minutes,
      national_holidays,
      JSON.stringify(languages),
      native_language,
      String(event_color || "#3b82f6"),
    ]
  );
}

async function upsertPhotographer({
  key,
  name,
  email,
  phone = "",
  phone_mobile = "",
  whatsapp = "",
  initials = "",
  is_admin = false,
}) {
  const normKey = String(key || "").toLowerCase();
  const phoneNorm = formatPhoneCH(phone) || String(phone || "").trim();
  const mobileNorm = formatPhoneCH(phone_mobile) || String(phone_mobile || "").trim();
  const wa = String(whatsapp || "").trim();
  const { rows } = await query(
    `INSERT INTO photographers (key, name, email, phone, phone_mobile, whatsapp, initials, is_admin)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (key) DO UPDATE SET
       name          = EXCLUDED.name,
       email         = EXCLUDED.email,
       phone         = EXCLUDED.phone,
       phone_mobile  = EXCLUDED.phone_mobile,
       whatsapp      = EXCLUDED.whatsapp,
       initials      = EXCLUDED.initials,
       is_admin      = EXCLUDED.is_admin
     RETURNING key`,
    [normKey, name || "", email || "", phoneNorm, mobileNorm, wa, initials || "", !!is_admin]
  );
  return rows[0]?.key || null;
}

async function setPhotographerAdminFlag(key, isAdmin) {
  await query(
    "UPDATE photographers SET is_admin = $1 WHERE key = $2",
    [!!isAdmin, String(key || "").toLowerCase()]
  );
}

async function updatePhotographerCore(key, { name, email, phone, phone_mobile, whatsapp, initials, bookable, photo_url, active }) {
  const normKey = String(key || "").toLowerCase();
  const col = await getRegclassColumnSet("photographers");
  const updates = [];
  const values = [];
  let i = 1;
  if (name !== undefined && col.has("name")) { updates.push(`name = $${i++}`); values.push(String(name || "")); }
  if (email !== undefined && col.has("email")) { updates.push(`email = $${i++}`); values.push(String(email || "")); }
  if (phone !== undefined && col.has("phone")) { updates.push(`phone = $${i++}`); values.push(phone == null ? "" : (formatPhoneCH(String(phone)) || String(phone).trim())); }
  if (phone_mobile !== undefined && col.has("phone_mobile")) {
    updates.push(`phone_mobile = $${i++}`);
    values.push(phone_mobile == null ? "" : (formatPhoneCH(String(phone_mobile)) || String(phone_mobile).trim()));
  }
  if (whatsapp !== undefined && col.has("whatsapp")) {
    updates.push(`whatsapp = $${i++}`);
    values.push(whatsapp == null ? "" : String(whatsapp).trim());
  }
  if (initials !== undefined && col.has("initials")) { updates.push(`initials = $${i++}`); values.push(String(initials || "")); }
  if (bookable !== undefined && col.has("bookable")) { updates.push(`bookable = $${i++}`); values.push(!!bookable); }
  if (active !== undefined && col.has("active")) { updates.push(`active = $${i++}`); values.push(!!active); }
  if (photo_url !== undefined && col.has("photo_url")) { updates.push(`photo_url = $${i++}`); values.push(String(photo_url == null ? "" : photo_url)); }
  if (updates.length === 0) return;
  values.push(normKey);
  await query(
    `UPDATE photographers SET ${updates.join(", ")} WHERE key = $${i}`,
    values
  );
}

async function deactivatePhotographer(key) {
  const normKey = String(key || "").toLowerCase();
  const { rowCount } = await query(
    "UPDATE photographers SET active = FALSE WHERE key = $1",
    [normKey]
  );
  return rowCount > 0;
}

async function reactivatePhotographer(key) {
  const normKey = String(key || "").toLowerCase();
  const { rowCount } = await query(
    "UPDATE photographers SET active = TRUE WHERE key = $1",
    [normKey]
  );
  return rowCount > 0;
}

// ─── Exxas-Status ─────────────────────────────────────────────────────────────

async function setExxasOrderId(orderNo, exxasOrderId) {
  await updateOrderFields(orderNo, {
    exxas_order_id: exxasOrderId,
    exxas_status: "sent",
    exxas_error: null,
  });
}

async function setExxasError(orderNo, errorMsg) {
  await updateOrderFields(orderNo, {
    exxas_status: "error",
    exxas_error: errorMsg,
  });
}

async function setCustomerExxasContactId(email, contactId) {
  await query(
    "UPDATE customers SET exxas_contact_id = $1, updated_at = NOW() WHERE email = $2",
    [contactId, (email || "").toLowerCase().trim()]
  );
}

// ─── Hilfsfunktion: DB-Zeile → Record-Objekt ─────────────────────────────────

function dbRowToRecord(row) {
  return normalizeTextDeep({
    orderNo: row.order_no,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    doneAt: row.done_at,
    status: row.status,
    address: row.address,
    object: row.object,
    services: row.services,
    photographer: row.photographer,
    schedule: row.schedule,
    billing: row.billing,
    pricing: row.pricing,
    settingsSnapshot: row.settings_snapshot || {},
    discount: row.discount,
    keyPickup: row.key_pickup,
    icsUid: row.ics_uid,
    photographerEventId: row.photographer_event_id,
    officeEventId: row.office_event_id,
    exxasOrderId: row.exxas_order_id,
    exxasStatus: row.exxas_status,
    exxasError: row.exxas_error,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerStreet: row.customer_street,
    customerZipcity: row.customer_zipcity,
    customerContactName: row.customer_contact_name,
    customerContactEmail: row.customer_contact_email,
    customerContactPhone: row.customer_contact_phone,
    exxasContactId: row.exxas_contact_id,
    customerNasCustomerFolderBase: row.customer_nas_customer_folder_base || null,
    customerNasRawFolderBase: row.customer_nas_raw_folder_base || null,
    confirmationToken: row.confirmation_token || null,
    confirmationTokenExpiresAt: row.confirmation_token_expires_at || null,
    confirmationPendingSince: row.confirmation_pending_since || null,
    attendeeEmails: row.attendee_emails || null,
    onsiteEmail: row.onsite_email || null,
    onsiteContacts: Array.isArray(row.onsite_contacts)
      ? row.onsite_contacts
      : (row.onsite_contacts && typeof row.onsite_contacts === "object" ? row.onsite_contacts : []),
    createdByMemberId: row.created_by_member_id != null ? Number(row.created_by_member_id) : null,
    provisionalBookedAt: row.provisional_booked_at || null,
    provisionalExpiresAt: row.provisional_expires_at || null,
    lastRescheduleOldDate: row.last_reschedule_old_date || null,
    lastRescheduleOldTime: row.last_reschedule_old_time || null,
  });
}

module.exports = {
  getPool,
  closePool,
  query,
  initSchema,
  runMigrations,
  upsertCustomer,
  getCustomerByEmail,
  getCustomerByAuthSub,
  updateCustomerAuthSub,
  createCustomer,
  setCustomerPasswordHash,
  setCustomerPasswordById,
  ensureCompanyByName,
  findCompanyByName,
  mapCustomerContactRoleToCompanyMemberRole,
  findCompanyMemberByCompanyAndEmail,
  createCompanyWithMeta,
  syncCompaniesLinkedToBillingCustomer,
  listCompanies,
  listCompaniesWithAdminData,
  getCompanyById,
  getCompanyMemberForIdentity,
  listCompanyMembers,
  upsertCompanyMember,
  updateCompanyMemberRole,
  updateCompanyMemberStatus,
  createCompanyInvitation,
  listCompanyInvitations,
  getPendingCompanyInvitationByEmail,
  getCompanyInvitationByToken,
  acceptCompanyInvitation,
  listCompanyOrders,
  listCompanyCustomers,
  syncCompaniesFromCustomersAndContacts,
  logAuthAudit,
  bootstrapCompaniesFromCustomers,
  createAdminSession,
  getAdminSessionByTokenHash,
  deleteAdminSessionByTokenHash,
  getAdminUserByUsername,
  getAdminUserById,
  bootstrapAdminUserFromEnvIfMissing,
  createCustomerSession,
  getCustomerBySessionTokenHash,
  deleteCustomerSessionByTokenHash,
  getOrdersForCustomerEmail,
  getOrdersForCustomerId,
  createEmailVerificationToken,
  verifyEmailToken,
  createPasswordResetToken,
  verifyPasswordResetToken,
  deletePasswordResetToken,
  getPhotographer,
  getPhotographerPhone,
  getPhotographerSettings,
  getAllPhotographerSettings,
  upsertPhotographerSettings,
  upsertPhotographer,
  setPhotographerAdminFlag,
  getRegclassColumnSet,
  updatePhotographerCore,
  deactivatePhotographer,
  reactivatePhotographer,
  insertOrder,
  getOrders,
  getOrderByNo,
  updateCustomerNasStorageBases,
  updateOrderFields,
  listOrderFolderLinks,
  getOrderFolderLink,
  upsertOrderFolderLink,
  archiveOrderFolderLink,
  createUploadBatch,
  updateUploadBatch,
  getUploadBatch,
  listUploadBatches,
  listUploadBatchesByGroupId,
  listPendingUploadBatches,
  createUploadBatchFiles,
  listUploadBatchFiles,
  updateUploadBatchFile,
  getMaxOrderNo,
  setExxasOrderId,
  setExxasError,
  setCustomerExxasContactId,
  ensureProductCatalogSeeded,
  listServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
  listProductsWithRules,
  getProductById,
  getProductByCode,
  createProduct,
  updateProduct,
  setProductActive,
  getAllAppSettings,
  getAppSetting,
  setAppSetting,
  upsertAppSettings,
  listDiscountCodes,
  getDiscountCodeByCode,
  getDiscountCodeById,
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
  getDiscountCodeUsageCount,
  listDiscountCodeUsages,
  markDiscountCodeUsed,
  dbRowToRecord,
};
