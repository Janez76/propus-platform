/**
 * Hintergrund-Cron-Worker (VPS) — startet neben dem Next.js-Prozess oder als eigener Service.
 * Erweitern: Jobs aus booking/jobs/* nachportieren.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cron = require("node-cron");

// Platzhalter — Feature-Jobs in späteren PRs
cron.schedule("*/5 * * * *", () => {
  if (String(process.env.PROPUS_ENABLE_CRON || "1") !== "1") return;
  if (String(process.env.LOG_CRON || "") === "1") {
    console.log("[propus-worker] tick", new Date().toISOString());
  }
});

if (String(process.env.LOG_CRON || "") === "1") {
  console.log("[propus-worker] started, PROPUS_ENABLE_CRON=", process.env.PROPUS_ENABLE_CRON);
}
