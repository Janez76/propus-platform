/**
 * Zentrale Logto-Anbindung (wiederverwendbar).
 * Booking nutzt weiterhin PROPUS_BOOKING_LOGTO_* in booking/server.js;
 * Tours nutzt PROPUS_TOURS_* in tours/server.js.
 */
const { createLogtoAuth } = require("../../auth/logto-middleware");

function createPlatformLogto(prefix = "PROPUS_BOOKING") {
  return createLogtoAuth({
    prefix,
    callbackPath: "/auth/callback",
    loginPath: "/auth/login",
    logoutPath: "/auth/logout",
    logoutRedirect: "/",
  });
}

module.exports = { createPlatformLogto };
