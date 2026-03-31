import { apiRequest } from "./client";

export type SystemSettingsMap = Record<string, unknown>;

interface SettingsResponse {
  ok: boolean;
  settings: SystemSettingsMap;
}

export async function getSystemSettings(token?: string): Promise<SystemSettingsMap> {
  const res = await apiRequest<SettingsResponse>("/api/admin/settings", "GET", token);
  return res.settings || {};
}

export async function patchSystemSettings(token: string | undefined, updates: Partial<SystemSettingsMap>): Promise<SystemSettingsMap> {
  const res = await apiRequest<SettingsResponse>("/api/admin/settings", "PATCH", token, { settings: updates });
  return res.settings || {};
}
