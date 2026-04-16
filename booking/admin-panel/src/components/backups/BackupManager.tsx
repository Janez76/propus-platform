import { useState } from "react";
import type { BackupItem, BackupConfig } from "../../api/backups";

type BackupManagerProps = {
  items: BackupItem[];
  config: BackupConfig | null;
  onCreate: (opts: { includeVolumes?: boolean }) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onRestore: (name: string, opts: { restoreLogto?: boolean; restoreVolumes?: boolean }) => Promise<void>;
};

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
    if (!confirm(`Backup "${name}" wirklich löschen?`)) return;
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
    <div className="space-y-6 p-4">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-[var(--text-main)]">Backups</h1>
        {config && (
          <p className="text-sm text-[var(--text-subtle)]">
            Pfad: {config.backupRoot} · Aufbewahrung: {config.retentionDays} Tage · Zeitplan: {config.schedule}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
          <input
            type="checkbox"
            checked={includeVolumes}
            onChange={(e) => setIncludeVolumes(e.target.checked)}
          />
          Volumes einschliessen
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={handleCreate}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? "Läuft…" : "Backup erstellen"}
        </button>
      </div>

      {restoreTarget && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="font-semibold text-amber-800">Backup wiederherstellen: {restoreTarget}</p>
          <label className="flex items-center gap-2 text-sm text-amber-900">
            <input type="checkbox" checked={restoreLogto} onChange={(e) => setRestoreLogto(e.target.checked)} />
            Logto-Daten wiederherstellen
          </label>
          <label className="flex items-center gap-2 text-sm text-amber-900">
            <input type="checkbox" checked={restoreVolumes} onChange={(e) => setRestoreVolumes(e.target.checked)} />
            Volumes wiederherstellen
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleRestore}
              className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? "Läuft…" : "Wiederherstellen"}
            </button>
            <button
              type="button"
              onClick={() => setRestoreTarget(null)}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-[var(--text-subtle)]">Keine Backups vorhanden.</p>
        )}
        {items.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-[var(--text-main)]">{item.name}</p>
              {item.createdAt && (
                <p className="text-xs text-[var(--text-subtle)]">{item.createdAt}</p>
              )}
              {item.size !== undefined && (
                <p className="text-xs text-[var(--text-subtle)]">{(item.size / 1024 / 1024).toFixed(1)} MB</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setRestoreTarget(item.name)}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-main)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
              >
                Wiederherstellen
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(item.name)}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Löschen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
