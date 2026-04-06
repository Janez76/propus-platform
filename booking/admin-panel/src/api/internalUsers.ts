import { apiRequest } from "./client";

export type InternalAdminUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  roles: string[];
  createdAt: string;
  lastSignInAt: string | null;
  isSuspended: boolean;
};

export async function getInternalAdminUsers(token: string) {
  const res = await apiRequest<{ users: InternalAdminUser[] }>("/api/admin/internal-users", "GET", token);
  return res.users || [];
}

export async function createInternalAdminUser(
  token: string,
  data: {
    name: string;
    email: string;
    username: string;
    password: string;
    roles: string[];
  },
) {
  return apiRequest<{ ok: boolean; user: InternalAdminUser }>("/api/admin/internal-users", "POST", token, data);
}

export async function patchInternalAdminUserRoles(token: string, userId: string, roles: string[]) {
  return apiRequest<{ ok: true; userId: string; roles: string[] }>(
    `/api/admin/internal-users/${encodeURIComponent(userId)}/roles`,
    "PATCH",
    token,
    { roles },
  );
}

export async function patchInternalAdminUserSuspend(token: string, userId: string, isSuspended: boolean) {
  return apiRequest<{ ok: true }>(`/api/admin/internal-users/${encodeURIComponent(userId)}/suspend`, "PATCH", token, {
    isSuspended,
  });
}

export async function resetInternalAdminUserPassword(
  token: string,
  userId: string,
  password: string,
  sendMail = false,
) {
  return apiRequest<{ ok: true }>(`/api/admin/internal-users/${encodeURIComponent(userId)}/reset-password`, "POST", token, {
    password,
    sendMail,
  });
}

export async function sendInternalAdminUserCredentials(token: string, userId: string, password?: string) {
  return apiRequest<{ ok: true; sent?: boolean }>(
    `/api/admin/internal-users/${encodeURIComponent(userId)}/send-credentials`,
    "POST",
    token,
    { password },
  );
}
