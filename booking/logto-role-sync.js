/**
 * Synchronisiert ausgewählte Booking-Systemrollen zu Logto User Roles (Management API).
 */
const logtoClient = require("./logto-client");

const SYNCABLE_TO_LOGTO = new Set(["tour_manager", "customer_admin"]);

function normEmail(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

async function syncSystemRoleToLogto(emailRaw, systemRoleKey, action) {
  const email = normEmail(emailRaw);
  const rk = String(systemRoleKey || "").trim();
  if (!email || !rk || !SYNCABLE_TO_LOGTO.has(rk)) return { skipped: true };
  if (!logtoClient.isConfigured()) return { skipped: true, reason: "logto_not_configured" };

  const logtoRoleName = rk === "customer_admin" ? "customer_admin" : rk;
  try {
    await logtoClient.ensureGlobalRole(
      logtoRoleName,
      rk === "customer_admin" ? "Propus Kunden-Admin (Portal)" : "Propus Tour-Manager (intern)"
    );
  } catch (e) {
    console.warn("[logto-role-sync] ensureGlobalRole:", e.message);
  }

  let user;
  try {
    user = await logtoClient.findUserByEmail(email);
  } catch (e) {
    console.warn("[logto-role-sync] findUserByEmail:", email, e.message);
    return { skipped: true, reason: "lookup_failed" };
  }
  if (!user?.id) {
    console.warn("[logto-role-sync] Kein Logto-User für", email, "— Rolle wird beim nächsten SSO-Lauf gesetzt.");
    return { skipped: true, reason: "user_not_in_logto" };
  }

  try {
    if (action === "add") {
      await logtoClient.assignRolesToUser(user.id, [logtoRoleName]);
    } else if (action === "remove") {
      await logtoClient.removeRolesFromUser(user.id, [logtoRoleName]);
    }
  } catch (e) {
    console.warn("[logto-role-sync] assign/remove:", email, rk, e.message);
    return { ok: false, error: e.message };
  }
  return { ok: true };
}

/** Bulk: alle portal_staff + portal_team admin an Logto (best effort). */
async function syncAllPortalRolesToLogto() {
  if (!logtoClient.isConfigured()) return { skipped: true };

  const db = require("./db");
  const { rows: staff } = await db.query(
    `SELECT email_norm FROM tour_manager.portal_staff_roles WHERE role = 'tour_manager'`
  );
  for (const r of staff || []) {
    await syncSystemRoleToLogto(r.email_norm, "tour_manager", "add");
  }

  const { rows: admins } = await db.query(
    `SELECT LOWER(TRIM(member_email)) AS m
     FROM tour_manager.portal_team_members
     WHERE role = 'admin' AND status = 'active'`
  );
  const seen = new Set();
  for (const r of admins || []) {
    const m = normEmail(r.m);
    if (!m || seen.has(m)) continue;
    seen.add(m);
    await syncSystemRoleToLogto(m, "customer_admin", "add");
  }

  return { ok: true };
}

module.exports = {
  syncSystemRoleToLogto,
  syncAllPortalRolesToLogto,
  SYNCABLE_TO_LOGTO,
};
