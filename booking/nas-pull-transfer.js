const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");
const {
  materializeUploadBatchTargetDirs,
  shouldVerifyTargetHash,
  sha256FileAsync,
  toBatchDto,
} = require("./upload-batch-service");
const {
  sanitizeUploadFilename,
  checkUploadExtension,
  writeCommentFile,
} = require("./order-storage");
const {
  mapBookingContainerPathToNas,
  mapContainerStagingToVpsHostPath,
  buildRsyncRemoteSource,
  mapNasLocalPathToContainer,
} = require("./nas-path-map");

const MB = 1024 * 1024;

function log(msg, data = {}) {
  const prefix = "[nas-pull-transfer]";
  if (Object.keys(data).length) console.log(`${prefix} ${msg}`, JSON.stringify(data));
  else console.log(`${prefix} ${msg}`);
}

function logWarn(msg, err) {
  console.warn("[nas-pull-transfer]", msg, err?.message || err);
}

function mbPerSec(bytes, ms) {
  const seconds = Number(ms || 0) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const mb = Number(bytes || 0) / MB;
  return Number.isFinite(mb) ? Number((mb / seconds).toFixed(2)) : null;
}

function runProcessCapture(cmd, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    p.stdout.on("data", (c) => {
      stdout += String(c);
    });
    p.stderr.on("data", (c) => {
      stderr += String(c);
    });
    p.on("error", reject);
    p.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * rsync Pull: remote (VPS Host) → lokaler NAS-Pfad
 */
async function rsyncPullFile(remoteSpec, localDest, env) {
  const sshHost = String(env.NAS_VPS_SSH_HOST || "").trim();
  if (!sshHost) throw new Error("NAS_VPS_SSH_HOST fehlt");
  const args = [
    "-a",
    "--whole-file",
    "--partial",
    "--inplace",
    "--info=progress2",
    "-e",
    `ssh -o BatchMode=yes -o ConnectTimeout=30`,
    remoteSpec,
    localDest,
  ];
  const { code, stderr } = await runProcessCapture("rsync", args, { env });
  if (code !== 0) {
    throw new Error(`rsync fehlgeschlagen (exit ${code}): ${stderr.slice(-2000)}`);
  }
}

async function sshRemovePath(remotePath, env) {
  const sshHost = String(env.NAS_VPS_SSH_HOST || "").trim();
  if (!sshHost) throw new Error("NAS_VPS_SSH_HOST fehlt");
  const { code, stderr } = await runProcessCapture("ssh", [
    sshHost,
    "rm",
    "-rf",
    remotePath,
  ]);
  if (code !== 0) {
    logWarn(`ssh rm fehlgeschlagen (${code})`, stderr);
  }
}

/**
 * @param {*} db booking db
 * @param {string} batchId
 * @param {{ loadOrder: Function, notifyCompleted?: Function, env?: object }} deps
 */
async function transferBatchNasPull(db, batchId, deps = {}) {
  const env = deps.env || process.env;
  const transferStart = Date.now();
  let batch = await db.getUploadBatch(batchId);
  if (!batch) return;

  batch = await db.updateUploadBatch(batchId, {
    status: batch.status === "retrying" ? "retrying" : "transferring",
    started_at: batch.started_at || new Date().toISOString(),
    error_message: null,
  });

  try {
  const order = await deps.loadOrder(Number(batch.order_no));
  if (!order) throw new Error(`Auftrag ${batch.order_no} nicht gefunden`);

  const folderType = String(batch.folder_type || "customer_folder");
  const folderLinkRow = await db.getOrderFolderLink(order.orderNo, folderType);
  if (!folderLinkRow) throw new Error(`Kein Zielordner für ${folderType} vorhanden`);

  const folderLinkNas = {
    ...folderLinkRow,
    absolute_path: mapBookingContainerPathToNas(folderLinkRow.absolute_path, env),
  };

  const materialized = materializeUploadBatchTargetDirs(batch, folderLinkNas);
  let targetDir = materialized.targetDir;
  let batchFolder = materialized.batchFolder;
  const targetRelativePath = materialized.targetRelativePath;
  if (!batch.batch_folder && batchFolder) {
    await db.updateUploadBatch(batchId, { batch_folder: batchFolder });
    batch = { ...batch, batch_folder: batchFolder };
  }

  const targetAbsoluteForDb = mapNasLocalPathToContainer(targetDir, env);

  const files = await db.listUploadBatchFiles(batchId);
  log("transfer started (nas_pull)", {
    batchId,
    orderNo: batch.order_no,
    fileCount: files.length,
    targetDir,
  });

  let failed = 0;
  let fileIndex = 0;

  for (const file of files) {
    fileIndex += 1;
    const currentStatus = String(file.status || "staged");
    if (["stored", "skipped_duplicate", "skipped_invalid_type"].includes(currentStatus)) continue;

    const safeName = sanitizeUploadFilename(file.stored_name || file.original_name);
    const extCheck = checkUploadExtension(String(batch.category || ""), safeName);
    if (!extCheck.ok) {
      await db.updateUploadBatchFile(file.id, {
        status: "skipped_invalid_type",
        error_message: `Dateityp "${extCheck.ext}" ist für diese Kategorie nicht erlaubt`,
      });
      continue;
    }

    const destination = path.join(targetDir, safeName);
    const fileStart = Date.now();
    try {
      const stagingContainer = String(file.staging_path || "");
      if (!stagingContainer) throw new Error("staging_path fehlt");

      const hostStagingFile = mapContainerStagingToVpsHostPath(stagingContainer, env);
      const sshHost = String(env.NAS_VPS_SSH_HOST || "").trim();
      const remoteSpec = buildRsyncRemoteSource(sshHost, hostStagingFile);

      const incomingHash = file.sha256 || null;

      if (incomingHash && fs.existsSync(destination)) {
        const existingHash = await sha256FileAsync(destination);
        if (existingHash === incomingHash) {
          await sshRemovePath(hostStagingFile, env);
          await db.updateUploadBatchFile(file.id, { status: "stored", error_message: null });
          continue;
        }
      }

      await fsPromises.mkdir(path.dirname(destination), { recursive: true });
      await rsyncPullFile(remoteSpec, destination, env);

      const sourceSize = Number(file.size_bytes || 0);
      const targetSize = Number((await fsPromises.stat(destination)).size || 0);
      if (sourceSize > 0 && sourceSize !== targetSize) {
        throw new Error(`Dateigrösse nach rsync stimmt nicht überein (${sourceSize} vs ${targetSize})`);
      }

      const verifyTargetHash = shouldVerifyTargetHash(sourceSize);
      if (verifyTargetHash) {
        const targetHash = await sha256FileAsync(destination);
        if (incomingHash && targetHash !== incomingHash) {
          throw new Error("SHA-256 nach rsync stimmt nicht überein");
        }
      }

      await sshRemovePath(hostStagingFile, env);

      await db.updateUploadBatchFile(file.id, { status: "stored", error_message: null });

      const fileMs = Date.now() - fileStart;
      if (fileIndex % 5 === 0 || fileIndex === files.length || fileMs > 10000) {
        log("file progress", {
          batchId,
          fileIndex,
          total: files.length,
          fileMB: (sourceSize / MB).toFixed(1),
          lastFileMs: fileMs,
          mbPerSec: mbPerSec(sourceSize, fileMs),
          lastFile: safeName,
        });
      }
    } catch (error) {
      failed += 1;
      logWarn(`file failed: ${safeName}`, error);
      try {
        if (fs.existsSync(destination)) await fsPromises.unlink(destination);
      } catch (_) {}
      await db.updateUploadBatchFile(file.id, {
        status: "failed",
        error_message: error instanceof Error ? error.message : "Transfer fehlgeschlagen",
      });
    }
  }

  if (String(batch.comment || "").trim()) {
    writeCommentFile(targetDir, batch.comment);
  }

  const completedFiles = await db.listUploadBatchFiles(batchId);
  const storedCount = completedFiles.filter((e) => e.status === "stored").length;
  const skippedCount = completedFiles.filter((e) => e.status === "skipped_duplicate").length;
  const invalidCount = completedFiles.filter((e) => e.status === "skipped_invalid_type").length;
  const failedCount = completedFiles.filter((e) => e.status === "failed").length;
  const status = failedCount > 0 ? "failed" : "completed";
  const completedAt = failedCount > 0 ? null : new Date().toISOString();

  batch = await db.updateUploadBatch(batchId, {
    status,
    batch_folder: batchFolder,
    target_relative_path: targetRelativePath,
    target_absolute_path: targetAbsoluteForDb,
    error_message: failedCount > 0 ? `${failedCount} Datei(en) konnten nicht übertragen werden` : null,
    completed_at: completedAt,
  });

  log("transfer completed (nas_pull)", {
    batchId,
    status,
    storedCount,
    skippedCount,
    invalidCount,
    failedCount,
    durationMs: Date.now() - transferStart,
  });

  if (failedCount === 0) {
    const localPath = String(batch.local_path || "");
    if (localPath) {
      try {
        const hostBatchDir = mapContainerStagingToVpsHostPath(localPath, env);
        await sshRemovePath(hostBatchDir, env);
      } catch (e) {
        logWarn("staging cleanup on VPS failed", e);
      }
    }
    if (typeof deps.notifyCompleted === "function") {
      const batchDto = toBatchDto(batch, completedFiles);
      await deps.notifyCompleted({
        order,
        batch: batchDto,
        storedCount,
        skippedCount,
        invalidCount,
      });
    }
  }
  } catch (error) {
    logWarn(`transfer failed batchId=${batchId}`, error);
    await db.updateUploadBatch(batchId, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "NAS-Pull-Transfer fehlgeschlagen",
    }).catch(() => {});
  }
}

module.exports = {
  transferBatchNasPull,
  rsyncPullFile,
  runProcessCapture,
};
