/**
 * Geplante REST-Pfade unter /api/core/* – aktuell nutzt das Booking-Backend dieselben Endpunkte (/api/admin/customers, /api/company, …).
 * Dieses Modul ist der Erweiterungspunkt für eine spätere Auslagerung aus booking/server.js.
 */
const express = require("express");

function createCoreRouter() {
  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({ ok: true, module: "core", note: "Routen noch im Booking-Monolithen" });
  });
  return router;
}

module.exports = { createCoreRouter };
