/**
 * Tour-Portal-Workspaces als Logto Organizations + Organization Roles.
 */
const logtoClient = require("./logto-client");
const db = require("./db");

const SOURCE = "tour-portal";

const ORG_ROLE_OWNER = "workspace_owner";
const ORG_ROLE_ADMIN = "workspace_admin";
const ORG_ROLE_MEMBER = "workspace_member";

function normEmail(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

async function ensurePortalWorkspaceOrgRolesDefined() {
  if (!logtoClient.isConfigured()) return false;
  await logtoClient.ensureOrganizationRole(ORG_ROLE_OWNER, "Propus Portal: Inhaber des Arbeitsbereichs");
  await logtoClient.ensureOrganizationRole(ORG_ROLE_ADMIN, "Propus Portal: Kunden-Admin");
  await logtoClient.ensureOrganizationRole(ORG_ROLE_MEMBER, "Propus Portal: Team-Mitglied");
  return true;
}

async function findWorkspaceOrganizationByOwnerEmail(ownerEmail) {
  if (!logtoClient.isConfigured()) return null;
  const norm = normEmail(ownerEmail);
  if (!norm) return null;
  const orgs = await logtoClient.listOrganizations({ pageSize: 200 });
  return (
    orgs.find(
      (o) =>
        o?.customData?.source === SOURCE &&
        normEmail(o?.customData?.ownerEmail) === norm
    ) || null
  );
}

/**
 * Sucht eine Logto-Org über customerId (bevorzugter Cutover-Pfad).
 * Fallback: ownerEmail (Bestandsdaten).
 */
async function findWorkspaceOrganizationByCustomerId(customerId) {
  if (!logtoClient.isConfigured()) return null;
  if (!customerId) return null;
  const id = Number(customerId);
  if (!Number.isFinite(id)) return null;
  const orgs = await logtoClient.listOrganizations({ pageSize: 200 });
  return (
    orgs.find(
      (o) =>
        o?.customData?.source === SOURCE &&
        Number(o?.customData?.customerId) === id
    ) || null
  );
}

async function loadCustomerMetaForOwner(ownerEmail) {
  const norm = normEmail(ownerEmail);
  if (!norm) return { customerId: null, displayName: norm };
  const { rows } = await db.query(
    `SELECT id,
            COALESCE(NULLIF(trim(company),''), NULLIF(trim(name),''), email) AS label
     FROM core.customers
     WHERE core.customer_email_matches($1, email, email_aliases)
     LIMIT 1`,
    [norm]
  );
  const row = rows[0];
  return {
    customerId: row?.id != null ? Number(row.id) : null,
    displayName: String(row?.label || norm).trim() || norm,
  };
}

async function loadCustomerMetaById(customerId) {
  const id = Number(customerId);
  if (!Number.isFinite(id)) return null;
  const { rows } = await db.query(
    `SELECT id, email,
            COALESCE(NULLIF(trim(company),''), NULLIF(trim(name),''), email) AS label
     FROM core.customers
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    customerId: Number(row.id),
    email: normEmail(row.email),
    displayName: String(row.label || '').trim() || String(row.email || ''),
  };
}

/**
 * Stellt sicher, dass eine Logto-Org für diesen Tour-Workspace existiert.
 * Bevorzugt customerId-Lookup; fällt auf ownerEmail zurück für Bestandsdaten.
 */
async function ensureWorkspaceOrganizationForOwner(ownerEmail) {
  if (!logtoClient.isConfigured()) return null;
  const norm = normEmail(ownerEmail);
  if (!norm) return null;
  await ensurePortalWorkspaceOrgRolesDefined();

  const meta = await loadCustomerMetaForOwner(norm);

  // Bevorzuge Lookup über customerId wenn vorhanden
  let org = null;
  if (meta.customerId) {
    org = await findWorkspaceOrganizationByCustomerId(meta.customerId);
  }
  if (!org) {
    org = await findWorkspaceOrganizationByOwnerEmail(norm);
  }

  if (!org) {
    org = await logtoClient.createOrganization({
      name: meta.displayName.slice(0, 128),
      description: "Propus Tour-Portal Arbeitsbereich",
      customData: {
        source: SOURCE,
        ownerEmail: norm,
        customerId: meta.customerId,
      },
    });
  } else {
    // Bestehende Org: customerId und Name aktualisieren (Cutover-Anreicherung)
    const updates = {};
    const name = meta.displayName.slice(0, 128);
    if (name && org.name !== name) updates.name = name;
    const needsCustomerIdPatch =
      meta.customerId &&
      Number(org.customData?.customerId) !== meta.customerId;
    if (needsCustomerIdPatch) {
      updates.customData = {
        ...org.customData,
        customerId: meta.customerId,
        ownerEmail: norm,
      };
    }
    if (Object.keys(updates).length > 0) {
      try {
        await logtoClient.updateOrganization(org.id, updates);
      } catch (_e) {}
    }
  }
  return org;
}

/**
 * Stellt sicher, dass eine Logto-Org für eine Firma über customer_id existiert.
 * Direkter Cutover-Pfad ohne E-Mail-Abhängigkeit.
 */
async function ensureWorkspaceOrganizationForCustomer(customerId) {
  if (!logtoClient.isConfigured()) return null;
  const id = Number(customerId);
  if (!Number.isFinite(id)) return null;
  await ensurePortalWorkspaceOrgRolesDefined();

  const meta = await loadCustomerMetaById(id);
  if (!meta) return null;

  let org = await findWorkspaceOrganizationByCustomerId(id);
  if (!org && meta.email) {
    org = await findWorkspaceOrganizationByOwnerEmail(meta.email);
  }

  if (!org) {
    org = await logtoClient.createOrganization({
      name: meta.displayName.slice(0, 128),
      description: "Propus Tour-Portal Arbeitsbereich",
      customData: {
        source: SOURCE,
        customerId: id,
        ownerEmail: meta.email || null,
      },
    });
  } else {
    const updates = {};
    const name = meta.displayName.slice(0, 128);
    if (name && org.name !== name) updates.name = name;
    if (Number(org.customData?.customerId) !== id) {
      updates.customData = { ...org.customData, customerId: id, ownerEmail: meta.email || org.customData?.ownerEmail };
    }
    if (Object.keys(updates).length > 0) {
      try {
        await logtoClient.updateOrganization(org.id, updates);
      } catch (_e) {}
    }
  }
  return org;
}

function mapPortalRoleToOrgRoleNames(portalRole, isOwnerEmail) {
  if (isOwnerEmail) return [ORG_ROLE_OWNER];
  const r = String(portalRole || "").trim().toLowerCase();
  if (r === "admin") return [ORG_ROLE_ADMIN];
  return [ORG_ROLE_MEMBER];
}

async function clearWorkspaceOrgRolesForUser(orgId, userId) {
  await logtoClient.removeOrganizationRolesFromUser(orgId, userId, [
    ORG_ROLE_OWNER,
    ORG_ROLE_ADMIN,
    ORG_ROLE_MEMBER,
  ]);
}

/**
 * Mitglied im Workspace in Logto-Org spiegeln (aktive Zeile).
 */
async function syncPortalMemberToLogtoOrg(ownerEmail, memberEmail, portalRole) {
  if (!logtoClient.isConfigured()) return { skipped: true };
  const owner = normEmail(ownerEmail);
  const member = normEmail(memberEmail);
  if (!owner || !member) return { skipped: true };

  await ensurePortalWorkspaceOrgRolesDefined();
  const org = await ensureWorkspaceOrganizationForOwner(owner);
  if (!org?.id) return { skipped: true };

  const user = await logtoClient.findUserByEmail(member);
  if (!user?.id) {
    console.warn("[logto-portal-workspace] Kein Logto-User für", member);
    return { skipped: true, reason: "no_logto_user" };
  }

  try {
    await logtoClient.addUsersToOrganization(org.id, [user.id]);
  } catch (e) {
    if (e.status !== 422 && e.status !== 409) throw e;
  }

  await clearWorkspaceOrgRolesForUser(org.id, user.id);
  const isOwner = member === owner;
  const names = mapPortalRoleToOrgRoleNames(portalRole, isOwner);
  await logtoClient.assignOrganizationRolesToUser(org.id, user.id, names);
  return { ok: true, orgId: org.id };
}

/** Workspace-Inhaber (owner_email) als Owner in der Org. */
async function syncWorkspaceOwnerToLogtoOrg(ownerEmail) {
  const owner = normEmail(ownerEmail);
  if (!owner) return { skipped: true };
  return syncPortalMemberToLogtoOrg(owner, owner, "inhaber");
}

/** User aus Workspace-Org entfernen (Team entfernt oder inaktiv). */
async function removePortalMemberFromLogtoOrg(ownerEmail, memberEmail) {
  if (!logtoClient.isConfigured()) return { skipped: true };
  const owner = normEmail(ownerEmail);
  const member = normEmail(memberEmail);
  if (!owner || !member) return { skipped: true };
  const org = await findWorkspaceOrganizationByOwnerEmail(owner);
  if (!org?.id) return { skipped: true };
  const user = await logtoClient.findUserByEmail(member);
  if (!user?.id) return { skipped: true };
  await logtoClient.removeUserFromOrganization(org.id, user.id);
  return { ok: true };
}

module.exports = {
  SOURCE,
  ORG_ROLE_OWNER,
  ORG_ROLE_ADMIN,
  ORG_ROLE_MEMBER,
  ensurePortalWorkspaceOrgRolesDefined,
  findWorkspaceOrganizationByOwnerEmail,
  findWorkspaceOrganizationByCustomerId,
  ensureWorkspaceOrganizationForOwner,
  ensureWorkspaceOrganizationForCustomer,
  syncPortalMemberToLogtoOrg,
  syncWorkspaceOwnerToLogtoOrg,
  removePortalMemberFromLogtoOrg,
};
