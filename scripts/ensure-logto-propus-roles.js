#!/usr/bin/env node
/**
 * Legt in Logto alle Propus-globalen Rollen und die Tour-Portal-Organization-Rollen an (idempotent).
 * Benötigt: LOGTO_INTERNAL_ENDPOINT oder LOGTO_ENDPOINT, PROPUS_MANAGEMENT_LOGTO_APP_ID, SECRET
 *
 * VPS: docker exec propus-platform-platform-1 node /app/booking/ensure-logto-roles.js
 */
const path = require("path");
const repoRoot = path.join(__dirname, "..");
process.chdir(repoRoot);

const { ensureAllPropusLogtoRoles } = require(path.join(repoRoot, "booking/ensure-logto-roles.js"));

(async () => {
  const r = await ensureAllPropusLogtoRoles();
  if (!r.ok) {
    console.error("[ensure-logto-propus-roles]", r.error);
    process.exit(1);
  }
  console.log("[ensure-logto-propus-roles] Globale Rollen:");
  for (const row of r.globalRoles) {
    console.log(`  - ${row.name}${row.id ? ` (id ${row.id})` : ""}`);
  }
  console.log("[ensure-logto-propus-roles] Org-Rollen Tour-Portal:", r.portalOrganizationRoles);
  console.log("[ensure-logto-propus-roles] Fertig.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
