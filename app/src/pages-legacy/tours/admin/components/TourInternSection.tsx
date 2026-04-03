import { ExternalLink } from "lucide-react";

const MP_OPEN_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-sm " +
  "transition-colors duration-150 " +
  "hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35";

type Props = {
  /** my.matterport.com/show/?m=… wenn Space-ID bekannt */
  matterportShowUrl?: string | null;
  /** Verknüpfter Kunde (canonical, customer_name oder kunde_ref) */
  linkedCustomerLabel?: string | null;
  bookingOrderNo?: number | null;
  onOpenBookingLink?: () => void;
};

/**
 * Bestellungs-Verknüpfung und Kurzaktion (z. B. Kunde/Bestellung anpassen).
 */
export function TourInternSection({ matterportShowUrl, linkedCustomerLabel, bookingOrderNo, onOpenBookingLink }: Props) {
  const customerOk = Boolean(linkedCustomerLabel?.trim());
  const orderOk = bookingOrderNo != null;
  const summaryDashed = !customerOk && !orderOk;

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

      <div
        className={[
          "rounded-lg px-3 py-3",
          summaryDashed
            ? "border border-dashed border-[var(--border-soft)] bg-[var(--surface)]/40"
            : "border border-[var(--border-soft)] bg-[var(--surface)]",
        ].join(" ")}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid flex-1 min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                Verknüpfter Kunde
              </div>
              <p className="mt-1 text-sm font-medium text-[var(--text-main)] break-words">
                {customerOk ? (
                  linkedCustomerLabel
                ) : (
                  <span className="font-normal text-[var(--text-subtle)]">Noch keiner zugeordnet</span>
                )}
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                Bestellnummer
              </div>
              <p className="mt-1 text-sm font-medium text-[var(--text-main)]">
                {orderOk ? (
                  <>#{bookingOrderNo}</>
                ) : (
                  <span className="font-normal text-[var(--text-subtle)]">Keine verknüpft</span>
                )}
              </p>
            </div>
          </div>
          {onOpenBookingLink ? (
            <button
              type="button"
              onClick={onOpenBookingLink}
              className="shrink-0 self-start text-sm font-medium text-[var(--accent)] hover:underline lg:self-center"
            >
              Kunde anpassen
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
