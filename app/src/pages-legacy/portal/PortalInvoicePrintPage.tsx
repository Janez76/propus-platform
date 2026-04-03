import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getInvoicePrintData, type InvoicePrintData } from "../../api/portalTours";
import { usePortalNav } from "../../hooks/usePortalNav";

const PROPUS_GOLD = "#B68E20";
const PROPUS_DARK = "#1C1C1C";

export function PortalInvoicePrintPage() {
  const { tourId, invoiceId } = useParams();
  const navigate = useNavigate();
  const { portalPath } = usePortalNav();
  const [data, setData] = useState<InvoicePrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tid = Number(tourId);
    const iid = Number(invoiceId);
    if (!Number.isFinite(tid) || !Number.isFinite(iid)) {
      setError("Ungültige IDs");
      return;
    }
    getInvoicePrintData(tid, iid)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [tourId, invoiceId]);

  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "1") {
      setTimeout(() => window.print(), 500);
    }
  }, [data]);

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p style={{ color: "#b42318" }}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #e8e6e2", borderTopColor: PROPUS_GOLD, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    paid:      { bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" },
    overdue:   { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
    cancelled: { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" },
    sent:      { bg: "#FFFBEB", color: "#92400E", border: "#FDE68A" },
  };
  const sc = statusColors[data.status] ?? { bg: "#F3F4F6", color: "#6B7280", border: "#E5E7EB" };

  const isFloorplan = data.invoiceKind === "floorplan_order";

  return (
    <>
      <style>{invoicePrintStyles}</style>

      <div className="inv-page">
        <div className="inv-card">

          {/* ── Header: dunkel mit Logo + Badge ── */}
          <div className="inv-topbar">
            <div className="inv-topbar-brand">
              <span className="inv-topbar-name">PROPUS GmbH</span>
              <span className="inv-topbar-sub">{data.creditor.email} · {data.creditor.website}</span>
            </div>
            <span className="inv-topbar-badge">RECHNUNG</span>
          </div>

          {/* ── Rechnungs-Titel + Status ── */}
          <div className="inv-hero">
            <div>
              <h1 className="inv-hero-title">Rechnung</h1>
              <div className="inv-hero-meta">
                <span>{data.invLabel}</span>
                <span className="inv-hero-dot">·</span>
                <span>{data.invoiceDate}</span>
              </div>
            </div>
            <span
              className="inv-status-badge"
              style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}
            >
              {data.statusLabel}
            </span>
          </div>

          {/* ── Parteien ── */}
          <div className="inv-parties">
            <div className="inv-party">
              <span className="inv-party-label">Rechnungsempfänger</span>
              <strong>{data.customerName}</strong>
              {data.customerEmail && <span>{data.customerEmail}</span>}
            </div>
            <div className="inv-party inv-party-right">
              <span className="inv-party-label">Tour / Objekt</span>
              <strong>{data.tourLabel}</strong>
              {data.tourAddress && <span>{data.tourAddress}</span>}
              {data.tourLink && (
                <a href={data.tourLink} target="_blank" rel="noopener noreferrer" className="inv-link">
                  {data.tourLink}
                </a>
              )}
            </div>
          </div>

          {/* ── Positions-Tabelle ── */}
          <table className="inv-table">
            <thead>
              <tr>
                <th className="inv-th-pos">Pos.</th>
                <th>Beschreibung</th>
                <th className="inv-th-amount">Betrag (CHF)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="inv-td-pos">1</td>
                <td>
                  <span className="inv-pos-main">{data.bezeichnung}</span>
                  {data.invoiceKindLabel && (
                    <span className="inv-pos-sub">{data.invoiceKindLabel}</span>
                  )}
                </td>
                <td className="inv-td-amount">
                  {isFloorplan && data.amountNet ? data.amountNet : data.amount}
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── Summen-Block ── */}
          <div className="inv-totals">
            {isFloorplan && data.amountNet && data.amountVat && data.vatPercent !== null ? (
              <>
                <div className="inv-total-row">
                  <span>Zwischensumme</span>
                  <span>CHF {data.amountNet}</span>
                </div>
                <div className="inv-total-row inv-total-vat">
                  <span>MwSt {data.vatPercent}%</span>
                  <span>CHF {data.amountVat}</span>
                </div>
                <div className="inv-total-row inv-total-final">
                  <span>Total</span>
                  <span>CHF {data.amount}</span>
                </div>
              </>
            ) : (
              <div className="inv-total-row inv-total-final">
                <span>Total</span>
                <span>CHF {data.amount}</span>
              </div>
            )}
          </div>

          {/* ── Zahlungsinfos ── */}
          <div className="inv-payment-block">
            <div className="inv-payment-row">
              <span className="inv-payment-label">Zahlungsfrist</span>
              <span>{data.paymentDueLabel}</span>
            </div>
            <div className="inv-payment-row">
              <span className="inv-payment-label">QR-Referenz</span>
              <span>{data.qrReferenceFormatted}</span>
            </div>
            <div className="inv-payment-row">
              <span className="inv-payment-label">IBAN</span>
              <span>{data.creditorIbanFormatted}</span>
            </div>
            <div className="inv-payment-row">
              <span className="inv-payment-label">Zahlbar an</span>
              <span>
                {data.creditor.name}
                {data.creditorLines?.[1] ? `, ${data.creditorLines[1]}` : ""}
                {data.creditorLines?.[2] ? `, ${data.creditorLines[2]}` : ""}
              </span>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="inv-footer">
            <p>Vielen Dank für Ihr Vertrauen. Bei Fragen stehen wir gerne zur Verfügung: <a href={`mailto:${data.creditor.email}`} className="inv-link">{data.creditor.email}</a></p>
            <p>Für den normgerechten QR-Zahlteil bitte den PDF-Download verwenden.</p>
            <p>Freundliche Grüsse<br />{data.creditor.name}</p>
          </div>

        </div>

        {/* ── Aktions-Buttons (kein Druck) ── */}
        <div className="inv-actions no-print">
          <button type="button" className="inv-btn-primary" onClick={() => window.print()}>
            Drucken / PDF
          </button>
          <a
            href={`/portal/api/tours/${data.tourId}/invoices/${data.invoiceId}/pdf`}
            download
            className="inv-btn-secondary"
          >
            PDF herunterladen
          </a>
          <a
            href={portalPath(`tours/${data.tourId}`)}
            className="inv-btn-ghost"
            onClick={(e) => { e.preventDefault(); navigate(portalPath(`tours/${data.tourId}`)); }}
          >
            ← Zurück zur Tour
          </a>
        </div>
      </div>
    </>
  );
}

const invoicePrintStyles = `
  * { box-sizing: border-box; }
  body { background: #EDECEA; margin: 0; }

  .inv-page {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    min-height: 100vh;
    padding: 32px 16px 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  /* ── Karte ── */
  .inv-card {
    background: #fff;
    width: 100%;
    max-width: 760px;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.10);
    font-size: 13px;
    color: #1C1C1C;
    line-height: 1.55;
  }

  /* ── Top-Bar ── */
  .inv-topbar {
    background: ${PROPUS_DARK};
    color: #fff;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .inv-topbar-brand { display: flex; flex-direction: column; gap: 2px; }
  .inv-topbar-name { font-size: 1.1rem; font-weight: 700; color: ${PROPUS_GOLD}; letter-spacing: 0.3px; }
  .inv-topbar-sub { font-size: 0.75rem; color: #9CA3AF; }
  .inv-topbar-badge {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 1.5px;
    border: 1.5px solid ${PROPUS_GOLD};
    color: ${PROPUS_GOLD};
    padding: 4px 12px;
    border-radius: 2px;
    white-space: nowrap;
  }

  /* ── Hero ── */
  .inv-hero {
    padding: 28px 32px 20px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid #F0EFED;
  }
  .inv-hero-title {
    font-size: 1.5rem;
    font-weight: 800;
    margin: 0 0 4px;
    color: ${PROPUS_DARK};
  }
  .inv-hero-meta { font-size: 0.82rem; color: #6B7280; display: flex; gap: 6px; align-items: center; }
  .inv-hero-dot { color: #D1D5DB; }

  .inv-status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 3px;
    border: 1px solid;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: 4px;
  }

  /* ── Parteien ── */
  .inv-parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border-bottom: 1px solid #F0EFED;
  }
  .inv-party {
    padding: 20px 32px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .inv-party-right { border-left: 1px solid #F0EFED; }
  .inv-party-label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: ${PROPUS_GOLD};
    margin-bottom: 4px;
  }
  .inv-party strong { font-weight: 600; font-size: 0.9rem; color: ${PROPUS_DARK}; }
  .inv-party span { font-size: 0.85rem; color: #4B5563; }
  .inv-link { color: ${PROPUS_GOLD}; text-decoration: none; font-size: 0.82rem; word-break: break-all; }
  .inv-link:hover { text-decoration: underline; }

  /* ── Tabelle ── */
  .inv-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0;
  }
  .inv-table thead tr {
    background: ${PROPUS_DARK};
  }
  .inv-table th {
    padding: 10px 32px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #9CA3AF;
    text-align: left;
  }
  .inv-th-pos { width: 60px; }
  .inv-th-amount { text-align: right; }
  .inv-table tbody tr { border-bottom: 1px solid #F0EFED; }
  .inv-table td { padding: 14px 32px; vertical-align: top; }
  .inv-td-pos { color: #9CA3AF; font-size: 0.85rem; }
  .inv-td-amount { text-align: right; font-weight: 600; font-size: 0.9rem; color: ${PROPUS_DARK}; white-space: nowrap; }
  .inv-pos-main { display: block; font-weight: 600; font-size: 0.9rem; color: ${PROPUS_DARK}; }
  .inv-pos-sub { display: block; font-size: 0.78rem; color: #9CA3AF; margin-top: 2px; }

  /* ── Summen ── */
  .inv-totals {
    padding: 12px 32px 20px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .inv-total-row {
    display: flex;
    gap: 48px;
    justify-content: flex-end;
    font-size: 0.88rem;
    color: #4B5563;
    width: 280px;
    padding: 3px 0;
  }
  .inv-total-row span:first-child { flex: 1; text-align: right; }
  .inv-total-row span:last-child { min-width: 90px; text-align: right; }
  .inv-total-vat { color: #6B7280; font-size: 0.82rem; }
  .inv-total-final {
    margin-top: 6px;
    padding-top: 8px;
    border-top: 2px solid ${PROPUS_DARK};
    font-size: 1rem;
    font-weight: 800;
    color: ${PROPUS_GOLD};
  }

  /* ── Zahlungsblock ── */
  .inv-payment-block {
    margin: 0 32px 24px;
    background: #FAFAF9;
    border: 1px solid #F0EFED;
    border-radius: 4px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .inv-payment-row {
    display: flex;
    gap: 16px;
    font-size: 0.82rem;
    color: #374151;
  }
  .inv-payment-label {
    min-width: 110px;
    color: #9CA3AF;
    font-weight: 600;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  /* ── Footer ── */
  .inv-footer {
    padding: 20px 32px 28px;
    border-top: 1px solid #F0EFED;
    font-size: 0.82rem;
    color: #6B7280;
  }
  .inv-footer p { margin: 0 0 6px; }

  /* ── Aktionen ── */
  .inv-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    padding: 8px 0;
  }
  .inv-btn-primary {
    background: ${PROPUS_GOLD};
    color: #fff;
    border: none;
    padding: 10px 22px;
    border-radius: 6px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .inv-btn-primary:hover { background: #9a7619; }
  .inv-btn-secondary {
    background: transparent;
    color: ${PROPUS_GOLD};
    border: 1.5px solid ${PROPUS_GOLD};
    padding: 10px 22px;
    border-radius: 6px;
    font-size: 0.88rem;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.15s;
  }
  .inv-btn-secondary:hover { background: #fdf9ee; }
  .inv-btn-ghost {
    background: transparent;
    color: #6B7280;
    border: 1.5px solid #E5E7EB;
    padding: 10px 22px;
    border-radius: 6px;
    font-size: 0.88rem;
    font-weight: 500;
    text-decoration: none;
    transition: background 0.15s;
  }
  .inv-btn-ghost:hover { background: #f9fafb; }

  /* ── Print ── */
  @media print {
    body { background: none; }
    .inv-page { padding: 0; background: none; }
    .inv-card { max-width: 100%; box-shadow: none; border-radius: 0; }
    .no-print { display: none !important; }
  }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .inv-parties { grid-template-columns: 1fr; }
    .inv-party-right { border-left: none; border-top: 1px solid #F0EFED; }
    .inv-topbar { padding: 14px 20px; }
    .inv-hero { padding: 20px 20px 16px; flex-direction: column; gap: 10px; }
    .inv-table th, .inv-table td { padding: 10px 20px; }
    .inv-totals { padding: 12px 20px 16px; }
    .inv-payment-block { margin: 0 20px 20px; }
    .inv-footer { padding: 16px 20px 24px; }
  }
`;
