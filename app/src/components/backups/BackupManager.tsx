import { useEffect, useMemo, useState } from "react";
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
type RestoreOpts = { restoreVolumes?: boolean };

type Props = {
  items: BackupItem[];
  config: BackupConfig | null;
  /** Wenn false: nur Liste/Konfiguration, keine Create/Restore/Delete */
  canManage?: boolean;
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
  "db.sql":        <Database  className="h-3.5 w-3.5" style={{ color: "#3498db" }} />,
  "orders.json":   <FileArchive className="h-3.5 w-3.5" style={{ color: "var(--propus-gold)" }} />,
  "metadata.txt":  <Info className="h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />,
  "SHA256SUMS.txt":<Info className="h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />,
};

function BackupContents({ contents }: { contents: BackupItem["contents"] }) {
  if (!contents?.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {contents.map((f) => (
        <li key={f.file} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
          {FILE_ICONS[f.file] ?? <FileArchive className="h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />}
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
    <span className="cust-status-badge cust-status-completed">
      <CheckCircle2 className="h-3 w-3" /> NAS-Sync OK
    </span>
  );
  if (status === "error") return (
    <span className="cust-status-badge cust-status-cancelled">
      <AlertTriangle className="h-3 w-3" /> NAS-Sync Fehler
    </span>
  );
  return (
    <span className="cust-status-badge cust-status-draft">
      <Clock className="h-3 w-3" /> NAS-Sync unbekannt
    </span>
  );
}

export function BackupManager({ items, config, canManage = true, onCreate, onDelete, onRestore }: Props) {
  const [busyAction, setBusyAction] = useState<"create" | "delete" | "restore" | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [createIncludeVolumes, setCreateIncludeVolumes] = useState(false);
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

  useEffect(() => {
    setCreateIncludeVolumes(config?.includeVolumes ?? false);
  }, [config?.includeVolumes]);

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
      await onRestore(name, { restoreVolumes });
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
    <section className="space-y-5">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="cust-page-header-title">Backups</h1>
          <p className="cust-page-header-sub">Datenbank-Sicherungen erstellen, wiederherstellen und verwalten.</p>
        </div>
        {canManage ? (
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={busyAction === "create"}
          className="btn-primary min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm shrink-0"
        >
          {busyAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Neues Backup
        </button>
        ) : null}
      </header>

      {/* Config / Status Panel */}
      {config && (
        <div className="cust-form-section space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
            <Server className="h-4 w-4" style={{ color: "var(--text-subtle)" }} />
            Backup-Konfiguration
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 text-xs">
            <div>
              <div style={{ color: "var(--text-subtle)" }}>Aufbewahrung</div>
              <div className="font-semibold mt-0.5" style={{ color: "var(--text-muted)" }}>{config.retentionDays} Tage</div>
            </div>
            <div>
              <div style={{ color: "var(--text-subtle)" }}>Zeitplan</div>
              <div className="font-semibold font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{config.schedule} (02:00)</div>
            </div>
            <div>
              <div style={{ color: "var(--text-subtle)" }}>Manuelles Voll-Backup</div>
              <div className="mt-0.5">
                {config.includeVolumes
                  ? <span className="cust-status-badge cust-status-completed"><CheckCircle2 className="h-3 w-3" /> Ja</span>
                  : <span style={{ color: "var(--text-subtle)", fontWeight: 500, fontSize: "12px" }}>Aus (Standard)</span>
                }
              </div>
            </div>
          </div>
          {config.volumePaths.length > 0 && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--surface-raised)" }}>
              <div className="mb-1 font-semibold" style={{ color: "var(--text-muted)" }}>Lokale Restore-Volume-Pfade</div>
              <div className="flex flex-wrap gap-1.5">
                {config.volumePaths.map((volumePath) => (
                  <span key={volumePath} className="cust-badge cust-badge--neutral font-mono">
                    {volumePath}
                  </span>
                ))}
              </div>
              <p className="mt-2" style={{ color: "var(--text-subtle)" }}>
                Diese Pfade werden nur bei aktiviertem Voll-Volume-Backup archiviert.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--border-soft)" }}>
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" style={{ color: "var(--text-subtle)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>NAS-Sync</span>
              <NasSyncBadge status={config.nasSync.lastSyncStatus} />
            </div>
            <div className="text-xs sm:ml-auto font-mono truncate" style={{ color: "var(--text-subtle)" }}>
              {config.nasSync.target}
            </div>
          </div>
          {config.nasSync.lastSync && (
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              Letzter Sync: {config.nasSync.lastSync}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Der tägliche NAS-Sync sichert standardmässig Datenbank und Metadaten. Volume-Archive nur manuell bei Bedarf.
          </p>
        </div>
      )}

      {error && (
        <div className="cust-alert cust-alert--error rounded-lg text-sm">{error}</div>
      )}

      {/* Backup Table */}
      {sortedItems.length === 0 ? (
        <EmptyState
          icon={<Database className="h-6 w-6" style={{ color: "var(--accent)" }} />}
          title="Keine Backups vorhanden"
          description="Erstelle das erste Backup, um einen Wiederherstellungspunkt zu sichern."
        />
      ) : (
        <div className="cust-table-wrap overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th className="w-6 px-2" />
                <th>Name</th>
                <th className="hidden sm:table-cell">Inhalt</th>
                <th className="text-right">Grösse</th>
                <th>Erstellt am</th>
                {canManage ? <th className="text-right">Aktionen</th> : null}
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const isDeleting = busyAction === "delete" && selectedName === item.name;
                const isRestoring = busyAction === "restore" && selectedName === item.name;
                const isExpanded = expandedRow === item.name;
                const hasContents = item.contents && item.contents.length > 0;
                const hasVolumes = item.contents?.some((f) => f.file.endsWith(".tar.gz"));

                return (
                  <>
                    <tr
                      key={item.name}
                      onClick={() => setExpandedRow(isExpanded ? null : item.name)}
                    >
                      <td className="px-2" style={{ color: "var(--text-subtle)" }}>
                        {hasContents
                          ? isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />
                          : null
                        }
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          {item.type === "folder"
                            ? <FolderArchive className="h-4 w-4 shrink-0" style={{ color: "var(--propus-gold)" }} />
                            : <Database className="h-4 w-4 shrink-0" style={{ color: "#3498db" }} />
                          }
                          <span className="text-sm font-medium font-mono" style={{ color: "var(--text-main)" }}>{item.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {hasVolumes && (
                            <span className="cust-badge cust-badge--gold">
                              <FolderArchive className="h-2.5 w-2.5 mr-0.5 inline" /> volumes
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {item.contents?.map((f) => (
                            <span key={f.file} className="cust-badge cust-badge--neutral font-mono">
                              {f.file}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-right text-sm tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {formatFileSize(item.size)}
                      </td>
                      <td className="text-sm whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {item.createdAt ? formatSwissDateTime(item.createdAt) : "-"}
                      </td>
                      {canManage ? (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRestoreTarget(item.name);
                              setRestoreVolumes(Boolean(hasVolumes));
                            }}
                            disabled={busyAction !== null}
                            className="cust-action-view min-h-0 min-w-0 disabled:opacity-60"
                          >
                            {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Wiederherstellen
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteName(item.name)}
                            disabled={busyAction !== null}
                            className="cust-action-icon cust-action-icon--danger min-h-0 min-w-0 disabled:opacity-60"
                            title="Löschen"
                          >
                            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                      ) : null}
                    </tr>
                    {isExpanded && hasContents && (
                      <tr key={`${item.name}-expanded`} style={{ background: "color-mix(in srgb, var(--surface-raised) 60%, transparent)" }}>
                        <td />
                        <td colSpan={canManage ? 5 : 4} className="px-4 pb-3 pt-1">
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
              <Database className="h-5 w-5" style={{ color: "var(--accent)" }} />
              Neues Backup erstellen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
            <p>Folgende Daten werden gesichert:</p>
            <ul className="space-y-1.5 rounded-lg p-3" style={{ background: "var(--surface-raised)" }}>
              {[
                "Haupt-Datenbank (propus)",
                "Bestellungen (orders.json)",
                "Umgebungskonfiguration (.env.vps)",
                "Volume-Archive der lokalen VPS-Restore-Daten (optional)",
              ].filter(Boolean).map((item) => (
                <li key={item as string} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "#2ecc71" }} />
                  {item}
                </li>
              ))}
            </ul>

            <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border p-3 transition-colors" style={{ borderColor: "var(--border-soft)" }}>
              <input
                type="checkbox"
                checked={createIncludeVolumes}
                onChange={(e) => setCreateIncludeVolumes(e.target.checked)}
                style={{ marginTop: "2px", accentColor: "var(--accent)" }}
              />
              <div>
                <div className="font-semibold flex items-center gap-1.5" style={{ color: "var(--text-main)" }}>
                  <FolderArchive className="h-3.5 w-3.5" style={{ color: "var(--propus-gold)" }} />
                  Komplettes Volume mitsichern
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
                  Archiviert nur die lokalen VPS-Pfade fuer Restore: State, Logs und Upload-Staging. Externe NAS-Mounts sind ausgeschlossen.
                </div>
              </div>
            </label>

            <div className="cust-alert cust-alert--warning text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Der tägliche NAS-Sync speichert standardmässig nur DB und Metadaten. Voll-Volume-Backups bitte gezielt manuell starten.</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowCreateDialog(false)} className="btn-secondary min-h-0 min-w-0 px-3 py-1.5 text-sm">
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busyAction === "create"}
              className="btn-primary min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
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
              <RotateCcw className="h-5 w-5" style={{ color: "#e67e22" }} />
              Backup wiederherstellen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
            <p>
              Backup <span className="font-semibold font-mono" style={{ color: "var(--text-main)" }}>{restoreTarget}</span> wiederherstellen?
            </p>
            <div className="cust-alert cust-alert--error text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Die aktuellen Datenbankdaten werden überschrieben. Erstelle zuerst ein neues Backup.</span>
            </div>
            {[
              { checked: restoreVolumes, onChange: (v: boolean) => setRestoreVolumes(v), title: "Volume-Archive wiederherstellen", hint: "Stellt die lokalen VPS-Pfade State, Logs und Upload-Staging aus dem Backup wieder her." },
            ].filter(Boolean).map((opt) => opt && (
              <label key={opt.title} className="flex items-start gap-3 cursor-pointer select-none rounded-lg border p-3 transition-colors" style={{ borderColor: "var(--border-soft)" }}>
                <input
                  type="checkbox"
                  checked={opt.checked}
                  onChange={(e) => opt.onChange(e.target.checked)}
                  style={{ marginTop: "2px", accentColor: "var(--accent)" }}
                />
                <div>
                  <div className="font-semibold" style={{ color: "var(--text-main)" }}>{opt.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{opt.hint}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setRestoreTarget(null)} disabled={busyAction === "restore"} className="btn-secondary min-h-0 min-w-0 px-3 py-1.5 text-sm disabled:opacity-60">
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => restoreTarget && handleRestore(restoreTarget)}
              disabled={busyAction === "restore"}
              className="btn-primary min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
              style={{ background: "#e67e22" }}
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
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Soll das Backup <span className="font-semibold font-mono" style={{ color: "var(--text-main)" }}>{confirmDeleteName}</span> wirklich gelöscht werden?
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setConfirmDeleteName(null)} disabled={busyAction === "delete"} className="btn-secondary min-h-0 min-w-0 px-3 py-1.5 text-sm disabled:opacity-60">
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => confirmDeleteName && handleDelete(confirmDeleteName)}
              disabled={busyAction === "delete"}
              className="btn-primary min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
              style={{ background: "#e74c3c" }}
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

