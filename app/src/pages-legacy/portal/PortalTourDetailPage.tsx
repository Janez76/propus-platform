import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysRemaining(endDate?: string | null): number {
  if (!endDate) return 0;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function TourStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    ACTIVE: { label: "Aktiv", bg: "#ecfdf3", color: "#027a48" },
    ARCHIVED: { label: "Archiviert", bg: "#f3f2ef", color: "#706b63" },
    PENDING: { label: "Ausstehend", bg: "#fffaeb", color: "#b68e20" },
    AWAITING_DECISION: { label: "Entscheidung ausstehend", bg: "#f0e6ff", color: "#6b21a8" },
    CUSTOMER_ACCEPTED_AWAITING_PAYMENT: { label: "Zahlung ausstehend", bg: "#fffaeb", color: "#b68e20" },
  };
  const s = map[status] ?? { label: status.replace(/_/g, " "), bg: "#f3f2ef", color: "#706b63" };
  return (
    <span
      className="ptd-badge"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PAID: { label: "Bezahlt", bg: "#ecfdf3", color: "#027a48" },
    OPEN: { label: "Offen", bg: "#fffaeb", color: "#b68e20" },
    SENT: { label: "Versendet", bg: "#eff8ff", color: "#175cd3" },
    OVERDUE: { label: "Überfällig", bg: "#fef3f2", color: "#b42318" },
    CANCELLED: { label: "Storniert", bg: "#f3f2ef", color: "#706b63" },
    DRAFT: { label: "Entwurf", bg: "#f3f2ef", color: "#706b63" },
  };
  const s = map[status ?? ""] ?? { label: status ?? "–", bg: "#f3f2ef", color: "#706b63" };
  return (
    <span
      className="ptd-badge"
      style={{ background: s.bg, color: s.color }}
    >
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
  const [editMode, setEditMode] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editName, setEditName] = useState("");
  const [editSweep, setEditSweep] = useState("");
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [extendMethod, setExtendMethod] = useState<"payrexx" | "qr_invoice">("payrexx");
  const [visibility, setVisibility] = useState("");
  const [visibilityPassword, setVisibilityPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

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
    if (id) loadData();
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

  const tour = data?.tour;
  const invoices = data?.invoices ?? [];
  const pricing = data?.pricing;
  const assigneeBundle = data?.assigneeBundle;
  const canManage = assigneeBundle?.canManageByTourId?.[String(tourId)] ?? false;
  const currentAssignee = assigneeBundle?.assigneeByTourId?.[String(tourId)] ?? "";
  const candidates = Object.values(assigneeBundle?.candidatesByWorkspace ?? {}).flat();
  const endDate = tour?.canonical_term_end_date ?? tour?.term_end_date ?? tour?.ablaufdatum;
  const remaining = daysRemaining(endDate);
  const maxDays = 365;
  const progressPct = Math.min(100, Math.max(0, (remaining / maxDays) * 100));
  const spaceId = tour?.canonical_matterport_space_id ?? tour?.matterport_model_id;
  const isArchived = tour?.archiv || tour?.status === "ARCHIVED";

  if (loading) {
    return (
      <div className="ptd-page">
        <style>{ptdStyles}</style>
        <div className="ptd-loading">
          <div className="ptd-spinner" />
          <p>Tour wird geladen…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="ptd-page">
        <style>{ptdStyles}</style>
        <div className="ptd-error-full">
          <p>{error}</p>
          <button className="ptd-btn ptd-btn-secondary" onClick={() => navigate(portalPath("tours"))}>
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  if (!tour) return null;

  return (
    <div className="ptd-page">
      <style>{ptdStyles}</style>

      {/* Breadcrumb */}
      <div className="ptd-breadcrumb">
        <button className="ptd-breadcrumb-link" onClick={() => navigate(portalPath("tours"))}>
          ← Meine Touren
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="ptd-alert ptd-alert-error">{error}</div>}
      {success && <div className="ptd-alert ptd-alert-success">{success}</div>}

      {/* Hero Header */}
      <div className="ptd-hero">
        <div className="ptd-hero-text">
          <h1 className="ptd-hero-title">
            {tour.canonical_object_label || tour.object_label || tour.bezeichnung || `Tour #${tourId}`}
          </h1>
          <div className="ptd-hero-meta">
            <TourStatusBadge status={tour.status} />
            {spaceId && <span className="ptd-hero-id">Matterport: {spaceId}</span>}
          </div>
        </div>
      </div>

      <div className="ptd-grid">
        {/* Main Column */}
        <div className="ptd-main">

          {/* Matterport Preview */}
          <div className="ptd-card">
            <h2 className="ptd-card-title">3D-Vorschau</h2>
            {spaceId ? (
              <div className="ptd-iframe-wrap">
                <iframe
                  src={`https://my.matterport.com/show?m=${spaceId}`}
                  title="Matterport Tour"
                  className="ptd-iframe"
                  allowFullScreen
                />
              </div>
            ) : tour.tour_url ? (
              <a href={tour.tour_url} target="_blank" rel="noopener noreferrer" className="ptd-link">
                Tour öffnen ↗
              </a>
            ) : (
              <p className="ptd-muted">Keine Vorschau verfügbar.</p>
            )}
          </div>

          {/* Edit Form */}
          <div className="ptd-card">
            <div className="ptd-card-header">
              <h2 className="ptd-card-title">Tour-Details</h2>
              {!editMode && (
                <button className="ptd-btn ptd-btn-secondary ptd-btn-sm" onClick={() => setEditMode(true)}>
                  Bearbeiten
                </button>
              )}
            </div>
            {editMode ? (
              <div className="ptd-form">
                <div className="ptd-form-group">
                  <label className="ptd-label">Tour-Titel</label>
                  <input
                    className="ptd-input"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="z.B. Musterhausweg 12, Zürich"
                  />
                </div>
                <div className="ptd-form-group">
                  <label className="ptd-label">Firma / Kundenname</label>
                  <input
                    className="ptd-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="ptd-form-group">
                  <label className="ptd-label">Kontaktperson</label>
                  <input
                    className="ptd-input"
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                  />
                </div>
                <div className="ptd-form-group">
                  <label className="ptd-label">Start-Sweep-ID</label>
                  <input
                    className="ptd-input"
                    value={editSweep}
                    onChange={(e) => setEditSweep(e.target.value)}
                    placeholder="Matterport Sweep ID"
                  />
                </div>
                <div className="ptd-form-actions">
                  <button className="ptd-btn ptd-btn-primary" onClick={handleEditSave} disabled={saving}>
                    {saving ? "Speichern…" : "Speichern"}
                  </button>
                  <button
                    className="ptd-btn ptd-btn-secondary"
                    onClick={() => {
                      setEditMode(false);
                      setEditLabel(tour.canonical_object_label ?? tour.object_label ?? tour.bezeichnung ?? "");
                      setEditContact(tour.customer_contact ?? "");
                      setEditName(tour.customer_name ?? "");
                      setEditSweep(tour.matterport_start_sweep ?? "");
                    }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="ptd-detail-grid">
                <div className="ptd-detail-item">
                  <span className="ptd-detail-label">Tour-Titel</span>
                  <span className="ptd-detail-value">
                    {tour.canonical_object_label || tour.object_label || tour.bezeichnung || "–"}
                  </span>
                </div>
                <div className="ptd-detail-item">
                  <span className="ptd-detail-label">Firma / Kundenname</span>
                  <span className="ptd-detail-value">{tour.customer_name || "–"}</span>
                </div>
                <div className="ptd-detail-item">
                  <span className="ptd-detail-label">Kontaktperson</span>
                  <span className="ptd-detail-value">{tour.customer_contact || "–"}</span>
                </div>
                <div className="ptd-detail-item">
                  <span className="ptd-detail-label">Start-Sweep-ID</span>
                  <span className="ptd-detail-value">{tour.matterport_start_sweep || "–"}</span>
                </div>
                <div className="ptd-detail-item">
                  <span className="ptd-detail-label">Erstellt am</span>
                  <span className="ptd-detail-value">{formatDate(tour.matterport_created_at ?? tour.created_at)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Privacy / Visibility */}
          <div className="ptd-card">
            <h2 className="ptd-card-title">Sichtbarkeit</h2>
            <div className="ptd-radio-group">
              {(["PRIVATE", "LINK_ONLY", "PUBLIC", "PASSWORD"] as const).map((v) => {
                const labels: Record<string, string> = {
                  PRIVATE: "Privat – nur eingeloggte Nutzer",
                  LINK_ONLY: "Nur mit Link zugänglich",
                  PUBLIC: "Öffentlich sichtbar",
                  PASSWORD: "Passwortgeschützt",
                };
                return (
                  <label className="ptd-radio-label" key={v}>
                    <input
                      type="radio"
                      name="visibility"
                      value={v}
                      checked={visibility === v}
                      onChange={() => setVisibility(v)}
                      className="ptd-radio"
                    />
                    <span>{labels[v]}</span>
                  </label>
                );
              })}
            </div>
            {visibility === "PASSWORD" && (
              <div className="ptd-form-group" style={{ marginTop: 12 }}>
                <label className="ptd-label">Passwort</label>
                <input
                  type="text"
                  className="ptd-input"
                  value={visibilityPassword}
                  onChange={(e) => setVisibilityPassword(e.target.value)}
                  placeholder="Passwort für den Zugriff"
                />
              </div>
            )}
            <div className="ptd-form-actions" style={{ marginTop: 16 }}>
              <button className="ptd-btn ptd-btn-primary" onClick={handleVisibilitySave} disabled={saving}>
                {saving ? "Speichern…" : "Sichtbarkeit speichern"}
              </button>
            </div>
          </div>

          {/* Invoices */}
          <div className="ptd-card">
            <h2 className="ptd-card-title">Rechnungen</h2>
            {invoices.length === 0 ? (
              <p className="ptd-muted">Keine Rechnungen vorhanden.</p>
            ) : (
              <div className="ptd-table-wrap">
                <table className="ptd-table">
                  <thead>
                    <tr>
                      <th>Nr. / ID</th>
                      <th>Datum</th>
                      <th>Betrag</th>
                      <th>Status</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.invoice_number ?? inv.exxas_document_id ?? `#${inv.id}`}</td>
                        <td>{formatDate(inv.invoice_date ?? inv.created_at)}</td>
                        <td>{((inv.amount_chf ?? inv.betrag) != null) ? `CHF ${(inv.amount_chf ?? inv.betrag)!.toFixed(2)}` : "–"}</td>
                        <td><InvoiceStatusBadge status={inv.invoice_status} /></td>
                        <td>
                          <div className="ptd-table-actions">
                            <a
                              href={portalPath(`tours/${tourId}/invoices/${inv.id}/print`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ptd-table-link"
                            >
                              Drucken
                            </a>
                            <a
                              href={`/tour-manager/portal/tours/${tourId}/invoices/${inv.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ptd-table-link"
                            >
                              PDF
                            </a>
                            {inv.invoice_status !== "PAID" && inv.invoice_status !== "CANCELLED" && (
                              <button
                                className="ptd-btn ptd-btn-primary ptd-btn-sm"
                                onClick={() => handlePay(inv.id)}
                                disabled={saving}
                              >
                                Bezahlen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="ptd-sidebar">

          {/* Subscription */}
          <div className="ptd-card">
            <h3 className="ptd-card-title">Abo-Status</h3>
            <div className="ptd-sub-info">
              <div className="ptd-sub-row">
                <span className="ptd-detail-label">Gültig bis</span>
                <span className="ptd-detail-value">{formatDate(endDate)}</span>
              </div>
              <div className="ptd-sub-row">
                <span className="ptd-detail-label">Verbleibend</span>
                <span className="ptd-detail-value">{remaining} Tage</span>
              </div>
              <div className="ptd-progress-bar">
                <div
                  className="ptd-progress-fill"
                  style={{
                    width: `${progressPct}%`,
                    background: remaining <= 30 ? "#b42318" : remaining <= 90 ? "#b68e20" : "#027a48",
                  }}
                />
              </div>
            </div>
            {pricing && (
              <div className="ptd-pricing-info">
                <span className="ptd-detail-label">{pricing.label}</span>
                <span className="ptd-pricing-amount">
                  CHF {(pricing.isExtension ? pricing.extensionPriceCHF : pricing.reactivationPriceCHF).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Assignee */}
          {canManage && candidates.length > 0 && (
            <div className="ptd-card">
              <h3 className="ptd-card-title">Zuständig</h3>
              <select
                className="ptd-input"
                value={currentAssignee}
                onChange={(e) => handleAssignee(e.target.value)}
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
          )}

          {/* Actions */}
          <div className="ptd-card">
            <h3 className="ptd-card-title">Aktionen</h3>
            <div className="ptd-action-stack">
              {!isArchived && pricing && (
                <button
                  className="ptd-btn ptd-btn-primary ptd-btn-full"
                  onClick={() => setShowExtendModal(true)}
                >
                  {pricing.isReactivation ? "Reaktivieren" : "Verlängern"}
                </button>
              )}
              {!isArchived && (
                <button
                  className="ptd-btn ptd-btn-danger ptd-btn-full"
                  onClick={() => setShowArchiveModal(true)}
                >
                  Archivieren
                </button>
              )}
              {tour.tour_url && (
                <a
                  href={tour.tour_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ptd-btn ptd-btn-secondary ptd-btn-full"
                  style={{ textAlign: "center" }}
                >
                  Tour öffnen ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Extend Modal */}
      {showExtendModal && (
        <div className="ptd-modal-overlay" onClick={() => !saving && setShowExtendModal(false)}>
          <div className="ptd-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="ptd-modal-title">
              {pricing?.isReactivation ? "Tour reaktivieren" : "Tour verlängern"}
            </h2>
            <p className="ptd-modal-desc">
              Wählen Sie die gewünschte Zahlungsart.
              {pricing && (
                <> Kosten: <strong>CHF {(pricing.isExtension ? pricing.extensionPriceCHF : pricing.reactivationPriceCHF).toFixed(2)}</strong></>
              )}
            </p>
            <div className="ptd-radio-group">
              {data?.payrexxConfigured && (
                <label className="ptd-radio-label">
                  <input
                    type="radio"
                    name="extendMethod"
                    value="payrexx"
                    checked={extendMethod === "payrexx"}
                    onChange={() => setExtendMethod("payrexx")}
                    className="ptd-radio"
                  />
                  <span>Online bezahlen (Payrexx)</span>
                </label>
              )}
              <label className="ptd-radio-label">
                <input
                  type="radio"
                  name="extendMethod"
                  value="qr_invoice"
                  checked={extendMethod === "qr_invoice"}
                  onChange={() => setExtendMethod("qr_invoice")}
                  className="ptd-radio"
                />
                <span>QR-Rechnung per E-Mail</span>
              </label>
            </div>
            <div className="ptd-modal-actions">
              <button className="ptd-btn ptd-btn-primary" onClick={handleExtend} disabled={saving}>
                {saving ? "Wird verarbeitet…" : "Bestätigen"}
              </button>
              <button className="ptd-btn ptd-btn-secondary" onClick={() => setShowExtendModal(false)} disabled={saving}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {showArchiveModal && (
        <div className="ptd-modal-overlay" onClick={() => !saving && setShowArchiveModal(false)}>
          <div className="ptd-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="ptd-modal-title">Tour archivieren</h2>
            <p className="ptd-modal-desc">
              Sind Sie sicher, dass Sie diese Tour archivieren möchten? Die Tour wird deaktiviert und ist nicht mehr öffentlich zugänglich.
            </p>
            <div className="ptd-modal-actions">
              <button className="ptd-btn ptd-btn-danger" onClick={handleArchive} disabled={saving}>
                {saving ? "Wird archiviert…" : "Ja, archivieren"}
              </button>
              <button className="ptd-btn ptd-btn-secondary" onClick={() => setShowArchiveModal(false)} disabled={saving}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ptdStyles = `
  .ptd-page {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 24px 64px;
    color: #111;
  }
  .ptd-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 40vh;
    gap: 16px;
    color: #706b63;
  }
  .ptd-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid #e8e6e2;
    border-top-color: #B68E20;
    border-radius: 50%;
    animation: ptd-spin 0.7s linear infinite;
  }
  @keyframes ptd-spin {
    to { transform: rotate(360deg); }
  }
  .ptd-error-full {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 40vh;
    gap: 16px;
    color: #b42318;
    text-align: center;
  }
  .ptd-breadcrumb {
    margin-bottom: 20px;
  }
  .ptd-breadcrumb-link {
    background: none;
    border: none;
    color: #B68E20;
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
  }
  .ptd-breadcrumb-link:hover {
    color: #9a7619;
    text-decoration: underline;
  }
  .ptd-alert {
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 0.875rem;
    margin-bottom: 16px;
  }
  .ptd-alert-error {
    background: #fef3f2;
    border: 1px solid #fee4e2;
    color: #b42318;
  }
  .ptd-alert-success {
    background: #ecfdf3;
    border: 1px solid #abefc6;
    color: #027a48;
  }
  .ptd-hero {
    margin-bottom: 24px;
  }
  .ptd-hero-title {
    font-size: 1.6rem;
    font-weight: 700;
    color: #111;
    margin: 0 0 8px;
    letter-spacing: -0.01em;
  }
  .ptd-hero-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .ptd-hero-id {
    font-size: 0.82rem;
    color: #706b63;
    background: #f3f2ef;
    padding: 3px 10px;
    border-radius: 6px;
    font-family: ui-monospace, 'SF Mono', monospace;
  }
  .ptd-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .ptd-grid {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 24px;
    align-items: start;
  }
  @media (max-width: 960px) {
    .ptd-grid {
      grid-template-columns: 1fr;
    }
  }
  .ptd-main {
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 0;
  }
  .ptd-sidebar {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .ptd-card {
    background: #fff;
    border: 1px solid #e8e6e2;
    border-radius: 12px;
    padding: 24px;
  }
  .ptd-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .ptd-card-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: #3b3833;
    margin: 0 0 16px;
  }
  .ptd-card-header .ptd-card-title {
    margin-bottom: 0;
  }
  .ptd-iframe-wrap {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
    border-radius: 8px;
    overflow: hidden;
    background: #f3f2ef;
  }
  .ptd-iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
  }
  .ptd-link {
    color: #B68E20;
    font-weight: 500;
    text-decoration: none;
  }
  .ptd-link:hover {
    text-decoration: underline;
  }
  .ptd-muted {
    color: #706b63;
    font-size: 0.9rem;
    margin: 0;
  }
  .ptd-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .ptd-form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ptd-label {
    font-size: 0.84rem;
    font-weight: 500;
    color: #706b63;
  }
  .ptd-input {
    width: 100%;
    padding: 0.6rem 0.85rem;
    background: #fff;
    border: 1px solid #e8e6e2;
    border-radius: 8px;
    color: #111;
    font-size: 0.92rem;
    font-family: inherit;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .ptd-input:focus {
    outline: none;
    border-color: #B68E20;
    box-shadow: 0 0 0 3px rgba(182, 142, 32, 0.15);
  }
  .ptd-form-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ptd-detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 600px) {
    .ptd-detail-grid {
      grid-template-columns: 1fr;
    }
  }
  .ptd-detail-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ptd-detail-label {
    font-size: 0.8rem;
    color: #706b63;
    font-weight: 500;
  }
  .ptd-detail-value {
    font-size: 0.94rem;
    color: #111;
  }
  .ptd-radio-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ptd-radio-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    color: #3b3833;
    cursor: pointer;
  }
  .ptd-radio {
    accent-color: #B68E20;
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
  .ptd-table-wrap {
    overflow-x: auto;
    margin: 0 -24px;
    padding: 0 24px;
  }
  .ptd-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }
  .ptd-table th {
    text-align: left;
    font-weight: 500;
    color: #706b63;
    padding: 10px 12px;
    border-bottom: 1px solid #e8e6e2;
    white-space: nowrap;
  }
  .ptd-table td {
    padding: 12px;
    border-bottom: 1px solid #f3f2ef;
    color: #111;
    vertical-align: middle;
  }
  .ptd-table tr:last-child td {
    border-bottom: none;
  }
  .ptd-table-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ptd-table-link {
    color: #B68E20;
    font-size: 0.82rem;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }
  .ptd-table-link:hover {
    text-decoration: underline;
  }
  .ptd-sub-info {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ptd-sub-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ptd-progress-bar {
    width: 100%;
    height: 6px;
    background: #e8e6e2;
    border-radius: 3px;
    overflow: hidden;
    margin-top: 4px;
  }
  .ptd-progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .ptd-pricing-info {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e8e6e2;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ptd-pricing-amount {
    font-size: 1.1rem;
    font-weight: 700;
    color: #B68E20;
  }
  .ptd-action-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ptd-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.62rem 1.1rem;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    font-family: inherit;
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s, transform 0.1s;
    white-space: nowrap;
  }
  .ptd-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .ptd-btn:active:not(:disabled) {
    transform: scale(0.97);
  }
  .ptd-btn-primary {
    background: #B68E20;
    color: #fff;
  }
  .ptd-btn-primary:hover:not(:disabled) {
    background: #9a7619;
  }
  .ptd-btn-secondary {
    background: #f3f2ef;
    color: #3b3833;
    border: 1px solid #e8e6e2;
  }
  .ptd-btn-secondary:hover:not(:disabled) {
    background: #e8e6e2;
  }
  .ptd-btn-danger {
    background: #fef3f2;
    color: #b42318;
    border: 1px solid #fee4e2;
  }
  .ptd-btn-danger:hover:not(:disabled) {
    background: #fee4e2;
  }
  .ptd-btn-sm {
    padding: 0.38rem 0.75rem;
    font-size: 0.82rem;
  }
  .ptd-btn-full {
    width: 100%;
  }
  .ptd-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 24px;
    animation: ptd-fade-in 0.15s ease;
  }
  @keyframes ptd-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .ptd-modal {
    background: #fff;
    border-radius: 14px;
    padding: 32px;
    max-width: 460px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
    animation: ptd-slide-up 0.2s ease;
  }
  @keyframes ptd-slide-up {
    from { transform: translateY(12px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .ptd-modal-title {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0 0 8px;
    color: #111;
  }
  .ptd-modal-desc {
    font-size: 0.9rem;
    color: #706b63;
    margin: 0 0 20px;
    line-height: 1.55;
  }
  .ptd-modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 24px;
    flex-wrap: wrap;
  }
`;
