import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toursAdminPost } from "../../../../api/toursAdmin";

const MP_OPEN_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-sm " +
  "transition-colors duration-150 " +
  "hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35";

type Props = {
  tourId: string;
  customerVerified: boolean;
  confirmationRequired?: boolean;
  /** Nach erfolgreichem Speichern der Verifizierung (z. B. Tour neu laden) */
  onVerifiedSaved: () => void;
  /** my.matterport.com/show/?m=… wenn Space-ID bekannt */
  matterportShowUrl?: string | null;
  /** my.matterport.com/models/{spaceId} — direkter Workspace-Link zum Bearbeiten */
  matterportEditUrl?: string | null;
  /** Verknüpfter Kunde (canonical, customer_name oder kunde_ref) */
  linkedCustomerLabel?: string | null;
  bookingOrderNo?: number | null;
  onOpenBookingLink?: () => void;
  /** Öffnet den Kunde-anpassen-Dialog (link-exxas-customer) */
  onOpenCustomerLink?: () => void;
};

/**
 * Bestellungs-Verknüpfung und Kurzaktion (z. B. Kunde/Bestellung anpassen).
 */
export function TourInternSection({
  tourId,
  customerVerified,
  confirmationRequired = false,
  onVerifiedSaved,
  matterportShowUrl,
  matterportEditUrl,
  linkedCustomerLabel,
  bookingOrderNo,
  onOpenBookingLink,
  onOpenCustomerLink,
}: Props) {
  const [verified, setVerified] = useState(customerVerified);
  const [verBusy, setVerBusy] = useState(false);
  const [verErr, setVerErr] = useState<string | null>(null);
  const [verOk, setVerOk] = useState<string | null>(null);
  const [confReq, setConfReq] = useState(confirmationRequired);
  const [confBusy, setConfBusy] = useState(false);
  const [confErr, setConfErr] = useState<string | null>(null);
  const [confOk, setConfOk] = useState<string | null>(null);

  useEffect(() => {
    setVerified(customerVerified);
  }, [customerVerified]);

  useEffect(() => {
    setConfReq(confirmationRequired);
  }, [confirmationRequired]);

  async function saveVerified() {
    setVerBusy(true);
    setVerErr(null);
    setVerOk(null);
    try {
      await toursAdminPost(`/tours/${tourId}/set-verified`, { verified });
      setVerOk("Gespeichert.");
      onVerifiedSaved();
    } catch (e) {
      setVerErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setVerBusy(false);
    }
  }

  async function saveConfirmationRequired() {
    setConfBusy(true);
    setConfErr(null);
    setConfOk(null);
    try {
      await toursAdminPost(`/tours/${tourId}/set-confirmation-required`, { required: confReq });
      setConfOk("Gespeichert.");
      onVerifiedSaved();
    } catch (e) {
      setConfErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setConfBusy(false);
    }
  }

  const customerOk = Boolean(linkedCustomerLabel?.trim());
  const orderOk = bookingOrderNo != null;
  const summaryDashed = !customerOk && !orderOk;

  return (
    <div className="space-y-3">
      {matterportEditUrl ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <a
              href={matterportEditUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={MP_OPEN_BTN}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              Direkt in Matterport bearbeiten
            </a>
          </div>
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
            Öffnet den Matterport-Workspace direkt im neuen Tab — zum Bearbeiten, Einstellungen ändern und Space verwalten.
          </p>
        </div>
      ) : matterportShowUrl ? (
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
              {orderOk ? (
                <p className="mt-1 text-sm font-medium text-[var(--text-main)]">#{bookingOrderNo}</p>
              ) : (
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                  <span className="text-sm font-normal text-[var(--text-subtle)]">Keine verknüpft</span>
                  {onOpenBookingLink ? (
                    <button
                      type="button"
                      onClick={onOpenBookingLink}
                      className="w-fit rounded-lg border border-[var(--accent)]/45 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                    >
                      Jetzt verknüpfen
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          {onOpenCustomerLink ? (
            <button
              type="button"
              onClick={onOpenCustomerLink}
              className="shrink-0 self-start text-sm font-medium text-[var(--accent)] hover:underline lg:self-center"
            >
              Kunde anpassen
            </button>
          ) : null}
          {onOpenBookingLink && orderOk ? (
            <button
              type="button"
              onClick={onOpenBookingLink}
              className="shrink-0 self-start text-sm font-medium text-[var(--text-subtle)] hover:underline hover:text-[var(--accent)] lg:self-center"
            >
              Bestellung verknüpfen
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
          Kundenverifizierung
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
            disabled={verBusy}
          />
          Kunde verifiziert
        </label>
        <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
          Internes Kennzeichen, z. B. wenn Identität oder Auftrag schriftlich bestätigt wurde — steuert keine
          Matterport-Funktion, hilft im Team bei der Einordnung der Tour.
        </p>
        {verOk ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{verOk}</p> : null}
        {verErr ? <p className="text-sm text-red-600 dark:text-red-400">{verErr}</p> : null}
        <button
          type="button"
          disabled={verBusy}
          onClick={() => void saveVerified()}
          className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
        >
          {verBusy ? "…" : "Verifizierung speichern"}
        </button>
      </div>

      <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
          Bereinigungslauf
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
          <input
            type="checkbox"
            checked={confReq}
            onChange={(e) => setConfReq(e.target.checked)}
            disabled={confBusy}
          />
          Bestätigung erforderlich
        </label>
        <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
          Markiert die Tour für den manuellen Bestätigungs-Dry-Run unter{" "}
          <span className="font-medium text-[var(--text-main)]">Workflow-Einstellungen → Bereinigungslauf</span>.
        </p>
        {confOk ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{confOk}</p> : null}
        {confErr ? <p className="text-sm text-red-600 dark:text-red-400">{confErr}</p> : null}
        <button
          type="button"
          disabled={confBusy}
          onClick={() => void saveConfirmationRequired()}
          className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] disabled:opacity-50"
        >
          {confBusy ? "…" : "Speichern"}
        </button>
      </div>
    </div>
  );
}
