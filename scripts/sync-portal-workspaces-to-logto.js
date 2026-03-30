#!/usr/bin/env node
/**
 * Einmaliger / wiederholbarer Bulk-Sync:
 * - Portal-Rollen ins Booking-RBAC (reconcile)
 * - Globale Logto-Rollen (tour_manager, customer_admin)
 * - Logto Organizations pro Tour-Workspace + Mitglieder mit Org-Rollen
 *
 * Ausführen vom Repo-Root mit gesetzter DATABASE_URL und Logto M2M-Env.
 */
const path = require('path');

// Repo-Root
const repoRoot = path.join(__dirname, '..');
process.chdir(repoRoot);

const portalRbac = require(path.join(repoRoot, 'booking/portal-rbac-sync'));
const logtoRole = require(path.join(repoRoot, 'booking/logto-role-sync'));
const logtoWs = require(path.join(repoRoot, 'booking/logto-portal-workspace-sync'));
const db = require(path.join(repoRoot, 'booking/db'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('[sync-portal-workspaces-to-logto] RBAC reconcile…');
  const r1 = await portalRbac.reconcileAllPortalRolesToRbac();
  console.log('[sync-portal-workspaces-to-logto] RBAC:', r1);

  console.log('[sync-portal-workspaces-to-logto] Logto globale Rollen…');
  await logtoRole.syncAllPortalRolesToLogto();

  console.log('[sync-portal-workspaces-to-logto] Logto Org-Rollen (workspace_*)…');
  await logtoWs.ensurePortalWorkspaceOrgRolesDefined();

  const owners = await db.query(`
    SELECT DISTINCT LOWER(TRIM(customer_email)) AS e
    FROM tour_manager.tours
    WHERE customer_email IS NOT NULL AND TRIM(customer_email) <> ''
  `);

  for (const row of owners.rows || []) {
    const e = String(row.e || '').trim().toLowerCase();
    if (!e) continue;
    try {
      await logtoWs.ensureWorkspaceOrganizationForOwner(e);
      await logtoWs.syncWorkspaceOwnerToLogtoOrg(e);
    } catch (err) {
      console.warn('[sync-portal-workspaces-to-logto] owner', e, err.message);
    }
    await sleep(30);
  }

  const members = await db.query(`
    SELECT LOWER(TRIM(owner_email)) AS o,
           LOWER(TRIM(member_email)) AS m,
           role
    FROM tour_manager.portal_team_members
    WHERE status = 'active'
  `);

  for (const row of members.rows || []) {
    const o = String(row.o || '').trim().toLowerCase();
    const m = String(row.m || '').trim().toLowerCase();
    if (!o || !m) continue;
    try {
      await logtoWs.syncPortalMemberToLogtoOrg(o, m, row.role);
    } catch (err) {
      console.warn('[sync-portal-workspaces-to-logto] member', o, m, err.message);
    }
    await sleep(40);
  }

  console.log('[sync-portal-workspaces-to-logto] Fertig.');
  await db.closePool();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.closePool();
  } catch (_) {}
  process.exit(1);
});
