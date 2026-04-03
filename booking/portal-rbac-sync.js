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

async function hasPortalUserEmailColumn() {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ANY (current_schemas(false))
       AND table_name = 'access_subjects' AND column_name = 'portal_user_email'
     LIMIT 1`
  );
  return rows.length > 0;
}

async function findContactIdForWorkspaceMember(ownerEmail, memberEmail) {
  const owner = normEmail(ownerEmail);
  const member = normEmail(memberEmail);
  if (!owner || !member) return null;

  // Primär: über customer_id in portal_team_members (Cutover-Pfad)
  const viaCustomerId = await db.query(
    `SELECT cc.id
     FROM tour_manager.portal_team_members m
     JOIN core.customer_contacts cc ON cc.customer_id = m.customer_id
     WHERE m.customer_id IS NOT NULL
       AND LOWER(TRIM(m.member_email)) = $1
       AND LOWER(TRIM(cc.email)) = $1
     LIMIT 1`,
    [member]
  );
  if (viaCustomerId.rows[0]?.id) return viaCustomerId.rows[0].id;

  // Fallback: über owner_email → core.customers.email
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
    if (!(await hasPortalUserEmailColumn())) return;
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

  // Bevorzuge customer_id-Lookup wenn vorhanden (Alias-aware)
  const cidRes = await db.query(
    `SELECT id FROM core.customers
     WHERE core.customer_email_matches($1, email, email_aliases)
     LIMIT 1`,
    [owner]
  );
  const ownerCustomerId = cidRes.rows[0]?.id ? Number(cidRes.rows[0].id) : null;

  let rows;
  if (ownerCustomerId) {
    const r = await db.query(
      `SELECT role, status FROM tour_manager.portal_team_members
       WHERE customer_id = $1 AND LOWER(TRIM(member_email)) = $2
       LIMIT 1`,
      [ownerCustomerId, member]
    );
    rows = r.rows;
  } else {
    const r = await db.query(
      `SELECT role, status FROM tour_manager.portal_team_members
       WHERE LOWER(TRIM(owner_email)) = $1 AND LOWER(TRIM(member_email)) = $2
       LIMIT 1`,
      [owner, member]
    );
    rows = r.rows;
  }
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
  const canQueryPortalUsers = await hasPortalUserEmailColumn();

  const { rows } = await db.query(
    `SELECT 1
     FROM access_subject_system_roles asr
     JOIN access_subjects s ON s.id = asr.subject_id
     WHERE asr.role_key = $2
       AND (
        (${canQueryPortalUsers} AND s.subject_type = 'portal_user' AND LOWER(s.portal_user_email) = $1)
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

/** Alle access_subjects-IDs für Portal-Nutzer per E-Mail (portal_user + customer_contact). */
async function listSubjectIdsForPortalEmail(emailRaw) {
  const email = normEmail(emailRaw);
  if (!email) return [];
  if (!(await rbac.tableExists("access_subjects"))) return [];
  const canQueryPortalUsers = await hasPortalUserEmailColumn();

  const ids = new Set();
  if (canQueryPortalUsers) {
    const pu = await db.query(
      `SELECT id FROM access_subjects
       WHERE subject_type = 'portal_user' AND LOWER(portal_user_email) = $1`,
      [email]
    );
    for (const r of pu.rows) {
      const id = Number(r.id);
      if (Number.isFinite(id)) ids.add(id);
    }
  }

  const cc = await db.query(
    `SELECT s.id FROM access_subjects s
     JOIN core.customer_contacts cc ON cc.id = s.customer_contact_id
     WHERE s.subject_type = 'customer_contact'
       AND LOWER(TRIM(cc.email)) = $1`,
    [email]
  );
  for (const r of cc.rows) {
    const id = Number(r.id);
    if (Number.isFinite(id)) ids.add(id);
  }

  return [...ids];
}

/**
 * Effektive RBAC-Permission für Portal-E-Mail (System-Scope), z. B. tours.cross_company, portal_team.manage.
 */
async function emailHasPortalPermission(emailRaw, permissionKey) {
  const pk = String(permissionKey || "").trim();
  if (!pk) return false;
  await rbac.seedRbacIfNeeded();
  const subjectIds = await listSubjectIdsForPortalEmail(emailRaw);
  if (!subjectIds.length) return false;
  const ctx = { scopeType: "system", companyId: null, customerId: null };
  for (const sid of subjectIds) {
    const perms = await rbac.getEffectivePermissions(sid, ctx);
    if (perms.has(pk)) return true;
  }
  return false;
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
    `SELECT DISTINCT
       COALESCE(cu.email, LOWER(TRIM(m.owner_email))) AS o,
       LOWER(TRIM(m.member_email)) AS m
     FROM tour_manager.portal_team_members m
     LEFT JOIN core.customers cu ON cu.id = m.customer_id
     WHERE m.role = 'admin' AND m.status = 'active'`
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
  emailHasPortalPermission,
  listSubjectIdsForPortalEmail,
  reconcileAllPortalRolesToRbac,
  findContactIdForWorkspaceMember,
  countActivePortalAdminWorkspaces,
};
