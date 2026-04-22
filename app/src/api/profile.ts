import { API_BASE, apiRequest } from "./client";
import type { Role } from "../types";

export type AdminProfile = {
  user: string;
  email: string;
  name: string;
  phone: string;
  language: "de" | "en" | "fr" | "it";
  avatarUrl: string | null;
};

export const getAdminProfile = (token: string) =>
  apiRequest<{ ok: true; role: Role; profile: AdminProfile; permissions?: string[] }>("/api/admin/me", "GET", token);

/** Session-Info inkl. Impersonation (eignet sich für Kunden-Panel, nicht requireAdmin) */
export const getAuthMe = (token: string) =>
  apiRequest<{
    ok: true;
    role: string;
    isImpersonating: boolean;
    impersonatorEmail: string | null;
    impersonatedAs: { email: string; role: string };
    permissions: string[];
  }>("/api/auth/me", "GET", token);

export const updateAdminProfile = (token: string, profile: Partial<AdminProfile>) =>
  apiRequest<{ ok: true; profile: AdminProfile }>("/api/admin/me", "PUT", token, profile);

export const changeAdminPassword = (token: string, oldPassword: string, newPassword: string) =>
  apiRequest<{ ok: true }>("/api/admin/me/change-password", "POST", token, { oldPassword, newPassword });

export async function uploadAdminAvatar(token: string, file: Blob | File, filename = "avatar.webp"): Promise<string> {
  const form = new FormData();
  const named = file instanceof File ? file : new File([file], filename, { type: file.type || "image/webp" });
  form.append("file", named);
  const res = await fetch(`${API_BASE}/api/admin/me/avatar`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* raw text */
    }
    throw new Error(msg.trim() || `HTTP ${res.status}`);
  }
  const json = JSON.parse(text) as { avatarUrl?: string };
  if (!json.avatarUrl) throw new Error("Ungueltige Server-Antwort");
  return json.avatarUrl;
}
