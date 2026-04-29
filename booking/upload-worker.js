const dotenv = require("dotenv");
const path = require("path");

function loadOptionalEnvFile(envPath) {
  try {
    dotenv.config({ path: envPath, override: true });
  } catch (_) {}
}

[
  path.join(__dirname, ".env.local"),
  path.join(__dirname, "..", ".env.local"),
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", ".env.vps.secrets"),
  path.join(__dirname, "..", ".env.vps"),
].forEach(loadOptionalEnvFile);

const db = require("./db");
const { runUploadWorker } = require("./upload-batch-service");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL fehlt - Upload-Worker kann keine Batches claimen");
  }

  if (typeof db.resetInterruptedUploadBatches === "function") {
    const reset = await db.resetInterruptedUploadBatches();
    if (reset.length > 0) {
      console.log("[upload-worker] reset interrupted transfers", { count: reset.length });
    }
  }

  await runUploadWorker(db, {
    workerId: process.env.UPLOAD_WORKER_ID || `upload-worker:${process.pid}`,
    loadOrder: async (orderNo) => db.getOrderByNo(orderNo),
    notifyCompleted: async ({ order, batch, storedCount, skippedCount, invalidCount }) => {
      console.log("[upload-worker] completed", {
        orderNo: order?.orderNo,
        batchId: batch?.id,
        storedCount,
        skippedCount,
        invalidCount,
      });
    },
  });
}

main().catch((error) => {
  console.error("[upload-worker] fatal", error?.message || error);
  process.exit(1);
});
