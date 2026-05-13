import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpFromLine,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Camera,
  CheckCircle2,
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
  Star,
  UserPlus,
  X,
} from "lucide-react";
import type { Order } from "../../api/orders";
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
}: {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  lang: Lang;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !order) return null;

  const orderNo = order.orderNo;
  const fullOrderHref = `/orders/${encodeURIComponent(orderNo)}`;
  const statusKey = normalizeStatusKey(order.status);
  const pill = statusPill(statusKey, lang);
  const isDone = statusKey === "done" || statusKey === "completed" || statusKey === "archived";
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
              <a
                href={fullOrderHref}
                className="osp-icon-btn"
                title={tr(lang, "orders.sidePanel.fullView", "In neuem Tab öffnen")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink />
              </a>
              <button type="button" className="osp-icon-btn" title="Mehr" aria-label="Mehr">
                <MoreHorizontal />
              </button>
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
            title={tr(lang, "orders.sidePanel.export", "Exportieren")}
            aria-label={tr(lang, "orders.sidePanel.export", "Exportieren")}
          >
            <ArrowUpFromLine />
          </a>
        </div>
      </aside>
    </>
  );
}
