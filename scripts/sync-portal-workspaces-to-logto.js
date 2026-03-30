#!/usr/bin/env node
/**
 * Einmaliger / wiederholbarer Bulk-Sync (nach Cutover auf customer_id):
 * - Portal-Rollen ins Booking-RBAC (reconcile)
 * - Globale Logto-Rollen (tour_manager, customer_admin)
 * - Logto Organizations pro Firma (core.customers) + Mitglieder mit Org-Rollen
 *
 * Bevorzugt customer_id-Pfad; fällt auf owner_email zurück für Bestandsdaten
 * ohne core.customers-Verknüpfung.
 *
 * Ausführen vom Repo-Root mit gesetzter DATABASE_URL und Logto M2M-Env.
 */
const path = require('path');

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
  console.log('[sync] RBAC reconcile…');
  const r1 = await portalRbac.reconcileAllPortalRolesToRbac();
  console.log('[sync] RBAC:', r1);

  console.log('[sync] Logto globale Rollen…');
  await logtoRole.syncAllPortalRolesToLogto();

  console.log('[sync] Logto Org-Rollen (workspace_*)…');
  await logtoWs.ensurePortalWorkspaceOrgRolesDefined();

  // Phase A: Firmen mit core.customers-Eintrag (customer_id-Pfad)
  console.log('[sync] Phase A: Logto Orgs für Firmen aus core.customers…');
  const customers = await db.query(`
    SELECT DISTINCT cu.id AS customer_id
    FROM core.customers cu
    WHERE EXISTS (
      SELECT 1 FROM tour_manager.portal_team_members m
      WHERE m.customer_id = cu.id AND m.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM tour_manager.tours t
      WHERE t.customer_id = cu.id
    )
    ORDER BY cu.id
  `);

  let aCount = 0;
  for (const row of customers.rows || []) {
    const cid = Number(row.customer_id);
    if (!Number.isFinite(cid)) continue;
    try {
      await logtoWs.ensureWorkspaceOrganizationForCustomer(cid);
      aCount++;
    } catch (err) {
      console.warn('[sync] customer_id', cid, err.message);
    }
    await sleep(30);
  }
  console.log(`[sync] Phase A: ${aCount} Firmen-Orgs sichergestellt.`);

  // Phase B: Bestandsdaten ohne customer_id (über owner_email)
  console.log('[sync] Phase B: Logto Orgs für Workspaces ohne customer_id (owner_email-Fallback)…');
  const legacyOwners = await db.query(`
    SELECT DISTINCT LOWER(TRIM(owner_email)) AS e
    FROM tour_manager.portal_team_members
    WHERE customer_id IS NULL
      AND status = 'active'
      AND owner_email IS NOT NULL AND TRIM(owner_email) <> ''
  `);

  let bCount = 0;
  for (const row of legacyOwners.rows || []) {
    const e = String(row.e || '').trim().toLowerCase();
    if (!e) continue;
    try {
      await logtoWs.ensureWorkspaceOrganizationForOwner(e);
      await logtoWs.syncWorkspaceOwnerToLogtoOrg(e);
      bCount++;
    } catch (err) {
      console.warn('[sync] legacy owner', e, err.message);
    }
    await sleep(30);
  }
  console.log(`[sync] Phase B: ${bCount} Legacy-Workspaces sichergestellt.`);

  // Phase C: Team-Mitglieder in Logto-Orgs spiegeln
  console.log('[sync] Phase C: Team-Mitglieder in Logto-Orgs…');
  const members = await db.query(`
    SELECT
      COALESCE(cu.email, LOWER(TRIM(m.owner_email))) AS o,
      LOWER(TRIM(m.member_email)) AS mem,
      m.role
    FROM tour_manager.portal_team_members m
    LEFT JOIN core.customers cu ON cu.id = m.customer_id
    WHERE m.status = 'active'
      AND m.accepted_at IS NOT NULL
  `);

  let cCount = 0;
  let cErrors = 0;
  for (const row of members.rows || []) {
    const o = String(row.o || '').trim().toLowerCase();
    const m = String(row.mem || '').trim().toLowerCase();
    if (!o || !m) continue;
    try {
      await logtoWs.syncPortalMemberToLogtoOrg(o, m, row.role);
      cCount++;
    } catch (err) {
      cErrors++;
      console.warn('[sync] member', o, '->', m, err.message);
    }
    await sleep(40);
  }
  console.log(`[sync] Phase C: ${cCount} Mitglieder synchronisiert, ${cErrors} Fehler.`);

  console.log('[sync] Fertig.');
  await db.closePool();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.closePool();
  } catch (_) {}
  process.exit(1);
});
