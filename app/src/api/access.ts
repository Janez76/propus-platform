import { apiRequest } from "./client";

export type PermissionDefinition = {
  permission_key: string;
  description: string;
  module_tag: string;
};

export type AccessGroup = {
  id: number;
  name: string;
  scope_type: string;
  scope_company_id?: number | null;
  scope_customer_id?: number | null;
  permission_keys?: string[];
  created_at?: string;
};

export async function getAccessPermissions(token: string) {
  return apiRequest<{ ok: true; permissions: PermissionDefinition[] }>("/api/admin/access/permissions", "GET", token);
}

export async function getAccessGroups(
  token: string,
  params?: { scope_type?: string; scope_company_id?: number; scope_customer_id?: number },
) {
  const q = new URLSearchParams();
  if (params?.scope_type) q.set("scope_type", params.scope_type);
  if (params?.scope_company_id != null) q.set("scope_company_id", String(params.scope_company_id));
  if (params?.scope_customer_id != null) q.set("scope_customer_id", String(params.scope_customer_id));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiRequest<{ ok: true; groups: AccessGroup[] }>(`/api/admin/access/groups${suffix}`, "GET", token);
}

export async function createAccessGroup(
  token: string,
  body: {
    name: string;
    scope_type: "system" | "company" | "customer";
    scope_company_id?: number | null;
    scope_customer_id?: number | null;
    permission_keys?: string[];
  },
) {
  return apiRequest<{ ok: true; group: AccessGroup }>("/api/admin/access/groups", "POST", token, body);
}

export async function updateAccessGroup(token: string, groupId: number, body: { name?: string; permission_keys?: string[] }) {
  return apiRequest<{ ok: true; group: AccessGroup }>(`/api/admin/access/groups/${groupId}`, "PATCH", token, body);
}

export async function deleteAccessGroup(token: string, groupId: number) {
  return apiRequest<{ ok: true }>(`/api/admin/access/groups/${groupId}`, "DELETE", token);
}

export async function addGroupMember(token: string, groupId: number, subjectId: number) {
  return apiRequest<{ ok: true }>(`/api/admin/access/groups/${groupId}/members`, "POST", token, { subject_id: subjectId });
}

export async function removeGroupMember(token: string, groupId: number, subjectId: number) {
  return apiRequest<{ ok: true }>(`/api/admin/access/groups/${groupId}/members/${subjectId}`, "DELETE", token);
}

export type CustomerAccessResponse = {
  ok: true;
  customer_id: number;
  customer_subject_id: number | null;
  groups: AccessGroup[];
  contacts: Array<{
    id: number;
    name: string;
    email: string;
    role: string;
    subject_id: number | null;
  }>;
};

export async function getCustomerAccess(token: string, customerId: number) {
  return apiRequest<CustomerAccessResponse>(`/api/admin/customers/${customerId}/access`, "GET", token);
}

export async function createCustomerAccessGroup(
  token: string,
  customerId: number,
  body: { name: string; permission_keys?: string[] },
) {
  return apiRequest<{ ok: true; group: AccessGroup }>(`/api/admin/customers/${customerId}/access/groups`, "POST", token, body);
}

export async function ensureContactSubject(token: string, customerId: number, contactId: number) {
  return apiRequest<{ ok: true; subject_id: number }>(
    `/api/admin/customers/${customerId}/access/contacts/${contactId}/ensure-subject`,
    "POST",
    token,
    {},
  );
}

/** Alle Rollen-Permissions aus der DB laden (nur Super-Admin). */
export async function getRolePresets(token: string) {
  return apiRequest<{ ok: true; presets: Record<string, string[]>; fallback?: boolean }>(
    "/api/admin/access/role-presets",
    "GET",
    token,
  );
}

/** Permissions für eine editierbare Rolle speichern (nur Super-Admin, fixe Rollen werden abgewiesen). */
export async function patchRolePreset(token: string, roleKey: string, permissions: string[]) {
  return apiRequest<{ ok: true; roleKey: string; permissions: string[] }>(
    `/api/admin/access/role-presets/${encodeURIComponent(roleKey)}`,
    "PATCH",
    token,
    { permissions },
  );
}
