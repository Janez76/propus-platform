import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw, Send, Eye, EyeOff, CheckCircle2, XCircle, AlertTriangle, Loader2, Mail, Search,
  ChevronDown, ChevronRight, Users, Package, Gift, Bell, MailOpen, Link, Copy, Check,
} from "lucide-react";
import {
  getCleanupDashboardCandidates,
  getCleanupSandboxPreview,
  getToursAdminMatterportModel,
  postCleanupDashboardBatchDryRun,
  postCleanupDashboardBatchSend,
  postCleanupDashboardBatchReminder,
  postCleanupDashboardBatchReminderDryRun,
  postCleanupDashboardGetLink,
  postCleanupDashboardSendSingle,
  postCleanupDashboardSendVouchers,
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

const ACTION_LABEL: Record<string, string> = {
  weiterfuehren: "Weitergeführt",
  weiterfuehren_online: "Weitergeführt (Online)",
  weiterfuehren_qr: "Weitergeführt (QR)",
  weiterfuehren_review: "Review ausstehend",
  weiterfuehren_pending_payment: "Zahlung ausstehend",
  archivieren: "Archiviert",
  uebertragen: "Übertragen",
  loeschen: "Löschen beantragt",
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

function MagicLinkButton({ customerEmails }: { customerEmails: string[] }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGetLink() {
    setLoading(true);
    setError(null);
    try {
      const r = await postCleanupDashboardGetLink(customerEmails);
      await navigator.clipboard.writeText(r.dashboardUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={() => void handleGetLink()}
        disabled={loading}
        title="Magic-Link generieren und kopieren"
        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          copied
            ? "border-green-300 bg-green-50 text-green-700"
            : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--surface-card-strong)]"
        }`}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Link className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">{copied ? "Kopiert!" : "Link"}</span>
      </button>
      {error && (
        <span className="absolute top-full mt-1 right-0 z-50 whitespace-nowrap rounded bg-red-600 px-2 py-1 text-[10px] text-white shadow">
          {error}
        </span>
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
  onSendSingle: (emails: string[]) => void;
  onSendSingleTour: (tourId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewTourId, setPreviewTourId] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const emails = group.customerEmails ?? [group.customerEmail];
  const [selectedEmails, setSelectedEmails] = useState<string[]>(emails);
  const [overrideEmail, setOverrideEmail] = useState("");
  const [overrideError, setOverrideError] = useState("");

  const isBusy = busyAction === `single:${group.groupKey}`;
  const allDone = group.pendingCount === 0;
  const displayName = group.customerName || group.customerEmail;

  // Klick ausserhalb schliesst Dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  function toggleEmail(email: string) {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }

  function addOverride() {
    const v = overrideEmail.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setOverrideError("Ungültige E-Mail-Adresse");
      return;
    }
    setOverrideError("");
    setSelectedEmails((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setOverrideEmail("");
  }

  // Effektive Empfänger: entweder Override-only wenn kein Standard gewählt, sonst selectedEmails
  const effectiveRecipients = selectedEmails.length > 0 ? selectedEmails : emails;

  const recipientLabel = (() => {
    if (selectedEmails.length === 0) return "Keine";
    if (selectedEmails.length === emails.length && selectedEmails.every((e) => emails.includes(e))) return "Alle";
    if (selectedEmails.length === 1 && selectedEmails[0] === emails[0]) return "Hauptkontakt";
    return `${selectedEmails.length}`;
  })();

  const hasCustomEmail = selectedEmails.some((e) => !emails.includes(e));

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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[var(--text-main)] truncate">{displayName}</span>
              <span className="text-xs text-[var(--text-subtle)] hidden sm:inline truncate">
                {emails.join(", ")}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-xs text-[var(--text-subtle)]">
                <Package className="h-3 w-3" />
                {group.tourCount} Tour{group.tourCount > 1 ? "en" : ""}
              </span>
              {emails.length > 1 && (
                <span className="text-xs text-[var(--text-subtle)]">{emails.length} E-Mails</span>
              )}
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
              {group.lastAccessedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium" title={`Dashboard zuletzt geöffnet: ${new Date(group.lastAccessedAt).toLocaleString("de-CH")}`}>
                  <MailOpen className="h-3 w-3" />
                  Gelesen {new Date(group.lastAccessedAt).toLocaleDateString("de-CH")}
                </span>
              ) : group.allSent ? (
                <span className="inline-flex items-center gap-1 text-xs text-orange-500" title="Kunde hat den Link noch nicht geöffnet">
                  <Bell className="h-3 w-3" /> Ungelesen
                </span>
              ) : null}
            </div>
          </div>
        </button>

        {/* Empfänger-Auswahl + Senden */}
        {!group.allSent && group.pendingCount > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Empfänger-Dropdown (immer sichtbar) */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium bg-white transition-colors ${
                  hasCustomEmail
                    ? "border-amber-400 text-amber-700"
                    : dropdownOpen
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
                }`}
                title="Empfänger auswählen oder übersteuern"
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{recipientLabel}</span>
                <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-[var(--border-soft)] bg-white shadow-xl py-1">
                  {/* Bestehende E-Mails */}
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                    Bekannte Kontakte
                  </div>
                  {emails.map((email, i) => (
                    <label key={email} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-card-strong)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEmails.includes(email)}
                        onChange={() => toggleEmail(email)}
                        className="rounded flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-[var(--text-main)] truncate">{email}</div>
                        {i === 0 && <div className="text-[10px] text-[var(--text-subtle)]">Hauptkontakt</div>}
                      </div>
                    </label>
                  ))}

                  {/* Schnellaktionen */}
                  <div className="px-3 py-1.5 flex gap-3 border-t border-[var(--border-soft)]">
                    <button type="button" onClick={() => setSelectedEmails([...emails])} className="text-[10px] text-[var(--accent)] hover:underline">Alle wählen</button>
                    <button type="button" onClick={() => setSelectedEmails([emails[0]])} className="text-[10px] text-[var(--text-subtle)] hover:underline">Nur Hauptkontakt</button>
                    <button type="button" onClick={() => setSelectedEmails([])} className="text-[10px] text-red-400 hover:underline ml-auto">Keine</button>
                  </div>

                  {/* Override: andere E-Mail eingeben */}
                  <div className="px-3 pb-2 pt-1 border-t border-[var(--border-soft)]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1.5">Andere E-Mail (übersteuern)</div>
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        value={overrideEmail}
                        onChange={(e) => { setOverrideEmail(e.target.value); setOverrideError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && addOverride()}
                        placeholder="neue@kontakt.ch"
                        className="flex-1 min-w-0 rounded border border-[var(--border-soft)] px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={addOverride}
                        className="rounded border border-[var(--border-soft)] px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--surface-card-strong)] font-medium flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                    {overrideError && <div className="text-[10px] text-red-500 mt-1">{overrideError}</div>}
                    {/* Hinzugefügte Override-E-Mails anzeigen */}
                    {selectedEmails.filter((e) => !emails.includes(e)).map((e) => (
                      <div key={e} className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex-1 truncate">{e} <span className="text-amber-500">(manuell)</span></span>
                        <button type="button" onClick={() => setSelectedEmails((prev) => prev.filter((x) => x !== e))} className="text-[10px] text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!!busyAction || effectiveRecipients.length === 0}
              onClick={() => { onSendSingle(effectiveRecipients); setDropdownOpen(false); }}
              title={`Dashboard-Link senden an: ${effectiveRecipients.join(", ")}`}
              className="flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-subtle)] hover:text-[var(--accent)] hover:bg-[var(--surface-card-strong)] disabled:opacity-40"
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Senden</span>
            </button>
          </div>
        )}
        {(group.allSent || allDone) && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <MagicLinkButton customerEmails={emails} />
          </div>
        )}
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
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-semibold">
                            <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                            {ACTION_LABEL[String(t.cleanup_action)] ?? String(t.cleanup_action)}
                            <span className="text-green-600 font-normal ml-1">{formatDate(t.cleanup_action_at)}</span>
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
  const [showSent, setShowSent] = useState(false);
  const [confirmVouchers, setConfirmVouchers] = useState(false);
  const [confirmReminder, setConfirmReminder] = useState(false);

  function toggleSelect(groupKey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
      return next;
    });
  }

  function toggleAll() {
    const eligible = customers.filter((c) => !c.allSent && c.pendingCount > 0);
    if (selected.size === eligible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.map((c) => c.groupKey)));
    }
  }

  // Alle E-Mails der ausgewählten Gruppen sammeln für Batch-Versand
  function getSelectedEmails(): string[] {
    const selectedGroups = customers.filter((c) => selected.has(c.groupKey));
    return selectedGroups.flatMap((c) => c.customerEmails ?? [c.customerEmail]);
  }

  async function handleDryRun() {
    setBusyAction("dryrun");
    setActionErr(null);
    setActionMsg(null);
    setBatchResult(null);
    try {
      const emails = selected.size > 0 ? getSelectedEmails() : undefined;
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
      const emails = selected.size > 0 ? getSelectedEmails() : undefined;
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

  async function handleSendSingle(emails: string[]) {
    const groupKey = customers.find((c) => (c.customerEmails ?? [c.customerEmail]).some((e) => emails.includes(e)))?.groupKey ?? emails[0];
    setBusyAction(`single:${groupKey}`);
    setActionErr(null);
    setActionMsg(null);
    try {
      const r = await postCleanupDashboardSendSingle(emails);
      const recipientList = r.recipientEmails?.join(", ") ?? r.recipientEmail;
      setActionMsg(`Dashboard-Link gesendet an ${recipientList} (${r.tourCount} Touren).`);
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

  async function handleSendVouchers() {
    setConfirmVouchers(false);
    setBusyAction("vouchers");
    setActionErr(null);
    setActionMsg(null);
    try {
      const r = await postCleanupDashboardSendVouchers();
      setActionMsg(`Gutscheine versendet: ${r.sent} neu, ${r.skipped} bereits erhalten, ${r.failed} fehlgeschlagen.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Fehler beim Gutschein-Versand");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReminderDryRun() {
    setBusyAction("reminder-dryrun");
    setActionErr(null);
    setActionMsg(null);
    setBatchResult(null);
    try {
      const emails = selected.size > 0 ? getSelectedEmails() : undefined;
      const r = await postCleanupDashboardBatchReminderDryRun(emails);
      setBatchResult(r as BatchResult);
      setActionMsg(`Erinnerungs-Dry-Run: ${r.totalCustomers} Kunden mit ${r.totalTours} offenen Touren würden eine Erinnerung erhalten.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Fehler beim Dry-Run");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendReminder() {
    setConfirmReminder(false);
    setBusyAction("reminder");
    setActionErr(null);
    setActionMsg(null);
    setBatchResult(null);
    try {
      const emails = selected.size > 0 ? getSelectedEmails() : undefined;
      const r = await postCleanupDashboardBatchReminder(emails);
      setBatchResult(r as BatchResult);
      setActionMsg(`Erinnerung versendet: ${r.sent} Kunden kontaktiert, ${r.skipped} übersprungen, ${r.failed} fehlgeschlagen.`);
      void refetch({ force: true });
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Fehler beim Erinnerungs-Versand");
    } finally {
      setBusyAction(null);
    }
  }

  const pendingCustomers = customers.filter((c) => !c.allSent && c.pendingCount > 0);
  const sentCustomers = customers.filter((c) => c.allSent);
  const reminderCustomers = sentCustomers.filter((c) => c.pendingCount > 0);
  const eligibleCount = pendingCustomers.length;
  const totalPendingTours = customers.reduce((s, c) => s + c.pendingCount, 0);
  const doneCustomers = customers.filter((c) => c.allSent && c.doneCount > 0);
  const readCount = sentCustomers.filter((c) => c.lastAccessedAt).length;

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
          <div className="surface-card-strong rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] uppercase tracking-wide">
              <MailOpen className="h-3.5 w-3.5" /> Gelesen
            </div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{readCount}</div>
            <div className="text-xs text-[var(--text-subtle)]">von {sentCustomers.length} versendet</div>
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
          <input type="checkbox" checked={selected.size > 0 && selected.size === pendingCustomers.length} onChange={toggleAll} className="rounded" />
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
        <button
          type="button"
          disabled={!!busyAction}
          onClick={() => setConfirmVouchers(true)}
          className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
        >
          {busyAction === "vouchers" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
          Gutscheine senden{doneCustomers.length > 0 ? ` (${doneCustomers.length})` : ""}
        </button>

        {reminderCustomers.length > 0 && (
          <>
            <div className="h-5 w-px bg-[var(--border-soft)]" />
            <button
              type="button"
              disabled={!!busyAction}
              onClick={handleReminderDryRun}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-card-strong)] disabled:opacity-50"
            >
              {busyAction === "reminder-dryrun" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Erinnerung Dry-Run ({reminderCustomers.length})
            </button>
            <button
              type="button"
              disabled={!!busyAction}
              onClick={() => setConfirmReminder(true)}
              className="flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
            >
              {busyAction === "reminder" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Erinnerung senden ({reminderCustomers.length})
            </button>
          </>
        )}
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

      {/* Bestätigungs-Dialog Erinnerung */}
      {confirmReminder && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Bell className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-800">Erinnerungs-Mail senden</p>
              <p className="text-sm text-orange-700 mt-0.5">
                An <strong>{reminderCustomers.length} Kunden</strong>, die bereits eine Mail erhalten haben aber <strong>noch keine Aktion</strong> gewählt haben, wird eine Erinnerung mit einem neuen Dashboard-Link gesendet.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleSendReminder()} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
              Ja, Erinnerung senden
            </button>
            <button type="button" onClick={() => setConfirmReminder(false)} className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm text-[var(--text-subtle)]">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Bestätigungs-Dialog Gutscheine */}
      {confirmVouchers && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Gift className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-900">Gutscheine versenden bestätigen</p>
              <p className="text-sm text-green-800 mt-0.5">
                An alle Kunden, die <strong>alle ihre Touren erledigt</strong> haben und <strong>noch keinen Gutschein</strong> erhalten haben, wird eine Dankes-Mail mit einem einmaligen <strong>10%-Gutscheincode</strong> (6 Monate gültig) gesendet.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleSendVouchers()} className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800">
              Ja, Gutscheine senden
            </button>
            <button type="button" onClick={() => setConfirmVouchers(false)} className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm text-[var(--text-subtle)]">
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
        <>
          {/* Offene Kunden */}
          {pendingCustomers.length > 0 ? (
            <div className="space-y-3">
              {pendingCustomers.map((group) => (
                <CustomerCard
                  key={group.groupKey}
                  group={group}
                  isSelected={selected.has(group.groupKey)}
                  onToggleSelect={() => toggleSelect(group.groupKey)}
                  busyAction={busyAction}
                  onSendSingle={handleSendSingle}
                  onSendSingleTour={handleSendSingleTour}
                />
              ))}
            </div>
          ) : (
            <div className="surface-card-strong flex flex-col items-center py-10 text-[var(--text-subtle)]">
              <CheckCircle2 className="h-6 w-6 mb-2 opacity-40" />
              <p className="text-sm">Alle Kunden wurden bereits kontaktiert.</p>
            </div>
          )}

          {/* Gesendete Kunden — zugeklapptes Akkordeon */}
          {sentCustomers.length > 0 && (
            <div className="border border-[var(--border-soft)] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSent(!showSent)}
                className="flex w-full items-center justify-between px-4 py-3 bg-[var(--surface-card-strong)] text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)] hover:bg-[var(--surface-card)]"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Mail className="h-4 w-4" />
                  Bereits gesendet ({sentCustomers.length})
                </span>
                {showSent ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {showSent && (
                <div className="space-y-2 p-3 bg-[var(--surface)]">
                  {sentCustomers.map((group) => (
                    <CustomerCard
                      key={group.groupKey}
                      group={group}
                      isSelected={selected.has(group.groupKey)}
                      onToggleSelect={() => toggleSelect(group.groupKey)}
                      busyAction={busyAction}
                      onSendSingle={handleSendSingle}
                      onSendSingleTour={handleSendSingleTour}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
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
