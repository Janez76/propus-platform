/**
 * Propus Platform – zentraler Entry-Point
 * Mountet Tour Manager unter TOURS_MOUNT_PATH (default /tour-manager) und das Booking-Backend auf /.
 */
const path = require("path");

const rootEnv = path.join(__dirname, "..", ".env");
try {
  require("dotenv").config({ path: rootEnv });
} catch (_) {
  /* optional */
}
require("dotenv").config();

process.env.PROPUS_PLATFORM_MERGED = "1";
if (!process.env.TOURS_MOUNT_PATH) process.env.TOURS_MOUNT_PATH = "/tour-manager";

const express = require("express");
const session = require("express-session");
const { createCoreRouter } = require("./modules/core/routes");
const booking = require("../booking/server");
const tours = require("../tours/server");
const { pool } = require("../tours/lib/db");
const { createPostgresSessionStore } = require("../auth/postgres-session-store");
const { requireAdmin } = require("../tours/middleware/auth");
const toursAdminApi = require("../tours/routes/admin-api");

const main = express();
main.set("trust proxy", true);
const mount = String(process.env.TOURS_MOUNT_PATH || "/tour-manager").replace(/\/$/, "") || "/tour-manager";

function publicBookingHostname() {
  const raw = String(process.env.FRONTEND_URL || "https://booking.propus.ch").trim();
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch (_) {
    return "booking.propus.ch";
  }
}

main.use("/api/core", createCoreRouter());

const toursSessionSecret =
  process.env.TOURS_SESSION_SECRET || process.env.SESSION_SECRET || "propus-tour-manager-secret";
const toursSessionStore = createPostgresSessionStore(session.Store, {
  pool,
  tableName: "core.tours_sessions",
  ttlSeconds: 24 * 60 * 60,
  logger: console,
});
const toursSessionMiddleware = session({
  name: "propus_tours.sid",
  secret: toursSessionSecret,
  resave: false,
  saveUninitialized: false,
  store: toursSessionStore,
  cookie: {
    secure: "auto",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  },
});

main.use("/api/tours/admin", express.json(), toursSessionMiddleware, requireAdmin, toursAdminApi);

main.use(mount, tours.app);

main.use(booking.app);

const PORT = parseInt(process.env.PORT || "3100", 10);

(async () => {
  try {
    await booking.startServer();
    main.listen(PORT, "0.0.0.0", () => {
      console.log(`[propus-platform] listening on http://0.0.0.0:${PORT}`);
      console.log(
        `[propus-platform] public booking SPA: https://${publicBookingHostname()}/  | admin SPA: ${process.env.ADMIN_PANEL_URL || "admin host"}`,
      );
      console.log(`[propus-platform] tour manager: http://0.0.0.0:${PORT}${mount}/admin`);
    });
  } catch (e) {
    console.error("[propus-platform] boot failed", e);
    process.exit(1);
  }
})();
