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

// ── Szenario 8: isSameOrderFolderPath ─────────────────────────────────────
test("isSameOrderFolderPath: gleiche Pfade, unterschiedliche Normalisierung", () => {
  const { mod, restore } = loadOrderStorage();
  try {
    const a = path.join("x", "y", "z");
    const b = path.resolve(a);
    assert.equal(mod.isSameOrderFolderPath(a, b), true);
    assert.equal(mod.isSameOrderFolderPath(null, b), false);
  } finally {
    restore();
  }
});

// ── Szenario 9: provisionOrderFolders überspringt bei linked+anderem Pfad ─
test("provisionOrderFolders: überspringt Anlage wenn linked und nicht am kanonischen Ziel", async () => {
  const customerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ost-prov-"));
  const rawRoot = path.join(customerRoot, "_raw");
  const linkedElsewhere = path.join(customerRoot, "linked-elsewhere");
  fs.mkdirSync(linkedElsewhere, { recursive: true });
  const { mod, restore } = loadOrderStorage({
    BOOKING_UPLOAD_CUSTOMER_ROOT: customerRoot,
    BOOKING_UPLOAD_RAW_ROOT: rawRoot,
  });
  try {
    const order = {
      orderNo: 100,
      customerId: 215,
      address: "Bahnhofstrasse 1",
      customerCompany: "Beseder Immobilien",
      customerZipcity: "8000 Zug",
      billing: {},
    };
    const defs = mod.buildFolderDefinitions(order);
    const expectedCanonical = defs.customer_folder.absolutePath;
    let upsertCount = 0;
    const db = {
      getOrderFolderLink: async (_orderNo, folderType) => {
        if (folderType === "customer_folder") {
          return { status: "linked", absolute_path: linkedElsewhere, folder_type: "customer_folder" };
        }
        return null;
      },
      upsertOrderFolderLink: async () => {
        upsertCount += 1;
        return { status: "linked" };
      },
    };
    const out = await mod.provisionOrderFolders(order, db, { folderTypes: ["customer_folder"], createMissing: true });
    assert.equal(upsertCount, 0, "upsert darf bei Skip nicht aufgerufen werden");
    assert.equal(out.customer_folder?.absolute_path, linkedElsewhere);
    assert.equal(fs.existsSync(expectedCanonical), false, "kanonischer Platzhalterpfad darf nicht angelegt werden");
  } finally {
    restore();
    fs.rmSync(customerRoot, { recursive: true, force: true });
  }
});

// ── Szenario 10: provisionOrderFolders legt kanonische Struktur an ─────────
test("provisionOrderFolders: legt Kundenstruktur an wenn kein linked-Eintrag", async () => {
  const customerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ost-prov2-"));
  const rawRoot = path.join(customerRoot, "_raw");
  const { mod, restore } = loadOrderStorage({
    BOOKING_UPLOAD_CUSTOMER_ROOT: customerRoot,
    BOOKING_UPLOAD_RAW_ROOT: rawRoot,
  });
  try {
    const order = {
      orderNo: 101,
      customerId: 215,
      address: "Bahnhofstrasse 1",
      customerCompany: "Beseder Immobilien",
      customerZipcity: "8000 Zug",
      billing: {},
    };
    const defs = mod.buildFolderDefinitions(order);
    const expectedCanonical = defs.customer_folder.absolutePath;
    const db = {
      getOrderFolderLink: async () => null,
      upsertOrderFolderLink: async (row) => row,
    };
    await mod.provisionOrderFolders(order, db, { folderTypes: ["customer_folder"], createMissing: true });
    const websize = path.join(expectedCanonical, "Finale", "Bilder", "websize");
    assert.ok(fs.existsSync(websize), "kanonische websize-Unterstruktur muss existieren: " + websize);
  } finally {
    restore();
    fs.rmSync(customerRoot, { recursive: true, force: true });
  }
});

// ── Szenario 11: ensureDirStructure legt websize nicht an wenn WEB SIZE existiert
test("ensureDirStructure: kein zweiter websize-Ordner wenn WEB SIZE bereits existiert", () => {
  const customerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ost-ensuredir-"));
  const { mod, restore } = loadOrderStorage({
    BOOKING_UPLOAD_CUSTOMER_ROOT: customerRoot,
    BOOKING_UPLOAD_RAW_ROOT: path.join(customerRoot, "_raw"),
  });
  try {
    const orderRoot = path.join(customerRoot, "TestKunde #1", "8000 Zug, Teststrasse #99");
    // Alias-Ordner "WEB SIZE" manuell anlegen (Legacy-Name)
    const webSizeDir = path.join(orderRoot, "Finale", "Bilder", "WEB SIZE");
    fs.mkdirSync(webSizeDir, { recursive: true });

    mod.ensureDirStructure(orderRoot, mod.CUSTOMER_UPLOAD_STRUCTURE);

    const websize = path.join(orderRoot, "Finale", "Bilder", "websize");
    assert.equal(
      fs.existsSync(websize),
      false,
      "websize darf nicht angelegt werden wenn WEB SIZE bereits existiert"
    );
    assert.ok(
      fs.existsSync(webSizeDir),
      "WEB SIZE muss noch vorhanden sein"
    );
  } finally {
    restore();
    fs.rmSync(customerRoot, { recursive: true, force: true });
  }
});

// ── Szenario 12: ensureDirStructure legt websize an wenn kein Alias existiert
test("ensureDirStructure: legt websize an wenn kein Alias-Ordner vorhanden ist", () => {
  const customerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ost-ensuredir2-"));
  const { mod, restore } = loadOrderStorage({
    BOOKING_UPLOAD_CUSTOMER_ROOT: customerRoot,
    BOOKING_UPLOAD_RAW_ROOT: path.join(customerRoot, "_raw"),
  });
  try {
    const orderRoot = path.join(customerRoot, "TestKunde #2", "8000 Zug, Teststrasse #100");
    fs.mkdirSync(orderRoot, { recursive: true });

    mod.ensureDirStructure(orderRoot, mod.CUSTOMER_UPLOAD_STRUCTURE);

    const websize = path.join(orderRoot, "Finale", "Bilder", "websize");
    assert.ok(fs.existsSync(websize), "websize muss angelegt werden wenn kein Alias existiert");
  } finally {
    restore();
    fs.rmSync(customerRoot, { recursive: true, force: true });
  }
});
