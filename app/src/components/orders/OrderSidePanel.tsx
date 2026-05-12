import { useState, type ReactNode } from "react";
import {
  ExternalLink,
  User,
  Calendar,
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
  CalendarClock,
  Camera,
  SlidersHorizontal,
} from "lucide-react";
import type { Order } from "../../api/orders";
import { SidePanel } from "../handoff/SidePanel";
import { StatusChip } from "../handoff/StatusChip";
import { t, type Lang } from "../../i18n";
import { formatDateTime, formatCurrency } from "../../lib/utils";
import { normalizeStatusKey } from "../../lib/status";

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
    <div className="flex items-start gap-2">
      {icon ? (
        <span className="mt-0.5 shrink-0 text-[var(--text-subtle)]">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        {label ? (
          <div className="text-xs uppercase tracking-wide text-[var(--text-subtle)]">
            {label}
          </div>
        ) : null}
        <div className="break-words text-sm text-[var(--text-main)]">{children}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  dim,
}: {
  title: string;
  children: ReactNode;
  dim?: boolean;
}) {
  return (
    <section
      className={`rounded-md border border-[var(--border-soft)] bg-[var(--surface-soft,transparent)] p-3 ${
        dim ? "opacity-60" : ""
      }`}
    >
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
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

function ActionLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-1 rounded-md border border-[var(--border-soft)] px-2 py-2 text-[11px] font-medium text-[var(--text-subtle)] no-underline transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/8 hover:text-[var(--text-main)]"
    >
      <span>{icon}</span>
      {children}
    </a>
  );
}

function HistoryItem({
  icon,
  label,
  when,
  detail,
}: {
  icon: ReactNode;
  label: string;
  when?: string | null;
  detail?: string | null;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-[var(--text-subtle)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text-main)]">{label}</div>
        {when ? (
          <div className="text-xs text-[var(--text-subtle)]">{formatDateTime(when)}</div>
        ) : null}
        {detail ? (
          <div className="mt-0.5 text-xs text-[var(--text-subtle)]">{detail}</div>
        ) : null}
      </div>
    </li>
  );
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
  const [tab, setTab] = useState<Tab>("overview");

  if (!open) return null;
  if (!order) return null;

  const orderNo = order.orderNo;
  const fullOrderHref = `/orders/${encodeURIComponent(orderNo)}`;
  const photographer = order.photographer?.name ?? "";
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
  const isPaused = statusKey === "paused";
  const isCancelled = statusKey === "cancelled";

  const pkgLabel = order.services?.package?.label ?? "";
  const addons = order.services?.addons ?? [];
  const subtotal = order.pricing?.subtotal;
  const vat = order.pricing?.vat;
  const discount = order.pricing?.discount;

  // last 1-2 timeline events for the overview mini-history
  const miniEvents: Array<{ icon: ReactNode; label: string; when?: string | null }> = [];
  if (order.appointmentDate)
    miniEvents.push({
      icon: <Calendar className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.appointment", "Termin"),
      when: order.appointmentDate,
    });
  if (order.confirmationPendingSince)
    miniEvents.push({
      icon: <Clock className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.confirmationPending", "Bestätigung ausstehend"),
      when: order.confirmationPendingSince,
    });
  if (order.doneAt)
    miniEvents.push({
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: tr(lang, "orders.sidePanel.event.done", "Erledigt"),
      when: order.doneAt,
    });

  const headerRight = <StatusChip status={order.status} />;
  const headerBelow = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {order.calendarSyncStatus && order.calendarSyncStatus !== "none" ? (
          <span className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[11px] text-[var(--text-subtle)]">
            {tr(lang, "orders.sidePanel.calendar", "Kalender")}: {order.calendarSyncStatus}
          </span>
        ) : null}
        {order.exxasOrderNumber ? (
          <span className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[11px] text-[var(--text-subtle)]">
            Exxas #{order.exxasOrderNumber}
          </span>
        ) : null}
        {order.bexioOrderNumber ? (
          <span className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[11px] text-[var(--text-subtle)]">
            bexio #{order.bexioOrderNumber}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <ActionLink href={`${fullOrderHref}#schedule`} icon={<CalendarClock className="h-4 w-4" />}>
          {tr(lang, "orders.sidePanel.action.schedule", "Termin")}
        </ActionLink>
        <ActionLink href={`${fullOrderHref}#photographer`} icon={<Camera className="h-4 w-4" />}>
          {tr(lang, "orders.sidePanel.action.photographer", "Fotograf")}
        </ActionLink>
        <ActionLink href={`${fullOrderHref}#status`} icon={<SlidersHorizontal className="h-4 w-4" />}>
          {tr(lang, "orders.sidePanel.action.status", "Status")}
        </ActionLink>
        <ActionLink href={fullOrderHref} icon={<ExternalLink className="h-4 w-4" />}>
          {tr(lang, "orders.sidePanel.action.full", "Voll")}
        </ActionLink>
      </div>
    </div>
  );

  return (
    <SidePanel
      open={open}
      title={`Bestellung #${orderNo}`}
      onClose={onClose}
      headerRight={headerRight}
      headerBelow={headerBelow}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {tr(lang, "common.close", "Schliessen")}
          </button>
          <a
            href={fullOrderHref}
            className="btn-primary inline-flex items-center gap-1.5 no-underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {tr(lang, "orders.sidePanel.fullView", "Volle Ansicht")}
          </a>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--border-soft)] pb-2">
        {(Object.keys(TAB_LABEL) as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === k
                ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            }`}
            onClick={() => setTab(k)}
          >
            {tr(lang, `orders.sidePanel.tab.${k}`, TAB_LABEL[k])}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-3">
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
            <Row icon={<User className="h-4 w-4" />}>
              <span className="text-[var(--text-subtle)]">
                {tr(lang, "orders.sidePanel.photographer", "Fotograf")}:{" "}
              </span>
              <Val placeholder={tr(lang, "orders.sidePanel.unassigned", "nicht zugewiesen")}>
                {photographer}
              </Val>
            </Row>
          </Section>

          {objHasData ? (
            <Section title={tr(lang, "orders.sidePanel.section.object", "Objekt")}>
              <Row icon={<ImageIcon className="h-4 w-4" />}>
                {order.listingTitle || order.listingSlug || "—"}
              </Row>
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
                      <DoorOpen className="h-3.5 w-3.5" /> {obj.rooms}{" "}
                      {tr(lang, "orders.sidePanel.rooms", "Zimmer")}
                    </span>
                  ) : null}
                  {obj?.floors ? (
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" /> {obj.floors}{" "}
                      {tr(lang, "orders.sidePanel.floors", "Etagen")}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {obj?.desc ? <Row icon={<StickyNote className="h-4 w-4" />}>{obj.desc}</Row> : null}
            </Section>
          ) : null}

          <Section title={tr(lang, "orders.sidePanel.section.summary", "Zusammenfassung")}>
            <Row icon={<Package className="h-4 w-4" />}>
              <Val placeholder={tr(lang, "orders.sidePanel.noPackage", "Kein Paket gewählt")}>
                {pkgLabel}
              </Val>
            </Row>
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
            {vat != null ? (
              <KeyVal k={tr(lang, "orders.sidePanel.vat", "MwSt.")} v={fmtMoney(vat)} />
            ) : null}
            <div className="mt-1 flex justify-between border-t border-[var(--border-soft)] pt-2 text-base font-semibold text-[var(--gold-700)]">
              <span>Total</span>
              <span>{total}</span>
            </div>
          </Section>

          {order.notes ? (
            <Section title={tr(lang, "orders.sidePanel.section.notes", "Notizen")}>
              <Row icon={<StickyNote className="h-4 w-4" />}>{order.notes}</Row>
            </Section>
          ) : null}

          {miniEvents.length > 0 ? (
            <Section title={tr(lang, "orders.sidePanel.section.lastEvents", "Letzte Ereignisse")}>
              <ul className="m-0 list-none space-y-1.5 p-0 text-xs text-[var(--text-subtle)]">
                {miniEvents.slice(-2).map((e, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {e.icon}
                    <span>{e.label}</span>
                    {e.when ? <span className="opacity-70">· {formatDateTime(e.when)}</span> : null}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-2 text-xs text-[var(--accent)] hover:underline"
                onClick={() => setTab("history")}
              >
                {tr(lang, "orders.sidePanel.openFullHistory", "Vollständige Historie öffnen")} →
              </button>
            </Section>
          ) : null}
        </div>
      )}

      {tab === "customer" && (
        <div className="space-y-3">
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
              <KeyVal
                k={tr(lang, "orders.sidePanel.orderRef", "Auftrags-Ref.")}
                v={order.billing.order_ref}
              />
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
                    {c.phone ? (
                      <div className="ml-6 text-xs text-[var(--text-subtle)]">{c.phone}</div>
                    ) : null}
                    {c.email ? (
                      <div className="ml-6 text-xs text-[var(--text-subtle)]">{c.email}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {order.keyPickup && (order.keyPickup.address || order.keyPickup.notes) ? (
            <Section title={tr(lang, "orders.sidePanel.section.keyPickup", "Schlüsselübergabe")}>
              {order.keyPickup.address ? (
                <Row icon={<Key className="h-4 w-4" />}>{order.keyPickup.address}</Row>
              ) : null}
              {order.keyPickup.notes ? (
                <Row icon={<StickyNote className="h-4 w-4" />}>{order.keyPickup.notes}</Row>
              ) : null}
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
        <div className="space-y-3">
          <Section title={tr(lang, "orders.sidePanel.section.timeline", "Zeitleiste")}>
            <ul className="m-0 list-none space-y-3 p-0">
              {order.provisionalBookedAt ? (
                <HistoryItem
                  icon={<Calendar className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.provisional", "Provisorisch gebucht")}
                  when={order.provisionalBookedAt}
                  detail={
                    order.provisionalExpiresAt
                      ? `${tr(lang, "orders.sidePanel.expiresAt", "Läuft ab")}: ${formatDateTime(order.provisionalExpiresAt)}`
                      : null
                  }
                />
              ) : null}
              {order.confirmationPendingSince ? (
                <HistoryItem
                  icon={<Clock className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.confirmationPending", "Bestätigung ausstehend")}
                  when={order.confirmationPendingSince}
                />
              ) : null}
              {order.appointmentDate ? (
                <HistoryItem
                  icon={<Calendar className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.appointment", "Termin")}
                  when={order.appointmentDate}
                />
              ) : null}
              {order.lastRescheduleOldDate ? (
                <HistoryItem
                  icon={<RotateCcw className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.rescheduled", "Termin verschoben")}
                  detail={`${tr(lang, "orders.sidePanel.previousDate", "Vorher")}: ${formatDateTime(order.lastRescheduleOldDate)}${order.lastRescheduleOldTime ? ` ${order.lastRescheduleOldTime}` : ""}`}
                />
              ) : null}
              {order.doneAt ? (
                <HistoryItem
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.done", "Erledigt")}
                  when={order.doneAt}
                />
              ) : null}
              {order.closedAt ? (
                <HistoryItem
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.closed", "Abgeschlossen")}
                  when={order.closedAt}
                />
              ) : null}
              {isPaused ? (
                <HistoryItem
                  icon={<PauseCircle className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.paused", "Pausiert")}
                  detail={order.pauseReason || null}
                />
              ) : null}
              {isCancelled ? (
                <HistoryItem
                  icon={<AlertTriangle className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.cancelled", "Storniert")}
                  detail={order.cancelReason || null}
                />
              ) : null}
              {order.reviewRequestSentAt ? (
                <HistoryItem
                  icon={<Mail className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.reviewSent", "Bewertungsanfrage gesendet")}
                  when={order.reviewRequestSentAt}
                  detail={order.reviewRequestCount ? `${order.reviewRequestCount}×` : null}
                />
              ) : null}
              {!order.provisionalBookedAt &&
              !order.confirmationPendingSince &&
              !order.appointmentDate &&
              !order.doneAt &&
              !order.closedAt &&
              !isPaused &&
              !isCancelled &&
              !order.lastRescheduleOldDate &&
              !order.reviewRequestSentAt ? (
                <li className="flex items-start gap-2 text-sm text-[var(--text-subtle)]">
                  <History className="h-4 w-4 shrink-0" />
                  <span>
                    {tr(
                      lang,
                      "orders.sidePanel.historyHint",
                      "Noch keine Ereignisse – mehr Details in der vollen Bestellansicht.",
                    )}
                  </span>
                </li>
              ) : null}
            </ul>
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

          <a
            href={fullOrderHref}
            className="btn-ghost inline-flex items-center gap-1.5 text-xs no-underline"
          >
            <Link2 className="h-3.5 w-3.5" />
            {tr(lang, "orders.sidePanel.openFullHistory", "Vollständige Historie öffnen")}
          </a>
        </div>
      )}
    </SidePanel>
  );
}
