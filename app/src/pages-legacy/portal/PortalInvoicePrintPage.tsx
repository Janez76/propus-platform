import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getInvoicePrintData, type InvoicePrintData } from "../../api/portalTours";
import { usePortalNav } from "../../hooks/usePortalNav";

const LOGO_URL = "https://propus.ch/wp-content/uploads/2024/06/Asset-2-2.png";

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
      .catch((e) => setError(e.message));
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
        <div style={{ width: 40, height: 40, border: "3px solid #e8e6e2", borderTopColor: "#B68E20", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const statusColor =
    data.status === "paid" ? { bg: "#ECFDF5", color: "#047857" } :
    data.status === "overdue" ? { bg: "#FEF2F2", color: "#B91C1C" } :
    data.status === "cancelled" ? { bg: "#FEE2E2", color: "#991B1B" } :
    data.status === "sent" ? { bg: "#FFFBEB", color: "#92400E" } :
    { bg: "#F3F4F6", color: "#6B7280" };

  return (
    <>
      <style>{invoicePrintStyles}</style>
      <div className="inv-card">
        <div className="inv-header">
          <div className="inv-logo"><img src={LOGO_URL} alt="Propus" /></div>
          <div className="inv-meta">
            {data.creditor.name}<br />
            {data.creditor.email}<br />
            {data.creditor.website}
          </div>
        </div>

        <div className="inv-title-row">
          <h1>Rechnung</h1>
          <span className="inv-status" style={{ background: statusColor.bg, color: statusColor.color }}>
            {data.statusLabel}
          </span>
        </div>
        <div className="inv-subtitle">{data.invLabel} · {data.invoiceDate}</div>

        <div className="inv-parties">
          <div className="inv-party">
            <strong>Rechnungssteller</strong>
            <p>
              {data.creditor.name}<br />
              {data.creditorLines?.[1]}<br />
              {data.creditorLines?.[2]}<br />
              {data.creditor.email}
            </p>
          </div>
          <div className="inv-party">
            <strong>Rechnungsempfänger</strong>
            <p>
              {data.customerName}<br />
              {data.customerEmail}
            </p>
          </div>
        </div>

        <div className="inv-detail-row">
          <span className="inv-detail-label">Tour / Objekt</span>
          <span>{data.tourLabel}</span>
        </div>
        {data.tourAddress && (
          <div className="inv-detail-row">
            <span className="inv-detail-label">Adresse</span>
            <span>{data.tourAddress}</span>
          </div>
        )}
        {data.tourLink && (
          <div className="inv-detail-row">
            <span className="inv-detail-label">Link</span>
            <a href={data.tourLink} target="_blank" rel="noopener noreferrer">{data.tourLink}</a>
          </div>
        )}
        <div className="inv-detail-row">
          <span className="inv-detail-label">Periode</span>
          <span>{data.billingPeriodLabel}</span>
        </div>
        <div className="inv-detail-row">
          <span className="inv-detail-label">Zahlungsfrist</span>
          <span>{data.paymentDueLabel}</span>
        </div>

        <table className="inv-table">
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Beschreibung</th>
              <th className="inv-amount">Betrag (CHF)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>{data.bezeichnung}</td>
              <td className="inv-amount">{data.amount}</td>
            </tr>
          </tbody>
        </table>

        <div className="inv-total">
          <span>Total</span>
          <span>CHF {data.amount}</span>
        </div>

        <div className="inv-payment">
          <div className="inv-payment-row">
            <span>QR-Referenz</span>
            <span>{data.qrReferenceFormatted}</span>
          </div>
          <div className="inv-payment-row">
            <span>IBAN</span>
            <span>{data.creditorIbanFormatted}</span>
          </div>
        </div>

        <div className="inv-footer">
          <p>Vielen Dank für Ihr Vertrauen. Bei Fragen erreichen Sie uns unter {data.creditor.email}.</p>
          <p>Für den normgerechten QR-Zahlteil bitte den PDF-Download verwenden.</p>
          <p>Freundliche Grüsse<br />{data.creditor.name}</p>
        </div>
      </div>

      <div className="inv-actions no-print">
        <button type="button" onClick={() => window.print()}>Drucken</button>
        <a href={`/portal/api/tours/${data.tourId}/invoices/${data.invoiceId}/pdf`} download>PDF herunterladen</a>
        <a
          href={portalPath(`tours/${data.tourId}`)}
          onClick={(e) => { e.preventDefault(); navigate(portalPath(`tours/${data.tourId}`)); }}
        >
          ← Zurück zur Tour
        </a>
      </div>
    </>
  );
}

const invoicePrintStyles = `
  body { background: #F3F4F6; }
  .inv-card {
    font-family: 'Inter', system-ui, sans-serif;
    background: #fff;
    width: 210mm;
    min-height: 297mm;
    margin: 40px auto;
    padding: 20mm;
    box-shadow: 0 20px 50px rgba(0,0,0,0.05);
    display: flex;
    flex-direction: column;
    font-size: 13px;
    color: #111827;
    line-height: 1.5;
  }
  .inv-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 48px;
  }
  .inv-logo img { width: 150px; height: auto; }
  .inv-meta { text-align: right; font-size: 0.85rem; color: #6B7280; }
  .inv-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .inv-title-row h1 { font-size: 1.4rem; font-weight: 700; margin: 0; }
  .inv-status {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .inv-subtitle { color: #6B7280; font-size: 0.9rem; margin-bottom: 32px; }
  .inv-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 24px; }
  .inv-party strong { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; margin-bottom: 6px; }
  .inv-party p { margin: 0; font-size: 0.9rem; }
  .inv-detail-row { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 0.9rem; }
  .inv-detail-label { color: #6B7280; min-width: 120px; font-weight: 500; }
  .inv-detail-row a { color: #005A70; text-decoration: none; }
  .inv-table { width: 100%; border-collapse: collapse; margin: 24px 0 16px; }
  .inv-table th, .inv-table td { padding: 10px 12px; text-align: left; }
  .inv-table th { background: #F9FAFB; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; border-bottom: 2px solid #E5E7EB; }
  .inv-table td { border-bottom: 1px solid #F3F4F6; }
  .inv-amount { text-align: right; }
  .inv-total { display: flex; justify-content: flex-end; gap: 24px; padding: 12px 0; font-size: 1.1rem; font-weight: 700; border-top: 2px solid #111827; }
  .inv-payment { margin-top: 24px; padding: 16px; background: #F9FAFB; border-radius: 8px; }
  .inv-payment-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.88rem; }
  .inv-payment-row span:first-child { color: #6B7280; font-weight: 500; }
  .inv-footer { margin-top: auto; padding-top: 24px; border-top: 1px solid #E5E7EB; font-size: 0.85rem; color: #6B7280; }
  .inv-footer p { margin-bottom: 8px; }
  .inv-actions {
    display: flex; gap: 10px; justify-content: center; padding: 24px; flex-wrap: wrap;
  }
  .inv-actions button, .inv-actions a {
    padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; font-weight: 600;
    text-decoration: none; cursor: pointer; border: 1px solid #B68E20;
  }
  .inv-actions button { background: #B68E20; color: #fff; border: none; }
  .inv-actions button:hover { background: #9a7619; }
  .inv-actions a { background: transparent; color: #B68E20; }
  .inv-actions a:hover { background: #f3f2ef; }
  @media print {
    body { background: none; }
    .inv-card { width: 100%; min-height: auto; box-shadow: none; margin: 0; padding: 15mm; }
    .no-print { display: none !important; }
  }
  @media (max-width: 900px) {
    .inv-card { width: 100%; min-height: auto; margin: 0; padding: 24px; }
    .inv-parties { grid-template-columns: 1fr; }
  }
`;
