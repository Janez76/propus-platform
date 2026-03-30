import { useEffect, useState } from "react";
import { BackupManager } from "../components/backups/BackupManager";
import {
  createBackup,
  deleteBackup,
  getBackupConfig,
  getBackups,
  restoreBackup,
  type BackupConfig,
  type BackupItem,
} from "../api/backups";
import { useAuthStore } from "../store/authStore";

export function BackupsPage() {
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<BackupItem[]>([]);
  const [config, setConfig] = useState<BackupConfig | null>(null);

  async function load() {
    const [backups, cfg] = await Promise.all([
      getBackups(token),
      getBackupConfig(token),
    ]);
    setItems(backups);
    if (cfg) setConfig(cfg);
  }

  useEffect(() => {
    load().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <BackupManager
      items={items}
      config={config}
      onCreate={async (opts: { includeVolumes?: boolean }) => { await createBackup(token, opts); await load(); }}
      onDelete={async (name: string) => { await deleteBackup(token, name); await load(); }}
      onRestore={async (name: string, opts: { restoreLogto?: boolean; restoreVolumes?: boolean }) => { await restoreBackup(token, name, opts); await load(); }}
    />
  );
}


