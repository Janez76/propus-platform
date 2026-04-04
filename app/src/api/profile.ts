import { apiRequest } from "./client";
import type { Role } from "../types";

export type AdminProfile = {
  user: string;
  email: string;
  name: string;
  phone: string;
  language: "de" | "en" | "fr" | "it";
};

export const getAdminProfile = (token: string) =>
  apiRequest<{ ok: true; role: Role; profile: AdminProfile; permissions?: string[] }>("/api/admin/me", "GET", token);

export const updateAdminProfile = (token: string, profile: Partial<AdminProfile>) =>
  apiRequest<{ ok: true; profile: AdminProfile }>("/api/admin/me", "PUT", token, profile);

export const changeAdminPassword = (token: string, oldPassword: string, newPassword: string) =>
  apiRequest<{ ok: true }>("/api/admin/me/change-password", "POST", token, { oldPassword, newPassword });
