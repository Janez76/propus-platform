/**
 * Propus Platform – zentraler Entry-Point
 * Mountet Tour Manager unter TOURS_MOUNT_PATH (default /tour-manager) und das Booking-Backend auf /.
 *
 * Hinweis ki.propus.ch: öffentlicher Hostname für Assistant/Mobile zeigt auf dieselbe Next.js-Instanz
 * (Port NEXTJS_PORT, typ. 3001) per Nginx — siehe docs/KI_PROPUS_CH.md. Express bleibt intern (PORT/3100).
 */
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const crypto = require("crypto");

function loadOptionalEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  dotenv.config({ path: envPath, override: true });
}
[
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", ".env.vps.secrets"),
  path.join(__dirname, "..", ".env.vps"),
].forEach(loadOptionalEnvFile);
dotenv.config({ override: true });

process.env.PROPUS_PLATFORM_MERGED = "1";
if (!process.env.TOURS_MOUNT_PATH) process.env.TOURS_MOUNT_PATH = "/tour-manager";

const express = require("express");
const session = require("express-session");
const { createCoreRouter } = require("./modules/core/routes");
const booking = require("../booking/server");
const bookingDb = require("../booking/db");
const tours = require("../tours/server");
const { pool } = require("../tours/lib/db");
const { createPostgresSessionStore } = require("../auth/postgres-session-store");
const { requireAdmin } = require("../tours/middleware/auth");
const toursAdminApi = require("../tours/routes/admin-api");
const posteingangAdminApi = require("../tours/routes/posteingang-admin-api");
const toursCronApi = require("../tours/routes/cron-api");
const galleryAdminApi = require("../tours/routes/gallery-admin-api");
const galleryPublicApi = require("../tours/routes/gallery-public-api");
const adminSearchApi = require("../tours/routes/admin-search");
const posteingangWebhook = require("../tours/routes/posteingang-webhook");

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

function getAdminSessionToken(req) {
  const auth = String(req.headers.authorization || "");
  let token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token) return token;

  const cookieHeader = String(req.headers.cookie || "");
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith("admin_session=")) {
      return cookie.substring("admin_session=".length);
    }
  }

  return String(req.query?.token || "").trim();
}

async function bridgeBookingAdminSession(req, _res, next) {
  if (req.session?.isAdmin) return next();

  try {
    const token = getAdminSessionToken(req);
    if (!token || !bookingDb.getAdminSessionByTokenHash) return next();

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const row = await bookingDb.getAdminSessionByTokenHash(tokenHash);
    if (!row) return next();

    const userKey = row.user_key != null ? String(row.user_key) : "";
    const userName = row.user_name || "";
    const emailFromKey = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userKey) ? userKey : "";
    const emailFromName = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userName) ? userName : "";
    const email = emailFromKey || emailFromName || "";

    req.session.isAdmin = true;
    req.session.admin = {
      email,
      username: userKey || email || "admin",
      role: String(row.role || "admin"),
      name: userName || email || userKey || "Admin",
    };
    req.session.adminEmail = email;

    return req.session.save(() => next());
  } catch (err) {
    console.warn("[platform] tour admin session bridge failed", err?.message || err);
    return next();
  }
}

main.use("/api/tours/admin/search", express.json(), toursSessionMiddleware, bridgeBookingAdminSession, requireAdmin, adminSearchApi);
main.use(
  "/api/tours/admin/posteingang",
  express.json(),
  toursSessionMiddleware,
  bridgeBookingAdminSession,
  requireAdmin,
  posteingangAdminApi,
);
main.use("/api/tours/admin", express.json(), toursSessionMiddleware, bridgeBookingAdminSession, requireAdmin, toursAdminApi);
main.use("/api/tours/admin/galleries", express.json(), toursSessionMiddleware, bridgeBookingAdminSession, requireAdmin, galleryAdminApi);
main.use("/api/tours/cron", express.json(), toursCronApi);
main.use("/api/tours/posteingang/webhook", posteingangWebhook);
main.use("/api/listing", express.json(), galleryPublicApi);

// Bereinigungslauf-Aktionsseiten: öffentlich auf Root-Ebene erreichbar (Token-Links in E-Mails zeigen auf /cleanup/...)
main.set("view engine", "ejs");
main.set("views", path.join(__dirname, "../tours/views"));
main.use("/cleanup", express.json(), express.urlencoded({ extended: true }), require("../tours/routes/cleanup"));

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
