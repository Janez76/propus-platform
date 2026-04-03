import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertCircle, Copy, Check, X } from "lucide-react";
import {
  getPortalTourDetail,
  editPortalTour,
  extendPortalTour,
  changePortalTourVisibility,
  archivePortalTour,
  setPortalTourAssignee,
  payPortalInvoice,
  type PortalTourDetail,
} from "../../api/portalTours";
import { usePortalNav } from "../../hooks/usePortalNav";
import { TourActionLog } from "../../components/tours/TourActionLog";

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "–";
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime())
    ? "–"
    : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `CHF ${v.toFixed(2)}`;
}

function daysRemaining(endDate?: string | null): number {
  if (!endDate) return 0;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function formatRestzeit(remaining: number, endDate?: string | null): string {
  if (!endDate) return "–";
  if (remaining === 0) return "Läuft heute ab";
  return `${remaining} ${remaining === 1 ? "Tag" : "Tage"}`;
}

function latestRenewalDate(invoices: PortalTourDetail["invoices"]): string | null {
  const candidates = invoices
    .map((inv) => inv.paid_at ?? inv.sent_at ?? inv.created_at ?? null)
    .filter((v): v is string => v != null)
    .map((v) => ({ raw: v, ts: new Date(v).getTime() }))
    .filter((v) => Number.isFinite(v.ts))
    .sort((a, b) => b.ts - a.ts);
  return candidates[0]?.raw ?? null;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE:                              { label: "Aktiv",                  cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900" },
  EXPIRING_SOON:                       { label: "Läuft bald ab",          cls: "text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-950/40 dark:border-yellow-900" },
  ARCHIVED:                            { label: "Archiviert",             cls: "text-[var(--text-subtle)] bg-[var(--surface)] border-[var(--border-soft)]" },
  AWAITING_CUSTOMER_DECISION:          { label: "Wartet auf Entscheid",   cls: "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-900" },
  CUSTOMER_ACCEPTED_AWAITING_PAYMENT:  { label: "Zahlung ausstehend",     cls: "text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-950/40 dark:border-yellow-900" },
  CUSTOMER_DECLINED:                   { label: "Keine Verlängerung",     cls: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-900" },
};

function StatusBadge({ code }: { code: string }) {
  const meta = STATUS_BADGE[code] ?? { label: code.replace(/_/g, " "), cls: "text-[var(--text-subtle)] bg-[var(--surface)] border-[var(--border-soft)]" };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-sm font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:      { label: "Bezahlt",    cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900" },
    sent:      { label: "Versendet",  cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-900" },
    overdue:   { label: "Überfällig", cls: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-900" },
    draft:     { label: "Entwurf",    cls: "text-[var(--text-subtle)] bg-[var(--surface)] border-[var(--border-soft)]" },
    cancelled: { label: "Storniert",  cls: "text-[var(--text-subtle)] bg-[var(--surface)] border-[var(--border-soft)]" },
  };
  const s = map[status ?? ""] ?? { label: status ?? "–", cls: "text-[var(--text-subtle)] bg-[var(--surface)] border-[var(--border-soft)]" };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function PortalTourDetailPage() {
  const { tourId: id } = useParams<{ tourId: string }>();
  const navigate = useNavigate();
  const { portalPath } = usePortalNav();

  const [data, setData] = useState<PortalTourDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit-State
  const [editMode, setEditMode] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editName, setEditName] = useState("");
  const [editSweep, setEditSweep] = useState("");

  // Visibility
  const [visibility, setVisibility] = useState("");
  const [visibilityPassword, setVisibilityPassword] = useState("");

  // Modals
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [extendMethod, setExtendMethod] = useState<"payrexx" | "qr_invoice">("payrexx");

  // URL copy
  const [urlCopied, setUrlCopied] = useState(false);

  const tourId = Number(id);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getPortalTourDetail(tourId);
      setData(res);
      setVisibility(res.mpVisibility ?? "PRIVATE");
      setEditLabel(res.tour.canonical_object_label ?? res.tour.object_label ?? res.tour.bezeichnung ?? "");
      setEditContact(res.tour.customer_contact ?? "");
      setEditName(res.tour.customer_name ?? "");
      setEditSweep(res.tour.matterport_start_sweep ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    if (id) void loadData();
  }, [id, loadData]);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      await editPortalTour(tourId, {
        object_label: editLabel,
        customer_contact: editContact,
        customer_name: editName,
        start_sweep: editSweep,
      });
      flashSuccess("Tour erfolgreich aktualisiert.");
      setEditMode(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const handleVisibilitySave = async () => {
    setSaving(true);
    try {
      await changePortalTourVisibility(tourId, visibility, visibility === "PASSWORD" ? visibilityPassword : undefined);
      flashSuccess("Sichtbarkeit aktualisiert.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sichtbarkeit konnte nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  };

  const handleExtend = async () => {
    setSaving(true);
    try {
      const res = await extendPortalTour(tourId, extendMethod);
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      flashSuccess("Verlängerung erfolgreich beantragt. Sie erhalten eine QR-Rechnung.");
      setShowExtendModal(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verlängerung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setSaving(true);
    try {
      await archivePortalTour(tourId);
      flashSuccess("Tour wurde archiviert.");
      setShowArchiveModal(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archivierung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignee = async (email: string) => {
    setSaving(true);
    try {
      await setPortalTourAssignee(tourId, email);
      flashSuccess("Zuständigkeit aktualisiert.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zuständigkeit konnte nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  };

  const handlePay = async (invoiceId: number) => {
    setSaving(true);
    try {
      const res = await payPortalInvoice(tourId, invoiceId);
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zahlung konnte nicht gestartet werden.");
    } finally {
      setSaving(false);
    }
  };

  const copyTourUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const tour = data?.tour;
  const invoices = data?.invoices ?? [];
  const pricing = data?.pricing;
  const assigneeBundle = data?.assigneeBundle;
  const paymentSummary = data?.paymentSummary;
  const paymentTimeline = data?.paymentTimeline ?? [];
  const displayedTourStatus = data?.displayedTourStatus;
  const canManage = assigneeBundle?.canManageByTourId?.[String(tourId)] ?? false;
  const currentAssignee = assigneeBundle?.assigneeByTourId?.[String(tourId)] ?? "";
  const candidates = Object.values(assigneeBundle?.candidatesByWorkspace ?? {}).flat();
  const endDate = tour?.canonical_term_end_date ?? tour?.term_end_date ?? tour?.ablaufdatum;
  const remaining = daysRemaining(endDate);
  const maxDays = 365;
  const progressPct = Math.min(100, Math.max(0, (remaining / maxDays) * 100));
  const spaceId = tour?.canonical_matterport_space_id ?? tour?.matterport_model_id;
  const tourShowUrl = spaceId ? `https://my.matterport.com/show/?m=${encodeURIComponent(spaceId)}` : null;
  const isArchived = tour?.archiv || tour?.status === "ARCHIVED";
  const lastRenewalAt = latestRenewalDate(invoices);

  const tourTitle =
    tour?.canonical_object_label || tour?.object_label || tour?.bezeichnung || `Tour #${tourId}`;

  if (!loading && error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => navigate(portalPath("tours"))}
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Meine Touren
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button type="button" onClick={() => void loadData()} className="text-sm underline font-medium">
            Erneut laden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(portalPath("tours"))}
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Meine Touren
          </button>
          {loading && !data ? (
            <div className="skeleton-line h-8 w-64 max-w-full" />
          ) : data ? (
            <>
              <h1 className="text-2xl font-bold text-[var(--text-main)]">{tourTitle}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {displayedTourStatus ? (
                  <StatusBadge code={displayedTourStatus.code} />
                ) : null}
                {displayedTourStatus?.note ? (
                  <span className="text-sm text-[var(--text-subtle)]">{displayedTourStatus.note}</span>
                ) : null}
                <span className="text-sm text-[var(--text-subtle)]">#{tourId}</span>
              </div>
            </>
          ) : (
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Tour #{tourId}</h1>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-sm underline font-medium">
            Schliessen
          </button>
        </div>
      ) : null}

      {/* Success Banner */}
      {success ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="text-sm flex-1">{success}</span>
          <button type="button" onClick={() => setSuccess(null)} className="text-sm underline font-medium">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Loading Spinner */}
      {loading && !data ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : null}

      {data && tour ? (
        <>
          {/* Aktionsprotokoll */}
          <TourActionLog rows={data.actions_log} />

          {/* Stammdaten & Matterport */}
          <section className="surface-card-strong p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Stammdaten &amp; Matterport</h2>
              {!editMode && (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="text-sm font-medium text-[var(--accent)] hover:underline shrink-0"
                >
                  Bearbeiten
                </button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Tour-URL */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-subtle)]">Tour-URL (Matterport)</label>
                <input
                  value={tourShowUrl ?? ""}
                  readOnly
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                  placeholder="–"
                  spellCheck={false}
                />
                {tourShowUrl ? (
                  <button
                    type="button"
                    onClick={() => void copyTourUrl(tourShowUrl)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)]"
                  >
                    {urlCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {urlCopied ? "Kopiert" : "URL kopieren"}
                  </button>
                ) : null}
              </div>

              {/* Objektbezeichnung */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-subtle)]">Objektbezeichnung</label>
                {editMode ? (
                  <input
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="z.B. Musterhausweg 12, Zürich"
                  />
                ) : (
                  <p className="text-sm text-[var(--text-main)] py-2">
                    {tour.canonical_object_label || tour.object_label || tour.bezeichnung || "–"}
                  </p>
                )}
              </div>

              {/* Firma / Kundenname */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-subtle)]">Firma / Kundenname</label>
                {editMode ? (
                  <input
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-main)] py-2">{tour.customer_name || "–"}</p>
                )}
              </div>

              {/* Kontaktperson */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-subtle)]">Kontaktperson</label>
                {editMode ? (
                  <input
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-main)] py-2">{tour.customer_contact || "–"}</p>
                )}
              </div>

              {/* Start-Sweep */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-subtle)]">Start-Sweep-ID</label>
                {editMode ? (
                  <input
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text-main)]"
                    value={editSweep}
                    onChange={(e) => setEditSweep(e.target.value)}
                    placeholder="Matterport Sweep ID"
                    spellCheck={false}
                  />
                ) : (
                  <p className="text-sm font-mono text-[var(--text-main)] py-2">
                    {tour.matterport_start_sweep || "–"}
                  </p>
                )}
              </div>
            </div>

            {editMode ? (
              <div className="flex gap-2 flex-wrap pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleEditSave()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Speichern…" : "Speichern"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditMode(false);
                    setEditLabel(tour.canonical_object_label ?? tour.object_label ?? tour.bezeichnung ?? "");
                    setEditContact(tour.customer_contact ?? "");
                    setEditName(tour.customer_name ?? "");
                    setEditSweep(tour.matterport_start_sweep ?? "");
                  }}
                  className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
                >
                  Abbrechen
                </button>
              </div>
            ) : null}

            {/* Sichtbarkeit */}
            <div className="border-t border-[var(--border-soft)] pt-4 space-y-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">Sichtbarkeit</h3>
              <div className="flex flex-col gap-2">
                {(["PRIVATE", "LINK_ONLY", "PUBLIC", "PASSWORD"] as const).map((v) => {
                  const labels: Record<string, string> = {
                    PRIVATE:   "Privat – nur eingeloggte Nutzer",
                    LINK_ONLY: "Nur mit Link zugänglich",
                    PUBLIC:    "Öffentlich sichtbar",
                    PASSWORD:  "Passwortgeschützt",
                  };
                  return (
                    <label
                      key={v}
                      className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={v}
                        checked={visibility === v}
                        onChange={() => setVisibility(v)}
                        className="accent-[var(--accent)] w-4 h-4 cursor-pointer"
                      />
                      {labels[v]}
                    </label>
                  );
                })}
              </div>
              {visibility === "PASSWORD" && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-[var(--text-subtle)]">Passwort</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                    value={visibilityPassword}
                    onChange={(e) => setVisibilityPassword(e.target.value)}
                    placeholder="Passwort für den Zugriff"
                  />
                </div>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleVisibilitySave()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Speichern…" : "Sichtbarkeit speichern"}
              </button>
            </div>

            {/* 3D-Vorschau */}
            {spaceId ? (
              <div className="border-t border-[var(--border-soft)] pt-4 space-y-3">
                <h3 className="text-base font-semibold text-[var(--text-main)]">3D-Vorschau</h3>
                <div className="relative w-full rounded-xl overflow-hidden bg-[var(--surface)]" style={{ paddingBottom: "56.25%" }}>
                  <iframe
                    src={`https://my.matterport.com/show?m=${spaceId}`}
                    title="Matterport Tour"
                    className="absolute inset-0 w-full h-full border-0"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : tour.tour_url ? (
              <div className="border-t border-[var(--border-soft)] pt-4">
                <a
                  href={tour.tour_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--accent)] hover:underline font-medium"
                >
                  Tour öffnen ↗
                </a>
              </div>
            ) : null}
          </section>

          {/* Rechnungen & Zahlungen */}
          <section className="surface-card-strong p-5 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Rechnungen &amp; Zahlungen</h2>

            {/* Stat-Grid */}
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--border-soft)] p-3">
                <div className="text-[var(--text-subtle)] text-xs">Tour erstellt am</div>
                <div className="mt-1 font-semibold text-[var(--text-main)]">
                  {formatDate(tour.matterport_created_at ?? tour.created_at)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-soft)] p-3">
                <div className="text-[var(--text-subtle)] text-xs">Tour läuft am ab</div>
                <div className="mt-1 font-semibold text-[var(--text-main)]">{formatDate(endDate)}</div>
              </div>
              <div className="rounded-lg border border-[var(--border-soft)] p-3">
                <div className="text-[var(--text-subtle)] text-xs">Letzte Verlängerung</div>
                <div className="mt-1 font-semibold text-[var(--text-main)]">{formatDate(lastRenewalAt)}</div>
              </div>
              <div className="rounded-lg border border-[var(--border-soft)] p-3">
                <div className="text-[var(--text-subtle)] text-xs">Restzeit</div>
                <div className="mt-1 font-semibold text-[var(--text-main)]">
                  {formatRestzeit(remaining, endDate)}
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            {paymentSummary ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border border-[var(--border-soft)] p-3">
                  <div className="text-[var(--text-subtle)] text-xs">Bezahlt</div>
                  <div className="font-semibold text-[var(--text-main)]">{paymentSummary.paidCount}</div>
                  <div className="text-xs text-[var(--text-subtle)]">{formatMoney(paymentSummary.paidAmount)}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-soft)] p-3">
                  <div className="text-[var(--text-subtle)] text-xs">Offen</div>
                  <div className="font-semibold text-[var(--text-main)]">{paymentSummary.openCount}</div>
                  <div className="text-xs text-[var(--text-subtle)]">{formatMoney(paymentSummary.openAmount)}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-soft)] p-3 sm:col-span-2">
                  <div className="text-[var(--text-subtle)] text-xs">Letzte Zahlung</div>
                  {paymentSummary.lastPayment ? (
                    <div className="text-sm text-[var(--text-main)] mt-1">
                      {paymentSummary.lastPayment.label}{" "}
                      <span className="text-[var(--text-subtle)]">
                        {formatDate(paymentSummary.lastPayment.at)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--text-subtle)]">–</div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Payment Timeline */}
            {paymentTimeline.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-[var(--text-main)] mb-2">Zeitleiste</h3>
                <ul className="space-y-2 text-sm">
                  {paymentTimeline.slice(0, 8).map((row, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap justify-between gap-2 border-b border-[var(--border-soft)]/50 pb-2"
                    >
                      <span className="text-[var(--text-main)]">{row.title}</span>
                      <span className="text-[var(--text-subtle)]">{row.statusLabel}</span>
                      <span className="text-[var(--text-subtle)]">{formatDate(row.primaryDate)}</span>
                      <span>{formatMoney(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Rechnungstabelle */}
            <div>
              <h3 className="text-sm font-medium text-[var(--text-main)] mb-2">Verlängerungsrechnungen</h3>
              {invoices.length === 0 ? (
                <p className="text-sm text-[var(--text-subtle)]">Keine Rechnungen vorhanden.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                        <th className="py-2 pr-2">Nr.</th>
                        <th className="py-2 pr-2">Datum</th>
                        <th className="py-2 pr-2">Betrag</th>
                        <th className="py-2 pr-2">Fällig</th>
                        <th className="py-2 pr-2">Status</th>
                        <th className="py-2">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-[var(--border-soft)]/40">
                          <td className="py-2 pr-2">
                            {inv.invoice_number ?? inv.exxas_document_id ?? `#${inv.id}`}
                          </td>
                          <td className="py-2 pr-2">{formatDate(inv.invoice_date ?? inv.created_at)}</td>
                          <td className="py-2 pr-2">{formatMoney(inv.amount_chf ?? inv.betrag)}</td>
                          <td className="py-2 pr-2">{formatDate(inv.due_at)}</td>
                          <td className="py-2 pr-2">
                            <InvoiceStatusBadge status={inv.invoice_status} />
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a
                                href={portalPath(`tours/${tourId}/invoices/${inv.id}/print`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[var(--accent)] hover:underline font-medium"
                              >
                                Drucken
                              </a>
                              <a
                                href={`/tour-manager/portal/tours/${tourId}/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[var(--accent)] hover:underline font-medium"
                              >
                                PDF
                              </a>
                              {inv.invoice_status !== "paid" && inv.invoice_status !== "cancelled" ? (
                                <button
                                  type="button"
                                  onClick={() => void handlePay(inv.id)}
                                  disabled={saving}
                                  className="rounded-lg bg-[var(--accent)] px-2.5 py-0.5 text-xs font-medium text-white disabled:opacity-50"
                                >
                                  Bezahlen
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Abo-Status & Aktionen */}
          <section className="surface-card-strong p-5 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Abo-Status &amp; Aktionen</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Abo-Info */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[var(--text-subtle)]">Gültig bis</span>
                  <span className="font-medium text-[var(--text-main)]">{formatDate(endDate)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[var(--text-subtle)]">Verbleibend</span>
                  <span className="font-medium text-[var(--text-main)]">{remaining} Tage</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--border-soft)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${progressPct}%`,
                      background: remaining <= 30 ? "#b42318" : remaining <= 90 ? "#b68e20" : "#027a48",
                    }}
                  />
                </div>
                {pricing ? (
                  <div className="flex justify-between items-center pt-1 border-t border-[var(--border-soft)] text-sm">
                    <span className="text-[var(--text-subtle)]">{pricing.label}</span>
                    <span className="font-bold text-[var(--accent)]">
                      {formatMoney(pricing.isExtension ? pricing.extensionPriceCHF : pricing.reactivationPriceCHF)}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Zuständigkeit */}
              {canManage && candidates.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--text-subtle)]">Zuständig</label>
                  <select
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]"
                    value={currentAssignee}
                    onChange={(e) => void handleAssignee(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">– Nicht zugewiesen –</option>
                    {candidates.map((c) => (
                      <option key={c.email} value={c.email}>
                        {c.name || c.email}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            {/* Aktionen */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border-soft)]">
              {!isArchived && pricing ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowExtendModal(true)}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pricing.isReactivation ? "Reaktivieren" : "Verlängern"}
                </button>
              ) : null}
              {!isArchived ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowArchiveModal(true)}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                >
                  Archivieren
                </button>
              ) : null}
              {tour.tour_url ? (
                <a
                  href={tour.tour_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-raised)] transition-colors"
                >
                  Tour öffnen ↗
                </a>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {/* Verlängerungs-Modal */}
      {showExtendModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setShowExtendModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">
                {pricing?.isReactivation ? "Tour reaktivieren" : "Tour verlängern"}
              </h3>
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                aria-label="Schliessen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-subtle)]">
              Wählen Sie die gewünschte Zahlungsart.
              {pricing ? (
                <>
                  {" "}Kosten:{" "}
                  <strong className="text-[var(--text-main)]">
                    {formatMoney(pricing.isExtension ? pricing.extensionPriceCHF : pricing.reactivationPriceCHF)}
                  </strong>
                </>
              ) : null}
            </p>
            <div className="flex flex-col gap-2">
              {data?.payrexxConfigured ? (
                <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                  <input
                    type="radio"
                    name="extendMethod"
                    value="payrexx"
                    checked={extendMethod === "payrexx"}
                    onChange={() => setExtendMethod("payrexx")}
                    className="accent-[var(--accent)] w-4 h-4"
                  />
                  Online bezahlen (Payrexx)
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                <input
                  type="radio"
                  name="extendMethod"
                  value="qr_invoice"
                  checked={extendMethod === "qr_invoice"}
                  onChange={() => setExtendMethod("qr_invoice")}
                  className="accent-[var(--accent)] w-4 h-4"
                />
                QR-Rechnung per E-Mail
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                disabled={saving}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleExtend()}
                disabled={saving}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Wird verarbeitet…" : "Bestätigen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Archivierungs-Modal */}
      {showArchiveModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setShowArchiveModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">Tour archivieren?</h3>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                aria-label="Schliessen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-subtle)]">
              Sind Sie sicher? Die Tour wird deaktiviert und ist nicht mehr öffentlich zugänglich.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                disabled={saving}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={saving}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                {saving ? "Wird archiviert…" : "Ja, archivieren"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
