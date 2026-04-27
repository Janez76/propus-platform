import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import type { Order } from "../../api/orders";
import { SidePanel } from "../handoff/SidePanel";
import { StatusChip } from "../handoff/StatusChip";
import { t, type Lang } from "../../i18n";
import { formatDateTime, formatCurrency } from "../../lib/utils";

type Tab = "overview" | "services" | "customer" | "history";

const TAB_LABEL: Record<Tab, string> = {
  overview: "Übersicht",
  services: "Leistungen",
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-soft,transparent)] p-3">
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
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");

  if (!open) return null;
  if (!order) return null;

  const orderNo = order.orderNo;
  const pkg = order.services?.package?.label ?? "—";
  const photographer = order.photographer?.name ?? "—";
  const termin = order.appointmentDate ? formatDateTime(order.appointmentDate) : "—";
  const addr = nonEmpty(order.address, order.customerStreet, order.customerZipcity) || "—";
  const total = fmtMoney(order.total ?? order.pricing?.total);

  const obj = order.object;

  return (
    <SidePanel
      open={open}
      title={`Bestellung #${orderNo}`}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {tr(lang, "common.close", "Schliessen")}
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => {
              navigate(`/orders/${encodeURIComponent(orderNo)}`);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {tr(lang, "orders.sidePanel.fullView", "Volle Ansicht")}
          </button>
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusChip status={order.status} />
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
      </div>

      {tab === "overview" && (
        <div className="space-y-3">
          <Section title={tr(lang, "orders.sidePanel.section.customer", "Kunde")}>
            <Row icon={<User className="h-4 w-4" />}>
              <strong className="font-semibold">
                {order.customerName || tr(lang, "orders.unknownCustomer", "Kunde unbekannt")}
              </strong>
              {order.customerEmail ? (
                <div className="text-xs text-[var(--text-subtle)]">{order.customerEmail}</div>
              ) : null}
              {order.customerPhone ? (
                <div className="text-xs text-[var(--text-subtle)]">{order.customerPhone}</div>
              ) : null}
            </Row>
          </Section>

          <Section title={tr(lang, "orders.sidePanel.section.appointment", "Termin & Adresse")}>
            <Row icon={<Calendar className="h-4 w-4" />}>{termin}</Row>
            {order.schedule?.durationMin ? (
              <Row icon={<Clock className="h-4 w-4" />}>
                {order.schedule.durationMin} Min.
              </Row>
            ) : null}
            <Row icon={<MapPin className="h-4 w-4" />}>{addr}</Row>
            <Row icon={<User className="h-4 w-4" />}>
              <span className="text-[var(--text-subtle)]">
                {tr(lang, "orders.sidePanel.photographer", "Fotograf")}:{" "}
              </span>
              {photographer}
            </Row>
          </Section>

          <Section title={tr(lang, "orders.sidePanel.section.object", "Objekt")}>
            <Row icon={<ImageIcon className="h-4 w-4" />}>
              {order.listingTitle || order.listingSlug || "—"}
            </Row>
            {obj?.type ? (
              <Row icon={<Home className="h-4 w-4" />}>{obj.type}</Row>
            ) : null}
            <div className="flex flex-wrap gap-3 text-xs text-[var(--text-subtle)]">
              {obj?.area ? (
                <span className="inline-flex items-center gap-1">
                  <Ruler className="h-3.5 w-3.5" /> {obj.area} m²
                </span>
              ) : null}
              {obj?.rooms ? (
                <span className="inline-flex items-center gap-1">
                  <DoorOpen className="h-3.5 w-3.5" />{" "}
                  {obj.rooms} {tr(lang, "orders.sidePanel.rooms", "Zimmer")}
                </span>
              ) : null}
              {obj?.floors ? (
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />{" "}
                  {obj.floors} {tr(lang, "orders.sidePanel.floors", "Etagen")}
                </span>
              ) : null}
            </div>
            {obj?.desc ? (
              <Row icon={<StickyNote className="h-4 w-4" />}>{obj.desc}</Row>
            ) : null}
          </Section>

          <Section title={tr(lang, "orders.sidePanel.section.summary", "Zusammenfassung")}>
            <Row icon={<Package className="h-4 w-4" />}>{pkg}</Row>
            {order.pricing?.subtotal != null ? (
              <KeyVal k={tr(lang, "orders.sidePanel.subtotal", "Zwischensumme")} v={fmtMoney(order.pricing.subtotal)} />
            ) : null}
            {order.pricing?.discount ? (
              <KeyVal k={tr(lang, "orders.sidePanel.discount", "Rabatt")} v={`- ${fmtMoney(order.pricing.discount)}`} />
            ) : null}
            {order.pricing?.vat != null ? (
              <KeyVal k={tr(lang, "orders.sidePanel.vat", "MwSt.")} v={fmtMoney(order.pricing.vat)} />
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
        </div>
      )}

      {tab === "services" && (
        <div className="space-y-3">
          <Section title={tr(lang, "orders.sidePanel.section.package", "Paket")}>
            <div className="flex justify-between gap-2 text-sm">
              <span className="font-medium">{order.services?.package?.label ?? "—"}</span>
              <span>{fmtMoney(order.services?.package?.price)}</span>
            </div>
          </Section>

          <Section title={tr(lang, "orders.sidePanel.section.addons", "Zusatzleistungen")}>
            {order.services?.addons && order.services.addons.length > 0 ? (
              <ul className="m-0 list-none space-y-1.5 p-0 text-sm">
                {order.services.addons.map((a) => (
                  <li key={a.id ?? a.label} className="flex justify-between gap-2">
                    <span className="text-[var(--text-main)]">{a.label}</span>
                    <span>{fmtMoney(a.price)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-[var(--text-subtle)]">
                {tr(lang, "orders.sidePanel.noAddons", "Keine Zusatzleistungen.")}
              </p>
            )}
          </Section>

          <Section title={tr(lang, "orders.sidePanel.section.pricing", "Preisübersicht")}>
            <KeyVal
              k={tr(lang, "orders.sidePanel.subtotal", "Zwischensumme")}
              v={fmtMoney(order.pricing?.subtotal)}
            />
            <KeyVal
              k={tr(lang, "orders.sidePanel.discount", "Rabatt")}
              v={order.pricing?.discount ? `- ${fmtMoney(order.pricing.discount)}` : "—"}
            />
            <KeyVal
              k={tr(lang, "orders.sidePanel.vat", "MwSt.")}
              v={fmtMoney(order.pricing?.vat)}
            />
            <div className="mt-1 flex justify-between border-t border-[var(--border-soft)] pt-2 text-base font-semibold text-[var(--gold-700)]">
              <span>Total</span>
              <span>{total}</span>
            </div>
          </Section>
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
                {nonEmpty(order.billing?.email, order.customerEmail)}
              </Row>
            ) : null}
            {nonEmpty(order.billing?.phone, order.billing?.phone_mobile, order.customerPhone) ? (
              <Row icon={<Phone className="h-4 w-4" />}>
                {nonEmpty(order.billing?.phone, order.billing?.phone_mobile, order.customerPhone)}
              </Row>
            ) : null}
          </Section>

          <Section title={tr(lang, "orders.sidePanel.section.billingAddress", "Rechnungsadresse")}>
            <Row icon={<MapPin className="h-4 w-4" />}>
              {nonEmpty(
                order.billing?.street,
                order.customerStreet,
              ) || "—"}
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

          {order.billing?.alt_company || order.billing?.alt_name || order.billing?.alt_email ? (
            <Section title={tr(lang, "orders.sidePanel.section.altContact", "Abweichender Kontakt")}>
              <Row icon={<User className="h-4 w-4" />}>
                {nonEmpty(order.billing?.alt_company, order.billing?.alt_name) || "—"}
              </Row>
              {order.billing?.alt_email ? (
                <Row icon={<Mail className="h-4 w-4" />}>{order.billing.alt_email}</Row>
              ) : null}
              {order.billing?.alt_phone || order.billing?.alt_phone_mobile ? (
                <Row icon={<Phone className="h-4 w-4" />}>
                  {nonEmpty(order.billing?.alt_phone, order.billing?.alt_phone_mobile)}
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
              {order.pauseReason ? (
                <HistoryItem
                  icon={<PauseCircle className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.paused", "Pausiert")}
                  detail={order.pauseReason}
                />
              ) : null}
              {order.cancelReason ? (
                <HistoryItem
                  icon={<AlertTriangle className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.cancelled", "Storniert")}
                  detail={order.cancelReason}
                />
              ) : null}
              {order.reviewRequestSentAt ? (
                <HistoryItem
                  icon={<Mail className="h-4 w-4" />}
                  label={tr(lang, "orders.sidePanel.event.reviewSent", "Bewertungsanfrage gesendet")}
                  when={order.reviewRequestSentAt}
                  detail={
                    order.reviewRequestCount
                      ? `${order.reviewRequestCount}×`
                      : null
                  }
                />
              ) : null}
              {!order.provisionalBookedAt &&
              !order.confirmationPendingSince &&
              !order.doneAt &&
              !order.closedAt &&
              !order.pauseReason &&
              !order.cancelReason &&
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
              {order.exxasOrderNumber ? (
                <KeyVal k="Nr." v={order.exxasOrderNumber} />
              ) : null}
              {order.exxasStatus ? (
                <KeyVal k="Status" v={order.exxasStatus} />
              ) : null}
              {order.exxasError ? (
                <Row icon={<AlertTriangle className="h-4 w-4 text-[var(--danger,#c0392b)]" />}>
                  <span className="text-[var(--danger,#c0392b)]">{order.exxasError}</span>
                </Row>
              ) : null}
            </Section>
          ) : null}

          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1.5 text-xs"
            onClick={() => navigate(`/orders/${encodeURIComponent(orderNo)}`)}
          >
            <Link2 className="h-3.5 w-3.5" />
            {tr(lang, "orders.sidePanel.openFullHistory", "Vollständige Historie öffnen")}
          </button>
        </div>
      )}
    </SidePanel>
  );
}
