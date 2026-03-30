import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { Order } from "../../api/orders";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import { getStatusEntry, getStatusIcon, normalizeStatusKey, type StatusKey } from "../../lib/status";
import { CalendarDays, MessageSquare, FolderUp, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip } from "../ui/tooltip";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  orders: Order[];
  onOpenDetail: (orderNo: string) => void;
  onOpenMessages: (orderNo: string) => void;
  onOpenUpload: (orderNo: string) => void;
};

type SortKey = "orderNo" | "customer" | "address" | "appointment" | "total" | "status";
type SortDir = "asc" | "desc";

const SECTION_ORDER: StatusKey[] = [
  "pending",
  "provisional",
  "confirmed",
  "paused",
  "completed",
  "done",
  "archived",
  "cancelled",
];

const DEFAULT_EXPANDED: Record<StatusKey, boolean> = {
  pending: true,
  provisional: true,
  confirmed: true,
  paused: true,
  completed: false,
  done: false,
  cancelled: false,
  archived: false,
};

function displayName(o: Order): string {
  return o.billing?.company || o.customerName || "–";
}

function contactSubline(o: Order): string | null {
  if (o.billing?.company && o.customerName && o.customerName !== o.billing.company) {
    return o.customerName;
  }
  return null;
}

function StatusBadge({ status }: { status: string }) {
  const entry = getStatusEntry(status);
  const Icon = getStatusIcon(status);
  return (
    <span className={entry.badgeClass}>
      <Icon className="mr-1 h-3 w-3 shrink-0" />
      {entry.label}
    </span>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={title}>
      <button
        type="button"
        aria-label={title}
        className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-transparent p-1.5 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        onClick={(e) => { e.stopPropagation(); onClick(e); }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function OrderTable({ orders, onOpenDetail, onOpenMessages, onOpenUpload }: Props) {
  const lang = useAuthStore((s) => s.language);
  const tooltipMessage = t(lang, "orders.tooltip.sendMessage");
  const tooltipUpload = t(lang, "orders.tooltip.uploadFiles");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedSections, setExpandedSections] = useState<Record<StatusKey, boolean>>(DEFAULT_EXPANDED);

  function toggleSection(key: StatusKey) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const sections = useMemo(() => {
    const grouped = new Map<StatusKey, Order[]>();
    for (const key of SECTION_ORDER) grouped.set(key, []);

    for (const order of orders) {
      const key = normalizeStatusKey(order.status) ?? "pending";
      grouped.get(key)?.push(order);
    }

    return SECTION_ORDER
      .map((key) => ({
        key,
        orders: grouped.get(key) ?? [],
      }))
      .filter((s) => s.orders.length > 0);
  }, [orders]);

  function sortOrders(list: Order[]): Order[] {
    if (!sortKey) return list;
    const factor = sortDir === "asc" ? 1 : -1;
    const collator = new Intl.Collator("de-CH", { sensitivity: "base", numeric: true });
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "orderNo":
          cmp = collator.compare(String(a.orderNo || ""), String(b.orderNo || ""));
          break;
        case "customer":
          cmp = collator.compare(displayName(a), displayName(b));
          break;
        case "address":
          cmp = collator.compare(String(a.address || a.billing?.street || ""), String(b.address || b.billing?.street || ""));
          break;
        case "appointment": {
          const ta = a.appointmentDate ? new Date(a.appointmentDate).getTime() : 0;
          const tb = b.appointmentDate ? new Date(b.appointmentDate).getTime() : 0;
          cmp = ta - tb;
          break;
        }
        case "total":
          cmp = (Number(a.total) || 0) - (Number(b.total) || 0);
          break;
        case "status":
          cmp = collator.compare(getStatusEntry(a.status).label, getStatusEntry(b.status).label);
          break;
      }
      return cmp * factor;
    });
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir("asc");
      return;
    }
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  function SortHeader({ label, keyName }: { label: string; keyName: SortKey }) {
    const isActive = sortKey === keyName;
    return (
      <button
        type="button"
        onClick={() => toggleSort(keyName)}
        className="inline-flex items-center gap-1.5 text-left text-xs font-bold uppercase tracking-wider text-[var(--accent)] hover:text-[#d7b878]"
      >
        <span>{label}</span>
        {isActive ? (
          sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
        )}
      </button>
    );
  }

  function renderOrderCard(o: Order) {
    return (
      <article
        key={o.orderNo}
        className="surface-card cursor-pointer p-3 transition-colors hover:border-zinc-700"
        onClick={() => onOpenDetail(o.orderNo)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpenDetail(o.orderNo)}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">#{o.orderNo}</div>
            <div className="text-xs text-zinc-500">{displayName(o)}</div>
            {contactSubline(o) && <div className="text-xs text-zinc-600">{contactSubline(o)}</div>}
          </div>
          <StatusBadge status={o.status} />
        </div>
        <div className="mb-2 text-xs text-zinc-500">{o.address || o.billing?.street || "–"}</div>
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm font-bold">{formatCurrency(o.total || 0)}</span>
          {o.appointmentDate && (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDateTime(o.appointmentDate)}
            </span>
          )}
        </div>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <IconBtn title={tooltipMessage} onClick={() => onOpenMessages(o.orderNo)}>
            <MessageSquare className="h-4 w-4" />
          </IconBtn>
          <IconBtn title={tooltipUpload} onClick={() => onOpenUpload(o.orderNo)}>
            <FolderUp className="h-4 w-4" />
          </IconBtn>
        </div>
      </article>
    );
  }

  function renderOrderRow(o: Order) {
    return (
      <tr
        key={o.orderNo}
        className="cursor-pointer transition-colors hover:bg-zinc-800/30"
        onClick={() => onOpenDetail(o.orderNo)}
      >
        <td className="px-3 py-2.5">
          <div className="font-semibold">#{o.orderNo}</div>
          {o.appointmentDate && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-emerald-500">
              <CalendarDays className="h-3 w-3" />
            </div>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div>{displayName(o)}</div>
          {contactSubline(o) && <div className="text-xs text-zinc-500">{contactSubline(o)}</div>}
          {o.customerEmail && !o.customerEmail.toLowerCase().endsWith("@company.local") && (
            <div className="text-xs text-zinc-500">{o.customerEmail}</div>
          )}
        </td>
        <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-zinc-500">
          {o.address || o.billing?.street || "–"}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-400">
          {o.appointmentDate ? formatDateTime(o.appointmentDate) : <span className="text-zinc-600">—</span>}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
          {formatCurrency(o.total || 0)}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={o.status} />
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <IconBtn title={tooltipMessage} onClick={() => onOpenMessages(o.orderNo)}>
              <MessageSquare className="h-4 w-4" />
            </IconBtn>
            <IconBtn title={tooltipUpload} onClick={() => onOpenUpload(o.orderNo)}>
              <FolderUp className="h-4 w-4" />
            </IconBtn>
          </div>
        </td>
      </tr>
    );
  }

  const visibleCount = sections.length;

  function isSectionExpanded(key: StatusKey) {
    if (visibleCount === 1) return true;
    return expandedSections[key];
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-4 md:hidden">
        {sections.map((section) => {
          const expanded = isSectionExpanded(section.key);
          const sorted = sortOrders(section.orders);
          const entry = getStatusEntry(section.key);
          const SectionIcon = getStatusIcon(section.key);
          const i18nKey = `orders.section.${section.key}` as const;
          const label = t(lang, i18nKey).replace("{{count}}", String(section.orders.length));

          return (
            <div key={section.key}>
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/30 px-3 py-2.5 text-left text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
              >
                <span className="inline-flex items-center gap-2">
                  <SectionIcon className="h-4 w-4 shrink-0" style={{ color: entry.eventColor }} />
                  {label}
                </span>
                {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </button>
              {expanded && (
                <div className="mt-3 space-y-3">
                  {sorted.map((o) => renderOrderCard(o))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden space-y-3 md:block">
        {/* Sticky header */}
        <div className="overflow-auto rounded-xl border border-zinc-800/50 bg-transparent">
          <table className="min-w-full text-sm">
            <thead className="border-b-2 border-[var(--accent)]/20">
              <tr>
                <th className="px-3 py-2 text-left"><SortHeader label={t(lang, "orders.table.order")} keyName="orderNo" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label={t(lang, "orders.table.customer")} keyName="customer" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label={t(lang, "orders.table.address")} keyName="address" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label={t(lang, "orders.table.appointment")} keyName="appointment" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label={t(lang, "orders.table.total")} keyName="total" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label={t(lang, "orders.table.status")} keyName="status" /></th>
                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-[var(--accent)]">{t(lang, "orders.table.actions")}</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Collapsible sections per status */}
        {sections.map((section) => {
          const expanded = isSectionExpanded(section.key);
          const sorted = sortOrders(section.orders);
          const entry = getStatusEntry(section.key);
          const SectionIcon = getStatusIcon(section.key);
          const i18nKey = `orders.section.${section.key}` as const;
          const label = t(lang, i18nKey).replace("{{count}}", String(section.orders.length));

          return (
            <div key={section.key}>
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className={`flex w-full items-center justify-between gap-2 border border-zinc-800/50 bg-zinc-800/30 px-4 py-2.5 text-left text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300 ${expanded ? "rounded-t-xl border-b-0" : "rounded-xl"}`}
              >
                <span className="inline-flex items-center gap-2">
                  <SectionIcon className="h-4 w-4 shrink-0" style={{ color: entry.eventColor }} />
                  {label}
                </span>
                {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </button>
              {expanded && (
                <div className="overflow-auto rounded-b-xl border border-t-0 border-zinc-800/50 bg-transparent">
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-zinc-800/30">
                      {sorted.map((o) => renderOrderRow(o))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

