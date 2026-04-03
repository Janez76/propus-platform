import { Link2 } from "lucide-react";

type Props = {
  bookingOrderNo?: number | null;
  customerName?: string | null;
  onOpenBookingLink?: () => void;
};

/**
 * Bestellungs-Verknüpfung und Kurzaktion (z. B. Kunde/Bestellung anpassen).
 */
export function TourInternSection({ bookingOrderNo, customerName, onOpenBookingLink }: Props) {
  return (
    <div className="space-y-3">
      {bookingOrderNo ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-[var(--text-main)]">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span>
              Bestellung <span className="font-medium">#{bookingOrderNo}</span>
              {customerName ? <span className="text-[var(--text-subtle)]"> · {customerName}</span> : null}
            </span>
          </div>
          {onOpenBookingLink ? (
            <button
              type="button"
              onClick={onOpenBookingLink}
              className="shrink-0 text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Kunde anpassen
            </button>
          ) : null}
        </div>
      ) : onOpenBookingLink ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--border-soft)] px-3 py-2">
          <span className="text-sm text-[var(--text-subtle)]">Keine Bestellung verknüpft</span>
          <button
            type="button"
            onClick={onOpenBookingLink}
            className="shrink-0 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Kunde anpassen
          </button>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-subtle)]">Keine Bestellung verknüpft</p>
      )}
    </div>
  );
}
