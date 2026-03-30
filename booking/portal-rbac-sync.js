/**
 * Synchronisiert Tour-Portal-Tabellen (portal_staff_roles, portal_team_members)
 * ins zentrale Booking-RBAC (access_subjects / access_subject_system_roles).
 */
const db = require("./db");
const rbac = require("./access-rbac");

function normEmail(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

async function findContactIdForWorkspaceMember(ownerEmail, memberEmail) {
  const owner = normEmail(ownerEmail);
  const member = normEmail(memberEmail);
  if (!owner || !member) return null;
  const { rows } = await db.query(
    `SELECT cc.id
     FROM core.customers cu
     JOIN core.customer_contacts cc ON cc.customer_id = cu.id
     WHERE LOWER(TRIM(cu.email)) = $1
       AND LOWER(TRIM(cc.email)) = $2
     LIMIT 1`,
    [owner, member]
  );
  return rows[0]?.id ?? null;
}

async function countActivePortalAdminWorkspaces(memberEmail) {
  const m = normEmail(memberEmail);
  if (!m) return 0;
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM tour_manager.portal_team_members
     WHERE LOWER(TRIM(member_email)) = $1
       AND role = 'admin'
       AND status = 'active'`,
    [m]
  );
  return rows[0]?.c ?? 0;
}

/**
 * Subjekt für Mitglied im Workspace: bevorzugt customer_contact, sonst portal_user.
 */
async function resolveSubjectForWorkspaceMember(ownerEmail, memberEmail) {
  const contactId = await findContactIdForWorkspaceMember(ownerEmail, memberEmail);
  if (contactId) {
    const sid = await rbac.ensureCustomerContactSubject(contactId);
    return { subjectId: sid, kind: "customer_contact" };
  }
  const sid = await rbac.ensurePortalUserSubject(memberEmail);
  return { subjectId: sid, kind: "portal_user" };
}

/** Nach Änderung an portal_staff_roles (Tour-Manager). */
async function syncPortalStaffTourManagerRbac(emailRaw, action) {
  await rbac.seedRbacIfNeeded();
  const email = normEmail(emailRaw);
  if (!email) return;
  if (action === "add") {
    const sid = await rbac.ensurePortalUserSubject(email);
    if (!sid) return;
    await rbac.addSubjectSystemRole(sid, "tour_manager");
    return;
  }
  if (action === "remove") {
    const { rows } = await db.query(
      `SELECT id FROM access_subjects
       WHERE subject_type = 'portal_user' AND LOWER(portal_user_email) = $1
       LIMIT 1`,
      [email]
    );
    const sid = rows[0]?.id;
    if (!sid) return;
    await rbac.removeSubjectSystemRole(sid, "tour_manager");
    await rbac.prunePortalUserSubjectIfEmpty(sid);
  }
}

/**
 * Nach Änderung an portal_team_members (Kunden-Admin = role admin).
 */
async function syncPortalTeamMemberAdminRbac(ownerEmail, memberEmail) {
  await rbac.seedRbacIfNeeded();
  const owner = normEmail(ownerEmail);
  const member = normEmail(memberEmail);
  if (!owner || !member) return;

  const { rows } = await db.query(
    `SELECT role, status FROM tour_manager.portal_team_members
     WHERE LOWER(TRIM(owner_email)) = $1 AND LOWER(TRIM(member_email)) = $2
     LIMIT 1`,
    [owner, member]
  );
  const row = rows[0];
  const isAdmin = row && String(row.status || "") === "active" && String(row.role || "") === "admin";

  const { subjectId, kind } = await resolveSubjectForWorkspaceMember(owner, member);
  if (!subjectId) return;

  if (isAdmin) {
    await rbac.addSubjectSystemRole(subjectId, "customer_admin");
    return;
  }

  const stillAdmin = (await countActivePortalAdminWorkspaces(member)) > 0;
  if (!stillAdmin) {
    await rbac.removeSubjectSystemRole(subjectId, "customer_admin");
    if (kind === "portal_user") {
      await rbac.prunePortalUserSubjectIfEmpty(subjectId);
    }
  }
}

/** tour_manager-Systemrolle für E-Mail (RBAC, nicht mehr nur portal_staff_roles). */
async function emailHasPortalSystemRole(emailRaw, roleKey) {
  const email = normEmail(emailRaw);
  const rk = String(roleKey || "").trim();
  if (!email || !rk) return false;
  if (!(await rbac.tableExists("access_subjects"))) return false;

  const hasPortalCol = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ANY (current_schemas(false))
       AND table_name = 'access_subjects' AND column_name = 'portal_user_email'
     LIMIT 1`
  );
  if (!hasPortalCol.rows.length) return false;

  const { rows } = await db.query(
    `SELECT 1
     FROM access_subject_system_roles asr
     JOIN access_subjects s ON s.id = asr.subject_id
     WHERE asr.role_key = $2
       AND (
         (s.subject_type = 'portal_user' AND LOWER(s.portal_user_email) = $1)
         OR (
           s.subject_type = 'customer_contact'
           AND EXISTS (
             SELECT 1 FROM core.customer_contacts cc
             WHERE cc.id = s.customer_contact_id AND LOWER(TRIM(cc.email)) = $1
           )
         )
       )
     LIMIT 1`,
    [email, rk]
  );
  return !!rows[0];
}

/**
 * Rebuild RBAC-Zuweisungen aus tour_manager-Tabellen (idempotent).
 */
async function reconcileAllPortalRolesToRbac() {
  await rbac.seedRbacIfNeeded();
  const hasCol = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ANY (current_schemas(false))
       AND table_name = 'access_subjects' AND column_name = 'portal_user_email'
     LIMIT 1`
  );
  if (!hasCol.rows.length) return { skipped: true, reason: "migration_060_pending" };

  const { rows: staff } = await db.query(
    `SELECT email_norm FROM tour_manager.portal_staff_roles WHERE role = 'tour_manager'`
  );
  for (const r of staff || []) {
    await syncPortalStaffTourManagerRbac(r.email_norm, "add");
  }

  const { rows: admins } = await db.query(
    `SELECT DISTINCT LOWER(TRIM(owner_email)) AS o, LOWER(TRIM(member_email)) AS m
     FROM tour_manager.portal_team_members
     WHERE role = 'admin' AND status = 'active'`
  );
  for (const r of admins || []) {
    await syncPortalTeamMemberAdminRbac(r.o, r.m);
  }

  return { ok: true, staff: (staff || []).length, adminPairs: (admins || []).length };
}

module.exports = {
  syncPortalStaffTourManagerRbac,
  syncPortalTeamMemberAdminRbac,
  emailHasPortalSystemRole,
  reconcileAllPortalRolesToRbac,
  findContactIdForWorkspaceMember,
  countActivePortalAdminWorkspaces,
};
