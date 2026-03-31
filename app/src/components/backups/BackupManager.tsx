import { useState } from "react";
import { Archive, Database, HardDrive, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import type { BackupConfig, BackupItem } from "../../api/backups";

interface BackupManagerProps {
  items: BackupItem[];
  config: BackupConfig | null;
  onCreate: (opts: { includeVolumes?: boolean }) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onRestore: (name: string, opts: { restoreLogto?: boolean; restoreVolumes?: boolean }) => Promise<void>;
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function BackupManager({ items, config, onCreate, onDelete, onRestore }: BackupManagerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [includeVolumes, setIncludeVolumes] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoreLogto, setRestoreLogto] = useState(false);
  const [restoreVolumes, setRestoreVolumes] = useState(false);

  async function handleCreate() {
    setBusy(true);
    setError("");
    try {
      await onCreate({ includeVolumes });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup konnte nicht erstellt werden");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(name: string) {
    if (!window.confirm(`Backup "${name}" wirklich löschen?`)) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup konnte nicht gelöscht werden");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    if (!window.confirm(`Backup "${restoreTarget}" wirklich wiederherstellen? Die aktuelle Datenbank wird überschrieben.`)) return;
    setBusy(true);
    setError("");
    try {
      await onRestore(restoreTarget, { restoreLogto, restoreVolumes });
      setRestoreTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wiederherstellung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-main)]">Backups</h1>
          <p className="text-[var(--text-subtle)]">Datenbank-Backups erstellen, verwalten und wiederherstellen.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {config ? (
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-main)]">Konfiguration</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[var(--text-subtle)]">Backup-Pfad</dt>
              <dd className="font-medium text-[var(--text-main)] break-all">{config.backupRoot}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-subtle)]">Aufbewahrung</dt>
              <dd className="font-medium text-[var(--text-main)]">{config.retentionDays} Tage</dd>
            </div>
            <div>
              <dt className="text-[var(--text-subtle)]">Zeitplan</dt>
              <dd className="font-medium text-[var(--text-main)]">{config.schedule}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-subtle)]">Volumes</dt>
              <dd className="font-medium text-[var(--text-main)]">{config.includeVolumes ? "Ja" : "Nein"}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-subtle)]">Logto</dt>
              <dd className="font-medium text-[var(--text-main)]">{config.logtoEnabled ? "Aktiviert" : "Deaktiviert"}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-subtle)]">NAS-Sync</dt>
              <dd className="font-medium text-[var(--text-main)]">
                {config.nasSync.enabled ? `Aktiv → ${config.nasSync.target}` : "Deaktiviert"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-main)]">Neues Backup erstellen</h2>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={includeVolumes}
              onChange={(e) => setIncludeVolumes(e.target.checked)}
              className="rounded border-[var(--border-soft)]"
            />
            Volumes einschließen
          </label>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {busy ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            Backup starten
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--border-soft)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Vorhandene Backups</h2>
        </div>
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--text-subtle)]">Keine Backups vorhanden.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-soft)]">
            {items.map((item) => (
              <li key={item.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  {item.type === "folder" ? (
                    <Archive className="h-5 w-5 shrink-0 text-[var(--text-subtle)]" />
                  ) : (
                    <HardDrive className="h-5 w-5 shrink-0 text-[var(--text-subtle)]" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-main)]">{item.name}</p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString("de-CH") : ""}
                      {item.size != null ? ` · ${formatBytes(item.size)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {restoreTarget === item.name ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2">
                      <label className="flex items-center gap-1.5 text-xs text-[var(--text-main)]">
                        <input
                          type="checkbox"
                          checked={restoreLogto}
                          onChange={(e) => setRestoreLogto(e.target.checked)}
                          className="rounded"
                        />
                        Logto
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-[var(--text-main)]">
                        <input
                          type="checkbox"
                          checked={restoreVolumes}
                          onChange={(e) => setRestoreVolumes(e.target.checked)}
                          className="rounded"
                        />
                        Volumes
                      </label>
                      <button
                        type="button"
                        onClick={handleRestore}
                        disabled={busy}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        Bestätigen
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestoreTarget(null)}
                        className="rounded-lg border border-[var(--border-soft)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)]"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setRestoreTarget(item.name); setRestoreLogto(false); setRestoreVolumes(false); }}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Wiederherstellen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(item.name)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
