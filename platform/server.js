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
const { createCoreRouter } = require("./modules/core/routes");
const booking = require("../booking/server");
const tours = require("../tours/server");

const fs = require("fs");

const main = express();
const mount = String(process.env.TOURS_MOUNT_PATH || "/tour-manager").replace(/\/$/, "") || "/tour-manager";

// Legacy Booking-Frontend unter /legacy-booking (nur lokal, Produktion bleibt unberührt)
const legacyDir = path.join(__dirname, "..", "booking");
const API_BASE_RE = /const API_BASE\s*=\s*window\.location\.hostname[\s\S]*?;/;

main.get("/legacy-booking/index.html", serveLegacyIndex);
main.get("/legacy-booking/", serveLegacyIndex);
main.get("/legacy-booking", serveLegacyIndex);

function serveLegacyIndex(_req, res) {
  const htmlPath = path.join(legacyDir, "index.html");
  try {
    let html = fs.readFileSync(htmlPath, "utf8");
    html = html.replace(
      'href="app.css',     'href="/legacy-booking/app.css'
    ).replace(
      'src="photographers.config.js"', 'src="/legacy-booking/photographers.config.js"'
    ).replace(
      'src="discount-codes.js"', 'src="/legacy-booking/discount-codes.js"'
    ).replace(
      /src="script\.js[^"]*"/,  'src="/legacy-booking/script.js"'
    ).replace(
      'src="version.js"',  'src="/legacy-booking/version.js"'
    ).replace(
      'src="assets/',      'src="/legacy-booking/assets/'
    ).replace(
      'href="assets/',     'href="/legacy-booking/assets/'
    );
    res.type("html").send(html);
  } catch (e) {
    res.status(404).send("Legacy booking frontend not found");
  }
}

main.get("/legacy-booking/script.js", (_req, res) => {
  const jsPath = path.join(legacyDir, "script.js");
  try {
    let js = fs.readFileSync(jsPath, "utf8");
    js = js.replace(API_BASE_RE, 'const API_BASE = "";');
    res.type("application/javascript").send(js);
  } catch (e) {
    res.status(404).send("// not found");
  }
});

main.use("/legacy-booking", express.static(legacyDir, { index: false }));

main.use("/api/core", createCoreRouter());
main.use(mount, tours.app);
main.use(booking.app);

const PORT = parseInt(process.env.PORT || "3100", 10);

(async () => {
  try {
    await booking.startServer();
    main.listen(PORT, "0.0.0.0", () => {
      console.log(`[propus-platform] listening on http://0.0.0.0:${PORT}`);
      console.log(`[propus-platform] booking SPA + API: /`);
      console.log(`[propus-platform] tour manager: http://0.0.0.0:${PORT}${mount}/admin`);
    });
  } catch (e) {
    console.error("[propus-platform] boot failed", e);
    process.exit(1);
  }
})();
