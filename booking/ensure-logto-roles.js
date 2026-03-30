/**
 * Legt alle von Propus genutzten Logto-Rollen idempotent an (globale Rollen + Org-Rollen für Tour-Portal).
 * Aufruf: node booking/ensure-logto-roles.js (DATABASE_URL nicht nötig; nur M2M + LOGTO_*).
 */
const logtoClient = require("./logto-client");
const logtoPortalWs = require("./logto-portal-workspace-sync");

/** Wie infra/setup-logto.js + Portal-Sync (Namen müssen mit mapLogtoRolesToSystemRole übereinstimmen). */
const GLOBAL_PROPUS_ROLES = [
  ["admin", "Propus Platform: Admin"],
  ["super_admin", "Propus Platform: Super-Admin"],
  ["company_owner", "Propus Platform: Firmen-Hauptkontakt"],
  ["company_admin", "Propus Platform: Firmen-Admin"],
  ["company_employee", "Propus Platform: Firmen-Mitarbeiter"],
  ["photographer", "Propus Platform: Fotograf"],
  ["customer", "Propus Platform: Kunde (Basis)"],
  ["tour_manager", "Propus Tour-Manager (intern, alle Touren)"],
  ["customer_admin", "Propus Kunden-Admin (Portal-Team)"],
];

async function ensureAllPropusLogtoRoles() {
  if (!logtoClient.isConfigured()) {
    return { ok: false, error: "Logto M2M nicht konfiguriert (PROPUS_MANAGEMENT_LOGTO_APP_ID / SECRET)" };
  }

  const global = [];
  for (const [name, description] of GLOBAL_PROPUS_ROLES) {
    const id = await logtoClient.ensureGlobalRole(name, description);
    global.push({ name, id: id || null });
  }

  const orgOk = await logtoPortalWs.ensurePortalWorkspaceOrgRolesDefined();

  return {
    ok: true,
    globalRoles: global,
    portalOrganizationRoles: orgOk ? "workspace_owner, workspace_admin, workspace_member" : "skipped",
  };
}

async function main() {
  const r = await ensureAllPropusLogtoRoles();
  if (!r.ok) {
    console.error("[ensure-logto-roles]", r.error);
    process.exit(1);
  }
  console.log("[ensure-logto-roles] Globale Rollen:");
  for (const row of r.globalRoles) {
    console.log(`  - ${row.name}${row.id ? ` (id ${row.id})` : ""}`);
  }
  console.log("[ensure-logto-roles] Org-Rollen Tour-Portal:", r.portalOrganizationRoles);
  console.log("[ensure-logto-roles] Fertig.");
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { ensureAllPropusLogtoRoles, GLOBAL_PROPUS_ROLES };
