import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Order } from "../../api/orders";
import { formatCurrency } from "../../lib/utils";
import { getStatusEntry, getStatusIcon, normalizeStatusKey, type StatusKey } from "../../lib/status";
import { MessageSquare, FolderUp, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip } from "../ui/tooltip";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { avatarColorFor, avatarInitials, getTerminInfo, terminKindClasses } from "../../lib/orderTermin";

type Props = {
  orders: Order[];
  onOpenDetail: (orderNo: string) => void;
  onOpenMessages: (orderNo: string) => void;
  onOpenUpload: (orderNo: string) => void;
  selectedNos: Set<string>;
  onToggleRow: (orderNo: string) => void;
  onToggleAllVisible: (select: boolean) => void;
  onToggleSection: (orderNos: string[], select: boolean) => void;
};

type SortKey = "orderNo" | "customer" | "address" | "appointment" | "total";
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

function streetLine(o: Order): string {
  return o.address || o.billing?.street || "";
}

function zipcityLine(o: Order): string {
  const zip = o.billing?.zip || "";
  const city = o.billing?.city || "";
  const combined = [zip, city].filter(Boolean).join(" ");
  return combined || o.customerZipcity || "";
}

function photographerDisplay(o: Order): { key: string; name: string } | null {
  const name = o.photographer?.name?.trim() || "";
  const key = o.photographer?.key?.trim() || "";
  if (!name && !key) return null;
  return { key: key || name, name: name || key };
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
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[var(--text-subtle)] transition-colors hover:border-[var(--border-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        onClick={(e) => { e.stopPropagation(); onClick(e); }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Avatar({ name, keyId }: { name: string; keyId: string }) {
  const color = avatarColorFor(keyId);
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
      style={{ background: color.bg, color: color.fg }}
      aria-hidden
    >
      {avatarInitials(name)}
    </span>
  );
}

function orderKey(o: Order): string {
  return String(o.orderNo);
}

function SortHeader({
  label,
  keyName,
  align = "left",
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  keyName: SortKey;
  align?: "left" | "right";
  sortKey: SortKey | null;
  sortDir: SortDir;
  onToggle: (key: SortKey) => void;
}) {
  const isActive = sortKey === keyName;
  return (
    <button
      type="button"
      onClick={() => onToggle(keyName)}
      className={`inline-flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors hover:text-[var(--text-main)] ${isActive ? "text-[var(--accent)]" : "text-[var(--text-subtle)]"} ${align === "right" ? "justify-end text-right" : "justify-start text-left"}`}
    >
      <span>{label}</span>
      {isActive ? (
        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

export function OrderTable({
  orders,
  onOpenDetail,
  onOpenMessages,
  onOpenUpload,
  selectedNos,
  onToggleRow,
  onToggleAllVisible,
  onToggleSection,
}: Props) {
  const lang = useAuthStore((s) => s.language);
  const tooltipMessage = t(lang, "orders.tooltip.sendMessage");
  const tooltipUpload = t(lang, "orders.tooltip.uploadFiles");
  const headerSelectRef = useRef<HTMLInputElement>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>("appointment");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedSections, setExpandedSections] = useState<Record<StatusKey, boolean>>(DEFAULT_EXPANDED);

  const allVisibleSelected =
    orders.length > 0 && orders.every((o) => selectedNos.has(orderKey(o)));
  const someVisibleSelected = orders.some((o) => selectedNos.has(orderKey(o)));

  useEffect(() => {
    const el = headerSelectRef.current;
    if (!el) return;
    el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

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
          cmp = collator.compare(streetLine(a), streetLine(b));
          break;
        case "appointment": {
          const ta = a.appointmentDate ? new Date(a.appointmentDate).getTime() : Number.MAX_SAFE_INTEGER;
          const tb = b.appointmentDate ? new Date(b.appointmentDate).getTime() : Number.MAX_SAFE_INTEGER;
          cmp = ta - tb;
          break;
        }
        case "total":
          cmp = (Number(a.total) || 0) - (Number(b.total) || 0);
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

  function renderOrderCard(o: Order) {
    const k = orderKey(o);
    const termin = getTerminInfo(o.appointmentDate, lang);
    const photog = photographerDisplay(o);
    const zipcity = zipcityLine(o);
    return (
      <article
        key={o.orderNo}
        className="surface-card cursor-pointer p-3 transition-colors hover:border-[var(--border-strong)]"
        onClick={() => onOpenDetail(o.orderNo)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpenDetail(o.orderNo)}
      >
        <div className="mb-2 flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border-soft)]"
            style={{ accentColor: "var(--accent)" }}
            checked={selectedNos.has(k)}
            onChange={() => onToggleRow(k)}
            onClick={(e) => e.stopPropagation()}
            aria-label={t(lang, "orders.bulk.selectRow")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-[var(--text-main)]">#{o.orderNo}</span>
              <span className="text-sm font-semibold">{formatCurrency(o.total || 0)}</span>
            </div>
            <div className="mt-0.5 text-sm font-semibold text-[var(--text-main)]">{displayName(o)}</div>
            {contactSubline(o) && <div className="text-xs text-[var(--text-muted)]">{contactSubline(o)}</div>}
          </div>
        </div>
        <div className="mb-2 text-xs">
          <div className="text-[var(--text-main)]">{streetLine(o) || "–"}</div>
          {zipcity ? <div className="text-[var(--text-subtle)]">{zipcity}</div> : null}
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {termin.kind !== "none" ? (
            <>
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${terminKindClasses(termin.kind)}`}>
                {termin.label}
              </span>
              {termin.absLabel ? <span className="text-[10px] text-[var(--text-subtle)]">{termin.absLabel}</span> : null}
            </>
          ) : (
            <span className="text-[11px] text-[var(--text-subtle)]">{t(lang, "orders.termin.none")}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          {photog ? (
            <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Avatar name={photog.name} keyId={photog.key} />
              {photog.name}
            </span>
          ) : (
            <span className="text-xs text-[var(--text-subtle)]">{t(lang, "orders.employee.none")}</span>
          )}
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <IconBtn title={tooltipMessage} onClick={() => onOpenMessages(o.orderNo)}>
              <MessageSquare className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn title={tooltipUpload} onClick={() => onOpenUpload(o.orderNo)}>
              <FolderUp className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        </div>
      </article>
    );
  }

  function renderOrderRow(o: Order) {
    const k = orderKey(o);
    const termin = getTerminInfo(o.appointmentDate, lang);
    const photog = photographerDisplay(o);
    const zipcity = zipcityLine(o);
    return (
      <tr
        key={o.orderNo}
        className="group cursor-pointer border-b border-[var(--border-soft)] transition-colors last:border-b-0 hover:bg-[var(--surface-raised)]"
        onClick={() => onOpenDetail(o.orderNo)}
      >
        <td className="w-10 px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[var(--border-soft)]"
            style={{ accentColor: "var(--accent)" }}
            checked={selectedNos.has(k)}
            onChange={() => onToggleRow(k)}
            aria-label={t(lang, "orders.bulk.selectRow")}
          />
        </td>
        <td className="w-[90px] px-3 py-3 align-middle">
          <span className="font-mono text-xs font-semibold text-[var(--text-main)]">#{o.orderNo}</span>
        </td>
        <td className="px-3 py-3 align-middle">
          <div className="text-sm font-semibold text-[var(--text-main)]">{displayName(o)}</div>
          {contactSubline(o) && <div className="text-xs text-[var(--text-muted)]">{contactSubline(o)}</div>}
          {o.customerEmail && !o.customerEmail.toLowerCase().endsWith("@company.local") && (
            <div className="text-[11px] text-[var(--text-subtle)]">{o.customerEmail}</div>
          )}
        </td>
        <td className="px-3 py-3 align-middle">
          <div className="text-sm text-[var(--text-main)]">{streetLine(o) || "–"}</div>
          {zipcity ? <div className="text-[11px] text-[var(--text-subtle)]">{zipcity}</div> : null}
        </td>
        <td className="w-[190px] px-3 py-3 align-middle">
          {termin.kind !== "none" ? (
            <div className="flex flex-col gap-0.5">
              <span className={`inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${terminKindClasses(termin.kind)}`}>
                {termin.label}
              </span>
              <span className="text-[11px] text-[var(--text-subtle)]">{termin.absLabel}</span>
            </div>
          ) : (
            <span className="text-xs text-[var(--text-subtle)]">—</span>
          )}
        </td>
        <td className="w-[130px] px-3 py-3 align-middle">
          {photog ? (
            <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Avatar name={photog.name} keyId={photog.key} />
              <span className="truncate">{photog.name}</span>
            </span>
          ) : (
            <span className="text-xs text-[var(--text-subtle)]">—</span>
          )}
        </td>
        <td className="w-[110px] px-3 py-3 text-right align-middle tabular-nums">
          <span className="text-sm font-semibold text-[var(--text-main)]">{formatCurrency(o.total || 0)}</span>
        </td>
        <td className="w-[80px] px-3 py-3 align-middle">
          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
            <IconBtn title={tooltipMessage} onClick={() => onOpenMessages(o.orderNo)}>
              <MessageSquare className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn title={tooltipUpload} onClick={() => onOpenUpload(o.orderNo)}>
              <FolderUp className="h-3.5 w-3.5" />
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

          const sectionKeys = sorted.map(orderKey);
          const sectionAll = sectionKeys.length > 0 && sectionKeys.every((id) => selectedNos.has(id));
          const sectionSome = sectionKeys.some((id) => selectedNos.has(id));

          return (
            <div key={section.key}>
              <div className="flex w-full items-stretch gap-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]">
                <label
                  className="flex shrink-0 cursor-pointer items-center px-2 py-2.5"
                  onClick={(e) => e.stopPropagation()}
                  title={t(lang, "orders.bulk.selectSection")}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[var(--border-soft)]"
                    style={{ accentColor: "var(--accent)" }}
                    checked={sectionAll}
                    ref={(el) => {
                      if (el) el.indeterminate = sectionSome && !sectionAll;
                    }}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSection(sectionKeys, e.target.checked);
                    }}
                    aria-label={t(lang, "orders.bulk.selectSection")}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 pr-3 text-left text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <SectionIcon className="h-4 w-4 shrink-0" style={{ color: entry.eventColor }} />
                    {label}
                  </span>
                  {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                </button>
              </div>
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
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-raised)]">
                <th className="w-10 px-3 py-2.5 text-left">
                  <input
                    ref={headerSelectRef}
                    type="checkbox"
                    className="h-4 w-4 rounded border-[var(--border-soft)]"
                    style={{ accentColor: "var(--accent)" }}
                    checked={allVisibleSelected}
                    onChange={(e) => onToggleAllVisible(e.target.checked)}
                    aria-label={t(lang, "orders.bulk.selectAllVisible")}
                  />
                </th>
                <th className="w-[90px] px-3 py-2.5"><SortHeader label={t(lang, "orders.table.orderNo")} keyName="orderNo" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th className="px-3 py-2.5"><SortHeader label={t(lang, "orders.table.customer")} keyName="customer" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th className="px-3 py-2.5"><SortHeader label={t(lang, "orders.table.address")} keyName="address" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th className="w-[190px] px-3 py-2.5"><SortHeader label={t(lang, "orders.table.appointment")} keyName="appointment" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th className="w-[130px] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{t(lang, "orders.table.employee")}</th>
                <th className="w-[110px] px-3 py-2.5"><SortHeader label={t(lang, "orders.table.total")} keyName="total" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th className="w-[80px] px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const expanded = isSectionExpanded(section.key);
                const sorted = sortOrders(section.orders);
                const entry = getStatusEntry(section.key);
                const i18nKey = `orders.section.${section.key}` as const;
                const label = t(lang, i18nKey).replace("{{count}}", String(section.orders.length));

                const sectionKeysD = sorted.map(orderKey);
                const sectionAllD = sectionKeysD.length > 0 && sectionKeysD.every((id) => selectedNos.has(id));
                const sectionSomeD = sectionKeysD.some((id) => selectedNos.has(id));

                return (
                  <GroupRows
                    key={section.key}
                    label={label}
                    dotColor={entry.eventColor}
                    expanded={expanded}
                    sectionAll={sectionAllD}
                    sectionSome={sectionSomeD}
                    onToggleExpanded={() => toggleSection(section.key)}
                    onToggleSection={(sel) => onToggleSection(sectionKeysD, sel)}
                    selectLabel={t(lang, "orders.bulk.selectSection")}
                  >
                    {expanded ? sorted.map((o) => renderOrderRow(o)) : null}
                  </GroupRows>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function GroupRows({
  label,
  dotColor,
  expanded,
  sectionAll,
  sectionSome,
  onToggleExpanded,
  onToggleSection,
  selectLabel,
  children,
}: {
  label: string;
  dotColor: string;
  expanded: boolean;
  sectionAll: boolean;
  sectionSome: boolean;
  onToggleExpanded: () => void;
  onToggleSection: (select: boolean) => void;
  selectLabel: string;
  children: ReactNode;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--border-soft)] bg-[var(--surface-raised)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-raised)_70%,var(--border-soft))]"
        onClick={onToggleExpanded}
      >
        <td className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[var(--border-soft)]"
            style={{ accentColor: "var(--accent)" }}
            checked={sectionAll}
            ref={(el) => {
              if (el) el.indeterminate = sectionSome && !sectionAll;
            }}
            onChange={(e) => onToggleSection(e.target.checked)}
            aria-label={selectLabel}
          />
        </td>
        <td colSpan={7} className="px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5 rotate-180" />}
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
            <span>{label}</span>
          </div>
        </td>
      </tr>
      {children}
    </>
  );
}
