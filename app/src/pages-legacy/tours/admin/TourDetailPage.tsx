import { useCallback, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { getToursAdminTourDetail } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminTourDetailQueryKey } from "../../../lib/queryKeys";
import type { ToursAdminTourRow } from "../../../types/toursAdmin";
import { TourActionLog } from "./components/TourActionLog";
import { TourActionsPanel } from "./components/TourActionsPanel";
import { TourInvoicesSection } from "./components/TourInvoicesSection";
import { TourMatterportSection } from "./components/TourMatterportSection";

function tourTitle(t: ToursAdminTourRow) {
  return (
    (t.canonical_object_label as string) ||
    (t.object_label as string) ||
    (t.bezeichnung as string) ||
    `Tour #${t.id}`
  );
}

export function TourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const okId = id != null && id !== "" && /^\d+$/.test(id) ? id : null;
  const [embedView, setEmbedView] = useState<"customer" | "invoice" | "booking" | null>(null);
  const qk = okId ? toursAdminTourDetailQueryKey(okId) : "toursAdmin:tour:invalid";
  const queryFn = useCallback(() => {
    if (!okId) throw new Error("Ungültige Tour-ID");
    return getToursAdminTourDetail(okId);
  }, [okId]);

  const { data, loading, error, refetch } = useQuery(qk, queryFn, { enabled: !!okId, staleTime: 20_000 });
  const refetchDetail = useCallback(() => void refetch({ force: true }), [refetch]);

  if (!okId) {
    return <Navigate to="/admin/tours/list" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/admin/tours/list"
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Liste
          </Link>
          {loading && !data ? (
            <div className="skeleton-line h-8 w-64 max-w-full" />
          ) : data ? (
            <>
              <h1 className="text-2xl font-bold text-[var(--text-main)]">{tourTitle(data.tour)}</h1>
              <p className="text-sm text-[var(--text-subtle)] mt-1">
                #{data.tour.id} · {data.displayedTourStatus.label}
                {data.displayedTourStatus.note ? ` · ${data.displayedTourStatus.note}` : ""}
              </p>
            </>
          ) : (
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Tour #{okId}</h1>
          )}
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button type="button" onClick={refetchDetail} className="text-sm underline font-medium">
            Erneut laden
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : null}

      {data ? (
        <>
          <TourActionsPanel
            tourId={okId}
            tour={data.tour}
            mpVisibility={data.mpVisibility}
            onSuccess={refetchDetail}
            onOpenCustomerLink={() => setEmbedView("customer")}
          />
          <TourMatterportSection
            tourId={okId}
            tour={data.tour}
            onSuccess={refetchDetail}
            onOpenBookingLink={() => setEmbedView("booking")}
          />
          <TourInvoicesSection
            tourId={okId}
            renewalInvoices={data.renewalInvoices}
            exxasInvoices={data.exxasInvoices}
            paymentSummary={data.paymentSummary}
            paymentTimeline={data.paymentTimeline}
            suggestedManualDueAt={data.suggestedManualDueAt}
            onOpenInvoiceLink={() => setEmbedView("invoice")}
          />
          <TourActionLog rows={data.actionsLog} />
        </>
      ) : null}

      {embedView ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-2">
          <div className="surface-card w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col rounded-xl shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-soft)]">
              <span className="font-semibold text-[var(--text-main)]">
                {embedView === "customer"
                  ? "Kunde anpassen"
                  : embedView === "invoice"
                    ? "Exxas-Rechnung verknüpfen"
                    : "Bestellung verknüpfen"} - Tour #{okId}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEmbedView(null);
                  refetchDetail();
                }}
                className="text-[var(--text-subtle)] hover:text-[var(--text-main)] text-xl leading-none px-1"
                aria-label="Schliessen"
              >
                ×
              </button>
            </div>
            <iframe
              src={
                embedView === "customer"
                  ? `/embed/tours/${encodeURIComponent(okId)}/link-exxas-customer`
                  : embedView === "invoice"
                    ? `/embed/tours/${encodeURIComponent(okId)}/link-invoice`
                    : `/embed/tours/link-matterport${
                        data.tour.canonical_matterport_space_id || data.tour.matterport_space_id
                          ? `?openSpaceId=${encodeURIComponent(
                              String(data.tour.canonical_matterport_space_id ?? data.tour.matterport_space_id ?? "")
                            )}`
                          : ""
                      }`
              }
              className="flex-1 w-full border-0"
              style={{ minHeight: "70vh" }}
              title={
                embedView === "customer"
                  ? "Kunde anpassen"
                  : embedView === "invoice"
                    ? "Exxas-Rechnung verknüpfen"
                    : "Bestellung verknüpfen"
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}