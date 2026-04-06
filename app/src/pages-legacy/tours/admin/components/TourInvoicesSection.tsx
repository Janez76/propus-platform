import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { createTourManualInvoice, renewalInvoicePdfUrl, postSyncExxasInventory } from "../../../../api/toursAdmin";
import type { ExxasInventorySyncResult } from "../../../../api/toursAdmin";
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
  onRefresh?: () => void;
};

export function TourInvoicesSection({
  renewalInvoices,
  exxasInvoices,
  paymentSummary,
  tour,
  paymentTimeline = [],
  tourId,
  onOpenInvoiceLink,
  onRefresh,
}: Props) {
  const ps = paymentSummary as Record<string, unknown>;
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createAmount, setCreateAmount] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<ExxasInventorySyncResult | null>(null);

  async function handleExxasSync() {
    if (!tourId) return;
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const result = await postSyncExxasInventory(Number(tourId));
      setSyncResult(result);
      if (result.ok && result.synced) onRefresh?.();
    } catch (e) {
      setSyncResult({ ok: false, synced: false, error: e instanceof Error ? e.message : "Fehler" });
    } finally {
      setSyncBusy(false);
    }
  }
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
          <div className="flex gap-2">
            {tourId ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1 text-xs rounded border border-[var(--accent)]/30 px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Rechnung erstellen
              </button>
            ) : null}
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
        </div>
        {showCreate && tourId ? (
          <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.01"
                placeholder="Betrag CHF *"
                value={createAmount}
                onChange={(e) => setCreateAmount(e.target.value)}
                className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)]"
              />
              <input
                type="text"
                placeholder="Notiz (optional)"
                value={createNote}
                onChange={(e) => setCreateNote(e.target.value)}
                className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)]"
              />
            </div>
            {createError ? <p className="text-xs text-red-600">{createError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={createBusy}
                onClick={async () => {
                  if (!createAmount.trim()) { setCreateError("Betrag erforderlich"); return; }
                  setCreateBusy(true);
                  setCreateError(null);
                  try {
                    const res = await createTourManualInvoice(tourId, {
                      amountChf: createAmount,
                      paymentNote: createNote || undefined,
                    });
                    if (!(res as Record<string, unknown>).ok) {
                      setCreateError(String((res as Record<string, unknown>).error || "Fehler"));
                    } else {
                      setShowCreate(false);
                      setCreateAmount("");
                      setCreateNote("");
                      onRefresh?.();
                    }
                  } catch (err) {
                    setCreateError(err instanceof Error ? err.message : "Fehler");
                  } finally {
                    setCreateBusy(false);
                  }
                }}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent)]/90 disabled:opacity-50"
              >
                {createBusy ? "Erstellt..." : "Erstellen"}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(null); }}
                className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:text-[var(--text-main)]"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : null}
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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-medium text-[var(--text-main)]">Exxas-Rechnungen</h3>
          {tourId ? (
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => void handleExxasSync()}
              className="inline-flex items-center gap-1.5 text-xs rounded border border-[var(--accent)]/30 px-2.5 py-1 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${syncBusy ? "animate-spin" : ""}`} />
              {syncBusy ? "Sync läuft…" : "Exxas-Anlage sync"}
            </button>
          ) : null}
        </div>
        {syncResult ? (
          <div
            className={`mb-3 rounded-lg border px-3 py-2.5 text-xs space-y-1 ${
              !syncResult.ok || syncResult.error
                ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                : (syncResult.archived || syncResult.archiveNote)
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            {syncResult.error ? (
              <p className="font-medium">{syncResult.error}</p>
            ) : (
              <>
                <p className="font-medium">{syncResult.message ?? (syncResult.synced ? "Sync erfolgreich." : "Keine Exxas-Anlage gefunden.")}</p>
                {syncResult.inventoryTitel ? (
                  <p>Anlage: <span className="font-medium">{syncResult.inventoryTitel}</span> · Status: <span className="font-medium">{syncResult.inventoryStatus === "ak" ? "aktiv" : syncResult.inventoryStatus ?? "—"}</span></p>
                ) : null}
                {syncResult.invoiceLinked != null ? (
                  <p>
                    Rechnung:{" "}
                    {syncResult.invoiceLinked ? (
                      <>
                        <span className="font-medium">{syncResult.invoiceNummer ?? syncResult.invoiceId ?? "verknüpft"}</span>
                        {" · "}
                        <span className={syncResult.bezahlt ? "text-emerald-700 dark:text-emerald-400 font-medium" : "font-medium"}>
                          {syncResult.bezahlt === true ? "bezahlt" : syncResult.bezahlt === false ? "offen" : "—"}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--text-subtle)]">keine gefunden</span>
                    )}
                  </p>
                ) : null}
                {syncResult.archived ? <p className="font-semibold">Tour wurde archiviert.</p> : null}
              </>
            )}
          </div>
        ) : null}
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
