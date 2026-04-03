import { ExternalLink, Link2 } from "lucide-react";

const MP_OPEN_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-sm " +
  "transition-colors duration-150 " +
  "hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35";

type Props = {
  /** my.matterport.com/show/?m=… wenn Space-ID bekannt */
  matterportShowUrl?: string | null;
  bookingOrderNo?: number | null;
  customerName?: string | null;
  onOpenBookingLink?: () => void;
};

/**
 * Bestellungs-Verknüpfung und Kurzaktion (z. B. Kunde/Bestellung anpassen).
 */
export function TourInternSection({ matterportShowUrl, bookingOrderNo, customerName, onOpenBookingLink }: Props) {
  return (
    <div className="space-y-3">
      {matterportShowUrl ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <a
              href={matterportShowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={MP_OPEN_BTN}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              Matterport öffnen
            </a>
          </div>
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
            Öffnet die Tour im offiziellen Matterport-Viewer im neuen Tab — gleiche Space-ID wie in Propus verknüpft.
          </p>
        </div>
      ) : null}
      <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
        Buchungsbezug und Schnellzugriff: Bestellung aus dem Booking-System mit dieser Tour verknüpfen oder Kundenstamm
        anpassen — unabhängig von Matterport-Einstellungen darunter.
      </p>
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
