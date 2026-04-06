import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Search, X } from "lucide-react";
import { toursAdminPost } from "../../../../api/toursAdmin";
import {
  getToursAdminTourCustomerOrders,
  postToursAdminTourSetBookingOrder,
  type TourCustomerOrder,
} from "../../../../api/toursAdmin";

const MP_OPEN_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-sm " +
  "transition-colors duration-150 " +
  "hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35";

type Props = {
  tourId: string;
  customerVerified: boolean;
  confirmationRequired?: boolean;
  onVerifiedSaved: () => void;
  matterportShowUrl?: string | null;
  matterportEditUrl?: string | null;
  linkedCustomerLabel?: string | null;
  linkedCoreCustomerId?: number | null;
  bookingOrderNo?: number | null;
  /** Callback nach erfolgreichem Bestellverknüpfen (löst Refetch aus) */
  onBookingLinked?: () => void;
  onOpenCustomerLink?: () => void;
};

function formatOrderLabel(o: TourCustomerOrder): string {
  const parts: string[] = [`#${o.orderNo}`];
  if (o.address) parts.push(o.address);
  if (o.appointmentDate) parts.push(o.appointmentDate);
  return parts.join(" · ");
}

function filterOrders(orders: TourCustomerOrder[], q: string): TourCustomerOrder[] {
  const t = q.toLowerCase().trim();
  if (!t) return orders;
  return orders.filter((o) => {
    const hay = [String(o.orderNo), o.address ?? "", o.status ?? "", o.appointmentDate ?? ""]
      .join(" ")
      .toLowerCase();
    return hay.includes(t);
  });
}

function BookingDropdown({
  tourId,
  currentOrderNo,
  onLinked,
}: {
  tourId: string;
  currentOrderNo?: number | null;
  onLinked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<TourCustomerOrder[]>([]);
  const [needsCustomer, setNeedsCustomer] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await getToursAdminTourCustomerOrders(tourId);
      setOrders(res.orders ?? []);
      setNeedsCustomer(res.needsCustomer ?? false);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setErr(null);
    setOk(null);
    void load();
    setTimeout(() => searchRef.current?.focus(), 60);
  }

  function handleClose() {
    setOpen(false);
    setQuery("");
  }

  async function handleSelect(orderNo: number) {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await postToursAdminTourSetBookingOrder(tourId, orderNo);
      setOk(`Bestellung #${orderNo} verknüpft.`);
      setTimeout(() => {
        handleClose();
        onLinked();
      }, 700);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setBusy(false);
    }
  }

  // Schliessen bei Klick ausserhalb
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const filtered = filterOrders(orders, query);
  const hasOrder = currentOrderNo != null;

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? handleClose : handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/45 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
      >
        {hasOrder ? "Bestellung Verknüpfen" : "Bestellung Verknüpfen"}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full z-50 mt-1.5 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-3 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              Bestellung auswählen
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="text-[var(--text-subtle)] hover:text-[var(--text-main)]"
              aria-label="Schliessen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-3 py-2 border-b border-[var(--border-soft)]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suche nach Nr., Adresse, Datum…"
                className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] py-1.5 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/35"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {needsCustomer ? (
              <p className="px-3 py-4 text-sm text-[var(--text-subtle)]">
                Zuerst einen Kunden im Stamm verknüpfen (→ „Kunde anpassen").
              </p>
            ) : loading ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
              </div>
            ) : loadErr ? (
              <p className="px-3 py-4 text-sm text-red-600 dark:text-red-400">{loadErr}</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--text-subtle)]">
                {orders.length === 0 ? "Keine Bestellungen zum Kunden gefunden." : "Keine Treffer."}
              </p>
            ) : (
              <ul>
                {filtered.map((o) => {
                  const no = Number(o.orderNo);
                  const isCurrent = no === currentOrderNo;
                  return (
                    <li key={o.orderNo}>
                      <button
                        type="button"
                        disabled={busy || isCurrent}
                        onClick={() => void handleSelect(no)}
                        className={[
                          "w-full text-left px-3 py-2.5 text-sm transition-colors",
                          isCurrent
                            ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold cursor-default"
                            : "text-[var(--text-main)] hover:bg-[var(--surface-raised)] disabled:opacity-50",
                        ].join(" ")}
                      >
                        <span className="font-medium">#{o.orderNo}</span>
                        {o.address ? (
                          <span className="ml-1.5 text-[var(--text-subtle)]">{o.address}</span>
                        ) : null}
                        {o.appointmentDate ? (
                          <span className="ml-1.5 text-xs text-[var(--text-subtle)]">{o.appointmentDate}</span>
                        ) : null}
                        {isCurrent ? (
                          <span className="ml-2 text-xs font-normal opacity-70">(aktuell)</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {(err || ok) && (
            <div
              className={`border-t border-[var(--border-soft)] px-3 py-2 text-sm ${
                ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {ok ?? err}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TourInternSection({
  tourId,
  customerVerified,
  confirmationRequired = false,
  onVerifiedSaved,
  matterportShowUrl,
  matterportEditUrl,
  linkedCustomerLabel,
  linkedCoreCustomerId,
  bookingOrderNo,
  onBookingLinked,
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
  const hasCustomerId = linkedCoreCustomerId != null && linkedCoreCustomerId > 0;

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
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                {orderOk ? (
                  <p className="text-sm font-medium text-[var(--text-main)]">#{bookingOrderNo}</p>
                ) : (
                  <span className="text-sm font-normal text-[var(--text-subtle)]">Keine verknüpft</span>
                )}
                {hasCustomerId && onBookingLinked ? (
                  <BookingDropdown
                    tourId={tourId}
                    currentOrderNo={bookingOrderNo}
                    onLinked={onBookingLinked}
                  />
                ) : !hasCustomerId ? (
                  <span className="text-xs text-[var(--text-subtle)] italic">
                    Kunden verknüpfen um Bestellung auszuwählen
                  </span>
                ) : null}
              </div>
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
          Internes Kennzeichen, z. B. wenn Identität oder Auftrag schriftlich bestätigt wurde — steuert keine
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
