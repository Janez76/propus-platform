import { useState } from "react";
import { Archive, Download, HardDrive, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import type { BackupConfig, BackupItem } from "../../api/backups";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";

type Props = {
  items: BackupItem[];
  config: BackupConfig | null;
  onCreate: (opts: { includeVolumes?: boolean }) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onRestore: (name: string, opts: { restoreLogto?: boolean; restoreVolumes?: boolean }) => Promise<void>;
};

function formatBytes(bytes?: number): string {
  if (bytes == null) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BackupManager({ items, config, onCreate, onDelete, onRestore }: Props) {
  const lang = useAuthStore((s) => s.language);
  const [busy, setBusy] = useState<string | null>(null);
  const [includeVolumes, setIncludeVolumes] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restoreLogto, setRestoreLogto] = useState(false);
  const [restoreVolumes, setRestoreVolumes] = useState(false);

  async function handleCreate() {
    setBusy("create");
    try {
      await onCreate({ includeVolumes });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(name: string) {
    setBusy(`delete:${name}`);
    try {
      await onDelete(name);
    } finally {
      setBusy(null);
      setConfirmDelete(null);
    }
  }

  async function handleRestore(name: string) {
    setBusy(`restore:${name}`);
    try {
      await onRestore(name, { restoreLogto, restoreVolumes });
    } finally {
      setBusy(null);
      setConfirmRestore(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5" style={{ color: "var(--text-subtle)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-main)" }}>
            Backups
          </h2>
        </div>
      </div>

      {/* Config info */}
      {config && (
        <div
          className="rounded-xl border p-4 text-sm space-y-1"
          style={{ background: "var(--surface)", borderColor: "var(--border-soft)", color: "var(--text-subtle)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="h-4 w-4" />
            <span className="font-medium" style={{ color: "var(--text-main)" }}>{t(lang, "backups.configuration")}</span>
          </div>
          <div>{t(lang, "backups.directory")}: <span style={{ color: "var(--text-main)" }}>{config.backupRoot}</span></div>
          <div>{t(lang, "backups.retention")}: <span style={{ color: "var(--text-main)" }}>{t(lang, "backups.retentionDays").replace("{n}", String(config.retentionDays))}</span></div>
          <div>{t(lang, "backups.schedule")}: <span style={{ color: "var(--text-main)" }}>{config.schedule}</span></div>
          {config.nasSync?.enabled && (
            <div>
              {t(lang, "backups.nasSync")}:{" "}
              <span style={{ color: "var(--text-main)" }}>
                {config.nasSync.target}
                {config.nasSync.lastSync && ` (${t(lang, "backups.lastSync")}: ${new Date(config.nasSync.lastSync).toLocaleString()})`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Create backup */}
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
      >
        <div className="text-sm font-medium" style={{ color: "var(--text-main)" }}>{t(lang, "backups.createTitle")}</div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-subtle)" }}>
          <input
            type="checkbox"
            checked={includeVolumes}
            onChange={(e) => setIncludeVolumes(e.target.checked)}
            className="rounded"
          />
          {t(lang, "backups.includeVolumes")}
        </label>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={handleCreate}
          disabled={busy === "create"}
        >
          {busy === "create" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {busy === "create" ? t(lang, "common.creating") : t(lang, "common.create")}
        </button>
      </div>

      {/* Backup list */}
      {items.length === 0 ? (
        <div className="cust-empty-state">
          <Archive className="h-10 w-10 mx-auto" />
          <p className="cust-empty-title">{t(lang, "common.noData")}</p>
        </div>
      ) : (
        <div className="cust-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Typ</th>
                <th>Größe</th>
                <th>Erstellt</th>
                <th>{t(lang, "common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.name}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Archive className="h-4 w-4 shrink-0" style={{ color: "var(--text-subtle)" }} />
                      <span className="font-mono text-xs" style={{ color: "var(--text-main)" }}>{item.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="cust-badge cust-badge--neutral">{item.type ?? "–"}</span>
                  </td>
                  <td style={{ color: "var(--text-subtle)" }}>{formatBytes(item.size)}</td>
                  <td style={{ color: "var(--text-subtle)" }}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "–"}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="cust-action-icon"
                        title={t(lang, "backups.restore")}
                        disabled={!!busy}
                        onClick={() => {
                          setRestoreLogto(false);
                          setRestoreVolumes(false);
                          setConfirmRestore(item.name);
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="cust-action-icon cust-action-icon--danger"
                        title={t(lang, "common.delete")}
                        disabled={!!busy}
                        onClick={() => setConfirmDelete(item.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="rounded-xl border p-6 w-full max-w-sm space-y-4"
            style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
          >
            <div className="font-semibold" style={{ color: "var(--text-main)" }}>{t(lang, "backups.deleteConfirmTitle")}</div>
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
              {t(lang, "backups.deleteConfirmMessage").replace("{name}", confirmDelete)}
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setConfirmDelete(null)} disabled={!!busy}>
                {t(lang, "common.cancel")}
              </button>
              <button
                className="flex-1 justify-center rounded-[10px] border-none bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => handleDelete(confirmDelete)}
                disabled={busy === `delete:${confirmDelete}`}
              >
                {busy === `delete:${confirmDelete}` ? t(lang, "common.saving") : t(lang, "common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore confirm dialog */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="rounded-xl border p-6 w-full max-w-sm space-y-4"
            style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
          >
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5" style={{ color: "var(--text-subtle)" }} />
              <div className="font-semibold" style={{ color: "var(--text-main)" }}>{t(lang, "backups.restoreTitle")}</div>
            </div>
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
              <span className="font-mono">{confirmRestore}</span>
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-subtle)" }}>
                <input
                  type="checkbox"
                  checked={restoreLogto}
                  onChange={(e) => setRestoreLogto(e.target.checked)}
                  className="rounded"
                />
                {t(lang, "backups.restoreLogto")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-subtle)" }}>
                <input
                  type="checkbox"
                  checked={restoreVolumes}
                  onChange={(e) => setRestoreVolumes(e.target.checked)}
                  className="rounded"
                />
                {t(lang, "backups.restoreVolumes")}
              </label>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setConfirmRestore(null)} disabled={!!busy}>
                {t(lang, "common.cancel")}
              </button>
              <button
                className="btn-primary flex-1 justify-center"
                onClick={() => handleRestore(confirmRestore)}
                disabled={busy === `restore:${confirmRestore}`}
              >
                {busy === `restore:${confirmRestore}` ? t(lang, "backups.restoring") : t(lang, "backups.restore")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
