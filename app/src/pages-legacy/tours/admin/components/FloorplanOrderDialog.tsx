/**
 * FloorplanOrderDialog – Grundriss bestellen Modal
 *
 * Wird sowohl in TourMatterportSection (Admin) als auch in PortalTourDetailPage (Portal)
 * verwendet. Die Unterscheidung erfolgt über die `onFetchPricing` / `onSubmit` Props,
 * damit beide Kontexte eigene API-Clients verwenden können.
 */

import React, { useEffect, useState } from "react";
import { FileText, Loader2, MapPin, X } from "lucide-react";

export interface FloorplanPricing {
  unitPrice: number;
  vatRate: number;
  vatPercent: number;
  floors: { id: string; label: string | null }[];
  floorCount: number;
  totalNet: number;
  totalGross: number;
}

interface FloorplanOrderDialogProps {
  tourId: number;
  payrexxConfigured: boolean;
  onFetchPricing: (tourId: number) => Promise<FloorplanPricing>;
  onSubmit: (
    tourId: number,
    payload: { paymentMethod: "payrexx" | "qr_invoice"; comment?: string; floorCount: number },
  ) => Promise<{ ok: boolean; via?: string; redirectUrl?: string }>;
  onClose: () => void;
  onSuccess?: () => void;
}

export function FloorplanOrderDialog({
  tourId,
  payrexxConfigured,
  onFetchPricing,
  onSubmit,
  onClose,
  onSuccess,
}: FloorplanOrderDialogProps) {
  const [pricing, setPricing] = useState<FloorplanPricing | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const [floorCount, setFloorCount] = useState<number>(1);
  const [comment, setComment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"payrexx" | "qr_invoice">(
    payrexxConfigured ? "payrexx" : "qr_invoice",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setLoadingPricing(true);
    setPricingError(null);
    onFetchPricing(tourId)
      .then((data) => {
        setPricing(data);
        setFloorCount(data.floorCount || 1);
      })
      .catch((err: Error) => {
        setPricingError(err.message || "Preis konnte nicht geladen werden");
      })
      .finally(() => setLoadingPricing(false));
  }, [tourId, onFetchPricing]);

  const unitPrice = pricing?.unitPrice ?? 49;
  const vatRate = pricing?.vatRate ?? 0;
  const vatPercent = pricing?.vatPercent ?? 0;
  const totalNet = Math.round(floorCount * unitPrice * 100) / 100;
  const totalGross = Math.round(totalNet * (1 + vatRate) * 100) / 100;
  const floorsFromApi = pricing?.floors ?? [];
  const hasKnownFloors = floorsFromApi.length > 0;

  async function handleSubmit() {
    if (busy || done) return;
    setError(null);
    setBusy(true);
    try {
      const result = await onSubmit(tourId, {
        paymentMethod,
        comment: comment.trim() || undefined,
        floorCount,
      });
      if (result.via === "payrexx" && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setDone(true);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Absenden");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] ring-1 ring-[var(--border-strong)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-5 relative">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--accent)] shrink-0" />
            <h3 className="text-base font-semibold text-[var(--text-main)]">Grundriss bestellen</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors disabled:opacity-50"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          /* Erfolgs-State */
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Bestellung aufgegeben</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                Ihre Grundriss-Bestellung wurde erfolgreich registriert.
                {paymentMethod === "qr_invoice"
                  ? " Die QR-Rechnung wurde per E-Mail zugestellt."
                  : ""}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)]"
              >
                Schließen
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Preis laden */}
            {loadingPricing ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preisinformationen werden geladen…
              </div>
            ) : pricingError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                {pricingError}
              </div>
            ) : null}

            {/* Etagen */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-main)]">
                Anzahl Etagen / Floors
              </label>
              {hasKnownFloors ? (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[var(--text-subtle)] shrink-0" />
                  <span className="text-sm text-[var(--text-main)]">
                    {floorCount} Etage{floorCount !== 1 ? "n" : ""} (aus Matterport ermittelt)
                  </span>
                </div>
              ) : null}
              <input
                type="number"
                min={1}
                max={20}
                value={floorCount}
                onChange={(e) => setFloorCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input,var(--bg-card))] px-3 py-1.5 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              {!hasKnownFloors && !loadingPricing && (
                <p className="text-xs text-[var(--text-subtle)]">
                  Anzahl Etagen konnte nicht automatisch ermittelt werden – bitte manuell eingeben.
                </p>
              )}
            </div>

            {/* Kostenzusammenfassung */}
            {!loadingPricing && (
              <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-subtle,var(--bg-card))] px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">
                  Kostenzusammenfassung
                </p>
                <div className="flex justify-between text-sm text-[var(--text-main)]">
                  <span>
                    {floorCount} × CHF {unitPrice.toFixed(2)}
                    {vatPercent > 0 ? " (Netto)" : ""}
                  </span>
                  <span>CHF {totalNet.toFixed(2)}</span>
                </div>
                {vatPercent > 0 && (
                  <div className="flex justify-between text-xs text-[var(--text-subtle)]">
                    <span>MwSt {vatPercent}%</span>
                    <span>CHF {(totalGross - totalNet).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-[var(--text-main)] border-t border-[var(--border-soft)] pt-1.5 mt-1">
                  <span>{vatPercent > 0 ? "Gesamtbetrag inkl. MwSt" : "Gesamtbetrag"}</span>
                  <span>CHF {totalGross.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Kommentar */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-main)]">
                Kommentar <span className="text-[var(--text-subtle)] font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="z.B. besondere Anforderungen, Skizze vorhanden, Raumaufteilung…"
                className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input,var(--bg-card))] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
              />
            </div>

            {/* Zahlungsart */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-main)]">Zahlungsart</p>
              <div className="flex flex-col gap-2">
                {payrexxConfigured && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-[var(--text-main)]">
                    <input
                      type="radio"
                      name="floorplanPayMethod"
                      value="payrexx"
                      checked={paymentMethod === "payrexx"}
                      onChange={() => setPaymentMethod("payrexx")}
                      className="accent-[var(--accent)] w-4 h-4"
                    />
                    Online bezahlen (Payrexx)
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                  <input
                    type="radio"
                    name="floorplanPayMethod"
                    value="qr_invoice"
                    checked={paymentMethod === "qr_invoice"}
                    onChange={() => setPaymentMethod("qr_invoice")}
                    className="accent-[var(--accent)] w-4 h-4"
                  />
                  QR-Rechnung per E-Mail
                </label>
              </div>
            </div>

            {/* Kontextueller Hinweis */}
            {paymentMethod === "qr_invoice" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Hinweis</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Die QR-Rechnung wird per E-Mail zugestellt und ist innerhalb von{" "}
                  <strong>14 Tagen</strong> zu bezahlen. Die Grundriss-Erstellung beginnt nach
                  Zahlungseingang.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/30">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Sie werden zur Payrexx-Zahlungsseite weitergeleitet. Die Grundriss-Erstellung
                  beginnt nach erfolgreicher Zahlung.
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Aktionen */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busy || loadingPricing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Wird gesendet…
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Jetzt bestellen
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
