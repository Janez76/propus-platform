import { useMemo, useState } from "react";
import { Database, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { BackupItem } from "../../api/backups";
import { EmptyState } from "../ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { formatSwissDateTime } from "../../lib/format";

type Props = {
  items: BackupItem[];
  onCreate: () => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onRestore: (name: string) => Promise<void>;
};

function formatFileSize(bytes?: number): string {
  if (!bytes || Number.isNaN(bytes)) return "-";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function BackupManager({ items, onCreate, onDelete, onRestore }: Props) {
  const [busyAction, setBusyAction] = useState<"create" | "delete" | "restore" | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [error, setError] = useState("");

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }),
    [items]
  );

  async function handleCreate() {
    setBusyAction("create");
    setError("");
    try {
      await onCreate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup konnte nicht erstellt werden.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestore(name: string) {
    setBusyAction("restore");
    setSelectedName(name);
    setError("");
    try {
      await onRestore(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup konnte nicht wiederhergestellt werden.");
    } finally {
      setBusyAction(null);
      setSelectedName(null);
    }
  }

  async function handleDelete(name: string) {
    setBusyAction("delete");
    setSelectedName(name);
    setError("");
    try {
      await onDelete(name);
      setConfirmDeleteName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup konnte nicht gelöscht werden.");
    } finally {
      setBusyAction(null);
      setSelectedName(null);
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">Backups</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Datenbank-Sicherungen erstellen, wiederherstellen und verwalten.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busyAction === "create"}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#C5A059] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B39049] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busyAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Neues Backup
        </button>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {sortedItems.length === 0 ? (
        <EmptyState
          icon={<Database className="h-6 w-6 text-[#C5A059]" />}
          title="Keine Backups vorhanden"
          description="Erstelle das erste Backup, um einen Wiederherstellungspunkt zu sichern."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-zinc-800">
            <thead className="bg-slate-50 dark:bg-zinc-900/70">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Name</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Grösse</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Erstellt am</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {sortedItems.map((item) => {
                const isDeleting = busyAction === "delete" && selectedName === item.name;
                const isRestoring = busyAction === "restore" && selectedName === item.name;
                return (
                  <tr key={item.name} className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-zinc-100">{item.name}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-700 dark:text-zinc-300">
                      {formatFileSize(item.size)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-zinc-300">
                      {item.createdAt ? formatSwissDateTime(item.createdAt) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Verfügbar
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestore(item.name)}
                          disabled={busyAction !== null}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-[#C5A059] hover:text-[#9E8649] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-[#C5A059]"
                        >
                          {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Wiederherstellen
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteName(item.name)}
                          disabled={busyAction !== null}
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(confirmDeleteName)} onOpenChange={(open) => !open && setConfirmDeleteName(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Backup löschen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700 dark:text-zinc-300">
            Soll das Backup <span className="font-semibold">{confirmDeleteName}</span> wirklich gelöscht werden?
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteName(null)}
              disabled={busyAction === "delete"}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => confirmDeleteName && handleDelete(confirmDeleteName)}
              disabled={busyAction === "delete"}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyAction === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Löschen
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
