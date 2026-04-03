import { renewalInvoicePdfUrl } from "../../../../api/toursAdmin";
import type { ToursAdminTourDetailResponse, ToursAdminTourRow } from "../../../../types/toursAdmin";

function formatDate(v: unknown) {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `CHF ${n.toFixed(2)}`;
}

function formatRestzeit(days: unknown) {
  const n = typeof days === "number" ? days : parseInt(String(days ?? ""), 10);
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return `Seit ${Math.abs(n)} ${Math.abs(n) === 1 ? "Tag" : "Tagen"} abgelaufen`;
  if (n === 0) return "Läuft heute ab";
  return `${n} ${n === 1 ? "Tag" : "Tage"}`;
}

function latestRenewalDate(rows: Record<string, unknown>[]): unknown {
  const candidates = rows
    .map((row) => row.paid_at ?? row.sent_at ?? row.created_at ?? null)
    .filter((v) => v != null)
    .map((v) => ({ raw: v, ts: new Date(String(v)).getTime() }))
    .filter((v) => Number.isFinite(v.ts))
    .sort((a, b) => b.ts - a.ts);
  return candidates[0]?.raw ?? null;
}

type Props = Pick<
  ToursAdminTourDetailResponse,
  "renewalInvoices" | "exxasInvoices" | "paymentSummary"
> & {
  tour: ToursAdminTourRow;
  paymentTimeline?: ToursAdminTourDetailResponse["paymentTimeline"];
  tourId?: string;
  onOpenInvoiceLink?: () => void;
};

export function TourInvoicesSection({
  renewalInvoices,
  exxasInvoices,
  paymentSummary,
  tour,
  paymentTimeline = [],
  tourId,
  onOpenInvoiceLink,
}: Props) {
  const ps = paymentSummary as Record<string, unknown>;
  const createdAt = tour.matterport_created_at ?? tour.created_at ?? null;
  const expiresAt = tour.canonical_term_end_date ?? tour.term_end_date ?? tour.ablaufdatum ?? null;
  const lastRenewalAt = latestRenewalDate(renewalInvoices);
  const restzeit = formatRestzeit(tour.days_until_expiry);

  return (
    <section className="surface-card-strong p-5 space-y-4">
      <h2 className="text-lg font-semibold text-[var(--text-main)]">Rechnungen &amp; Zahlungen</h2>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-soft)] p-3">
          <div className="text-[var(--text-subtle)] text-xs">Tour erstellt am</div>
          <div className="mt-1 font-semibold text-[var(--text-main)]">{formatDate(createdAt)}</div>
        </div>
        <div className="rounded-lg border border-[var(--border-soft)] p-3">
          <div className="text-[var(--text-subtle)] text-xs">Tour läuft am ab</div>
          <div className="mt-1 font-semibold text-[var(--text-main)]">{formatDate(expiresAt)}</div>
        </div>
        <div className="rounded-lg border border-[var(--border-soft)] p-3">
          <div className="text-[var(--text-subtle)] text-xs">Letzte Verlängerung</div>
          <div className="mt-1 font-semibold text-[var(--text-main)]">{formatDate(lastRenewalAt)}</div>
        </div>
        <div className="rounded-lg border border-[var(--border-soft)] p-3">
          <div className="text-[var(--text-subtle)] text-xs">Restzeit</div>
          <div className="mt-1 font-semibold text-[var(--text-main)]">{restzeit}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg border border-[var(--border-soft)] p-3">
          <div className="text-[var(--text-subtle)] text-xs">Bezahlt</div>
          <div className="font-semibold text-[var(--text-main)]">{String(ps.paidCount ?? "0")}</div>
          <div className="text-xs text-[var(--text-subtle)]">{formatMoney(ps.paidAmount)}</div>
        </div>
        <div className="rounded-lg border border-[var(--border-soft)] p-3">
          <div className="text-[var(--text-subtle)] text-xs">Offen</div>
          <div className="font-semibold text-[var(--text-main)]">{String(ps.openCount ?? "0")}</div>
          <div className="text-xs text-[var(--text-subtle)]">{formatMoney(ps.openAmount)}</div>
        </div>
        <div className="rounded-lg border border-[var(--border-soft)] p-3 sm:col-span-2">
          <div className="text-[var(--text-subtle)] text-xs">Letzte Zahlung</div>
          {ps.lastPayment && typeof ps.lastPayment === "object" ? (
            <div className="text-sm text-[var(--text-main)] mt-1">
              {String((ps.lastPayment as Record<string, unknown>).label ?? "")}{" "}
              <span className="text-[var(--text-subtle)]">
                {formatDate((ps.lastPayment as Record<string, unknown>).at)}
              </span>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-subtle)]">—</div>
          )}
        </div>
      </div>
      {paymentTimeline.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-[var(--text-main)] mb-2">Zeitleiste</h3>
          <ul className="space-y-2 text-sm">
            {paymentTimeline.slice(0, 8).map((row, i) => {
              const r = row as Record<string, unknown>;
              return (
                <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-[var(--border-soft)]/50 pb-2">
                  <span className="text-[var(--text-main)]">{String(r.title ?? "")}</span>
                  <span className="text-[var(--text-subtle)]">{String(r.statusLabel ?? r.status ?? "")}</span>
                  <span className="text-[var(--text-subtle)]">{formatDate(r.primaryDate)}</span>
                  <span>{formatMoney(r.amount)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-medium text-[var(--text-main)]">Verlängerungsrechnungen (intern)</h3>
          {tourId && onOpenInvoiceLink ? (
            <button
              type="button"
              onClick={onOpenInvoiceLink}
              className="text-xs text-[var(--accent)] hover:underline font-medium"
            >
              Exxas-Rechnung verknüpfen
            </button>
          ) : null}
        </div>
        {renewalInvoices.length === 0 ? (
          <p className="text-sm text-[var(--text-subtle)]">Keine Einträge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                  <th className="py-2 pr-2">Nr.</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Betrag</th>
                  <th className="py-2">Fällig</th>
                  {tourId ? <th className="py-2">PDF</th> : null}
                </tr>
              </thead>
              <tbody>
                {renewalInvoices.map((inv) => {
                  const r = inv as Record<string, unknown>;
                  const rid = r.id;
                  return (
                    <tr key={String(r.id ?? Math.random())} className="border-b border-[var(--border-soft)]/40">
                      <td className="py-2 pr-2">{String(r.invoice_number ?? r.id ?? "")}</td>
                      <td className="py-2 pr-2">{String(r.invoice_status ?? "")}</td>
                      <td className="py-2 pr-2">{formatMoney(r.amount_chf ?? r.preis_brutto)}</td>
                      <td className="py-2">{formatDate(r.due_at)}</td>
                      {tourId && rid != null ? (
                        <td className="py-2">
                          <a
                            href={renewalInvoicePdfUrl(tourId, rid as string | number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--accent)] hover:underline text-xs"
                          >
                            PDF
                          </a>
                        </td>
                      ) : tourId ? (
                        <td className="py-2">—</td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-[var(--text-main)] mb-2">Exxas-Rechnungen</h3>
        {exxasInvoices.length === 0 ? (
          <p className="text-sm text-[var(--text-subtle)]">Keine Einträge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                  <th className="py-2 pr-2">Nummer</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Betrag</th>
                  <th className="py-2">Zahlungstermin</th>
                </tr>
              </thead>
              <tbody>
                {exxasInvoices.map((inv) => {
                  const r = inv as Record<string, unknown>;
                  return (
                    <tr key={String(r.id ?? r.exxas_document_id ?? Math.random())} className="border-b border-[var(--border-soft)]/40">
                      <td className="py-2 pr-2">{String(r.nummer ?? r.exxas_document_id ?? "")}</td>
                      <td className="py-2 pr-2">{String(r.exxas_status ?? r.sv_status ?? "")}</td>
                      <td className="py-2 pr-2">{formatMoney(r.betrag)}</td>
                      <td className="py-2">{formatDate(r.zahlungstermin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
