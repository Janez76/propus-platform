/**
 * Kundenportal: Team-Mitglieder, Rollen (admin / mitarbeiter), Exxas-Organisationskontakte
 */
const crypto = require('crypto');
const path = require('path');
const { pool } = require('./db');
const exxas = require('./exxas');
const customerLookup = require('./customer-lookup');
const userProfiles = require('./user-profiles');

let schemaReady = false;

function getBookingPortalSync() {
  try {
    // Von tours/lib → Repo-Root/booking
    const bookingRoot = path.join(__dirname, '..', '..', 'booking');
    return {
      portalRbac: require(path.join(bookingRoot, 'portal-rbac-sync')),
      logtoRole: require(path.join(bookingRoot, 'logto-role-sync')),
      logtoWs: require(path.join(bookingRoot, 'logto-portal-workspace-sync')),
    };
  } catch (e) {
    return null;
  }
}

async function runAfterTeamMemberDbChange(ownerEmail, memberEmail) {
  const m = getBookingPortalSync();
  if (!m) return;
  try {
    await m.portalRbac.syncPortalTeamMemberAdminRbac(ownerEmail, memberEmail);
    const cnt = await m.portalRbac.countActivePortalAdminWorkspaces(memberEmail);
    if (cnt > 0) await m.logtoRole.syncSystemRoleToLogto(memberEmail, 'customer_admin', 'add');
    else await m.logtoRole.syncSystemRoleToLogto(memberEmail, 'customer_admin', 'remove');

    const tm = await pool.query(
      `SELECT role, status FROM tour_manager.portal_team_members
       WHERE LOWER(TRIM(owner_email)) = $1 AND LOWER(TRIM(member_email)) = $2
       LIMIT 1`,
      [normalizeEmail(ownerEmail), normalizeEmail(memberEmail)]
    );
    const t = tm.rows[0];
    if (t && String(t.status) === 'active') {
      await m.logtoWs.ensureWorkspaceOrganizationForOwner(ownerEmail);
      await m.logtoWs.syncWorkspaceOwnerToLogtoOrg(ownerEmail);
      await m.logtoWs.syncPortalMemberToLogtoOrg(ownerEmail, memberEmail, normalizeMemberRole(t.role));
    } else {
      await m.logtoWs.removePortalMemberFromLogtoOrg(ownerEmail, memberEmail);
    }
  } catch (e) {
    console.warn('[portal-team sync]', e.message);
  }
}

async function runAfterTeamMemberRemoved(ownerEmail, memberEmail) {
  const m = getBookingPortalSync();
  if (!m) return;
  try {
    await m.portalRbac.syncPortalTeamMemberAdminRbac(ownerEmail, memberEmail);
    const cnt = await m.portalRbac.countActivePortalAdminWorkspaces(memberEmail);
    if (cnt === 0) await m.logtoRole.syncSystemRoleToLogto(memberEmail, 'customer_admin', 'remove');
    await m.logtoWs.removePortalMemberFromLogtoOrg(ownerEmail, memberEmail);
  } catch (e) {
    console.warn('[portal-team sync]', e.message);
  }
}

async function runAfterStaffTourManagerChange(emailNorm, action) {
  const m = getBookingPortalSync();
  if (!m) return;
  try {
    if (action === 'add') {
      await m.portalRbac.syncPortalStaffTourManagerRbac(emailNorm, 'add');
      await m.logtoRole.syncSystemRoleToLogto(emailNorm, 'tour_manager', 'add');
    } else {
      await m.portalRbac.syncPortalStaffTourManagerRbac(emailNorm, 'remove');
      await m.logtoRole.syncSystemRoleToLogto(emailNorm, 'tour_manager', 'remove');
    }
  } catch (e) {
    console.warn('[portal-team staff sync]', e.message);
  }
}

/** Workspace-Inhaber (customer_email der Tour); keine Zeile in portal_team_members. */
const ROLE_INHABER = 'inhaber';
const ROLE_ADMIN = 'admin';
const ROLE_MITARBEITER = 'mitarbeiter';
/** Intern: zentral in Admin vergeben; sieht alle Kunden-Touren (tour_manager.portal_staff_roles). */
const ROLE_TOUR_MANAGER = 'tour_manager';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeMemberRole(value) {
  const r = String(value || '').trim().toLowerCase();
  if (r === ROLE_ADMIN) return ROLE_ADMIN;
  if (r === ROLE_TOUR_MANAGER) return ROLE_TOUR_MANAGER;
  return ROLE_MITARBEITER;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function ensurePortalTeamSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.portal_team_members (
      id BIGSERIAL PRIMARY KEY,
      owner_email TEXT NOT NULL,
      member_email TEXT NOT NULL,
      display_name TEXT NULL,
      role TEXT NOT NULL DEFAULT 'mitarbeiter',
      status TEXT NOT NULL DEFAULT 'pending',
      invite_token_hash TEXT NULL,
      expires_at TIMESTAMPTZ NULL,
      invited_by TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ NULL
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_owner_member
    ON tour_manager.portal_team_members ((LOWER(owner_email)), (LOWER(member_email)))
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_portal_team_member_lookup
    ON tour_manager.portal_team_members ((LOWER(member_email)), status)
  `);
  await pool.query(`
    UPDATE tour_manager.portal_team_members
    SET role = 'mitarbeiter'
    WHERE role IS NULL OR LOWER(TRIM(role)) = 'member'
  `);
  // customer_id-Spalte: Migration 016 fügt diese hinzu, hier nur sicherstellen
  await pool.query(`
    ALTER TABLE tour_manager.portal_team_members
    ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES core.customers(id) ON DELETE CASCADE
  `).catch(() => null);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_customer_member
    ON tour_manager.portal_team_members (customer_id, (LOWER(TRIM(member_email))))
    WHERE customer_id IS NOT NULL
  `).catch(() => null);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.portal_team_exclusions (
      id BIGSERIAL PRIMARY KEY,
      owner_email TEXT NOT NULL,
      member_email TEXT NOT NULL,
      reason TEXT NULL,
      created_by TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_exclusions_owner_member
    ON tour_manager.portal_team_exclusions ((LOWER(owner_email)), (LOWER(member_email)))
  `);
  await pool.query(`
    ALTER TABLE tour_manager.portal_team_exclusions
    ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES core.customers(id) ON DELETE CASCADE
  `).catch(() => null);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.portal_tour_assignees (
      tour_id INTEGER PRIMARY KEY,
      assignee_email TEXT NOT NULL,
      workspace_owner_email TEXT NOT NULL,
      updated_by TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT portal_tour_assignees_tour_fk
        FOREIGN KEY (tour_id) REFERENCES tour_manager.tours(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_portal_tour_assignees_workspace
    ON tour_manager.portal_tour_assignees ((LOWER(workspace_owner_email)))
  `);
  await pool.query(`
    ALTER TABLE tour_manager.portal_tour_assignees
    ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES core.customers(id) ON DELETE CASCADE
  `).catch(() => null);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.portal_staff_roles (
      email_norm TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'tour_manager',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT NULL,
      PRIMARY KEY (email_norm, role)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_portal_staff_roles_role
    ON tour_manager.portal_staff_roles (role)
  `);
  schemaReady = true;
}

/**
 * Löst customer_id aus einer owner_email auf (über core.customers oder tours.kunde_ref).
 * Gibt null zurück wenn keine eindeutige Zuordnung möglich.
 */
async function resolveCustomerIdForOwnerEmail(ownerEmail) {
  const norm = normalizeEmail(ownerEmail);
  if (!norm) return null;
  let directResult;
  try {
    directResult = await pool.query(
      `SELECT id FROM core.customers
       WHERE core.customer_email_matches($1, email, email_aliases)
       LIMIT 1`,
      [norm]
    );
  } catch (_aliasErr) {
    // Fallback falls Migration noch nicht ausgeführt
    directResult = await pool.query(
      `SELECT id FROM core.customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
      [norm]
    );
  }
  const direct = directResult;
  if (direct.rows[0]?.id) return Number(direct.rows[0].id);

  const viaRef = await pool.query(
    `SELECT DISTINCT cu.id
     FROM tour_manager.tours t
     JOIN core.customers cu ON cu.customer_number = TRIM(CAST(t.kunde_ref AS TEXT))
     WHERE LOWER(TRIM(t.customer_email)) = $1
       AND t.kunde_ref IS NOT NULL AND TRIM(CAST(t.kunde_ref AS TEXT)) <> ''
     LIMIT 1`,
    [norm]
  );
  return viaRef.rows[0]?.id ? Number(viaRef.rows[0].id) : null;
}

/** Interner Tour-Manager (Propus): alle Kunden-Touren sichtbar. */
async function isGlobalTourManager(userEmail) {
  await ensurePortalTeamSchema();
  const norm = normalizeEmail(userEmail);
  if (!norm) return false;
  const m = getBookingPortalSync();
  if (m) {
    try {
      const ok = await m.portalRbac.emailHasPortalSystemRole(norm, ROLE_TOUR_MANAGER);
      if (ok) return true;
      if (await m.portalRbac.emailHasPortalPermission(norm, "tours.cross_company")) return true;
    } catch (_e) {
      /* Migration 060 evtl. noch nicht */
    }
  }
  const r = await pool.query(
    `SELECT 1 FROM tour_manager.portal_staff_roles
     WHERE email_norm = $1 AND role = $2 LIMIT 1`,
    [norm, ROLE_TOUR_MANAGER]
  );
  return !!r.rows[0];
}

async function listPortalStaffRoles() {
  await ensurePortalTeamSchema();
  const r = await pool.query(
    `SELECT email_norm, role, created_at, created_by
     FROM tour_manager.portal_staff_roles
     ORDER BY email_norm, role`
  );
  return r.rows;
}

async function addPortalStaffRole(emailRaw, roleRaw, createdBy) {
  await ensurePortalTeamSchema();
  const emailNorm = normalizeEmail(emailRaw);
  const role = String(roleRaw || ROLE_TOUR_MANAGER).trim().toLowerCase() || ROLE_TOUR_MANAGER;
  if (!emailNorm || !emailNorm.includes('@')) throw new Error('Ungültige E-Mail.');
  if (role !== ROLE_TOUR_MANAGER) throw new Error('Unbekannte Rolle.');
  await pool.query(
    `INSERT INTO tour_manager.portal_staff_roles (email_norm, role, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (email_norm, role) DO UPDATE SET created_by = EXCLUDED.created_by`,
    [emailNorm, role, createdBy ? normalizeEmail(createdBy) : null]
  );
  await runAfterStaffTourManagerChange(emailNorm, 'add');
}

async function removePortalStaffRole(emailRaw, roleRaw) {
  await ensurePortalTeamSchema();
  const emailNorm = normalizeEmail(emailRaw);
  const role = String(roleRaw || ROLE_TOUR_MANAGER).trim().toLowerCase() || ROLE_TOUR_MANAGER;
  await pool.query(
    `DELETE FROM tour_manager.portal_staff_roles WHERE email_norm = $1 AND role = $2`,
    [emailNorm, role]
  );
  await runAfterStaffTourManagerChange(emailNorm, 'remove');
}

/**
 * Alle Touren-Inhaber-E-Mails, für die der Nutzer das Portal sehen darf:
 * eigene Kunden-E-Mail, lokaler Firmenkontakt, Team-Mitgliedschaft,
 * oder Exxas-Kontakt der Organisation (kunde_ref).
 */
async function listTourOwnerEmailsForPortalUser(userEmail) {
  await ensurePortalTeamSchema();
  const norm = normalizeEmail(userEmail);
  if (await isGlobalTourManager(norm)) {
    const allRes = await pool.query(
      `SELECT DISTINCT LOWER(TRIM(customer_email)) AS e
       FROM tour_manager.tours
       WHERE customer_email IS NOT NULL AND TRIM(customer_email) <> ''`
    );
    return allRes.rows.map((row) => String(row.e || '').trim().toLowerCase()).filter(Boolean);
  }

  const owners = new Set();

  let directCheckResult;
  try {
    directCheckResult = await pool.query(
      `SELECT 1 FROM tour_manager.tours t
       WHERE LOWER(TRIM(t.customer_email)) = $1
          OR EXISTS (
            SELECT 1 FROM core.customers c
            WHERE core.customer_email_matches($1, c.email, c.email_aliases)
              AND core.customer_email_matches(t.customer_email, c.email, c.email_aliases)
          )
       LIMIT 1`,
      [norm]
    );
  } catch (_aliasErr) {
    // Fallback falls Migration noch nicht ausgeführt
    directCheckResult = await pool.query(
      `SELECT 1 FROM tour_manager.tours t WHERE LOWER(TRIM(t.customer_email)) = $1 LIMIT 1`,
      [norm]
    );
  }
  if (directCheckResult.rows[0]) owners.add(norm);

  // Lokaler Firmenkontakt: sieht alle Touren derselben customer_id,
  // auch wenn diese Touren unter anderen owner_email-Adressen laufen.
  const localContactCustomers = await pool.query(
    `SELECT DISTINCT t.customer_email AS e
     FROM core.customer_contacts cc
     JOIN tour_manager.tours t ON t.customer_id = cc.customer_id
     WHERE LOWER(TRIM(cc.email)) = $1
       AND t.customer_id IS NOT NULL
       AND t.customer_email IS NOT NULL
       AND TRIM(t.customer_email) <> ''`,
    [norm]
  );
  localContactCustomers.rows.forEach((r) => {
    const e = normalizeEmail(r.e);
    if (e) owners.add(e);
  });

  // Über customer_id: alle owner_emails der zugehörigen Firma
  const memberOfCustomers = await pool.query(
    `SELECT DISTINCT t.customer_email AS e
     FROM tour_manager.portal_team_members m
     JOIN tour_manager.tours t ON t.customer_id = m.customer_id
     WHERE LOWER(TRIM(m.member_email)) = $1
       AND m.status = 'active' AND m.accepted_at IS NOT NULL
       AND m.customer_id IS NOT NULL
       AND t.customer_email IS NOT NULL AND TRIM(t.customer_email) <> ''`,
    [norm]
  );
  memberOfCustomers.rows.forEach((r) => {
    const e = normalizeEmail(r.e);
    if (e) owners.add(e);
  });

  // Fallback: über owner_email für Zeilen ohne customer_id
  const memberOf = await pool.query(
    `SELECT DISTINCT LOWER(TRIM(owner_email)) AS e
     FROM tour_manager.portal_team_members
     WHERE LOWER(TRIM(member_email)) = $1 AND status = 'active' AND accepted_at IS NOT NULL
       AND customer_id IS NULL`,
    [norm]
  );
  memberOf.rows.forEach((r) => owners.add(r.e));

  const refsRes = await pool.query(
    `SELECT DISTINCT TRIM(CAST(kunde_ref AS TEXT)) AS ref
     FROM tour_manager.tours
     WHERE kunde_ref IS NOT NULL AND TRIM(CAST(kunde_ref AS TEXT)) <> ''`
  );
  const excludedOwnersForUser = await pool.query(
    `SELECT LOWER(TRIM(owner_email)) AS owner
     FROM tour_manager.portal_team_exclusions
     WHERE LOWER(TRIM(member_email)) = $1`,
    [norm]
  );
  const excludedOwners = new Set(excludedOwnersForUser.rows.map((r) => String(r.owner || '')));

  for (const row of refsRes.rows) {
    const ref = String(row.ref || '').trim();
    if (!ref) continue;

    const localCustomer = await customerLookup.getCustomerByExxasRef(ref);
    let hit = false;
    if (localCustomer) {
      if (normalizeEmail(localCustomer.email) === norm) hit = true;
      if (!hit) {
        const contacts = await customerLookup.getLocalContacts(localCustomer.id);
        hit = contacts.some((c) => normalizeEmail(c.email) === norm);
      }
    }

    if (!hit) {
      const { contacts } = await exxas.getContactsForCustomer(ref).catch(() => ({ contacts: [] }));
      hit = (contacts || []).some((c) => normalizeEmail(c.email) === norm);
      if (!hit) {
        const cust = await exxas.getCustomer(ref).catch(() => ({ customer: null }));
        const mainMail = cust?.customer?.email ? normalizeEmail(cust.customer.email) : '';
        if (mainMail && mainMail === norm) hit = true;
      }
    }
    if (!hit) continue;

    const ownRes = await pool.query(
      `SELECT DISTINCT LOWER(TRIM(customer_email)) AS e
       FROM tour_manager.tours
       WHERE TRIM(CAST(kunde_ref AS TEXT)) = $1`,
      [ref]
    );
    ownRes.rows.forEach((r) => {
      if (!excludedOwners.has(r.e)) owners.add(r.e);
    });
  }

  return Array.from(owners);
}

/**
 * Alle Exxas-Kunden-Refs (kunde_ref), die zu bereits sichtbaren Inhaber-E-Mails gehören.
 * Ermöglicht: Team-Mitglieder sehen alle Touren der Organisation, nicht nur die mit E-Mail des Inhabers.
 */
async function listOrgKundeRefsForOwnerEmails(ownerEmails) {
  const emails = (ownerEmails || []).map((e) => normalizeEmail(e)).filter(Boolean);
  if (!emails.length) return [];
  const r = await pool.query(
    `SELECT DISTINCT TRIM(CAST(kunde_ref AS TEXT)) AS ref
     FROM tour_manager.tours
     WHERE LOWER(TRIM(customer_email)) = ANY($1::text[])
       AND kunde_ref IS NOT NULL
       AND TRIM(CAST(kunde_ref AS TEXT)) <> ''`,
    [emails]
  );
  return r.rows
    .map((row) => String(row.ref || '').trim())
    .filter(Boolean);
}

/** Inhaber-E-Mails plus Organisations-Refs für Tour-Liste und Zugriffsprüfung (eine kombinierte Abfrage-Kette). */
async function getPortalTourAccessScope(userEmail) {
  const ownerEmails = await listTourOwnerEmailsForPortalUser(userEmail);
  const orgKundeRefs =
    ownerEmails.length > 0 ? await listOrgKundeRefsForOwnerEmails(ownerEmails) : [];
  return { ownerEmails, orgKundeRefs };
}

async function ensurePortalTourAccess(tourRow, userEmail) {
  if (!tourRow) return false;
  const { ownerEmails, orgKundeRefs } = await getPortalTourAccessScope(userEmail);
  const tourOwner = normalizeEmail(tourRow.customer_email);
  if (ownerEmails.includes(tourOwner)) return true;
  const ref = String(tourRow.kunde_ref ?? '').trim();
  if (!ref || !orgKundeRefs.length) return false;
  return orgKundeRefs.includes(ref);
}

async function listTeamMembers(ownerEmail) {
  await ensurePortalTeamSchema();
  const e = normalizeEmail(ownerEmail);
  const customerId = await resolveCustomerIdForOwnerEmail(e);
  let r;
  if (customerId) {
    r = await pool.query(
      `SELECT id, member_email, display_name, role, status, created_at, accepted_at, expires_at
       FROM tour_manager.portal_team_members
       WHERE customer_id = $1
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         accepted_at DESC NULLS LAST,
         created_at DESC`,
      [customerId]
    );
  } else {
    r = await pool.query(
      `SELECT id, member_email, display_name, role, status, created_at, accepted_at, expires_at
       FROM tour_manager.portal_team_members
       WHERE LOWER(owner_email) = $1
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         accepted_at DESC NULLS LAST,
         created_at DESC`,
      [e]
    );
  }
  return r.rows.map((row) => ({
    ...row,
    role: normalizeMemberRole(row.role),
  }));
}

/**
 * Personen aus Exxas (Kontakte + Haupt-E-Mail Kunde) für dieselbe Organisation wie die Touren des Inhabers.
 */
async function listExxasOrgPeersForOwner(ownerEmail) {
  await ensurePortalTeamSchema();
  const owner = normalizeEmail(ownerEmail);
  let refsRes;
  try {
    refsRes = await pool.query(
      `SELECT DISTINCT TRIM(CAST(kunde_ref AS TEXT)) AS ref
       FROM tour_manager.tours t
       WHERE (
         LOWER(TRIM(t.customer_email)) = $1
         OR EXISTS (
           SELECT 1 FROM core.customers c
           WHERE core.customer_email_matches($1, c.email, c.email_aliases)
             AND core.customer_email_matches(t.customer_email, c.email, c.email_aliases)
         )
       )
         AND kunde_ref IS NOT NULL
         AND TRIM(CAST(kunde_ref AS TEXT)) <> ''`,
      [owner]
    );
  } catch (_aliasErr) {
    refsRes = await pool.query(
      `SELECT DISTINCT TRIM(CAST(kunde_ref AS TEXT)) AS ref
       FROM tour_manager.tours t
       WHERE LOWER(TRIM(t.customer_email)) = $1
         AND kunde_ref IS NOT NULL
         AND TRIM(CAST(kunde_ref AS TEXT)) <> ''`,
      [owner]
    );
  }

  const peers = new Map();

  for (const row of refsRes.rows) {
    const ref = String(row.ref || '').trim();
    if (!ref) continue;

    const localCustomer = await customerLookup.getCustomerByExxasRef(ref);
    if (localCustomer) {
      const em = normalizeEmail(localCustomer.email);
      if (em) {
        peers.set(em, {
          email: em,
          name: localCustomer.company || localCustomer.name || em.split('@')[0],
          source: 'local',
        });
      }
      const contacts = await customerLookup.getLocalContacts(localCustomer.id);
      for (const c of contacts) {
        const cem = normalizeEmail(c.email);
        if (!cem) continue;
        if (!peers.has(cem)) {
          peers.set(cem, { email: cem, name: c.name || cem.split('@')[0], source: 'local' });
        }
      }
    } else {
      const custRes = await exxas.getCustomer(ref).catch(() => ({ customer: null }));
      if (custRes?.customer?.email) {
        const em = normalizeEmail(custRes.customer.email);
        if (em) peers.set(em, { email: em, name: custRes.customer.firmenname || em.split('@')[0], source: 'exxas' });
      }
      const { contacts } = await exxas.getContactsForCustomer(ref).catch(() => ({ contacts: [] }));
      for (const c of contacts || []) {
        const cem = normalizeEmail(c.email);
        if (!cem) continue;
        if (!peers.has(cem)) peers.set(cem, { email: cem, name: c.name || cem.split('@')[0], source: 'exxas' });
      }
    }
  }

  const ownerCustomerId = await resolveCustomerIdForOwnerEmail(owner);
  let excluded;
  if (ownerCustomerId) {
    excluded = await pool.query(
      `SELECT LOWER(TRIM(member_email)) AS email
       FROM tour_manager.portal_team_exclusions
       WHERE customer_id = $1`,
      [ownerCustomerId]
    );
  } else {
    excluded = await pool.query(
      `SELECT LOWER(TRIM(member_email)) AS email
       FROM tour_manager.portal_team_exclusions
       WHERE LOWER(TRIM(owner_email)) = $1`,
      [owner]
    );
  }
  const excludedSet = new Set(excluded.rows.map((r) => String(r.email || '')));

  return Array.from(peers.values()).filter((p) => !excludedSet.has(normalizeEmail(p.email)));
}

/** Inhaber des Arbeitsbereichs oder delegierter Administrator */
async function getPortalTeamManageContext(sessionEmail, ownerEmail) {
  await ensurePortalTeamSchema();
  const session = normalizeEmail(sessionEmail);
  const owner = normalizeEmail(ownerEmail);
  if (!owner) return { canManage: false, isWorkspaceOwner: false, sessionRole: null };

  if (await isGlobalTourManager(session)) {
    return { canManage: true, isWorkspaceOwner: false, sessionRole: ROLE_TOUR_MANAGER };
  }

  const m = getBookingPortalSync();
  if (m) {
    try {
      if (await m.portalRbac.emailHasPortalPermission(session, "portal_team.manage")) {
        return { canManage: true, isWorkspaceOwner: false, sessionRole: ROLE_TOUR_MANAGER };
      }
    } catch (_e) {
      /* RBAC nicht verfügbar */
    }
  }

  const isWorkspaceOwner = session === owner;

  let sessionRole = null;
  if (!isWorkspaceOwner) {
    const ownerCustomerId = await resolveCustomerIdForOwnerEmail(owner);
    let r;
    if (ownerCustomerId) {
      r = await pool.query(
        `SELECT role FROM tour_manager.portal_team_members
         WHERE customer_id = $1 AND LOWER(TRIM(member_email)) = $2
           AND status = 'active' AND accepted_at IS NOT NULL
         LIMIT 1`,
        [ownerCustomerId, session]
      );
    } else {
      r = await pool.query(
        `SELECT role FROM tour_manager.portal_team_members
         WHERE LOWER(owner_email) = $1 AND LOWER(member_email) = $2
           AND status = 'active' AND accepted_at IS NOT NULL
         LIMIT 1`,
        [owner, session]
      );
    }
    const role = r.rows[0]?.role;
    sessionRole = role ? normalizeMemberRole(role) : null;
  }

  const canManage = isWorkspaceOwner || sessionRole === ROLE_ADMIN;

  return { canManage, isWorkspaceOwner, sessionRole };
}

async function assertCanManageTeam(sessionEmail, ownerEmail) {
  const ctx = await getPortalTeamManageContext(sessionEmail, ownerEmail);
  if (!ctx.canManage) {
    const err = new Error('Keine Berechtigung.');
    err.code = 'FORBIDDEN';
    throw err;
  }
}

// ─── Tour-Zuständigkeit (Ansprechpartner pro Tour, Workspace = customer_email der Tour) ───

async function batchGetTourAssignees(tourIds) {
  const ids = (tourIds || []).filter((id) => Number.isFinite(Number(id))).map((id) => Number(id));
  if (!ids.length) return new Map();
  await ensurePortalTeamSchema();
  const r = await pool.query(
    `SELECT tour_id, assignee_email, workspace_owner_email, updated_at
     FROM tour_manager.portal_tour_assignees
     WHERE tour_id = ANY($1::int[])`,
    [ids]
  );
  const map = new Map();
  for (const row of r.rows) {
    map.set(row.tour_id, {
      assigneeEmail: normalizeEmail(row.assignee_email),
      workspaceOwnerEmail: normalizeEmail(row.workspace_owner_email),
      updatedAt: row.updated_at,
    });
  }
  return map;
}

async function batchResolvePortalLabels(emails) {
  const uniq = [...new Set((emails || []).map((e) => normalizeEmail(e)).filter(Boolean))];
  const m = new Map();
  if (!uniq.length) return m;
  await userProfiles.ensureSchema();
  const r = await pool.query(
    `SELECT user_key, display_name
     FROM tour_manager.user_profile_settings
     WHERE realm = 'portal' AND LOWER(user_key) = ANY($1::text[])`,
    [uniq]
  );
  for (const row of r.rows) {
    const k = normalizeEmail(row.user_key);
    const dn = String(row.display_name || '').trim();
    m.set(k, dn || userProfiles.deriveNameFromEmail(k));
  }
  for (const e of uniq) {
    if (!m.has(e)) m.set(e, userProfiles.deriveNameFromEmail(e));
  }
  return m;
}

/** Inhaber + aktive Team-Mitglieder des Arbeitsbereichs (für Zuständigkeits-Dropdown). */
async function listAssignableCandidatesForWorkspace(ownerEmail) {
  await ensurePortalTeamSchema();
  await userProfiles.ensureSchema();
  const owner = normalizeEmail(ownerEmail);
  if (!owner) return [];
  const prof = await pool.query(
    `SELECT display_name FROM tour_manager.user_profile_settings
     WHERE realm = 'portal' AND LOWER(user_key) = $1`,
    [owner]
  );
  const ownerDisplay =
    String(prof.rows[0]?.display_name || '').trim() || userProfiles.deriveNameFromEmail(owner);
  const candidates = [{ email: owner, label: `${ownerDisplay} (Inhaber)` }];
  const seen = new Set([owner]);
  const members = await listTeamMembers(owner);
  for (const m of members) {
    if (m.status !== 'active' || !m.accepted_at) continue;
    const em = normalizeEmail(m.member_email);
    if (!em || seen.has(em)) continue;
    seen.add(em);
    const dn = String(m.display_name || '').trim() || userProfiles.deriveNameFromEmail(em);
    candidates.push({ email: em, label: dn });
  }
  candidates.sort((a, b) => {
    if (a.email === owner) return -1;
    if (b.email === owner) return 1;
    return a.label.localeCompare(b.label, 'de');
  });
  return candidates;
}

async function canSetTourAssignee(sessionEmail, tourRow) {
  if (!tourRow) return false;
  const workspace = normalizeEmail(tourRow.customer_email);
  if (!workspace) return false;
  const ctx = await getPortalTeamManageContext(sessionEmail, workspace);
  return ctx.canManage;
}

/**
 * UI-Bundle: Zuständigkeit je Tour, Bearbeitbarkeit, Kandidaten pro Workspace (nur wenn Admin/Inhaber).
 */
async function getPortalTourAssigneeBundle(sessionEmail, tours) {
  await ensurePortalTeamSchema();
  const list = Array.isArray(tours) ? tours : [];
  const tourIds = list.map((t) => t.id).filter((id) => Number.isFinite(Number(id)));
  const assigneeMap = await batchGetTourAssignees(tourIds);
  const assigneeEmails = [...assigneeMap.values()].map((v) => v.assigneeEmail).filter(Boolean);
  const labelMap = await batchResolvePortalLabels(assigneeEmails);

  const workspaces = [...new Set(list.map((t) => normalizeEmail(t.customer_email)).filter(Boolean))];
  const canByWs = new Map();
  await Promise.all(
    workspaces.map(async (w) => {
      const ctx = await getPortalTeamManageContext(sessionEmail, w);
      canByWs.set(w, ctx.canManage);
    })
  );

  const candidatesByWorkspace = {};
  const defaultAssigneeByWorkspace = {};
  for (const w of workspaces) {
    const candidates = await listAssignableCandidatesForWorkspace(w);
    if (candidates.length > 0) {
      defaultAssigneeByWorkspace[w] = candidates[0];
    }
    if (canByWs.get(w)) {
      candidatesByWorkspace[w] = candidates;
    }
  }

  const assigneeByTourId = {};
  const canManageByTourId = {};
  for (const t of list) {
    const w = normalizeEmail(t.customer_email);
    canManageByTourId[t.id] = !!canByWs.get(w);
    const a = assigneeMap.get(t.id);
    assigneeByTourId[t.id] = a
      ? { email: a.assigneeEmail, label: labelMap.get(a.assigneeEmail) || a.assigneeEmail }
      : (defaultAssigneeByWorkspace[w]
          ? {
              email: defaultAssigneeByWorkspace[w].email,
              label: defaultAssigneeByWorkspace[w].label,
            }
          : null);
  }

  return { assigneeByTourId, canManageByTourId, candidatesByWorkspace };
}

async function setTourAssignee(tourRow, assigneeRaw, sessionEmail) {
  await ensurePortalTeamSchema();
  if (!tourRow?.id) throw new Error('Tour ungültig.');
  const workspace = normalizeEmail(tourRow.customer_email);
  if (!workspace) throw new Error('Für diese Tour ist keine Inhaber-E-Mail hinterlegt.');
  await assertCanManageTeam(sessionEmail, workspace);

  const raw = assigneeRaw !== undefined && assigneeRaw !== null ? String(assigneeRaw).trim() : '';
  if (!raw) {
    await pool.query(`DELETE FROM tour_manager.portal_tour_assignees WHERE tour_id = $1`, [tourRow.id]);
    return;
  }

  const assignee = normalizeEmail(raw);
  if (!assignee.includes('@')) throw new Error('Ungültige E-Mail.');

  const candidates = await listAssignableCandidatesForWorkspace(workspace);
  if (!candidates.some((c) => c.email === assignee)) {
    throw new Error('Diese Person kann nicht als Zuständige*r gesetzt werden.');
  }

  const by = normalizeEmail(sessionEmail);
  const wsCustomerId = await resolveCustomerIdForOwnerEmail(workspace);
  await pool.query(
    `INSERT INTO tour_manager.portal_tour_assignees
      (tour_id, assignee_email, workspace_owner_email, updated_by, updated_at, customer_id)
     VALUES ($1, $2, $3, $4, NOW(), $5)
     ON CONFLICT (tour_id) DO UPDATE SET
       assignee_email = EXCLUDED.assignee_email,
       workspace_owner_email = EXCLUDED.workspace_owner_email,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW(),
       customer_id = COALESCE(EXCLUDED.customer_id, tour_manager.portal_tour_assignees.customer_id)`,
    [tourRow.id, assignee, workspace, by || null, wsCustomerId || null]
  );
}

async function createTeamInvite({ ownerEmail, inviterEmail, memberEmail, displayName, role }) {
  await ensurePortalTeamSchema();
  const owner = normalizeEmail(ownerEmail);
  const member = normalizeEmail(memberEmail);
  const rawRole = String(role || '').trim().toLowerCase();
  if (rawRole === ROLE_TOUR_MANAGER) {
    throw new Error('Die Rolle „Tour-Manager“ wird nur zentral in der Verwaltung vergeben.');
  }
  const memberRole = normalizeMemberRole(role);
  if (!member || !member.includes('@')) throw new Error('Ungültige E-Mail.');
  if (member === owner) throw new Error('Sie können sich nicht selbst einladen.');

  const ownerCustomerId = await resolveCustomerIdForOwnerEmail(owner);

  let existing;
  if (ownerCustomerId) {
    existing = await pool.query(
      `SELECT id, status FROM tour_manager.portal_team_members
       WHERE customer_id = $1 AND LOWER(TRIM(member_email)) = $2`,
      [ownerCustomerId, member]
    );
  } else {
    existing = await pool.query(
      `SELECT id, status FROM tour_manager.portal_team_members
       WHERE LOWER(owner_email) = $1 AND LOWER(member_email) = $2`,
      [owner, member]
    );
  }
  if (existing.rows[0]?.status === 'active') throw new Error('Diese Person ist bereits im Team.');

  const token = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE tour_manager.portal_team_members
       SET display_name = $2, role = $3, status = 'pending', invite_token_hash = $4, expires_at = $5,
           invited_by = $6, accepted_at = NULL, created_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, displayName || null, memberRole, tokenHash, expiresAt, normalizeEmail(inviterEmail)]
    );
  } else {
    await pool.query(
      `INSERT INTO tour_manager.portal_team_members
        (owner_email, member_email, display_name, role, status, invite_token_hash, expires_at, invited_by, customer_id)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)`,
      [owner, member, displayName || null, memberRole, tokenHash, expiresAt, normalizeEmail(inviterEmail), ownerCustomerId || null]
    );
  }

  return { token, expiresAt, memberEmail: member };
}

async function getInviteByToken(token) {
  await ensurePortalTeamSchema();
  const h = hashToken(token);
  const r = await pool.query(
    `SELECT * FROM tour_manager.portal_team_members
     WHERE invite_token_hash = $1 AND status = 'pending' AND expires_at > NOW()`,
    [h]
  );
  return r.rows[0] || null;
}

async function acceptTeamInvite(token, userEmail) {
  await ensurePortalTeamSchema();
  const row = await getInviteByToken(token);
  if (!row) throw new Error('Einladung ungültig oder abgelaufen.');
  const invited = normalizeEmail(row.member_email);
  const session = normalizeEmail(userEmail);
  if (invited !== session) throw new Error('Bitte mit der eingeladenen E-Mail-Adresse anmelden.');

  await pool.query(
    `UPDATE tour_manager.portal_team_members
     SET status = 'active', accepted_at = NOW(), invite_token_hash = NULL
     WHERE id = $1`,
    [row.id]
  );
  await runAfterTeamMemberDbChange(row.owner_email, row.member_email);
  return row;
}

async function revokeTeamMember(ownerEmail, memberId) {
  await ensurePortalTeamSchema();
  const owner = normalizeEmail(ownerEmail);
  const ownerCustomerId = await resolveCustomerIdForOwnerEmail(owner);
  let existing;
  if (ownerCustomerId) {
    existing = await pool.query(
      `SELECT member_email FROM tour_manager.portal_team_members
       WHERE id = $1 AND customer_id = $2`,
      [memberId, ownerCustomerId]
    );
  } else {
    existing = await pool.query(
      `SELECT member_email FROM tour_manager.portal_team_members
       WHERE id = $1 AND LOWER(owner_email) = $2`,
      [memberId, owner]
    );
  }
  const memberEmail = existing.rows[0]?.member_email;
  if (ownerCustomerId) {
    await pool.query(
      `DELETE FROM tour_manager.portal_team_members WHERE id = $1 AND customer_id = $2`,
      [memberId, ownerCustomerId]
    );
  } else {
    await pool.query(
      `DELETE FROM tour_manager.portal_team_members WHERE id = $1 AND LOWER(owner_email) = $2`,
      [memberId, owner]
    );
  }
  if (memberEmail) await runAfterTeamMemberRemoved(owner, normalizeEmail(memberEmail));
}

async function updateTeamMemberRole(ownerEmail, memberId, newRole) {
  await ensurePortalTeamSchema();
  const role = normalizeMemberRole(newRole);
  const owner = normalizeEmail(ownerEmail);
  const ownerCustomerId = await resolveCustomerIdForOwnerEmail(owner);
  let r;
  if (ownerCustomerId) {
    r = await pool.query(
      `UPDATE tour_manager.portal_team_members
       SET role = $3
       WHERE id = $1 AND customer_id = $2 AND status = 'active'
       RETURNING id, owner_email, member_email`,
      [memberId, ownerCustomerId, role]
    );
  } else {
    r = await pool.query(
      `UPDATE tour_manager.portal_team_members
       SET role = $3
       WHERE id = $1 AND LOWER(owner_email) = $2 AND status = 'active'
       RETURNING id, owner_email, member_email`,
      [memberId, owner, role]
    );
  }
  if (r.rowCount > 0 && r.rows[0]) {
    await runAfterTeamMemberDbChange(r.rows[0].owner_email, r.rows[0].member_email);
  }
  return r.rowCount > 0;
}

async function getMemberRowForManage(memberId) {
  await ensurePortalTeamSchema();
  const id = parseInt(String(memberId), 10);
  if (!Number.isFinite(id)) return null;
  const r = await pool.query(
    `SELECT id, owner_email, member_email, status FROM tour_manager.portal_team_members WHERE id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function setExxasMemberExcluded(ownerEmail, memberEmail, createdBy, reason = 'manual_remove') {
  await ensurePortalTeamSchema();
  const owner = normalizeEmail(ownerEmail);
  const member = normalizeEmail(memberEmail);
  if (!owner || !member) return false;
  const ownerCustomerId = await resolveCustomerIdForOwnerEmail(owner);
  if (ownerCustomerId) {
    await pool.query(
      `INSERT INTO tour_manager.portal_team_exclusions (owner_email, member_email, reason, created_by, customer_id)
       VALUES ($1, TRIM($2), $3, $4, $5)
       ON CONFLICT (customer_id, (LOWER(TRIM(member_email)))) WHERE customer_id IS NOT NULL
       DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = NOW()`,
      [owner, member, String(reason || 'manual_remove'), normalizeEmail(createdBy), ownerCustomerId]
    );
  } else {
    await pool.query(
      `INSERT INTO tour_manager.portal_team_exclusions (owner_email, member_email, reason, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ((LOWER(owner_email)), (LOWER(member_email)))
       DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = NOW()`,
      [owner, member, String(reason || 'manual_remove'), normalizeEmail(createdBy)]
    );
  }
  return true;
}

async function clearExxasMemberExcluded(ownerEmail, memberEmail) {
  await ensurePortalTeamSchema();
  const owner = normalizeEmail(ownerEmail);
  const member = normalizeEmail(memberEmail);
  if (!owner || !member) return false;
  const ownerCustomerId = await resolveCustomerIdForOwnerEmail(owner);
  if (ownerCustomerId) {
    await pool.query(
      `DELETE FROM tour_manager.portal_team_exclusions
       WHERE customer_id = $1 AND LOWER(TRIM(member_email)) = $2`,
      [ownerCustomerId, member]
    );
  } else {
    await pool.query(
      `DELETE FROM tour_manager.portal_team_exclusions
       WHERE LOWER(TRIM(owner_email)) = $1 AND LOWER(TRIM(member_email)) = $2`,
      [owner, member]
    );
  }
  return true;
}

/** Zwei Nutzer dürfen sich gegenseitig Profilbilder sehen, wenn sie einen gemeinsamen Touren-Inhaber-Kontext haben. */
async function canViewPortalIdentity(viewerEmail, targetEmail) {
  const viewer = normalizeEmail(viewerEmail);
  const target = normalizeEmail(targetEmail);
  if (!viewer || !target) return false;
  if (viewer === target) return true;

  const vOwners = new Set(await listTourOwnerEmailsForPortalUser(viewer));
  const tOwners = new Set(await listTourOwnerEmailsForPortalUser(target));
  for (const o of vOwners) {
    if (tOwners.has(o)) return true;
  }
  return false;
}

function getPortalBaseUrl() {
  return process.env.PORTAL_BASE_URL || 'https://tour.propus.ch';
}

/**
 * Mitarbeiter sehen nur Touren ohne fremde Zustaendigkeit oder mit eigener Zuweisung.
 * Inhaber/Admin sehen alle Touren des Workspaces.
 */
async function filterToursForMitarbeiterAssignee(userEmail, tours) {
  await ensurePortalTeamSchema();
  const list = Array.isArray(tours) ? tours : [];
  if (!list.length) return [];
  const norm = normalizeEmail(userEmail);
  if (await isGlobalTourManager(norm)) return list;
  const tourIds = list.map((t) => t.id).filter((id) => Number.isFinite(Number(id)));
  const assigneeMap = await batchGetTourAssignees(tourIds);
  const out = [];
  for (const t of list) {
    const workspace = normalizeEmail(t.customer_email);
    const ctx = await getPortalTeamManageContext(norm, workspace);
    if (ctx.isWorkspaceOwner || ctx.sessionRole === ROLE_ADMIN || ctx.sessionRole === ROLE_TOUR_MANAGER) {
      out.push(t);
      continue;
    }
    if (ctx.sessionRole === ROLE_MITARBEITER) {
      const a = assigneeMap.get(t.id);
      if (!a || normalizeEmail(a.assigneeEmail) === norm) {
        out.push(t);
      }
      continue;
    }
    out.push(t);
  }
  return out;
}

module.exports = {
  ROLE_INHABER,
  ROLE_ADMIN,
  ROLE_MITARBEITER,
  ROLE_TOUR_MANAGER,
  ensurePortalTeamSchema,
  isGlobalTourManager,
  listPortalStaffRoles,
  addPortalStaffRole,
  removePortalStaffRole,
  normalizeEmail,
  normalizeMemberRole,
  resolveCustomerIdForOwnerEmail,
  listTourOwnerEmailsForPortalUser,
  listOrgKundeRefsForOwnerEmails,
  getPortalTourAccessScope,
  ensurePortalTourAccess,
  listAssignableCandidatesForWorkspace,
  canSetTourAssignee,
  getPortalTourAssigneeBundle,
  setTourAssignee,
  listTeamMembers,
  listExxasOrgPeersForOwner,
  getPortalTeamManageContext,
  assertCanManageTeam,
  createTeamInvite,
  getInviteByToken,
  acceptTeamInvite,
  revokeTeamMember,
  updateTeamMemberRole,
  getMemberRowForManage,
  setExxasMemberExcluded,
  clearExxasMemberExcluded,
  canViewPortalIdentity,
  getPortalBaseUrl,
  filterToursForMitarbeiterAssignee,
};
