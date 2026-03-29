import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  FileArchive,
  FolderArchive,
  HardDrive,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  Server,
  Trash2,
} from "lucide-react";
import type { BackupConfig, BackupItem } from "../../api/backups";
import { EmptyState } from "../ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { formatSwissDateTime } from "../../lib/format";

type CreateOpts = { includeVolumes?: boolean };
type RestoreOpts = { restoreLogto?: boolean; restoreVolumes?: boolean };

type Props = {
  items: BackupItem[];
  config: BackupConfig | null;
  onCreate: (opts: CreateOpts) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onRestore: (name: string, opts: RestoreOpts) => Promise<void>;
};

function formatFileSize(bytes?: number): string {
  if (!bytes || Number.isNaN(bytes)) return "-";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
  "db.sql": <Database className="h-3.5 w-3.5 text-blue-500" />,
  "logto.sql": <Database className="h-3.5 w-3.5 text-violet-500" />,
  "orders.json": <FileArchive className="h-3.5 w-3.5 text-amber-500" />,
  "metadata.txt": <Info className="h-3.5 w-3.5 text-slate-400" />,
  "SHA256SUMS.txt": <Info className="h-3.5 w-3.5 text-slate-400" />,
};

function BackupContents({ contents }: { contents: BackupItem["contents"] }) {
  if (!contents?.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {contents.map((f) => (
        <li key={f.file} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
          {FILE_ICONS[f.file] ?? <FileArchive className="h-3.5 w-3.5 text-slate-400" />}
          <span className="font-mono">{f.file}</span>
          <span className="ml-auto tabular-nums">{formatFileSize(f.size)}</span>
        </li>
      ))}
    </ul>
  );
}

function NasSyncBadge({ status }: { status: BackupConfig["nasSync"]["lastSyncStatus"] }) {
  if (!status) return null;
  if (status === "ok") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> NAS-Sync OK
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
      <AlertTriangle className="h-3 w-3" /> NAS-Sync Fehler
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
      <Clock className="h-3 w-3" /> NAS-Sync unbekannt
    </span>
  );
}

export function BackupManager({ items, config, onCreate, onDelete, onRestore }: Props) {
  const [busyAction, setBusyAction] = useState<"create" | "delete" | "restore" | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [createIncludeVolumes, setCreateIncludeVolumes] = useState(config?.includeVolumes ?? true);
  const [restoreSkipLogto, setRestoreSkipLogto] = useState(false);
  const [restoreVolumes, setRestoreVolumes] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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
    setShowCreateDialog(false);
    try {
      await onCreate({ includeVolumes: createIncludeVolumes });
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
    setRestoreTarget(null);
    try {
      await onRestore(name, { restoreLogto: !restoreSkipLogto, restoreVolumes });
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

  const hasLogto = config?.logtoEnabled ?? false;

  return (
    <section className="space-y-5">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">Backups</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Datenbank-Sicherungen erstellen, wiederherstellen und verwalten.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={busyAction === "create"}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#C5A059] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B39049] disabled:cursor-not-allowed disabled:opacity-70 shrink-0"
        >
          {busyAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Neues Backup
        </button>
      </header>

      {/* Config / Status Panel */}
      {config && (
        <div className="rounded-xl border border-slate-200/60 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-zinc-300">
            <Server className="h-4 w-4 text-slate-400" />
            Backup-Konfiguration
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 text-xs">
            <div>
              <div className="text-slate-400 dark:text-zinc-500">Aufbewahrung</div>
              <div className="font-semibold text-slate-700 dark:text-zinc-200 mt-0.5">{config.retentionDays} Tage</div>
            </div>
            <div>
              <div className="text-slate-400 dark:text-zinc-500">Zeitplan</div>
              <div className="font-semibold font-mono text-slate-700 dark:text-zinc-200 mt-0.5">{config.schedule} (02:00)</div>
            </div>
            <div>
              <div className="text-slate-400 dark:text-zinc-500">Logto-DB</div>
              <div className="mt-0.5">
                {config.logtoEnabled
                  ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold"><CheckCircle2 className="h-3 w-3" /> Aktiv</span>
                  : <span className="inline-flex items-center gap-1 text-slate-500 dark:text-zinc-500 font-semibold"><AlertTriangle className="h-3 w-3" /> Nicht konfiguriert</span>
                }
              </div>
            </div>
            <div>
              <div className="text-slate-400 dark:text-zinc-500">Voll-Volume-Backup</div>
              <div className="mt-0.5">
                {config.includeVolumes
                  ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold"><CheckCircle2 className="h-3 w-3" /> Ja</span>
                  : <span className="text-slate-500 dark:text-zinc-500 font-semibold">Nein (Standard)</span>
                }
              </div>
            </div>
          </div>
          {config.volumePaths.length > 0 ? (
            <div className="rounded-lg bg-white/70 px-3 py-2 text-xs dark:bg-zinc-950/40">
              <div className="mb-1 font-semibold text-slate-600 dark:text-zinc-300">Gesicherte Volume-Pfade</div>
              <div className="flex flex-wrap gap-1.5">
                {config.volumePaths.map((volumePath) => (
                  <span key={volumePath} className="rounded bg-slate-100 px-2 py-1 font-mono text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {volumePath}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* NAS Sync Status */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">NAS-Sync</span>
              <NasSyncBadge status={config.nasSync.lastSyncStatus} />
            </div>
            <div className="text-xs text-slate-400 dark:text-zinc-600 sm:ml-auto font-mono truncate">
              {config.nasSync.target}
            </div>
          </div>
          {config.nasSync.lastSync && (
            <p className="text-xs text-slate-400 dark:text-zinc-600 leading-snug">
              Letzter Sync: {config.nasSync.lastSync}
            </p>
          )}
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {/* Backup Table */}
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
                <th className="w-6 px-2 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 hidden sm:table-cell">Inhalt</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Grösse</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Erstellt am</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {sortedItems.map((item) => {
                const isDeleting = busyAction === "delete" && selectedName === item.name;
                const isRestoring = busyAction === "restore" && selectedName === item.name;
                const isExpanded = expandedRow === item.name;
                const hasContents = item.contents && item.contents.length > 0;
                const hasLogtoSql = item.contents?.some((f) => f.file === "logto.sql");
                const hasVolumes = item.contents?.some((f) => f.file.endsWith(".tar.gz"));

                return (
                  <>
                    <tr
                      key={item.name}
                      className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 cursor-pointer"
                      onClick={() => setExpandedRow(isExpanded ? null : item.name)}
                    >
                      <td className="px-2 py-3 text-slate-400">
                        {hasContents
                          ? isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />
                          : null
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {item.type === "folder"
                            ? <FolderArchive className="h-4 w-4 text-amber-500 shrink-0" />
                            : <Database className="h-4 w-4 text-blue-500 shrink-0" />
                          }
                          <span className="text-sm font-medium text-slate-900 dark:text-zinc-100 font-mono">{item.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {hasLogtoSql && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                              <Database className="h-2.5 w-2.5" /> logto
                            </span>
                          )}
                          {hasVolumes && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              <FolderArchive className="h-2.5 w-2.5" /> volumes
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {item.contents?.map((f) => (
                            <span key={f.file} className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                              {f.file}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-700 dark:text-zinc-300">
                        {formatFileSize(item.size)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                        {item.createdAt ? formatSwissDateTime(item.createdAt) : "-"}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRestoreTarget(item.name);
                              setRestoreVolumes(Boolean(hasVolumes));
                            }}
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
                    {isExpanded && hasContents && (
                      <tr key={`${item.name}-expanded`} className="bg-slate-50/50 dark:bg-zinc-900/30">
                        <td />
                        <td colSpan={5} className="px-4 pb-3 pt-1">
                          <BackupContents contents={item.contents} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Backup Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && setShowCreateDialog(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-[#C5A059]" />
              Neues Backup erstellen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
            <p>Folgende Daten werden gesichert:</p>
            <ul className="space-y-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800 p-3">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Haupt-Datenbank (propus)
              </li>
              {hasLogto && (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  Auth-Datenbank (logto)
                </li>
              )}
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Bestellungen (orders.json)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Umgebungskonfiguration (.env.vps)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Komplettes Daten-Volume (State, Logs, Staging, NAS-Ordner)
              </li>
            </ul>

            <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-slate-200 dark:border-zinc-700 p-3 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
              <input
                type="checkbox"
                checked={createIncludeVolumes}
                onChange={(e) => setCreateIncludeVolumes(e.target.checked)}
                className="mt-0.5 accent-[#C5A059]"
              />
              <div>
                <div className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <FolderArchive className="h-3.5 w-3.5 text-amber-500" />
                  Komplettes Volume mitsichern
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
                  Alle gemounteten Datenpfade werden als .tar.gz archiviert, nicht nur Uploads. Kann sehr gross sein.
                </div>
              </div>
            </label>

            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Das Backup wird automatisch täglich um 02:00 Uhr auf der NAS gespeichert (30 Tage Aufbewahrung).</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateDialog(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busyAction === "create"}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#C5A059] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#B39049] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Backup starten
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={Boolean(restoreTarget)} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-500" />
              Backup wiederherstellen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
            <p>
              Backup <span className="font-semibold font-mono">{restoreTarget}</span> wiederherstellen?
            </p>
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Die aktuellen Datenbankdaten werden überschrieben. Erstelle zuerst ein neues Backup.</span>
            </div>
            <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-slate-200 dark:border-zinc-700 p-3 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
              <input
                type="checkbox"
                checked={restoreVolumes}
                onChange={(e) => setRestoreVolumes(e.target.checked)}
                className="mt-0.5 accent-[#C5A059]"
              />
              <div>
                <div className="font-semibold text-slate-800 dark:text-zinc-200">Volume-Archive wiederherstellen</div>
                <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
                  Stellt State, Logs, Staging und NAS-Ordner aus dem Backup wieder her. Fuer exakte Ruecksetzung ausserhalb des laufenden Betriebs empfohlen.
                </div>
              </div>
            </label>
            {hasLogto && (
              <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-slate-200 dark:border-zinc-700 p-3 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                <input
                  type="checkbox"
                  checked={restoreSkipLogto}
                  onChange={(e) => setRestoreSkipLogto(e.target.checked)}
                  className="mt-0.5 accent-[#C5A059]"
                />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-zinc-200">Logto-Datenbank überspringen</div>
                  <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
                    Nur Haupt-DB wiederherstellen. Logto-Auth-Daten bleiben unverändert.
                  </div>
                </div>
              </label>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setRestoreTarget(null)}
              disabled={busyAction === "restore"}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => restoreTarget && handleRestore(restoreTarget)}
              disabled={busyAction === "restore"}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyAction === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Wiederherstellen
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={Boolean(confirmDeleteName)} onOpenChange={(open) => !open && setConfirmDeleteName(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Backup löschen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700 dark:text-zinc-300">
            Soll das Backup <span className="font-semibold font-mono">{confirmDeleteName}</span> wirklich gelöscht werden?
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteName(null)}
              disabled={busyAction === "delete"}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => confirmDeleteName && handleDelete(confirmDeleteName)}
              disabled={busyAction === "delete"}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-70"
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
