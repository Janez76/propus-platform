const path = require("path");
const dotenv = require("dotenv");

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
const { moveRawMaterialToCustomerFolder } = require("./order-storage");

function parseOrderNo(argv) {
  const idx = argv.indexOf("--orderNo");
  const raw = idx >= 0 ? argv[idx + 1] : argv[2];
  const orderNo = Number(raw);
  if (!Number.isInteger(orderNo) || orderNo <= 0) {
    throw new Error("Usage: node booking/raw-to-customer-worker.js --orderNo <orderNo>");
  }
  return orderNo;
}

async function main() {
  const orderNo = parseOrderNo(process.argv);
  console.log("[raw-to-customer-worker] started", { orderNo });
  const order = await db.getOrderByNo(orderNo);
  if (!order) throw new Error(`Auftrag ${orderNo} nicht gefunden`);
  const stats = await moveRawMaterialToCustomerFolder(order, db);
  console.log("[raw-to-customer-worker] completed", { orderNo, stats });
}

main().catch((error) => {
  console.error("[raw-to-customer-worker] fatal", error?.message || error);
  process.exit(1);
});
