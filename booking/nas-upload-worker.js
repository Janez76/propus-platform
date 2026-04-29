/**
 * NAS-seitiger Upload-Worker: claimt Batches in Postgres und zieht Dateien per rsync
 * vom VPS-Staging auf lokale NAS-Pfade (schnell, kein CIFS-Push vom VPS).
 *
 * Erforderliche Env (NAS):
 * - DATABASE_URL (Postgres erreichbar vom NAS, ggf. SSH-Tunnel)
 * - NAS_BOOKING_UPLOAD_RAW_ROOT, NAS_BOOKING_UPLOAD_CUSTOMER_ROOT
 * - NAS_VPS_SSH_HOST (z. B. root@87.106.24.107)
 * - NAS_VPS_STAGING_HOST_PATH (default /opt/propus-upload-staging)
 *
 * VPS (.env.vps):
 * - UPLOAD_TRANSFER_BACKEND=nas_pull
 * - UPLOAD_WORKER_ENABLED=false
 */
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
const { transferBatchNasPull } = require("./nas-pull-transfer");

async function runNasPullWorkerOnce(dbMod, deps = {}) {
  if (!dbMod || typeof dbMod.claimNextUploadBatch !== "function") {
    throw new Error("NAS-Worker benötigt db.claimNextUploadBatch");
  }
  const workerId = String(
    deps.workerId || process.env.NAS_UPLOAD_WORKER_ID || process.env.UPLOAD_WORKER_ID || `nas-upload-worker:${process.pid}`
  );
  const batch = await dbMod.claimNextUploadBatch(workerId);
  if (!batch?.id) return null;
  await transferBatchNasPull(dbMod, batch.id, deps);
  return String(batch.id);
}

async function runNasPullUploadWorker(dbMod, deps = {}) {
  const pollMs = Math.max(250, Number(process.env.NAS_UPLOAD_WORKER_POLL_MS || process.env.UPLOAD_WORKER_POLL_MS || 1000));
  const workerId = String(
    deps.workerId || process.env.NAS_UPLOAD_WORKER_ID || process.env.UPLOAD_WORKER_ID || `nas-upload-worker:${process.pid}`
  );
  console.log("[nas-upload-worker] started", JSON.stringify({ workerId, pollMs }));
  while (true) {
    try {
      const batchId = await runNasPullWorkerOnce(dbMod, { ...deps, workerId });
      if (!batchId) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    } catch (error) {
      console.warn("[nas-upload-worker] iteration failed", error?.message || error);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL fehlt - NAS-Upload-Worker kann keine Batches claimen");
  }

  if (typeof db.resetInterruptedUploadBatches === "function") {
    const reset = await db.resetInterruptedUploadBatches();
    if (reset.length > 0) {
      console.log("[nas-upload-worker] reset interrupted transfers", { count: reset.length });
    }
  }

  await runNasPullUploadWorker(db, {
    workerId: process.env.NAS_UPLOAD_WORKER_ID || process.env.UPLOAD_WORKER_ID || `nas-upload-worker:${process.pid}`,
    loadOrder: async (orderNo) => db.getOrderByNo(orderNo),
    notifyCompleted: async ({ order, batch, storedCount, skippedCount, invalidCount }) => {
      console.log("[nas-upload-worker] completed", {
        orderNo: order?.orderNo,
        batchId: batch?.id,
        storedCount,
        skippedCount,
        invalidCount,
      });
    },
    env: process.env,
  });
}

main().catch((error) => {
  console.error("[nas-upload-worker] fatal", error?.message || error);
  process.exit(1);
});

module.exports = {
  runNasPullWorkerOnce,
  runNasPullUploadWorker,
};
