// Vorkonfigurierte Rate-Limiter für sicherheitskritische Endpunkte.
//
// Verwendung:
//   const { authLimiter, passwordResetLimiter, bookingLimiter } = require("./rate-limiters");
//   app.post("/api/admin/login", authLimiter, async (req, res) => { ... });
//
// Trust-Proxy ist in server.js gesetzt → req.ip enthält die echte Client-IP
// hinter Cloudflare/Nginx. Defaults sind konservativ; alle Limits via ENV
// überschreibbar (z. B. RATE_LIMIT_AUTH_MAX=10).

const rateLimit = require("express-rate-limit");

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MIN = 60 * 1000;

// 5 Versuche / 15 min pro IP für Login & Token-basierte Reset-Endpunkte.
const authLimiter = rateLimit({
  windowMs: intEnv("RATE_LIMIT_AUTH_WINDOW_MS", 15 * MIN),
  limit: intEnv("RATE_LIMIT_AUTH_MAX", 5),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Zu viele Versuche. Bitte später erneut probieren." },
});

// 3 / Stunde pro IP für Forgot-Password (verhindert Mail-Bombing/Enumeration).
const passwordResetLimiter = rateLimit({
  windowMs: intEnv("RATE_LIMIT_PASSWORD_RESET_WINDOW_MS", 60 * MIN),
  limit: intEnv("RATE_LIMIT_PASSWORD_RESET_MAX", 3),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte später erneut probieren." },
});

// 10 / Stunde pro IP für öffentliche Booking-Submits (Spam-/Mailkosten-Schutz).
const bookingLimiter = rateLimit({
  windowMs: intEnv("RATE_LIMIT_BOOKING_WINDOW_MS", 60 * MIN),
  limit: intEnv("RATE_LIMIT_BOOKING_MAX", 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Zu viele Buchungsanfragen. Bitte später erneut probieren." },
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  bookingLimiter,
};
