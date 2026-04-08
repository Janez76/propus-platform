const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MODULE_PATH = path.join(__dirname, "..", "order-storage.js");
const DEFAULT_STAGING = path.join(os.tmpdir(), "buchungstool-upload-staging");

function loadOrderStorage(envOverrides = {}) {
  const previous = {};
  for (const [key, value] of Object.entries(envOverrides)) {
    previous[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = String(value);
  }
  delete require.cache[require.resolve(MODULE_PATH)];
  const mod = require(MODULE_PATH);
  return {
    mod,
    restore() {
      delete require.cache[require.resolve(MODULE_PATH)];
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

// ── Szenario 1: kein Env-Var gesetzt → tmpdir ─────────────────────────────
test("ensureLocalStagingRoot uses tmpdir when BOOKING_UPLOAD_STAGING_ROOT is unset", () => {
  const { mod, restore } = loadOrderStorage({ BOOKING_UPLOAD_STAGING_ROOT: null });
  try {
    const resolved = mod.ensureLocalStagingRoot();
    assert.equal(resolved, path.resolve(DEFAULT_STAGING));
    assert.ok(fs.existsSync(resolved), "Verzeichnis muss existieren");
    assert.ok(fs.statSync(resolved).isDirectory(), "Muss ein Verzeichnis sein");
  } finally {
    restore();
  }
});

// ── Szenario 2: konfigurierter Pfad ist beschreibbar → diesen verwenden ───
test("ensureLocalStagingRoot keeps configured path when it is writable", () => {
  const configuredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ost-writable-"));
  const { mod, restore } = loadOrderStorage({ BOOKING_UPLOAD_STAGING_ROOT: configuredRoot });
  try {
    const resolved = mod.ensureLocalStagingRoot();
    assert.equal(resolved, path.resolve(configuredRoot));
  } finally {
    restore();
    fs.rmSync(configuredRoot, { recursive: true, force: true });
  }
});

// ── Szenario 3: konfigurierter Pfad ist eine Datei, kein Verzeichnis → Fallback ─
test("ensureLocalStagingRoot falls back to tmpdir when configured path is a file", () => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "ost-file-"));
  const filePath = path.join(tempBase, "not-a-dir");
  fs.writeFileSync(filePath, "x", "utf8");

  const { mod, restore } = loadOrderStorage({ BOOKING_UPLOAD_STAGING_ROOT: filePath });
  try {
    const resolved = mod.ensureLocalStagingRoot();
    assert.equal(resolved, path.resolve(DEFAULT_STAGING));
  } finally {
    restore();
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
});

// ── Szenario 4: createStagingBatchDir legt Batch-Verzeichnis korrekt an ──
test("createStagingBatchDir creates a writable subdirectory under staging root", () => {
  const configuredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ost-batch-"));
  const { mod, restore } = loadOrderStorage({ BOOKING_UPLOAD_STAGING_ROOT: configuredRoot });
  try {
    const batchDir = mod.createStagingBatchDir("upl_42_1700000000_abcd");
    assert.equal(path.dirname(batchDir), path.resolve(configuredRoot));
    assert.ok(fs.existsSync(batchDir), "Batch-Verzeichnis muss existieren");
    assert.ok(fs.statSync(batchDir).isDirectory());

    // Schreiben in das erstellte Verzeichnis muss funktionieren
    const testFile = path.join(batchDir, "test.txt");
    fs.writeFileSync(testFile, "ok", "utf8");
    assert.equal(fs.readFileSync(testFile, "utf8"), "ok");
  } finally {
    restore();
    fs.rmSync(configuredRoot, { recursive: true, force: true });
  }
});

// ── Szenario 5: Fallback-Pfad wird bei ungültigem Pfad korrekt durchlaufen ─
test("createStagingBatchDir falls back to tmpdir and creates batch dir when configured path fails", () => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "ost-fb-"));
  const filePath = path.join(tempBase, "not-a-dir");
  fs.writeFileSync(filePath, "x", "utf8");

  const { mod, restore } = loadOrderStorage({ BOOKING_UPLOAD_STAGING_ROOT: filePath });
  try {
    const batchDir = mod.createStagingBatchDir("upl_fallback_test");
    assert.equal(path.dirname(batchDir), path.resolve(DEFAULT_STAGING));
    assert.ok(fs.existsSync(batchDir));
    assert.ok(fs.statSync(batchDir).isDirectory());
  } finally {
    restore();
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
});

// ── Szenario 6: getStorageRoots() wirft nie, auch bei kaputtem Staging-Pfad ─
test("getStorageRoots does not throw when configured staging path is invalid", () => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "ost-roots-"));
  const filePath = path.join(tempBase, "not-a-dir");
  fs.writeFileSync(filePath, "x", "utf8");

  const { mod, restore } = loadOrderStorage({ BOOKING_UPLOAD_STAGING_ROOT: filePath });
  try {
    let roots;
    assert.doesNotThrow(() => { roots = mod.getStorageRoots(); });
    assert.ok(typeof roots.stagingRoot === "string", "stagingRoot muss ein String sein");
    assert.ok(roots.stagingRoot.length > 0, "stagingRoot darf nicht leer sein");
  } finally {
    restore();
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
});

// ── Szenario 7: getStorageHealth() wirft nie ──────────────────────────────
test("getStorageHealth does not throw when configured staging path is invalid", () => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "ost-health-"));
  const filePath = path.join(tempBase, "not-a-dir");
  fs.writeFileSync(filePath, "x", "utf8");

  const { mod, restore } = loadOrderStorage({ BOOKING_UPLOAD_STAGING_ROOT: filePath });
  try {
    let health;
    assert.doesNotThrow(() => { health = mod.getStorageHealth(); });
    assert.ok(Array.isArray(health), "health muss ein Array sein");
    const stagingEntry = health.find((h) => h.key === "stagingRoot");
    assert.ok(stagingEntry, "stagingRoot-Eintrag muss vorhanden sein");
  } finally {
    restore();
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
});
