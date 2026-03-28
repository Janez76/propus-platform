import { apiRequest } from "./client";
import type { CompanyMemberRole } from "./company";

export type AdminCompanyRow = {
  id: number;
  name: string;
  slug: string;
  billing_customer_id?: number | null;
  standort?: string;
  notiz?: string;
  member_count?: number;
  created_at?: string;
  updated_at?: string;
  status?: "aktiv" | "ausstehend" | "inaktiv";
  hauptkontakte_count?: number;
  mitarbeiter_count?: number;
  pending_invitations?: number;
  members: AdminCompanyMemberRow[];
  invitations: AdminInvitationRow[];
  uiStatus: "aktiv" | "ausstehend" | "inaktiv";
};

export type AdminCompanyMemberRow = {
  id: number;
  company_id: number;
  email: string;
  role: CompanyMemberRole;
  status: "invited" | "active" | "disabled";
  is_primary_contact?: boolean;
};

export type AdminInvitationRow = {
  id: number;
  company_id: number;
  email: string;
  role: CompanyMemberRole;
  expires_at: string;
  accepted_at?: string | null;
  given_name?: string;
  family_name?: string;
  login_name?: string;
};

export type AdminCompaniesStats = {
  aktiveFirmen: number;
  hauptkontakte: number;
  mitarbeiterZugaenge: number;
  ausstehendeEinladungen: number;
};

export async function getAdminCompanies(token: string) {
  const res = await apiRequest<{
    ok: true;
    stats: {
      active_companies: number;
      main_contacts: number;
      employees: number;
      pending_invitations: number;
    };
    companies: AdminCompanyRow[];
  }>("/api/admin/users/companies", "GET", token);
  return {
    ok: true as const,
    stats: {
      aktiveFirmen: Number(res.stats?.active_companies || 0),
      hauptkontakte: Number(res.stats?.main_contacts || 0),
      mitarbeiterZugaenge: Number(res.stats?.employees || 0),
      ausstehendeEinladungen: Number(res.stats?.pending_invitations || 0),
    } satisfies AdminCompaniesStats,
    companies: (res.companies || []).map((c) => ({
      ...c,
      uiStatus: (c.uiStatus ?? c.status ?? "aktiv") as "aktiv" | "ausstehend" | "inaktiv",
    })),
  };
}

export async function createAdminCompany(
  token: string,
  body: {
    name: string;
    standort?: string;
    notiz?: string;
    inviteEmail?: string;
    primaryContactEmail?: string;
    inviteRole?: CompanyMemberRole | string;
  },
) {
  return apiRequest<{ ok: true; company: Record<string, unknown>; invitation: unknown }>(
    "/api/admin/users/companies",
    "POST",
    token,
    {
      name: body.name,
      standort: body.standort,
      notiz: body.notiz,
      mainContactEmail: body.inviteEmail || body.primaryContactEmail || "",
      role: body.inviteRole || "company_owner",
    },
  );
}

export async function createAdminCompanyInvitation(
  token: string,
  companyId: number,
  body: {
    email?: string;
    role: CompanyMemberRole | string;
    givenName?: string;
    familyName?: string;
    loginName?: string;
  },
) {
  return apiRequest<{ ok: true; invitation: AdminInvitationRow }>(
    `/api/admin/users/companies/${companyId}/invitations`,
    "POST",
    token,
    body,
  );
}

export async function patchAdminCompanyMemberRole(
  token: string,
  _companyId: number,
  memberId: number,
  role: CompanyMemberRole | string,
) {
  return apiRequest<{ ok: true; member: AdminCompanyMemberRow }>(
    `/api/admin/users/members/${memberId}/role`,
    "PATCH",
    token,
    { role },
  );
}

export async function patchAdminCompanyMemberStatus(
  token: string,
  _companyId: number,
  memberId: number,
  status: "active" | "disabled" | "invited",
) {
  return apiRequest<{ ok: true; member: AdminCompanyMemberRow }>(
    `/api/admin/users/members/${memberId}/status`,
    "PATCH",
    token,
    { status },
  );
}

export async function deleteAdminCompany(token: string, companyId: number) {
  return apiRequest<{ ok: true }>(`/api/admin/companies/${companyId}`, "DELETE", token);
}
