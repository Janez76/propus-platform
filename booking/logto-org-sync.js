/**
 * Sync Propus companies (core.companies) with Logto Organizations.
 * Links via organization.customData: { source: 'propus-core', companyId: number }
 */

const logtoClient = require('./logto-client');
const logtoPortalWorkspace = require('./logto-portal-workspace-sync');

const SOURCE = 'propus-core';

async function findOrganizationByCompanyId(companyId) {
  if (!logtoClient.isConfigured()) return null;
  const cid = Number(companyId);
  if (!Number.isFinite(cid)) return null;
  const orgs = await logtoClient.listOrganizations({ pageSize: 200 });
  return (
    orgs.find(
      (o) =>
        o?.customData?.source === SOURCE && Number(o.customData?.companyId) === cid,
    ) || null
  );
}

/**
 * Ensure a Logto organization exists for this company; optionally update name.
 */
async function ensureOrganizationForCompany(company) {
  if (!logtoClient.isConfigured() || !company?.id) return null;
  const name = String(company.name || '').trim();
  if (!name) return null;
  let org = await findOrganizationByCompanyId(company.id);
  if (!org) {
    org = await logtoClient.createOrganization({
      name,
      description: 'Propus Firmenkonto',
      customData: {
        source: SOURCE,
        companyId: Number(company.id),
        slug: String(company.slug || '').trim(),
      },
    });
    return org;
  }
  if (org.name !== name) {
    try {
      await logtoClient.updateOrganization(org.id, { name });
    } catch (_e) {}
  }
  return org;
}

async function deleteOrganizationForCompany(companyId) {
  if (!logtoClient.isConfigured()) return;
  const org = await findOrganizationByCompanyId(companyId);
  if (!org?.id) return;
  try {
    const users = await logtoClient.getOrganizationUsers(org.id);
    for (const u of users) {
      const uid = u?.id || u?.userId;
      if (uid) await logtoClient.removeUserFromOrganization(org.id, uid);
    }
    await logtoClient.deleteOrganization(org.id);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
}

async function resolveLogtoUserIdForMember(member) {
  const sub = String(member?.auth_subject || '').trim();
  if (sub) {
    try {
      await logtoClient.getUserById(sub);
      return sub;
    } catch (_e) {}
  }
  const email = String(member?.email || '').trim().toLowerCase();
  if (email.includes('@')) {
    const u = await logtoClient.findUserByEmail(email);
    return u?.id || null;
  }
  return null;
}

async function addCompanyMemberToLogtoOrg(companyId, member) {
  if (!logtoClient.isConfigured() || !member) return;
  const org = await findOrganizationByCompanyId(companyId);
  if (!org?.id) return;
  const userId = await resolveLogtoUserIdForMember(member);
  if (!userId) return;
  try {
    await logtoClient.addUsersToOrganization(org.id, [userId]);
  } catch (e) {
    if (e.status !== 422 && e.status !== 409) throw e;
  }
}

async function removeCompanyMemberFromLogtoOrg(companyId, member) {
  if (!logtoClient.isConfigured() || !member) return;
  const org = await findOrganizationByCompanyId(companyId);
  if (!org?.id) return;
  const userId = await resolveLogtoUserIdForMember(member);
  if (!userId) return;
  await logtoClient.removeUserFromOrganization(org.id, userId);
}

module.exports = {
  findOrganizationByCompanyId,
  ensureOrganizationForCompany,
  deleteOrganizationForCompany,
  addCompanyMemberToLogtoOrg,
  removeCompanyMemberFromLogtoOrg,
  resolveLogtoUserIdForMember,
  // Tour-Portal-Workspaces (Logto Organizations + Org-Rollen)
  portalWorkspace: logtoPortalWorkspace,
  ensurePortalWorkspaceOrgRolesDefined: logtoPortalWorkspace.ensurePortalWorkspaceOrgRolesDefined,
  ensureWorkspaceOrganizationForOwner: logtoPortalWorkspace.ensureWorkspaceOrganizationForOwner,
  syncPortalMemberToLogtoOrg: logtoPortalWorkspace.syncPortalMemberToLogtoOrg,
  syncWorkspaceOwnerToLogtoOrg: logtoPortalWorkspace.syncWorkspaceOwnerToLogtoOrg,
  removePortalMemberFromLogtoOrg: logtoPortalWorkspace.removePortalMemberFromLogtoOrg,
};
