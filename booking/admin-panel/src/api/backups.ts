import { apiRequest } from "./client";

export type BackupItem = {
  name: string;
  size?: number;
  createdAt?: string;
};

export async function getBackups(token: string): Promise<BackupItem[]> {
  const data = await apiRequest<unknown>("/api/admin/backups", "GET", token);
  if (Array.isArray(data)) return data as BackupItem[];
  if (data && typeof data === "object" && Array.isArray((data as { backups?: unknown[] }).backups)) {
    return (data as { backups: BackupItem[] }).backups;
  }
  return [];
}

export const createBackup = (token: string) =>
  apiRequest("/api/admin/backups/create", "POST", token);

export const deleteBackup = (token: string, name: string) =>
  apiRequest(`/api/admin/backups/${encodeURIComponent(name)}`, "DELETE", token);

export const restoreBackup = (token: string, name: string) =>
  apiRequest(`/api/admin/backups/${encodeURIComponent(name)}/restore`, "POST", token);
