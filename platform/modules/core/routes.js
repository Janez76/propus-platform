/**
 * Geplante REST-Pfade unter /api/core/* – aktuell nutzt das Booking-Backend dieselben Endpunkte (/api/admin/customers, /api/company, …).
 * Dieses Modul ist der Erweiterungspunkt für eine spätere Auslagerung aus booking/server.js.
 */
const express = require("express");
const fs = require("fs");
const path = require("path");

const BUILD_ID_FILE_CANDIDATES = [
  process.env.BUILD_ID_FILE,
  path.join(process.cwd(), "nextjs", "public", "VERSION"),
  path.join(process.cwd(), "public", "VERSION"),
  path.join(process.cwd(), "app", "public", "VERSION"),
  path.join(process.cwd(), "booking", "public", "VERSION"),
  "/opt/buchungstool/VERSION",
].filter(Boolean);

function getBuildId() {
  for (const candidate of BUILD_ID_FILE_CANDIDATES) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8").trim();
      if (raw) return raw;
    } catch (_error) {
      // Fallback auf den nächsten Kandidaten.
    }
  }
  return process.env.BUILD_ID || "dev";
}

function createCoreRouter() {
  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      module: "core",
      note: "Routen noch im Booking-Monolithen",
      buildId: getBuildId(),
    });
  });
  return router;
}

module.exports = { createCoreRouter };
