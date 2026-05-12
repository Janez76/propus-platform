import { useState, type ReactNode } from "react";
import {
  ExternalLink,
  User,
  Calendar,
  CalendarClock,
  Camera,
  SlidersHorizontal,
  MapPin,
  Package,
  Image as ImageIcon,
  History,
  Phone,
  Mail,
  Clock,
  Home,
  Ruler,
  Layers,
  DoorOpen,
  StickyNote,
  Lock,
  Key,
  Users,
  AlertTriangle,
  PauseCircle,
  CheckCircle2,
  RotateCcw,
  Link2,
  ArrowRight,
  Receipt,
  UserPlus,
} from "lucide-react";
import type { Order } from "../../api/orders";
import { SidePanel } from "../handoff/SidePanel";
import { StatusChip } from "../handoff/StatusChip";
import { t, type Lang } from "../../i18n";
import { formatDateTime, formatCurrency } from "../../lib/utils";
import { normalizeStatusKey } from "../../lib/status";
import { orderNextStep, type NextStepAction } from "../../lib/orderNextStep";

/** Display serif used for headline numbers — matches the cockpit/sidebar styling. */
const SERIF = '"DM Serif Display", "Source Serif 4", Georgia, serif';

type Tab = "overview" | "customer" | "history";

const TAB_LABEL: Record<Tab, string> = {
  overview: "Übersicht",
  customer: "Kunde",
  history: "Verlauf",
};

function tr(lang: Lang, key: string, fallback: string): string {
  const v = t(lang, key);
  return v === key ? fallback : v;
}

function fmtMoney(v?: number | null): string {
  return v != null ? formatCurrency(v) : "—";
}

function nonEmpty(...vals: Array<string | number | null | undefined>): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

/** Renders a value, or a dimmed placeholder when empty. */
function Val({ children, placeholder }: { children?: ReactNode; placeholder: string }) {
  const empty =
    children == null ||
    children === "" ||
    children === "—" ||
    (typeof children === "string" && !children.trim());
  if (empty) return <span className="italic text-[var(--text-subtle)] opacity-70">{placeholder}</span>;
  return <>{children}</>;
}

function Row({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {icon ? (
        <span className="mt-0.5 shrink-0 text-[var(--text-subtle)]">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        {label ? (
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
            {label}
          </div>
        ) : null}
        <div className="break-words text-sm text-[var(--text-main)]">{children}</div>
      </div>
    </div>
  );
}

/** Editorial section: a small heading with a thin gold rule, content un-boxed. */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <h4 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
          {title}
        </h4>
        <span className="h-px flex-1 bg-[var(--gold-200,var(--border-soft))]" />
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function KeyVal({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-[var(--text-subtle)]">{k}</span>
      <span className="text-right font-medium text-[var(--text-main)]">{v}</span>
    </div>
  );
}

function ActionTile({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised,transparent)] px-3 py-2.5 text-[13px] font-medium text-[var(--text-main)] no-underline transition-colors hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
    >
      <span className="shrink-0 text-[var(--text-subtle)]">{icon}</span>
      <span>{label}</span>
    </a>
  );
}

type TLEvent = {
  key: string;
  icon: ReactNode;
  label: string;
  when?: string | null;
  detail?: string | null;
  /** future/open event → drawn as a hollow dashed node */
  pending?: boolean;
  tone?: "warn" | "danger";
};

function buildTimeline(order: Order, lang: Lang): TLEvent[] {
  const statusKey = normalizeStatusKey(order.status);
  const ev: TLEvent[] = [];
  if (order.provisionalBookedAt)
    ev.push({
      key: "provisional",
      icon: <Calendar className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.provisional", "Provisorisch gebucht"),
      when: order.provisionalBookedAt,
      detail: order.provisionalExpiresAt
        ? `${tr(lang, "orders.sidePanel.expiresAt", "Läuft ab")}: ${formatDateTime(order.provisionalExpiresAt)}`
        : null,
    });
  if (order.confirmationPendingSince)
    ev.push({
      key: "confPending",
      icon: <Clock className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.confirmationPending", "Bestätigung ausstehend"),
      when: order.confirmationPendingSince,
    });
  if (order.lastRescheduleOldDate)
    ev.push({
      key: "resched",
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.rescheduled", "Termin verschoben"),
      detail: `${tr(lang, "orders.sidePanel.previousDate", "Vorher")}: ${formatDateTime(order.lastRescheduleOldDate)}${order.lastRescheduleOldTime ? ` ${order.lastRescheduleOldTime}` : ""}`,
    });
  if (order.appointmentDate) {
    const future = new Date(order.appointmentDate).getTime() > Date.now();
    ev.push({
      key: "appointment",
      icon: <Calendar className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.appointment", "Termin"),
      when: order.appointmentDate,
      pending: future && statusKey !== "done" && statusKey !== "completed",
    });
  }
  if (order.reviewRequestSentAt)
    ev.push({
      key: "review",
      icon: <Mail className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.reviewSent", "Bewertungsanfrage gesendet"),
      when: order.reviewRequestSentAt,
      detail: order.reviewRequestCount ? `${order.reviewRequestCount}×` : null,
    });
  if (order.doneAt)
    ev.push({
      key: "done",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.done", "Erledigt"),
      when: order.doneAt,
    });
  if (order.closedAt)
    ev.push({
      key: "closed",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.closed", "Abgeschlossen"),
      when: order.closedAt,
    });
  if (statusKey === "paused")
    ev.push({
      key: "paused",
      icon: <PauseCircle className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.paused", "Pausiert"),
      detail: order.pauseReason || null,
      tone: "warn",
    });
  if (statusKey === "cancelled")
    ev.push({
      key: "cancelled",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.cancelled", "Storniert"),
      detail: order.cancelReason || null,
      tone: "danger",
    });
  // Sort chronologically so `slice(-2)` picks the genuinely most recent events.
  // Events without a timestamp (reschedule note, paused/cancelled state) sort
  // to the end as "current" markers.
  const ts = (v?: string | null) => {
    if (!v) return Number.POSITIVE_INFINITY;
    const n = new Date(v).getTime();
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  return ev.sort((a, b) => ts(a.when) - ts(b.when));
}

const ACTION_ICON: Record<NextStepAction, ReactNode> = {
  schedule: <CalendarClock className="h-4 w-4" />,
  photographer: <UserPlus className="h-4 w-4" />,
  confirm: <CheckCircle2 className="h-4 w-4" />,
  invoice: <Receipt className="h-4 w-4" />,
  deliver: <CheckCircle2 className="h-4 w-4" />,
  none: null,
};

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
  const [tab, setTab] = useState<Tab>("overview");

  if (!open) return null;
  if (!order) return null;

  const orderNo = order.orderNo;
  const fullOrderHref = `/orders/${encodeURIComponent(orderNo)}`;
  const photographerName = order.photographer?.name?.trim() || "";
  const photographerKey = order.photographer?.key?.trim() || "";
  const hasPhotographer = Boolean(photographerName || photographerKey);
  const termin = order.appointmentDate ? formatDateTime(order.appointmentDate) : "";
  const street = nonEmpty(order.address, order.customerStreet);
  const cityLine = nonEmpty(order.customerZipcity);
  const addr = [street, cityLine].filter(Boolean).join(", ");
  const mapsHref = addr
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
    : null;
  const total = fmtMoney(order.total ?? order.pricing?.total);

  const obj = order.object;
  const objHasData = !!(
    order.listingTitle ||
    order.listingSlug ||
    obj?.type ||
    obj?.area ||
    obj?.rooms ||
    obj?.floors ||
    obj?.desc
  );
  const statusKey = normalizeStatusKey(order.status);
  const isClosed = statusKey === "done" || statusKey === "completed" || statusKey === "cancelled" || statusKey === "archived";

  const pkgLabel = order.services?.package?.label ?? "";
  const addons = order.services?.addons ?? [];
  const subtotal = order.pricing?.subtotal;
  const vat = order.pricing?.vat;
  const discount = order.pricing?.discount;

  const next = orderNextStep(order);
  const timeline = buildTimeline(order, lang);

  // ── header ────────────────────────────────────────────
  const headerRight = (
    <div className="flex items-center gap-2">
      <StatusChip status={order.status} />
      {next.action !== "none" ? (
        <span
          className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            next.tone === "warn"
              ? "bg-[color-mix(in_srgb,var(--warn,#d97706)_15%,transparent)] text-[var(--warn,#b45309)]"
              : "bg-[var(--surface-raised,transparent)] text-[var(--text-subtle)]"
          }`}
        >
          {tr(lang, next.shortKey, next.short)}
        </span>
      ) : null}
    </div>
  );

  const badges: ReactNode[] = [];
  if (order.calendarSyncStatus && order.calendarSyncStatus !== "none")
    badges.push(
      <span key="cal" className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[11px] text-[var(--text-subtle)]">
        {tr(lang, "orders.sidePanel.calendar", "Kalender")}: {order.calendarSyncStatus}
      </span>,
    );
  if (order.exxasOrderNumber)
    badges.push(
      <span key="exxas" className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[11px] text-[var(--text-subtle)]">
        Exxas #{order.exxasOrderNumber}
      </span>,
    );
  if (order.bexioOrderNumber)
    badges.push(
      <span key="bexio" className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[11px] text-[var(--text-subtle)]">
        bexio #{order.bexioOrderNumber}
      </span>,
    );
  const headerBelow = badges.length ? <div className="flex flex-wrap gap-1.5">{badges}</div> : undefined;

  // ── footer: sticky primary action adapts to the next step ──
  const footer = (
    <div className="flex w-full items-center gap-2">
      {next.action !== "none" ? (
        <>
          <a
            href={`${fullOrderHref}${next.anchor}`}
            className="btn-primary inline-flex flex-1 items-center justify-center gap-1.5 no-underline"
          >
            {ACTION_ICON[next.action]}
            {tr(lang, next.labelKey, next.label)}
          </a>
          <a
            href={fullOrderHref}
            className="btn-ghost inline-flex shrink-0 items-center gap-1.5 no-underline"
            title={tr(lang, "orders.sidePanel.fullView", "Volle Ansicht")}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </>
      ) : (
        <a
          href={fullOrderHref}
          className="btn-primary inline-flex w-full items-center justify-center gap-1.5 no-underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {tr(lang, "orders.sidePanel.fullView", "Volle Ansicht")}
        </a>
      )}
    </div>
  );

  const tabCounts: Partial<Record<Tab, number>> = { history: timeline.length || undefined };

  return (
    <SidePanel
      open={open}
      title={`Bestellung #${orderNo}`}
      onClose={onClose}
      headerRight={headerRight}
      headerBelow={headerBelow}
      footer={footer}
    >
      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border-soft)] pb-2">
        {(Object.keys(TAB_LABEL) as Tab[]).map((k) => {
          const count = tabCounts[k];
          return (
            <button
              key={k}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === k
                  ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                  : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
              }`}
              onClick={() => setTab(k)}
            >
              {tr(lang, `orders.sidePanel.tab.${k}`, TAB_LABEL[k])}
              {count ? (
                <span className="rounded-full bg-[color-mix(in_srgb,var(--text-subtle)_18%,transparent)] px-1.5 text-[10px] tabular-nums">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          {/* Quick action tiles */}
          <div className="grid grid-cols-2 gap-2">
            <ActionTile href={`${fullOrderHref}#schedule`} icon={<CalendarClock className="h-4 w-4" />} label={tr(lang, "orders.sidePanel.action.schedule", "Termin")} />
            <ActionTile href={`${fullOrderHref}#photographer`} icon={<Camera className="h-4 w-4" />} label={tr(lang, "orders.sidePanel.action.photographer", "Fotograf")} />
            <ActionTile href={`${fullOrderHref}#status`} icon={<SlidersHorizontal className="h-4 w-4" />} label={tr(lang, "orders.sidePanel.action.status", "Status")} />
            <ActionTile href={fullOrderHref} icon={<ExternalLink className="h-4 w-4" />} label={tr(lang, "orders.sidePanel.action.full", "Volle Ansicht")} />
          </div>

          <Section title={tr(lang, "orders.sidePanel.section.customer", "Kunde")}>
            <Row icon={<User className="h-4 w-4" />}>
              <strong className="font-semibold">
                {order.customerName || tr(lang, "orders.unknownCustomer", "Kunde unbekannt")}
              </strong>
              {order.customerEmail ? (
                <div className="text-xs">
                  <a href={`mailto:${order.customerEmail}`} className="text-[var(--accent)] no-underline hover:underline">
                    {order.customerEmail}
                  </a>
                </div>
              ) : null}
              {order.customerPhone ? (
                <div className="text-xs">
                  <a href={`tel:${order.customerPhone.replace(/\s+/g, "")}`} className="text-[var(--accent)] no-underline hover:underline">
                    {order.customerPhone}
                  </a>
                </div>
              ) : null}
            </Row>
          </Section>

          <Section title={tr(lang, "orders.sidePanel.section.appointment", "Termin & Adresse")}>
            <Row icon={<Calendar className="h-4 w-4" />}>
              <Val placeholder={tr(lang, "orders.sidePanel.noAppointment", "Noch kein Termin")}>
                {termin}
                {order.schedule?.durationMin ? (
                  <span className="text-[var(--text-subtle)]"> · {order.schedule.durationMin} Min.</span>
                ) : null}
              </Val>
            </Row>
            <Row icon={<MapPin className="h-4 w-4" />}>
              <Val placeholder={tr(lang, "orders.sidePanel.noAddress", "Keine Adresse")}>
                {addr ? (
                  <>
                    {addr}
                    {mapsHref ? (
                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-xs text-[var(--accent)] no-underline hover:underline"
                      >
                        {tr(lang, "orders.sidePanel.map", "Karte")} ↗
                      </a>
                    ) : null}
                  </>
                ) : null}
              </Val>
            </Row>
          </Section>

          {/* Photographer — prominent CTA when unassigned & still open */}
          <Section title={tr(lang, "orders.sidePanel.photographer", "Fotograf")}>
            {hasPhotographer ? (
              <Row icon={<Camera className="h-4 w-4" />}>{photographerName || photographerKey}</Row>
            ) : isClosed ? (
              <Row icon={<Camera className="h-4 w-4" />}>
                <span className="italic text-[var(--text-subtle)] opacity-70">
                  {tr(lang, "orders.sidePanel.unassigned", "nicht zugewiesen")}
                </span>
              </Row>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color-mix(in_srgb,var(--warn,#d97706)_35%,var(--border-soft))] bg-[color-mix(in_srgb,var(--warn,#d97706)_8%,transparent)] px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <UserPlus className="h-4 w-4 text-[var(--warn,#b45309)]" />
                  <span className="font-medium">{tr(lang, "orders.sidePanel.noPhotographer", "Noch kein Fotograf zugewiesen")}</span>
                </div>
                <a
                  href={`${fullOrderHref}#photographer`}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-[var(--primary-contrast,#1a1200)] no-underline"
                >
                  {tr(lang, "orders.sidePanel.assign", "Zuweisen")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </Section>

          {objHasData ? (
            <Section title={tr(lang, "orders.sidePanel.section.object", "Objekt")}>
              {order.listingTitle || order.listingSlug ? (
                <Row icon={<ImageIcon className="h-4 w-4" />}>{order.listingTitle || order.listingSlug}</Row>
              ) : null}
              {obj?.type ? <Row icon={<Home className="h-4 w-4" />}>{obj.type}</Row> : null}
              {obj?.area || obj?.rooms || obj?.floors ? (
                <div className="flex flex-wrap gap-3 text-xs text-[var(--text-subtle)]">
                  {obj?.area ? (
                    <span className="inline-flex items-center gap-1">
                      <Ruler className="h-3.5 w-3.5" /> {obj.area} m²
                    </span>
                  ) : null}
                  {obj?.rooms ? (
                    <span className="inline-flex items-center gap-1">
                      <DoorOpen className="h-3.5 w-3.5" /> {obj.rooms} {tr(lang, "orders.sidePanel.rooms", "Zimmer")}
                    </span>
                  ) : null}
                  {obj?.floors ? (
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" /> {obj.floors} {tr(lang, "orders.sidePanel.floors", "Etagen")}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {obj?.desc ? <Row icon={<StickyNote className="h-4 w-4" />}>{obj.desc}</Row> : null}
            </Section>
          ) : null}

          <Section title={tr(lang, "orders.sidePanel.section.summary", "Zusammenfassung")}>
            {pkgLabel || addons.length === 0 ? (
              <Row icon={<Package className="h-4 w-4" />}>
                <Val placeholder={tr(lang, "orders.sidePanel.noPackage", "Kein Paket gewählt")}>{pkgLabel}</Val>
              </Row>
            ) : null}
            {addons.length > 0 ? (
              <ul className="m-0 list-none space-y-1 p-0 text-xs text-[var(--text-subtle)]">
                {addons.map((a) => (
                  <li key={a.id ?? a.label} className="flex justify-between gap-2">
                    <span>+ {a.label}</span>
                    <span>{fmtMoney(a.price)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {subtotal != null ? (
              <KeyVal k={tr(lang, "orders.sidePanel.subtotal", "Zwischensumme")} v={fmtMoney(subtotal)} />
            ) : null}
            {discount ? (
              <KeyVal k={tr(lang, "orders.sidePanel.discount", "Rabatt")} v={`- ${fmtMoney(discount)}`} />
            ) : null}
            {vat != null ? <KeyVal k={tr(lang, "orders.sidePanel.vat", "MwSt.")} v={fmtMoney(vat)} /> : null}
            <div className="mt-2 border-y border-[var(--gold-200,var(--border-soft))] py-2.5">
              <div className="flex items-end justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)]">Total</span>
                <span className="text-[26px] leading-none text-[var(--gold-700)]" style={{ fontFamily: SERIF }}>
                  {total}
                </span>
              </div>
            </div>
          </Section>

          {order.notes ? (
            <Section title={tr(lang, "orders.sidePanel.section.notes", "Notizen")}>
              <Row icon={<StickyNote className="h-4 w-4" />}>{order.notes}</Row>
            </Section>
          ) : null}

          {timeline.length > 0 ? (
            <Section
              title={tr(lang, "orders.sidePanel.section.lastEvents", "Letzte Ereignisse")}
              action={
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-[var(--accent)] hover:underline"
                  onClick={() => setTab("history")}
                >
                  {tr(lang, "orders.sidePanel.allEvents", "Alle")} →
                </button>
              }
            >
              <ul className="m-0 list-none space-y-1.5 p-0 text-xs text-[var(--text-subtle)]">
                {timeline.slice(-2).map((e) => (
                  <li key={e.key} className="flex items-center gap-1.5">
                    {e.icon}
                    <span>{e.label}</span>
                    {e.when ? <span className="opacity-70">· {formatDateTime(e.when)}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}

      {tab === "customer" && (
        <div className="space-y-5">
          <Section title={tr(lang, "orders.sidePanel.section.contact", "Kontakt")}>
            <Row icon={<User className="h-4 w-4" />}>
              <strong className="font-semibold">
                {nonEmpty(order.billing?.company, order.billing?.name, order.customerName) ||
                  tr(lang, "orders.unknownCustomer", "Kunde unbekannt")}
              </strong>
              {order.billing?.company && order.billing?.name ? (
                <div className="text-xs text-[var(--text-subtle)]">{order.billing.name}</div>
              ) : null}
            </Row>
            {nonEmpty(order.billing?.email, order.customerEmail) ? (
              <Row icon={<Mail className="h-4 w-4" />}>
                <a
                  href={`mailto:${nonEmpty(order.billing?.email, order.customerEmail)}`}
                  className="text-[var(--accent)] no-underline hover:underline"
                >
                  {nonEmpty(order.billing?.email, order.customerEmail)}
                </a>
              </Row>
            ) : null}
            {nonEmpty(order.billing?.phone, order.billing?.phone_mobile, order.customerPhone) ? (
              <Row icon={<Phone className="h-4 w-4" />}>
                <a
                  href={`tel:${nonEmpty(order.billing?.phone, order.billing?.phone_mobile, order.customerPhone).replace(/\s+/g, "")}`}
                  className="text-[var(--accent)] no-underline hover:underline"
                >
                  {nonEmpty(order.billing?.phone, order.billing?.phone_mobile, order.customerPhone)}
                </a>
              </Row>
            ) : null}
          </Section>

          <Section title={tr(lang, "orders.sidePanel.section.billingAddress", "Rechnungsadresse")}>
            <Row icon={<MapPin className="h-4 w-4" />}>
              {nonEmpty(order.billing?.street, order.customerStreet) || "—"}
              <div className="text-xs text-[var(--text-subtle)]">
                {nonEmpty(
                  order.billing?.zipcity,
                  [order.billing?.zip, order.billing?.city].filter(Boolean).join(" "),
                  order.customerZipcity,
                ) || ""}
              </div>
            </Row>
            {order.billing?.order_ref ? (
              <KeyVal k={tr(lang, "orders.sidePanel.orderRef", "Auftrags-Ref.")} v={order.billing.order_ref} />
            ) : null}
          </Section>

          {order.billing?.alt_company ||
          order.billing?.alt_name ||
          order.billing?.alt_email ||
          order.billing?.alt_company_email ||
          order.billing?.alt_phone ||
          order.billing?.alt_phone_mobile ||
          order.billing?.alt_company_phone ||
          order.billing?.alt_street ||
          order.billing?.alt_zipcity ||
          order.billing?.alt_zip ||
          order.billing?.alt_city ? (
            <Section title={tr(lang, "orders.sidePanel.section.altContact", "Abweichender Kontakt")}>
              <Row icon={<User className="h-4 w-4" />}>
                {nonEmpty(order.billing?.alt_company, order.billing?.alt_name) || "—"}
              </Row>
              {nonEmpty(order.billing?.alt_email, order.billing?.alt_company_email) ? (
                <Row icon={<Mail className="h-4 w-4" />}>
                  {nonEmpty(order.billing?.alt_email, order.billing?.alt_company_email)}
                </Row>
              ) : null}
              {nonEmpty(
                order.billing?.alt_phone,
                order.billing?.alt_phone_mobile,
                order.billing?.alt_company_phone,
              ) ? (
                <Row icon={<Phone className="h-4 w-4" />}>
                  {nonEmpty(
                    order.billing?.alt_phone,
                    order.billing?.alt_phone_mobile,
                    order.billing?.alt_company_phone,
                  )}
                </Row>
              ) : null}
              {nonEmpty(order.billing?.alt_street, order.billing?.alt_zipcity) ? (
                <Row icon={<MapPin className="h-4 w-4" />}>
                  {order.billing?.alt_street || ""}
                  {order.billing?.alt_street && order.billing?.alt_zipcity ? <br /> : null}
                  {order.billing?.alt_zipcity || ""}
                </Row>
              ) : null}
            </Section>
          ) : null}

          {order.onsiteContacts && order.onsiteContacts.length > 0 ? (
            <Section title={tr(lang, "orders.sidePanel.section.onsite", "Vor-Ort-Kontakte")}>
              <ul className="m-0 list-none space-y-2 p-0">
                {order.onsiteContacts.map((c, idx) => (
                  <li key={idx} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-[var(--text-subtle)]" />
                      <strong>{c.name || "—"}</strong>
                    </div>
                    {c.phone ? <div className="ml-6 text-xs text-[var(--text-subtle)]">{c.phone}</div> : null}
                    {c.email ? <div className="ml-6 text-xs text-[var(--text-subtle)]">{c.email}</div> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {order.keyPickup && (order.keyPickup.address || order.keyPickup.notes) ? (
            <Section title={tr(lang, "orders.sidePanel.section.keyPickup", "Schlüsselübergabe")}>
              {order.keyPickup.address ? <Row icon={<Key className="h-4 w-4" />}>{order.keyPickup.address}</Row> : null}
              {order.keyPickup.notes ? <Row icon={<StickyNote className="h-4 w-4" />}>{order.keyPickup.notes}</Row> : null}
            </Section>
          ) : null}

          {order.internalNotes ? (
            <Section title={tr(lang, "orders.sidePanel.section.internalNotes", "Interne Notizen")}>
              <Row icon={<Lock className="h-4 w-4" />}>{order.internalNotes}</Row>
            </Section>
          ) : null}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-5">
          <Section title={tr(lang, "orders.sidePanel.section.timeline", "Zeitleiste")}>
            {timeline.length === 0 ? (
              <div className="flex items-start gap-2 text-sm text-[var(--text-subtle)]">
                <History className="h-4 w-4 shrink-0" />
                <span>
                  {tr(
                    lang,
                    "orders.sidePanel.historyHint",
                    "Noch keine Ereignisse – mehr Details in der vollen Bestellansicht.",
                  )}
                </span>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-[6px] top-1 bottom-1 w-px bg-[var(--border-soft)]" aria-hidden />
                <ol className="relative m-0 list-none space-y-4 p-0 pl-5">
                {timeline.map((e) => {
                  const dotColor =
                    e.tone === "danger"
                      ? "var(--danger,#c0392b)"
                      : e.tone === "warn"
                        ? "var(--warn,#d97706)"
                        : "var(--gold-700)";
                  return (
                    <li key={e.key} className="relative">
                      <span
                        className="absolute -left-5 top-0.5 flex h-[13px] w-[13px] items-center justify-center rounded-full"
                        style={
                          e.pending
                            ? { border: `1.5px dashed ${dotColor}`, background: "var(--surface)" }
                            : { background: dotColor, boxShadow: "0 0 0 2px var(--surface)" }
                        }
                        aria-hidden
                      />
                      <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-main)]">
                        <span className="text-[var(--text-subtle)]">{e.icon}</span>
                        {e.label}
                        {e.pending ? (
                          <span className="rounded-full bg-[color-mix(in_srgb,var(--text-subtle)_18%,transparent)] px-1.5 text-[10px] font-normal text-[var(--text-subtle)]">
                            {tr(lang, "orders.sidePanel.upcoming", "geplant")}
                          </span>
                        ) : null}
                      </div>
                      {e.when ? <div className="text-xs text-[var(--text-subtle)]">{formatDateTime(e.when)}</div> : null}
                      {e.detail ? <div className="mt-0.5 text-xs text-[var(--text-subtle)]">{e.detail}</div> : null}
                    </li>
                  );
                })}
                </ol>
              </div>
            )}
          </Section>

          {order.exxasOrderNumber || order.exxasStatus || order.exxasError ? (
            <Section title={tr(lang, "orders.sidePanel.section.exxas", "Exxas")}>
              {order.exxasOrderNumber ? <KeyVal k="Nr." v={order.exxasOrderNumber} /> : null}
              {order.exxasStatus ? <KeyVal k="Status" v={order.exxasStatus} /> : null}
              {order.exxasError ? (
                <Row icon={<AlertTriangle className="h-4 w-4 text-[var(--danger,#c0392b)]" />}>
                  <span className="text-[var(--danger,#c0392b)]">{order.exxasError}</span>
                </Row>
              ) : null}
            </Section>
          ) : null}

          {order.bexioOrderNumber || order.bexioOrderId || (order.bexioStatus && order.bexioStatus !== "not_sent") || order.bexioError ? (
            <Section title={tr(lang, "orders.sidePanel.section.bexio", "bexio")}>
              {order.bexioOrderNumber ? <KeyVal k="Nr." v={order.bexioOrderNumber} /> : null}
              {order.bexioOrderId ? <KeyVal k="ID" v={order.bexioOrderId} /> : null}
              {order.bexioStatus ? <KeyVal k="Status" v={order.bexioStatus} /> : null}
              {order.bexioOrderId ? (
                <Row>
                  <a
                    href={`https://office.bexio.com/index.php/kb_order/show/id/${encodeURIComponent(order.bexioOrderId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline"
                  >
                    {tr(lang, "orders.sidePanel.bexio.openInBexio", "In bexio öffnen")}
                  </a>
                </Row>
              ) : null}
              {order.bexioError ? (
                <Row icon={<AlertTriangle className="h-4 w-4 text-[var(--danger,#c0392b)]" />}>
                  <span className="text-[var(--danger,#c0392b)]">{order.bexioError}</span>
                </Row>
              ) : null}
            </Section>
          ) : null}

          <a href={fullOrderHref} className="btn-ghost inline-flex items-center gap-1.5 text-xs no-underline">
            <Link2 className="h-3.5 w-3.5" />
            {tr(lang, "orders.sidePanel.openFullHistory", "Vollständige Historie öffnen")}
          </a>
        </div>
      )}
    </SidePanel>
  );
}
