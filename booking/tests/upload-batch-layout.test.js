const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const MODULE_PATH = path.join(__dirname, "..", "upload-batch-service.js");

function loadModule(envOverrides = {}) {
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

test("computeUploadBatchTargetLayout new_batch without batch_folder needs unique dir", () => {
  const { mod, restore } = loadModule();
  try {
    const batch = {
      category: "raw_bilder",
      upload_mode: "new_batch",
      batch_folder: null,
      custom_folder_name: null,
    };
    const folderLink = { absolute_path: "/booking_upload_raw/1001 Order" };
    const layout = mod.computeUploadBatchTargetLayout(batch, folderLink);
    assert.equal(layout.needsUniqueBatchDir, true);
    assert.equal(layout.targetDir, null);
  } finally {
    restore();
  }
});

test("computeUploadBatchTargetLayout existing mode uses category only", () => {
  const { mod, restore } = loadModule();
  try {
    const batch = {
      category: "raw_bilder",
      upload_mode: "existing",
      batch_folder: null,
      custom_folder_name: null,
    };
    const folderLink = { absolute_path: "/booking_upload_raw/1001 Order" };
    const layout = mod.computeUploadBatchTargetLayout(batch, folderLink);
    assert.equal(layout.needsUniqueBatchDir, false);
    assert.ok(layout.targetDir.includes("Unbearbeitete"));
  } finally {
    restore();
  }
});
