import { apiRequest } from "./client";

export type CompanyMemberRole = "company_owner" | "company_admin" | "company_employee";

export type Company = {
  id: number;
  name: string;
  slug: string;
  billing_customer_id?: number | null;
};

export type CompanyMember = {
  id: number;
  company_id: number;
  auth_subject: string;
  customer_id?: number | null;
  email: string;
  role: CompanyMemberRole;
  status: "invited" | "active" | "disabled";
  is_primary_contact?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CompanyInvitation = {
  id: number;
  company_id: number;
  email: string;
  role: CompanyMemberRole;
  token: string;
  expires_at: string;
  accepted_at?: string | null;
  invited_by?: string;
  created_at?: string;
};

export type CompanyOrder = {
  orderNo?: number | string;
  status?: string;
  address?: string;
  customerName?: string;
  customerEmail?: string;
  appointmentDate?: string;
  createdAt?: string;
  createdByMemberId?: number | null;
};

export type CompanyCustomer = {
  id: number;
  name: string;
  email: string;
  company?: string;
};

export async function getCompanyMe(token: string) {
  return apiRequest<{
    ok: true;
    role: CompanyMemberRole;
    membership: CompanyMember;
    company: Company;
  }>("/api/company/me", "GET", token);
}

export async function getCompanyMembers(token: string) {
  return apiRequest<{ ok: true; members: CompanyMember[] }>("/api/company/members", "GET", token);
}

export async function getCompanyInvitations(token: string) {
  return apiRequest<{ ok: true; invitations: CompanyInvitation[] }>("/api/company/invitations", "GET", token);
}

export async function createCompanyInvitation(
  token: string,
  payload: { email: string; role: CompanyMemberRole },
) {
  return apiRequest<{ ok: true; invitation: CompanyInvitation }>("/api/company/invitations", "POST", token, payload);
}

export async function updateCompanyMemberRole(
  token: string,
  memberId: number,
  role: CompanyMemberRole,
) {
  return apiRequest<{ ok: true; member: CompanyMember }>(`/api/company/members/${memberId}/role`, "PATCH", token, { role });
}

export async function updateCompanyMemberActive(token: string, memberId: number, active: boolean) {
  return apiRequest<{ ok: true; member: CompanyMember }>(`/api/company/members/${memberId}/active`, "PATCH", token, { active });
}

export async function getCompanyOrders(token: string) {
  return apiRequest<{ ok: true; orders: CompanyOrder[] }>("/api/company/orders", "GET", token);
}

export async function getCompanyCustomers(token: string) {
  return apiRequest<{ ok: true; customers: CompanyCustomer[] }>("/api/company/customers", "GET", token);
}

export async function updateCompanyProfile(token: string, payload: { name: string }) {
  return apiRequest<{ ok: true; company: Company }>("/api/company/profile", "PATCH", token, payload);
}

export async function deleteCompanyInvitation(token: string, invitationId: number) {
  return apiRequest<{ ok: true }>(`/api/company/invitations/${invitationId}`, "DELETE", token);
}

export async function resendCompanyInvitation(token: string, invitationId: number) {
  return apiRequest<{ ok: true; invitation: CompanyInvitation }>(`/api/company/invitations/${invitationId}/resend`, "POST", token);
}
