/**
 * Migration: orders.json → PostgreSQL
 * Wird beim Backend-Start automatisch ausgeführt.
 * Ist idempotent – bereits migrierte Bestellungen werden übersprungen.
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const envLocalPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
dotenv.config();
const logger = require("./logger");
const console = logger.createModuleConsole();

const db = require("./db");
const PHOTOGRAPHERS_CONFIG = require("./photographers.config.js");
const { DEFAULT_APP_SETTINGS, LEGACY_DISCOUNT_FALLBACK } = require("./settings-defaults");
const { seedDefaultSettings } = require("./settings");

async function run() {
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl) {
    console.log("[migrate] DATABASE_URL not set – skipping migration");
    return;
  }

  // Schema erstellen (idempotent via IF NOT EXISTS)
  await db.initSchema();

  // Versionierte Migrations aus backend/migrations/ ausführen (idempotent)
  if (db.runMigrations) {
    await db.runMigrations();
  }

  const boot = await db.bootstrapAdminUserFromEnvIfMissing();
  if (boot?.created) {
    console.log("[migrate] admin_users Bootstrap:", boot.username, "(ADMIN_USER/ADMIN_PASS)");
  } else if (boot?.updated) {
    console.log("[migrate] admin_users Stammdaten aktualisiert:", boot.username, "(ADMIN_USER/ADMIN_EMAIL/ADMIN_NAME/ADMIN_ROLE)");
  } else if (boot?.skipped && boot.reason) {
    console.log("[migrate] admin_users Bootstrap uebersprungen:", boot.reason, boot.username || "");
  }

  // Globale App-Settings defaults seeden (nur fehlende Keys, manuelle Werte bleiben erhalten)
  const seedResult = await seedDefaultSettings();
  console.log(`[migrate] app_settings seeded missing defaults (${seedResult.inserted})`);

  const rbac = require("./access-rbac");
  try {
    const s = await rbac.seedRbacIfNeeded();
    if (s.seeded) console.log("[migrate] RBAC permission catalogue seeded");
    const sync = await rbac.syncAllLegacySubjects();
    if (sync.ok) console.log("[migrate] RBAC legacy subjects synchronisiert");
  } catch (e) {
    console.warn("[migrate] RBAC sync:", e?.message || e);
  }

  // Legacy Discount als fallback seeden, falls noch keine Codes vorhanden
  const existingCodes = await db.listDiscountCodes({ includeInactive: true });
  if (!existingCodes.length) {
    await db.createDiscountCode(LEGACY_DISCOUNT_FALLBACK);
    console.log("[migrate] legacy discount seeded (PROPUS10)");
  }

  // Fotografen aus Config einfügen (nur neue Keys; bestehende behalten ihre DB-Werte)
  // WICHTIG: DO NOTHING verhindert, dass manuell geänderte Telefonnummern/etc. bei jedem Neustart überschrieben werden
  for (const p of PHOTOGRAPHERS_CONFIG) {
    if (!p?.key) continue;
    await db.query(
      `INSERT INTO photographers (key, name, email, phone, initials)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO NOTHING`,
      [p.key, p.name || "", p.email || "", p.phone || "", p.initials || ""]
    );
  }
  console.log("[migrate] photographers synced (new keys only; existing preserved)");

  // Fotografen-Einstellungen (Skills, Startpunkte) – idempotent via ON CONFLICT
  const photographerSettingsDefaults = [
    {
      key: "janez",
      // Startpunkt: Zürich-Zentrum als Fallback (kein spezifischer Wohnort bekannt)
      home_address: "8001 Zürich",
      home_lat: 47.3769,
      home_lon: 8.5417,
      max_radius_km: null,
      skills: { foto: 10, matterport: 10, drohne_foto: 10, drohne_video: 10, video: 5 },
      blocked_dates: [],
      national_holidays: true,
    },
    {
      key: "ivan",
      home_address: "8001 Zürich",
      home_lat: 47.3769,
      home_lon: 8.5417,
      max_radius_km: null,
      // Matterport ab 300m² = 5 (wird im resolver dynamisch berechnet)
      skills: { foto: 10, matterport: 10, drohne_foto: 10, drohne_video: 0, video: 0 },
      blocked_dates: [],
      national_holidays: true,
    },
    {
      key: "maher",
      home_address: "8906 Bonstetten",
      home_lat: 47.3297,
      home_lon: 8.4619,
      max_radius_km: 30,
      skills: { foto: 7, matterport: 10, drohne_foto: 10, drohne_video: 10, video: 10 },
      blocked_dates: [],
      national_holidays: true,
    },
  ];

  for (const s of photographerSettingsDefaults) {
    // Nur einfügen wenn noch nicht vorhanden (DO NOTHING um manuelle Anpassungen zu erhalten)
    await db.query(
      `INSERT INTO photographer_settings
         (photographer_key, home_address, home_lat, home_lon, max_radius_km, skills, blocked_dates, national_holidays)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (photographer_key) DO NOTHING`,
      [
        s.key,
        s.home_address,
        s.home_lat,
        s.home_lon,
        s.max_radius_km,
        JSON.stringify(s.skills),
        JSON.stringify(s.blocked_dates),
        s.national_holidays,
      ]
    );
  }
  console.log("[migrate] photographer_settings seeded (skipped if already exist)");

  // orders.json migrieren
  const ordersFile = process.env.ORDERS_FILE || path.join(__dirname, "orders.json");
  if (!fs.existsSync(ordersFile)) {
    console.log("[migrate] no orders.json found – nothing to migrate");
    return;
  }

  let jsonOrders = [];
  try {
    jsonOrders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    if (!Array.isArray(jsonOrders)) jsonOrders = [];
  } catch (e) {
    console.warn("[migrate] could not parse orders.json:", e.message);
    return;
  }

  if (jsonOrders.length === 0) {
    console.log("[migrate] orders.json is empty – nothing to migrate");
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const record of jsonOrders) {
    if (!record?.orderNo) continue;

    // Prüfen ob bereits in DB
    const existing = await db.getOrderByNo(record.orderNo);
    if (existing) {
      skipped++;
      continue;
    }

    // Kunde anlegen/upserten
    const customerId = record.billing?.email
      ? await db.upsertCustomer(record.billing)
      : null;

    // Bestellung einfügen
    await db.insertOrder(record, customerId);
    migrated++;
  }

  console.log(`[migrate] done – migrated: ${migrated}, skipped (already in DB): ${skipped}`);
}

(async () => {
  try {
    await run();
  } catch (err) {
    console.error("[migrate] FATAL:", err.message);
    // Kein process.exit(1): Folgekommando (z. B. server.js) soll bei Bedarf trotzdem starten
  } finally {
    try {
      await db.closePool();
    } catch (_) {
      /* ignore */
    }
  }
})();
