#!/usr/bin/env node
/**
 * Legt die Logto Organization Roles an: workspace_owner, workspace_admin, workspace_member
 * (idempotent). Benötigt PROPUS_MANAGEMENT_LOGTO_APP_ID / SECRET und LOGTO_ENDPOINT.
 */
const path = require('path');
const repoRoot = path.join(__dirname, '..');
process.chdir(repoRoot);

const logtoWs = require(path.join(repoRoot, 'booking/logto-portal-workspace-sync'));

(async () => {
  const ok = await logtoWs.ensurePortalWorkspaceOrgRolesDefined();
  console.log(ok ? '[ensure-logto-portal-org-roles] OK' : '[ensure-logto-portal-org-roles] Logto nicht konfiguriert oder fehlgeschlagen');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
