import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Home,
  Layers,
  Mail,
  MapPin,
  MoreHorizontal,
  PauseCircle,
  Phone,
  Ruler,
  SlidersHorizontal,
  Star,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { deleteOrder, updateOrderStatus, type Order } from "../../api/orders";
import { t, type Lang } from "../../i18n";
import { formatDateTime, formatCurrency } from "../../lib/utils";
import { normalizeStatusKey, type StatusKey } from "../../lib/status";
import { orderNextStep, type NextStepAction } from "../../lib/orderNextStep";
import "../../styles/orders-page.css";

function tr(lang: Lang, key: string, fallback: string): string {
  const v = t(lang, key);
  return v === key ? fallback : v;
}

function fmtMoney(v?: number | null): string {
  return v != null ? formatCurrency(v) : "—";
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

type Tone = "open" | "confirmed" | "paused" | "done" | "cancelled" | "invoice" | "meta";

function statusPill(key: StatusKey | null, lang: Lang): { label: string; tone: Tone } | null {
  switch (key) {
    case "pending":
    case "provisional":
    case "disposition_offen":
      return { label: tr(lang, "orders.chip.open", "Ausstehend"), tone: "open" };
    case "confirmed":
      return { label: tr(lang, "orders.chip.confirmed", "Bestätigt"), tone: "confirmed" };
    case "paused":
      return { label: tr(lang, "orders.chip.paused", "Wartet auf Kunde"), tone: "paused" };
    case "completed":
      return { label: tr(lang, "orders.chip.material", "Material in Bearbeitung"), tone: "confirmed" };
    case "done":
      return { label: tr(lang, "orders.section.event.done", "Erledigt"), tone: "done" };
    case "cancelled":
      return { label: tr(lang, "orders.chip.cancelled", "Storniert"), tone: "cancelled" };
    case "archived":
      return { label: tr(lang, "orders.chip.archived", "Archiviert"), tone: "done" };
    default:
      return null;
  }
}

const ACTION_ICON: Record<NextStepAction, React.ReactNode> = {
  schedule: <CalendarClock />,
  photographer: <UserPlus />,
  confirm: <CheckCircle2 />,
  invoice: <FileText />,
  deliver: <CheckCircle2 />,
  none: null,
};

type TLEvent = {
  key: string;
  icon: React.ReactNode;
  label: string;
  when?: string | null;
  tone?: "warn" | "danger";
};

function buildTimeline(order: Order, lang: Lang): TLEvent[] {
  const statusKey = normalizeStatusKey(order.status);
  const ev: TLEvent[] = [];
  if (order.provisionalBookedAt)
    ev.push({
      key: "provisional",
      icon: <Calendar />,
      label: tr(lang, "orders.sidePanel.event.provisional", "Provisorisch gebucht"),
      when: order.provisionalBookedAt,
    });
  if (order.appointmentDate)
    ev.push({
      key: "appointment",
      icon: <CalendarCheck />,
      label: tr(lang, "orders.sidePanel.event.appointment", "Termin bestätigt"),
      when: order.appointmentDate,
    });
  if (order.reviewRequestSentAt)
    ev.push({
      key: "review",
      icon: <Mail />,
      label: tr(lang, "orders.sidePanel.event.reviewSent", "Bewertungsanfrage gesendet"),
      when: order.reviewRequestSentAt,
    });
  if (order.doneAt)
    ev.push({
      key: "done",
      icon: <CheckCircle2 />,
      label: tr(lang, "orders.sidePanel.event.done", "Erledigt"),
      when: order.doneAt,
    });
  if (order.closedAt)
    ev.push({
      key: "closed",
      icon: <CheckCircle2 />,
      label: tr(lang, "orders.sidePanel.event.closed", "Abgeschlossen"),
      when: order.closedAt,
    });
  if (statusKey === "paused")
    ev.push({
      key: "paused",
      icon: <PauseCircle />,
      label: tr(lang, "orders.sidePanel.event.paused", "Pausiert"),
      tone: "warn",
    });
  if (statusKey === "cancelled")
    ev.push({
      key: "cancelled",
      icon: <AlertTriangle />,
      label: tr(lang, "orders.sidePanel.event.cancelled", "Storniert"),
      tone: "danger",
    });
  const ts = (v?: string | null) => {
    if (!v) return Number.POSITIVE_INFINITY;
    const n = new Date(v).getTime();
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  return ev.sort((a, b) => ts(b.when) - ts(a.when));
}

export function OrderSidePanel({
  open,
  order,
  onClose,
  lang,
  token,
  onChanged,
}: {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  lang: Lang;
  token?: string | null;
  onChanged?: () => void | Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<"delete" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmType) setConfirmType(null);
        else if (menuOpen) setMenuOpen(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, confirmType, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: globalThis.MouseEvent) {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Reset transient state when the panel re-opens for a different order.
  useEffect(() => {
    setMenuOpen(false);
    setConfirmType(null);
    setBusy(false);
  }, [order?.orderNo]);

  async function handleDelete() {
    if (!token || !order || busy) return;
    setBusy(true);
    try {
      await deleteOrder(token, order.orderNo);
      await onChanged?.();
      setConfirmType(null);
      onClose();
    } catch {
      // Error stays visible until the user retries / closes.
    } finally {
      setBusy(false);
    }
  }
  async function handleCancel() {
    if (!token || !order || busy) return;
    setBusy(true);
    try {
      await updateOrderStatus(token, order.orderNo, "cancelled", {
        sendEmails: true,
        sendEmailTargets: { customer: true, office: false, photographer: true, cc: false },
      });
      await onChanged?.();
      setConfirmType(null);
    } catch {
      /* leave dialog open */
    } finally {
      setBusy(false);
    }
  }
  async function handleSetStatus(next: StatusKey) {
    if (!token || !order || busy) return;
    const current = normalizeStatusKey(order.status);
    if (current === next) return;
    setBusy(true);
    try {
      await updateOrderStatus(token, order.orderNo, next, { sendEmails: false });
      await onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  if (!open || !order) return null;

  const orderNo = order.orderNo;
  const fullOrderHref = `/orders/${encodeURIComponent(orderNo)}`;
  const statusKey = normalizeStatusKey(order.status);
  const pill = statusPill(statusKey, lang);
  // "completed" maps to "Material in Bearbeitung" (still in production),
  // so the "Rechnung offen" pill must only show for truly finished orders.
  const isDone = statusKey === "done" || statusKey === "archived";
  const invoiceOpen = isDone && !order.bexioOrderNumber;

  const photographerName = order.photographer?.name?.trim() || "";
  const photographerKey = order.photographer?.key?.trim() || "";
  const hasPhotographer = Boolean(photographerName || photographerKey);

  const termin = order.appointmentDate ? formatDateTime(order.appointmentDate) : "";
  const terminWeekday = order.appointmentDate
    ? new Date(order.appointmentDate).toLocaleDateString("de-DE", { weekday: "long" })
    : "";
  const street = order.address || order.customerStreet || "";
  const cityLine = order.customerZipcity || "";
  const fullAddr = [street, cityLine].filter(Boolean).join(", ");
  const mapsHref = fullAddr
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}`
    : null;

  const company = order.billing?.company?.trim() || "";
  const displayName = company || order.customerName?.trim() || tr(lang, "orders.unknownCustomer", "Kunde unbekannt");
  const subName = company && order.customerName && order.customerName !== company ? order.customerName : "";
  const initialsText = initials(displayName);

  const total = fmtMoney(order.total ?? order.pricing?.total);
  const pkgLabel = order.services?.package?.label ?? "";
  const addons = order.services?.addons ?? [];
  const subtotal = order.pricing?.subtotal;
  const vat = order.pricing?.vat;

  const obj = order.object;
  const objHasData = !!(
    order.listingTitle ||
    order.listingSlug ||
    obj?.type ||
    obj?.area ||
    obj?.rooms ||
    obj?.floors
  );

  const timeline = buildTimeline(order, lang);
  const next = orderNextStep(order);

  return (
    <>
      <button type="button" className="osp-overlay" aria-label="Close panel" onClick={onClose} />
      <aside className="osp-panel" role="dialog" aria-modal="true" aria-label={`Bestellung #${orderNo}`}>
        {/* Header */}
        <div className="osp-header">
          <div className="osp-header-top">
            <div className="osp-title-block">
              <span className="osp-title-label">{tr(lang, "orders.sidePanel.titleLabel", "Bestellung")}</span>
              <span className="osp-title">#{orderNo}</span>
            </div>
            <div className="osp-header-actions">
              <div className="osp-menu-wrap" ref={menuRef}>
                <button
                  type="button"
                  className="osp-icon-btn"
                  title="Mehr"
                  aria-label="Mehr"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <MoreHorizontal />
                </button>
                {menuOpen ? (
                  <div className="osp-menu" role="menu">
                    {statusKey !== "cancelled" ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="osp-menu-item is-warn"
                        onClick={() => { setMenuOpen(false); setConfirmType("cancel"); }}
                      >
                        <Ban /> <span>Stornieren</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="osp-menu-item is-danger"
                      onClick={() => { setMenuOpen(false); setConfirmType("delete"); }}
                    >
                      <Trash2 /> <span>Löschen</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <button type="button" className="osp-icon-btn" title="Schliessen" aria-label="Schliessen" onClick={onClose}>
                <X />
              </button>
            </div>
          </div>
          <div className="osp-status-row">
            {pill ? (
              <span className="osp-status-pill" data-tone={pill.tone}>
                <span className="osp-dot" /> {pill.label}
              </span>
            ) : null}
            {invoiceOpen ? (
              <span className="osp-status-pill" data-tone="invoice">
                <span className="osp-dot" /> {tr(lang, "orders.sidePanel.invoiceOpen", "Rechnung offen")}
              </span>
            ) : null}
            {order.exxasOrderNumber ? (
              <span className="osp-status-pill" data-tone="meta">
                <span className="osp-meta-label">Exxas</span> #{order.exxasOrderNumber}
              </span>
            ) : null}
            {order.bexioOrderNumber ? (
              <span className="osp-status-pill" data-tone="meta">
                <span className="osp-meta-label">bexio</span> #{order.bexioOrderNumber}
              </span>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div className="osp-body">
          {/* Kunde */}
          <div className="osp-card">
            <div className="osp-card-header">
              <span className="osp-card-title">{tr(lang, "orders.sidePanel.section.customer", "Kunde")}</span>
              <a href={fullOrderHref} className="osp-card-action">
                {tr(lang, "orders.sidePanel.profile", "Profil")} <ArrowRight />
              </a>
            </div>
            <div className="osp-customer-row">
              <span className="osp-customer-avatar">{initialsText}</span>
              <div className="osp-customer-info">
                <div className="osp-customer-name">{displayName}</div>
                {(subName || order.customerEmail || order.customerPhone) ? (
                  <div className="osp-customer-contact">
                    {subName ? <span className="osp-contact-chip">{subName}</span> : null}
                    {order.customerEmail ? (
                      <a className="osp-contact-chip" href={`mailto:${order.customerEmail}`}>
                        <Mail /> {order.customerEmail}
                      </a>
                    ) : null}
                    {order.customerPhone ? (
                      <a className="osp-contact-chip" href={`tel:${order.customerPhone.replace(/\s+/g, "")}`}>
                        <Phone /> {order.customerPhone}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Termin & Adresse */}
          <div className="osp-card">
            <div className="osp-card-header">
              <span className="osp-card-title">{tr(lang, "orders.sidePanel.section.appointment", "Termin & Adresse")}</span>
            </div>
            <div className="osp-list-row" data-tone="blue">
              <span className="osp-lr-icon"><Calendar /></span>
              <div className="osp-lr-content">
                <div className="osp-lr-main">
                  {termin || tr(lang, "orders.sidePanel.noAppointment", "Noch kein Termin")}
                </div>
                {terminWeekday || order.schedule?.durationMin ? (
                  <div className="osp-lr-sub">
                    {[
                      terminWeekday,
                      order.schedule?.durationMin ? `Dauer ${order.schedule.durationMin} Min.` : null,
                    ].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="osp-list-row">
              <span className="osp-lr-icon"><MapPin /></span>
              <div className="osp-lr-content">
                <div className="osp-lr-main">{street || tr(lang, "orders.sidePanel.noAddress", "Keine Adresse")}</div>
                {cityLine ? <div className="osp-lr-sub">{cityLine}</div> : null}
              </div>
              {mapsHref ? (
                <div className="osp-lr-trail">
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                    {tr(lang, "orders.sidePanel.map", "Karte")} <ExternalLink />
                  </a>
                </div>
              ) : null}
            </div>
            <div className="osp-list-row" data-tone="orange">
              <span className="osp-lr-icon"><Camera /></span>
              <div className="osp-lr-content">
                <div className="osp-lr-main">
                  {hasPhotographer
                    ? (photographerName || photographerKey)
                    : tr(lang, "orders.sidePanel.noPhotographer", "Noch kein Fotograf zugewiesen")}
                </div>
                <div className="osp-lr-sub">
                  {hasPhotographer
                    ? tr(lang, "orders.sidePanel.photographerAssigned", "Fotograf zugewiesen")
                    : tr(lang, "orders.sidePanel.photographerHint", "Bitte zuweisen")}
                </div>
              </div>
              {!hasPhotographer ? (
                <div className="osp-lr-trail">
                  <a href={`${fullOrderHref}#photographer`}>
                    {tr(lang, "orders.sidePanel.assign", "Zuweisen")} <ArrowRight />
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          {/* Status setter — aufklappbares Dropdown, damit das Side-Panel
              nicht durch die 5-Buttons-Liste ueberlauft und nichts
              abgeschnitten wird. */}
          <StatusDropdown
            currentStatus={statusKey}
            disabled={busy || !token}
            onSelect={(target) => void handleSetStatus(target)}
          />

          {/* Objekt */}
          {objHasData ? (
            <div className="osp-card">
              <div className="osp-card-header">
                <span className="osp-card-title">{tr(lang, "orders.sidePanel.section.object", "Objekt")}</span>
              </div>
              {(order.listingTitle || order.listingSlug || obj?.type) ? (
                <div className="osp-list-row">
                  <span className="osp-lr-icon"><Home /></span>
                  <div className="osp-lr-content">
                    <div className="osp-lr-main">{order.listingTitle || obj?.type || order.listingSlug}</div>
                    {obj?.desc ? <div className="osp-lr-sub">{obj.desc}</div> : null}
                  </div>
                </div>
              ) : null}
              {obj?.area || obj?.rooms || obj?.floors || order.schedule?.durationMin ? (
                <div className="osp-meta-row">
                  {obj?.area ? (
                    <span className="osp-meta-chip">
                      <Ruler /> <strong>{obj.area}</strong> m²
                    </span>
                  ) : null}
                  {obj?.floors ? (
                    <span className="osp-meta-chip">
                      <Layers /> <strong>{obj.floors}</strong> {tr(lang, "orders.sidePanel.floors", "Etagen")}
                    </span>
                  ) : null}
                  {order.schedule?.durationMin ? (
                    <span className="osp-meta-chip">
                      <Clock /> {order.schedule.durationMin} Min.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Zusammenfassung */}
          <div className="osp-card">
            <div className="osp-card-header">
              <span className="osp-card-title">{tr(lang, "orders.sidePanel.section.summary", "Zusammenfassung")}</span>
              <a href={fullOrderHref} className="osp-card-action">
                {tr(lang, "orders.sidePanel.details", "Details")} <ArrowRight />
              </a>
            </div>
            <div className="osp-summary-rows">
              {pkgLabel ? (
                <div className="osp-sum-row">
                  <span className="osp-sum-label">
                    <span className="osp-sum-bullet"><Star /></span>
                    {pkgLabel}
                  </span>
                  <span className="osp-sum-value">{fmtMoney(order.services?.package?.price ?? null)}</span>
                </div>
              ) : null}
              {addons.map((a) => (
                <div key={a.id ?? a.label} className="osp-sum-row is-muted">
                  <span className="osp-sum-label" style={{ paddingLeft: 28 }}>+ {a.label}</span>
                  <span className="osp-sum-value">{fmtMoney(a.price ?? null)}</span>
                </div>
              ))}
              {subtotal != null ? (
                <div className="osp-sum-row is-muted">
                  <span className="osp-sum-label">{tr(lang, "orders.sidePanel.subtotal", "Zwischensumme")}</span>
                  <span className="osp-sum-value">{fmtMoney(subtotal)}</span>
                </div>
              ) : null}
              {vat != null ? (
                <div className="osp-sum-row is-muted">
                  <span className="osp-sum-label">{tr(lang, "orders.sidePanel.vat", "MwSt.")}</span>
                  <span className="osp-sum-value">{fmtMoney(vat)}</span>
                </div>
              ) : null}
              <div className="osp-sum-row is-total">
                <span className="osp-sum-label">Total</span>
                <span className="osp-sum-value">{total}</span>
              </div>
            </div>
          </div>

          {/* Letzte Ereignisse */}
          {timeline.length > 0 ? (
            <div className="osp-card">
              <div className="osp-card-header">
                <span className="osp-card-title">{tr(lang, "orders.sidePanel.section.lastEvents", "Letzte Ereignisse")}</span>
                <a href={fullOrderHref} className="osp-card-action">
                  {tr(lang, "orders.sidePanel.allEvents", "Alle")} <ArrowRight />
                </a>
              </div>
              <div className="osp-timeline">
                {timeline.slice(0, 3).map((e) => (
                  <div key={e.key} className="osp-timeline-item" data-tone={e.tone}>
                    <span className="osp-timeline-dot">{e.icon}</span>
                    <div className="osp-timeline-content">
                      <div className="osp-timeline-main">{e.label}</div>
                      {e.when ? <div className="osp-timeline-time">{formatDateTime(e.when)}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="osp-footer">
          {next.action !== "none" ? (
            <a href={`${fullOrderHref}${next.anchor}`} className="osp-footer-primary">
              {ACTION_ICON[next.action]}
              <span>{tr(lang, next.labelKey, next.label)}</span>
            </a>
          ) : (
            <a href={fullOrderHref} className="osp-footer-primary">
              <ExternalLink />
              <span>{tr(lang, "orders.sidePanel.fullView", "Volle Ansicht")}</span>
            </a>
          )}
          <a
            href={fullOrderHref}
            className="osp-footer-secondary"
            title={tr(lang, "orders.sidePanel.fullView", "Volle Ansicht")}
            aria-label={tr(lang, "orders.sidePanel.fullView", "Volle Ansicht")}
          >
            <ExternalLink />
          </a>
        </div>
      </aside>

      {confirmType ? (
        <div className="osp-confirm-backdrop" onClick={() => !busy && setConfirmType(null)}>
          <div className="osp-confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={`osp-confirm-icon${confirmType === "delete" ? " is-danger" : " is-warn"}`}>
              {confirmType === "delete" ? <Trash2 /> : <Ban />}
            </div>
            <h3 className="osp-confirm-title">
              {confirmType === "delete" ? "Bestellung löschen?" : "Bestellung stornieren?"}
            </h3>
            <p className="osp-confirm-text">
              {confirmType === "delete" ? (
                <>
                  Bestellung <strong>#{orderNo}</strong> wird endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                </>
              ) : (
                <>
                  Bestellung <strong>#{orderNo}</strong> wird storniert. Der Kunde
                  {order.customerEmail ? <> (<span style={{ fontFamily: "JetBrains Mono, monospace" }}>{order.customerEmail}</span>)</> : null}
                  {" "}erhält eine Storno-Mail. Der Fotograf bekommt eine Benachrichtigung.
                </>
              )}
            </p>
            <div className="osp-confirm-actions">
              <button
                type="button"
                className="osp-confirm-btn"
                disabled={busy}
                onClick={() => setConfirmType(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className={`osp-confirm-btn ${confirmType === "delete" ? "is-danger" : "is-warn"}`}
                disabled={busy}
                onClick={() => void (confirmType === "delete" ? handleDelete() : handleCancel())}
              >
                {busy ? "Bitte warten…" : confirmType === "delete" ? "Endgültig löschen" : "Stornieren + Mail senden"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type StatusOption = { id: StatusKey; label: string; tone: "open" | "confirmed" | "paused" | "done" };

const STATUS_OPTIONS: ReadonlyArray<StatusOption> = [
  { id: "pending",   label: "Ausstehend",             tone: "open" },
  { id: "confirmed", label: "Bestätigt",              tone: "confirmed" },
  { id: "paused",    label: "Wartet auf Kunde",       tone: "paused" },
  { id: "completed", label: "Material in Bearbeitung", tone: "confirmed" },
  { id: "done",      label: "Abgeschlossen",          tone: "done" },
];

function bucketOption(key: StatusKey | null): StatusOption {
  if (!key) return STATUS_OPTIONS[0];
  // provisional + disposition_offen mappen UI-seitig auf "Ausstehend",
  // archived auf "Abgeschlossen" — dieselben Buckets wie im Kanban.
  if (key === "provisional" || key === "disposition_offen") return STATUS_OPTIONS[0];
  if (key === "archived") return STATUS_OPTIONS[4];
  if (key === "cancelled") {
    return { id: "cancelled", label: "Storniert", tone: "paused" };
  }
  return STATUS_OPTIONS.find((o) => o.id === key) ?? STATUS_OPTIONS[0];
}

function StatusDropdown({
  currentStatus,
  disabled,
  onSelect,
}: {
  currentStatus: StatusKey | null;
  disabled: boolean;
  onSelect: (target: StatusKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Klick ausserhalb schliesst das Dropdown — sonst bleibt es offen, sobald
  // der User auf eine andere Card im Side-Panel klickt.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: globalThis.MouseEvent) {
      const root = wrapRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const current = bucketOption(currentStatus);

  return (
    <div className="osp-card osp-status-card" ref={wrapRef}>
      <div className="osp-card-header">
        <span className="osp-card-title">
          <SlidersHorizontal style={{ width: 11, height: 11, display: "inline-block", marginRight: 6, verticalAlign: "-1px" }} />
          Status
        </span>
      </div>
      <button
        type="button"
        className={`osp-status-trigger${open ? " is-open" : ""}`}
        data-tone={current.tone}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="osp-dot" />
        <span className="osp-status-row-label">{current.label}</span>
        <ChevronDown
          style={{
            width: 14,
            height: 14,
            marginLeft: "auto",
            transition: "transform 120ms",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {open ? (
        <div className="osp-status-menu" role="listbox">
          {STATUS_OPTIONS.map((s) => {
            const isActive = current.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`osp-status-row${isActive ? " is-active" : ""}`}
                data-tone={s.tone}
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  if (!isActive) onSelect(s.id);
                }}
              >
                <span className="osp-dot" />
                <span className="osp-status-row-label">{s.label}</span>
                {isActive ? <CheckCircle2 className="osp-status-row-check" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
