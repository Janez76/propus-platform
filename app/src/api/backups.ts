import { apiRequest } from "./client";

export type BackupFileEntry = {
  file: string;
  label: string;
  size: number;
};

export type BackupItem = {
  name: string;
  type?: "folder" | "sql";
  size?: number;
  createdAt?: string;
  contents?: BackupFileEntry[];
};

export type NasSyncInfo = {
  enabled: boolean;
  target: string;
  lastSync: string | null;
  lastSyncStatus: "ok" | "error" | "unknown" | null;
};

export type BackupConfig = {
  backupRoot: string;
  retentionDays: number;
  includeVolumes: boolean;
  volumePaths: string[];
  logtoEnabled: boolean;
  schedule: string;
  nasSync: NasSyncInfo;
};

export async function getBackups(token: string): Promise<BackupItem[]> {
  const data = await apiRequest<unknown>("/api/admin/backups", "GET", token);
  if (Array.isArray(data)) return data as BackupItem[];
  if (data && typeof data === "object" && Array.isArray((data as { backups?: unknown[] }).backups)) {
    return (data as { backups: BackupItem[] }).backups;
  }
  return [];
}

export async function getBackupConfig(token: string): Promise<BackupConfig | null> {
  try {
    const data = await apiRequest<{ ok: boolean; config: BackupConfig }>("/api/admin/backup-config", "GET", token);
    return data?.config ?? null;
  } catch {
    return null;
  }
}

export const createBackup = (token: string, opts?: { includeVolumes?: boolean }) =>
  apiRequest("/api/admin/backups/create", "POST", token, opts ?? {});

export const deleteBackup = (token: string, name: string) =>
  apiRequest(`/api/admin/backups/${encodeURIComponent(name)}`, "DELETE", token);

export const restoreBackup = (token: string, name: string, opts?: { restoreLogto?: boolean; restoreVolumes?: boolean }) =>
  apiRequest(`/api/admin/backups/${encodeURIComponent(name)}/restore`, "POST", token, opts ?? {});
