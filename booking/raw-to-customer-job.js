const path = require("path");
const { spawn } = require("child_process");

const activeJobs = new Map();

function normalizeOrderNo(orderNo) {
  const value = Number(orderNo);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Ungueltige Auftragsnummer");
  }
  return String(value);
}

function startRawToCustomerJob({
  orderNo,
  spawnImpl = spawn,
  cwd = path.join(__dirname, ".."),
  env = process.env,
} = {}) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  const existing = activeJobs.get(normalizedOrderNo);
  if (existing) {
    return {
      started: false,
      alreadyRunning: true,
      orderNo: Number(normalizedOrderNo),
      pid: existing.pid || null,
    };
  }

  const scriptPath = path.join(__dirname, "raw-to-customer-worker.js");
  const child = spawnImpl(process.execPath, [scriptPath, "--orderNo", normalizedOrderNo], {
    cwd,
    env,
    detached: true,
    stdio: "ignore",
  });
  activeJobs.set(normalizedOrderNo, { pid: child.pid || null, startedAt: new Date().toISOString() });

  const cleanup = () => {
    activeJobs.delete(normalizedOrderNo);
  };
  if (typeof child.on === "function") {
    child.on("exit", cleanup);
    child.on("error", cleanup);
  }
  if (typeof child.unref === "function") {
    child.unref();
  }

  return {
    started: true,
    alreadyRunning: false,
    orderNo: Number(normalizedOrderNo),
    pid: child.pid || null,
  };
}

function isRawToCustomerJobActive(orderNo) {
  return activeJobs.has(normalizeOrderNo(orderNo));
}

module.exports = {
  startRawToCustomerJob,
  isRawToCustomerJobActive,
};
