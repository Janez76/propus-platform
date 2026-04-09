import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw, Send, Eye, EyeOff, CheckCircle2, XCircle, AlertTriangle, Loader2, Mail, Search,
  ChevronDown, ChevronRight, Users, Package,
} from "lucide-react";
import {
  getCleanupDashboardCandidates,
  getCleanupSandboxPreview,
  getToursAdminMatterportModel,
  postCleanupDashboardBatchDryRun,
  postCleanupDashboardBatchSend,
  postCleanupDashboardSendSingle,
  postCleanupSendSingle,
  type CleanupCustomerGroup,
  type CleanupSandboxPreview,
  type MatterportModelMeta,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminCleanupCandidatesQueryKey } from "../../../lib/queryKeys";

function formatDate(v: unknown) {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type BatchResult = {
  dryRun: boolean;
  totalCustomers: number;
  totalTours: number;
  sent: number;
  skipped: number;
  failed: number;
  results: Array<{
    customerEmail: string;
    customerName?: string | null;
    tourCount: number;
    pendingCount: number;
    skipped: boolean;
    skipReason?: string;
    success?: boolean;
    error?: string;
    dryRun?: boolean;
    tours?: Array<{ id: number; objectLabel: string; status: string; statusLabel?: string }>;
  }>;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Aktiv", cls: "bg-green-100 text-green-800" },
  EXPIRING_SOON: { label: "Läuft ab", cls: "bg-yellow-100 text-yellow-800" },
  EXPIRED_PENDING_ARCHIVE: { label: "Abgelaufen", cls: "bg-orange-100 text-orange-800" },
  ARCHIVED: { label: "Archiviert", cls: "bg-gray-100 text-gray-700" },
  CUSTOMER_ACCEPTED_AWAITING_PAYMENT: { label: "Warten auf Zahlung", cls: "bg-blue-100 text-blue-800" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] || { label: status, cls: "bg-slate-100 text-slate-700" };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const MP_STATE_LABEL: Record<string, { label: string; cls: string }> = {
  active:     { label: "Aktiv",          cls: "bg-green-100 text-green-800" },
  inactive:   { label: "Inaktiv",        cls: "bg-gray-100 text-gray-600" },
  processing: { label: "In Verarbeitung",cls: "bg-blue-100 text-blue-700" },
  failed:     { label: "Fehler",         cls: "bg-red-100 text-red-700" },
  pending:    { label: "Ausstehend",     cls: "bg-yellow-100 text-yellow-700" },
  staging:    { label: "Staging",        cls: "bg-purple-100 text-purple-700" },
};

const MP_VISIBILITY_LABEL: Record<string, string> = {
  private:  "Privat",
  unlisted: "Nur Link",
  public:   "Öffentlich",
  password: "Passwortgeschützt",
};

function MatterportSpaceCheck({ tourId }: { tourId: number }) {
  const [model, setModel] = useState<MatterportModelMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inactiveWarning, setInactiveWarning] = useState(false);
  const [checked, setChecked] = useState(false);

  async function runCheck() {
    setLoading(true);
    setError(null);
    setModel(null);
    setInactiveWarning(false);
    try {
      const r = await getToursAdminMatterportModel(String(tourId));
      setModel(r.model);
      setInactiveWarning(r.inactiveWarning ?? false);
      setChecked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Abrufen");
      setChecked(true);
    } finally {
      setLoading(false);
    }
  }

  const stateKey = model?.state?.toLowerCase() ?? "";
  const stateCfg = MP_STATE_LABEL[stateKey] ?? { label: model?.state ?? "—", cls: "bg-slate-100 text-slate-600" };
  const visKey = model?.accessVisibility?.toLowerCase() ?? model?.visibility?.toLowerCase() ?? "";
  const visLabel = MP_VISIBILITY_LABEL[visKey] ?? visKey ?? "—";

  return (
    <div className="border border-[var(--border-soft)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface-card-strong)]">
        <span className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" />
          Matterport Live-Check
        </span>
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={loading}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium border border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {checked ? "Erneut prüfen" : "Space prüfen"}
        </button>
      </div>

      {!checked && !loading && (
        <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">Klicken Sie auf «Space prüfen», um den Zustand direkt bei Matterport abzufragen.</p>
      )}

      {loading && (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-[var(--text-subtle)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Matterport API wird abgefragt…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 text-xs text-red-700 bg-red-50">
          <XCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {model && (
        <div className="px-3 py-2 space-y-2">
          {inactiveWarning && (
            <div className="flex gap-1.5 rounded bg-yellow-50 border border-yellow-200 px-2 py-1.5 text-xs text-yellow-800">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              Space ist archiviert – publication-Felder nicht verfügbar
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-[var(--text-subtle)]">Space-ID</span>
              <div className="font-mono font-medium">{model.id}</div>
            </div>
            <div>
              <span className="text-[var(--text-subtle)]">Name</span>
              <div className="font-medium">{model.name || "—"}</div>
            </div>
            <div>
              <span className="text-[var(--text-subtle)]">Zustand</span>
              <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-0.5 ${stateCfg.cls}`}>
                  {stateCfg.label}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[var(--text-subtle)]">Sichtbarkeit</span>
              <div className="font-medium">{visLabel}</div>
            </div>
            {model.publication?.address && (
              <div className="col-span-2">
                <span className="text-[var(--text-subtle)]">Adresse</span>
                <div className="font-medium">{model.publication.address}</div>
              </div>
            )}
            {model.publication?.url && (
              <div className="col-span-2">
                <span className="text-[var(--text-subtle)]">Link</span>
                <div>
                  <a href={model.publication.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline break-all">
                    {model.publication.url}
                  </a>
                </div>
              </div>
            )}
            <div>
              <span className="text-[var(--text-subtle)]">Erstellt</span>
              <div>{model.created ? new Date(model.created).toLocaleDateString("de-CH") : "—"}</div>
            </div>
            <div>
              <span className="text-[var(--text-subtle)]">Geändert</span>
              <div>{model.modified ? new Date(model.modified).toLocaleDateString("de-CH") : "—"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SandboxPreviewPanel({ tourId, onClose }: { tourId: number; onClose: () => void }) {
  const queryFn = useCallback(() => getCleanupSandboxPreview(tourId), [tourId]);
  const { data, loading, error } = useQuery(`cleanup:sandbox:${tourId}`, queryFn, { staleTime: 60_000 });

  const preview = data as ({ ok: true } & CleanupSandboxPreview) | undefined;

  return (
    <div className="border border-[var(--border-soft)] rounded-lg bg-[var(--surface-card)] mt-2 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface-card-strong)] border-b border-[var(--border-soft)]">
        <span className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">Sandbox-Vorschau</span>
        <button type="button" onClick={onClose} className="text-[var(--text-subtle)] hover:text-[var(--text-main)] text-xs">✕ Schliessen</button>
      </div>
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
        </div>
      )}
      {error && <p className="px-4 py-3 text-xs text-red-600">{error}</p>}
      {preview && (
        <div className="px-4 py-3 space-y-3">
          {!preview.withinCleanupWindow && preview.withinCleanupWindowNote && (
            <div className="flex gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {preview.withinCleanupWindowNote}
            </div>
          )}
          {preview.needsManualReview && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
              Manueller Review erforderlich — kein automatischer Preis
            </div>
          )}
          <div className="text-xs space-y-1">
            <p><span className="text-[var(--text-subtle)]">Status:</span> {preview.statusLabel}</p>
            <p><span className="text-[var(--text-subtle)]">E-Mail:</span> {preview.email || "—"}</p>
            <p><span className="text-[var(--text-subtle)]">Bereits versendet:</span> {preview.alreadySent ? "Ja" : "Nein"}</p>
            <p><span className="text-[var(--text-subtle)]">Aktion gewählt:</span> {preview.alreadyDone ? "Ja" : "Nein"}</p>
            {preview.rule.needsInvoice && (
              <p><span className="text-[var(--text-subtle)]">Rechnungsbetrag:</span> CHF {preview.rule.invoiceAmount}.—</p>
            )}
          </div>

          <MatterportSpaceCheck tourId={tourId} />

          <div>
            <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide mb-1">Betreff</p>
            <p className="text-xs bg-[var(--surface)] rounded px-3 py-2 border border-[var(--border-soft)]">{preview.mail.subject}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide mb-1">Mail-Vorschau (HTML)</p>
            <div
              className="rounded border border-[var(--border-soft)] overflow-auto max-h-80 bg-white text-xs"
              dangerouslySetInnerHTML={{ __html: preview.mail.html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerCard({
  group,
  isSelected,
  onToggleSelect,
  busyAction,
  onSendSingle,
  onSendSingleTour,
}: {
  group: CleanupCustomerGroup;
  isSelected: boolean;
  onToggleSelect: () => void;
  busyAction: string | null;
  onSendSingle: (email: string) => void;
  onSendSingleTour: (tourId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewTourId, setPreviewTourId] = useState<number | null>(null);

  const isBusy = busyAction === `single:${group.customerEmail}`;
  const allDone = group.pendingCount === 0;

  return (
    <div className={`surface-card-strong rounded-lg border border-[var(--border-soft)] overflow-hidden ${allDone ? "opacity-50" : ""}`}>
      {/* Kunden-Kopfzeile */}
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          disabled={group.allSent || allDone}
          className="rounded flex-shrink-0"
        />
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {expanded ? <ChevronDown className="h-4 w-4 text-[var(--text-subtle)] flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-[var(--text-subtle)] flex-shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--text-main)] truncate">{group.customerEmail}</span>
              {group.customerName && (
                <span className="text-xs text-[var(--text-subtle)] truncate hidden sm:inline">({group.customerName})</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-xs text-[var(--text-subtle)]">
                <Package className="h-3 w-3" />
                {group.tourCount} Tour{group.tourCount > 1 ? "en" : ""}
              </span>
              {group.pendingCount > 0 && (
                <span className="text-xs font-medium text-orange-600">{group.pendingCount} offen</span>
              )}
              {group.doneCount > 0 && (
                <span className="text-xs text-green-600">{group.doneCount} erledigt</span>
              )}
              {group.allSent && (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--text-subtle)]">
                  <Mail className="h-3 w-3" /> Versendet
                </span>
              )}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!group.allSent && group.pendingCount > 0 && (
            <button
              type="button"
              disabled={!!busyAction}
              onClick={() => onSendSingle(group.customerEmail)}
              title="Dashboard-Link senden"
              className="flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-subtle)] hover:text-[var(--accent)] hover:bg-[var(--surface-card-strong)] disabled:opacity-40"
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Senden</span>
            </button>
          )}
        </div>
      </div>

      {/* Aufgeklappte Tour-Liste */}
      {expanded && (
        <div className="border-t border-[var(--border-soft)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)] text-xs uppercase tracking-wide">
                <th className="px-4 py-2">Tour</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Aktion</th>
                <th className="px-4 py-2 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {group.tours.map((tour) => {
                const t = tour as Record<string, unknown>;
                const id = Number(t.id);
                const done = !!t.cleanup_action;
                const isPreviewOpen = previewTourId === id;
                return (
                  <>
                    <tr key={id} className={`border-b border-[var(--border-soft)] last:border-0 ${done ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2">
                        <Link to={`/admin/tours/${id}`} className="font-medium text-[var(--accent)] hover:underline">
                          {String(t.object_label || t.bezeichnung || `Tour ${id}`)}
                        </Link>
                        <div className="text-[10px] text-[var(--text-subtle)]">#{id}</div>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={String(t.status || "")} />
                      </td>
                      <td className="px-4 py-2">
                        {done ? (
                          <span className="text-xs text-green-700 font-medium">
                            {String(t.cleanup_action)} ({formatDate(t.cleanup_action_at)})
                          </span>
                        ) : t.cleanup_sent_at ? (
                          <span className="text-xs text-[var(--text-subtle)]">Mail: {formatDate(t.cleanup_sent_at)}</span>
                        ) : (
                          <span className="text-xs text-[var(--text-subtle)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewTourId(isPreviewOpen ? null : id)}
                            title="Sandbox-Vorschau"
                            className="rounded p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)] hover:bg-[var(--surface-card-strong)]"
                          >
                            {isPreviewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          {!done && !t.cleanup_sent_at && (
                            <button
                              type="button"
                              disabled={!!busyAction}
                              onClick={() => onSendSingleTour(id)}
                              title="Einzel-Mail nur für diese Tour senden (4 Aktions-Links)"
                              className="rounded p-1 text-[var(--text-subtle)] hover:text-[var(--accent)] hover:bg-[var(--surface-card-strong)] disabled:opacity-40"
                            >
                              {busyAction === `tour:${id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isPreviewOpen && (
                      <tr key={`preview-${id}`}>
                        <td colSpan={4} className="px-4 pb-3">
                          <SandboxPreviewPanel tourId={id} onClose={() => setPreviewTourId(null)} />
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
    </div>
  );
}

export function ToursAdminCleanupPage() {
  const qk = toursAdminCleanupCandidatesQueryKey();
  const queryFn = useCallback(() => getCleanupDashboardCandidates().then((r) => r), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const customers: CleanupCustomerGroup[] = (data as { customers?: CleanupCustomerGroup[] } | undefined)?.customers ?? [];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  function toggleSelect(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }

  function toggleAll() {
    const eligible = customers.filter((c) => !c.allSent && c.pendingCount > 0);
    if (selected.size === eligible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.map((c) => c.customerEmail)));
    }
  }

  async function handleDryRun() {
    setBusyAction("dryrun");
    setActionErr(null);
    setActionMsg(null);
    setBatchResult(null);
    try {
      const emails = selected.size > 0 ? [...selected] : undefined;
      const r = await postCleanupDashboardBatchDryRun(emails);
      setBatchResult(r as BatchResult);
      setActionMsg(`Dry-Run abgeschlossen: ${r.totalCustomers} Kunden, ${r.totalTours} Touren geprüft.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Fehler beim Dry-Run");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSend() {
    setConfirmSend(false);
    setBusyAction("send");
    setActionErr(null);
    setActionMsg(null);
    setBatchResult(null);
    try {
      const emails = selected.size > 0 ? [...selected] : undefined;
      const r = await postCleanupDashboardBatchSend(emails);
      setBatchResult(r as BatchResult);
      setActionMsg(`Versand abgeschlossen: ${r.sent} versendet, ${r.skipped} übersprungen, ${r.failed} fehlgeschlagen.`);
      void refetch({ force: true });
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Fehler beim Versand");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendSingle(email: string) {
    setBusyAction(`single:${email}`);
    setActionErr(null);
    setActionMsg(null);
    try {
      const r = await postCleanupDashboardSendSingle(email);
      setActionMsg(`Dashboard-Link gesendet an ${r.recipientEmail} (${r.tourCount} Touren).`);
      void refetch({ force: true });
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Fehler beim Einzelversand");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendSingleTour(tourId: number) {
    setBusyAction(`tour:${tourId}`);
    setActionErr(null);
    setActionMsg(null);
    try {
      const r = await postCleanupSendSingle(tourId);
      setActionMsg(`Einzel-Mail gesendet an ${(r as { recipientEmail?: string }).recipientEmail || "?"} für Tour #${tourId}.`);
      void refetch({ force: true });
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Fehler beim Einzelversand");
    } finally {
      setBusyAction(null);
    }
  }

  const eligibleCount = customers.filter((c) => !c.allSent && c.pendingCount > 0).length;
  const totalPendingTours = customers.reduce((s, c) => s + c.pendingCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Bereinigungslauf</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">
            Pro Kunde wird <strong>eine einzige E-Mail</strong> mit einem Dashboard-Link versendet, auf dem alle Touren gesammelt angezeigt werden.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch({ force: true })}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)]"
        >
          <RefreshCw className="h-4 w-4" />
          Aktualisieren
        </button>
      </div>

      {/* Statistik */}
      {customers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="surface-card-strong rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] uppercase tracking-wide">
              <Users className="h-3.5 w-3.5" /> Kunden
            </div>
            <div className="text-2xl font-bold text-[var(--text-main)] mt-1">{customers.length}</div>
          </div>
          <div className="surface-card-strong rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] uppercase tracking-wide">
              <Package className="h-3.5 w-3.5" /> Offene Touren
            </div>
            <div className="text-2xl font-bold text-orange-600 mt-1">{totalPendingTours}</div>
          </div>
          <div className="surface-card-strong rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] uppercase tracking-wide">
              <Mail className="h-3.5 w-3.5" /> Versendbar
            </div>
            <div className="text-2xl font-bold text-[var(--accent)] mt-1">{eligibleCount}</div>
          </div>
          <div className="surface-card-strong rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] uppercase tracking-wide">
              <CheckCircle2 className="h-3.5 w-3.5" /> Erledigt
            </div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {customers.reduce((s, c) => s + c.doneCount, 0)}
            </div>
          </div>
        </div>
      )}

      {/* Fehler beim Laden */}
      {error && (
        <p className="text-sm text-red-600">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void refetch({ force: true })}>Erneut laden</button>
        </p>
      )}

      {/* Aktions-Feedback */}
      {(actionMsg || actionErr) && (
        <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${actionErr ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-800"}`}>
          {actionErr ? <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          {actionErr || actionMsg}
        </div>
      )}

      {/* Aktionsleiste */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-[var(--text-subtle)] cursor-pointer">
          <input type="checkbox" checked={selected.size > 0 && selected.size === customers.filter((c) => !c.allSent && c.pendingCount > 0).length} onChange={toggleAll} className="rounded" />
          Alle
        </label>
        <span className="text-sm text-[var(--text-subtle)]">
          {selected.size > 0 ? `${selected.size} Kunden ausgewählt` : `${eligibleCount} Kunden versendbar`}
        </span>
        <button
          type="button"
          disabled={!!busyAction}
          onClick={handleDryRun}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-card-strong)] disabled:opacity-50"
        >
          {busyAction === "dryrun" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Dry-Run{selected.size > 0 ? ` (${selected.size})` : " (alle)"}
        </button>
        <button
          type="button"
          disabled={!!busyAction || eligibleCount === 0}
          onClick={() => setConfirmSend(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busyAction === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Produktiv senden{selected.size > 0 ? ` (${selected.size})` : " (alle)"}
        </button>
      </div>

      {/* Bestätigungs-Dialog */}
      {confirmSend && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-800">Produktiver Versand bestätigen</p>
              <p className="text-sm text-orange-700 mt-0.5">
                Es wird pro Kunde <strong>eine E-Mail mit Dashboard-Link</strong> an {selected.size > 0 ? selected.size : eligibleCount} Empfänger gesendet. Dieser Vorgang kann nicht rückgängig gemacht werden.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleSend} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
              Ja, jetzt senden
            </button>
            <button type="button" onClick={() => setConfirmSend(false)} className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm text-[var(--text-subtle)]">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Kunden-Liste */}
      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : customers.length === 0 ? (
        <div className="surface-card-strong flex flex-col items-center py-16 text-[var(--text-subtle)]">
          <CheckCircle2 className="h-8 w-8 mb-3 opacity-40" />
          <p className="text-sm">Keine Kandidaten für den Bereinigungslauf gefunden.</p>
          <p className="text-xs mt-1 opacity-70">Touren müssen <code>confirmation_required = TRUE</code> gesetzt haben.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((group) => (
            <CustomerCard
              key={group.customerEmail}
              group={group}
              isSelected={selected.has(group.customerEmail)}
              onToggleSelect={() => toggleSelect(group.customerEmail)}
              busyAction={busyAction}
              onSendSingle={handleSendSingle}
              onSendSingleTour={handleSendSingleTour}
            />
          ))}
        </div>
      )}

      {/* Batch-Ergebnis */}
      {batchResult && (
        <div className="surface-card-strong space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-main)]">
              {batchResult.dryRun ? "Dry-Run Ergebnis" : "Versand-Ergebnis"}
            </h2>
            <div className="flex gap-4 text-xs text-[var(--text-subtle)]">
              <span>Kunden: <strong>{batchResult.totalCustomers}</strong></span>
              <span>Touren: <strong>{batchResult.totalTours}</strong></span>
              {!batchResult.dryRun && <span className="text-green-700">Versendet: <strong>{batchResult.sent}</strong></span>}
              <span>Übersprungen: <strong>{batchResult.skipped}</strong></span>
              {!batchResult.dryRun && batchResult.failed > 0 && (
                <span className="text-red-600">Fehler: <strong>{batchResult.failed}</strong></span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                  <th className="px-3 py-2">Kunde</th>
                  <th className="px-3 py-2">Touren</th>
                  <th className="px-3 py-2">Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {batchResult.results.map((r) => (
                  <tr key={r.customerEmail} className="border-b border-[var(--border-soft)] last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.customerEmail}</div>
                      {r.customerName && <div className="text-[var(--text-subtle)]">{r.customerName}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {r.pendingCount} offen / {r.tourCount} total
                      {r.dryRun && r.tours && (
                        <div className="mt-1 space-y-0.5">
                          {r.tours.map((t) => (
                            <div key={t.id} className="flex items-center gap-1.5">
                              <StatusBadge status={t.status} />
                              <span>{t.objectLabel}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.skipped ? (
                        <span className="text-[var(--text-subtle)]">Übersprungen: {r.skipReason}</span>
                      ) : batchResult.dryRun ? (
                        <span className="text-blue-700">1 Dashboard-Mail würde versendet</span>
                      ) : r.success ? (
                        <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Versendet</span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" />{r.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
