const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const MODULE_PATH = path.join(__dirname, "..", "upload-batch-service.js");

function loadUploadBatchService(envOverrides = {}) {
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

test("shouldVerifyTargetHash keeps strict verification when explicitly enabled", () => {
  const { mod, restore } = loadUploadBatchService({
    UPLOAD_STRICT_HASH_VERIFY: "true",
    UPLOAD_HASH_VERIFY_MAX_MB: "100",
  });
  try {
    assert.equal(mod.shouldVerifyTargetHash(1024 * 1024 * 500), true);
  } finally {
    restore();
  }
});

test("shouldVerifyTargetHash skips large files when strict verification is disabled", () => {
  const { mod, restore } = loadUploadBatchService({
    UPLOAD_STRICT_HASH_VERIFY: "false",
    UPLOAD_HASH_VERIFY_MAX_MB: "100",
  });
  try {
    assert.equal(mod.shouldVerifyTargetHash(1024 * 1024 * 99), true);
    assert.equal(mod.shouldVerifyTargetHash(1024 * 1024 * 100), true);
    assert.equal(mod.shouldVerifyTargetHash(1024 * 1024 * 101), false);
  } finally {
    restore();
  }
});

test("runWorkerTransferOnce claims exactly one pending batch before transferring", async () => {
  const { mod, restore } = loadUploadBatchService();
  const calls = [];
  const db = {
    claimNextUploadBatch: async (workerId) => {
      calls.push(["claim", workerId]);
      return { id: "upl_test", order_no: 42 };
    },
    getUploadBatch: async (batchId) => {
      calls.push(["get", batchId]);
      return null;
    },
    updateUploadBatch: async (batchId, fields) => {
      calls.push(["update", batchId, fields.status]);
      return { id: batchId, ...fields };
    },
  };
  try {
    const result = await mod.runWorkerTransferOnce(db, {
      workerId: "worker-a",
      loadOrder: async () => null,
    });
    assert.equal(result, "upl_test");
    assert.deepEqual(calls[0], ["claim", "worker-a"]);
    assert.deepEqual(calls[1], ["get", "upl_test"]);
  } finally {
    restore();
  }
});
