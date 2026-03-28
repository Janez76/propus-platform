import { useEffect, useState } from "react";
import { BackupManager } from "../components/backups/BackupManager";
import { createBackup, deleteBackup, getBackups, restoreBackup, type BackupItem } from "../api/backups";
import { useAuthStore } from "../store/authStore";

export function BackupsPage() {
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<BackupItem[]>([]);

  async function load() {
    setItems(await getBackups(token));
  }

  useEffect(() => {
    let alive = true;
    getBackups(token).then((rows) => {
      if (alive) setItems(rows);
    }).catch(() => {});
    return () => { alive = false; };
  }, [token]);

  return (
    <BackupManager
      items={items}
      onCreate={async () => { await createBackup(token); await load(); }}
      onDelete={async (name) => { await deleteBackup(token, name); await load(); }}
      onRestore={async (name) => { await restoreBackup(token, name); await load(); }}
    />
  );
}
