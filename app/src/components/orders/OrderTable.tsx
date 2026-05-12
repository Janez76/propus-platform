import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Order } from "../../api/orders";
import { formatCurrency } from "../../lib/utils";
import { getStatusEntry, getStatusIcon, normalizeStatusKey, type StatusKey } from "../../lib/status";
import { Clock, MessageSquare, FolderUp, FileText, RefreshCw, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, Receipt } from "lucide-react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { avatarColorFor, avatarInitials, getTerminInfo, terminKindClasses, type TerminKind } from "../../lib/orderTermin";

function formatChfParts(n: number): { amount: string } {
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return { amount: `${grouped}.${decPart}` };
}

type Props = {
  orders: Order[];
  onOpenDetail: (orderNo: string) => void;
  onOpenMessages: (orderNo: string) => void;
  onOpenUpload: (orderNo: string) => void;
  selectedNos: Set<string>;
  onToggleRow: (orderNo: string) => void;
  onToggleAllVisible: (select: boolean) => void;
  onToggleSection: (orderNos: string[], select: boolean) => void;
  onCreateExxasOrder?: (orderNo: string) => void;
  /** Bestehender Exxas-Auftrag: Tour- und Drive-URL aus Propus nachträglich in Exxas schreiben */
  onSyncExxasOrderLinks?: (orderNo: string) => void;
  /** Auftragsbestätigung in bexio (kb_order) anlegen */
  onCreateBexioOrder?: (orderNo: string) => void;
};

type SortKey = "orderNo" | "customer" | "address" | "appointment" | "total";
type SortDir = "asc" | "desc";

export const SECTION_ORDER: StatusKey[] = [
  "pending",
  "provisional",
  "disposition_offen",
  "confirmed",
  "paused",
  "completed",
  "done",
  "archived",
  "cancelled",
];

const DEFAULT_EXPANDED: Record<StatusKey, boolean> = {
  pending: true,
  disposition_offen: true,
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
    <button
      type="button"
      title={title}
      aria-label={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[var(--text-subtle)] transition-colors hover:border-[var(--border-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
    >
      {children}
    </button>
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

export function OrderTable({
  orders,
  onOpenDetail,
  onOpenMessages,
  onOpenUpload,
  selectedNos,
  onToggleRow,
  onToggleAllVisible,
  onToggleSection,
  onCreateExxasOrder,
  onSyncExxasOrderLinks,
  onCreateBexioOrder,
}: Props) {
  const lang = useAuthStore((s) => s.language);
  const tooltipMessage = t(lang, "orders.tooltip.sendMessage");
  const tooltipUpload = t(lang, "orders.tooltip.uploadFiles");

  function exxasRowTitle(o: Order): string {
    if (o.exxasOrderId) return t(lang, "orders.tooltip.exxasCreated");
    if (o.exxasStatus === "error") return t(lang, "orders.tooltip.exxasError");
    return t(lang, "orders.tooltip.exxasCreate");
  }

  function bexioRowTitle(o: Order): string {
    if (o.bexioOrderId) return t(lang, "orders.tooltip.bexioCreated");
    if (o.bexioStatus === "error") return t(lang, "orders.tooltip.bexioError");
    return t(lang, "orders.tooltip.bexioCreate");
  }
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
            {onCreateExxasOrder ? (
              o.exxasOrderId ? (
                <span className="inline-flex items-center gap-0.5">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-subtle)] opacity-40"
                    title={exxasRowTitle(o)}
                    aria-label={exxasRowTitle(o)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  {onSyncExxasOrderLinks ? (
                    <IconBtn title={t(lang, "orders.tooltip.exxasSync")} onClick={() => onSyncExxasOrderLinks(o.orderNo)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </IconBtn>
                  ) : null}
                </span>
              ) : (
                <IconBtn title={exxasRowTitle(o)} onClick={() => onCreateExxasOrder(o.orderNo)}>
                  <FileText
                    className={`h-3.5 w-3.5 ${o.exxasStatus === "error" ? "text-red-500 dark:text-red-400" : ""}`}
                  />
                </IconBtn>
              )
            ) : null}
            {onCreateBexioOrder ? (
              o.bexioOrderId ? (
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-subtle)] opacity-40"
                  title={bexioRowTitle(o)}
                  aria-label={bexioRowTitle(o)}
                >
                  <Receipt className="h-3.5 w-3.5" />
                </span>
              ) : (
                <IconBtn title={bexioRowTitle(o)} onClick={() => onCreateBexioOrder(o.orderNo)}>
                  <Receipt
                    className={`h-3.5 w-3.5 ${o.bexioStatus === "error" ? "text-red-500 dark:text-red-400" : ""}`}
                  />
                </IconBtn>
              )
            ) : null}
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
    const company = o.billing?.company?.trim() || "";
    const personName = o.customerName?.trim() || "";
    const isSelected = selectedNos.has(k);
    const total = Number(o.total) || 0;
    const totalParts = formatChfParts(total);
    const terminKind: TerminKind = termin.kind;
    const showEmail = o.customerEmail && !o.customerEmail.toLowerCase().endsWith("@company.local");
    return (
      <tr
        key={o.orderNo}
        className={`op-row${isSelected ? " is-selected" : ""}`}
        onClick={() => onOpenDetail(o.orderNo)}
      >
        <td className="op-th-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="op-check"
            checked={isSelected}
            onChange={() => onToggleRow(k)}
            aria-label={t(lang, "orders.bulk.selectRow")}
          />
        </td>
        <td>
          <span className="op-cell-num">#{o.orderNo}</span>
        </td>
        <td>
          <div className="op-customer">
            <div className="op-customer-company">{company || personName || "–"}</div>
            {company && personName && personName !== company ? (
              <div className="op-customer-person">{personName}</div>
            ) : null}
            {showEmail ? <div className="op-customer-email">{o.customerEmail}</div> : null}
          </div>
        </td>
        <td>
          <div className="op-address">
            <div className="op-address-line1">{streetLine(o) || "–"}</div>
            {zipcity ? <div className="op-address-line2">{zipcity}</div> : null}
          </div>
        </td>
        <td>
          {terminKind !== "none" ? (
            <div className="op-termin">
              <span className="op-termin-when" data-kind={terminKind}>
                <Clock />
                <span>{termin.label}</span>
              </span>
              {termin.absLabel ? <span className="op-termin-date">{termin.absLabel}</span> : null}
            </div>
          ) : (
            <span className="op-no-termin">—</span>
          )}
        </td>
        <td>
          {photog ? (
            <span className="op-staff">
              <Avatar name={photog.name} keyId={photog.key} />
              <span className="op-staff-name">{photog.name}</span>
            </span>
          ) : (
            <span className="op-staff">
              <span className="op-staff-avatar is-unassigned">?</span>
              <span className="op-staff-name is-unassigned">{t(lang, "orders.employee.none")}</span>
            </span>
          )}
        </td>
        <td className={`op-cell-total${total === 0 ? " is-zero" : ""}`}>
          <span className="op-currency">CHF</span>{totalParts.amount}
        </td>
        <td className={`op-cell-exxas${o.exxasOrderNumber || o.exxasOrderId ? "" : " is-empty"}`}>
          {o.exxasOrderNumber ? (
            <span title={o.exxasOrderId ? `ID ${o.exxasOrderId}` : undefined}>{o.exxasOrderNumber}</span>
          ) : o.exxasOrderId ? (
            <span>{o.exxasOrderId}</span>
          ) : (
            <span>—</span>
          )}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="op-row-actions">
            <button
              type="button"
              className="op-row-action-btn"
              title={tooltipMessage}
              aria-label={tooltipMessage}
              onClick={(e) => { e.stopPropagation(); onOpenMessages(o.orderNo); }}
            >
              <MessageSquare />
            </button>
            <button
              type="button"
              className="op-row-action-btn"
              title={tooltipUpload}
              aria-label={tooltipUpload}
              onClick={(e) => { e.stopPropagation(); onOpenUpload(o.orderNo); }}
            >
              <FolderUp />
            </button>
            {onCreateExxasOrder ? (
              o.exxasOrderId ? (
                <>
                  <span
                    className="op-row-action-btn is-on"
                    title={exxasRowTitle(o)}
                    aria-label={exxasRowTitle(o)}
                  >
                    <FileText />
                  </span>
                  {onSyncExxasOrderLinks ? (
                    <button
                      type="button"
                      className="op-row-action-btn"
                      title={t(lang, "orders.tooltip.exxasSync")}
                      aria-label={t(lang, "orders.tooltip.exxasSync")}
                      onClick={(e) => { e.stopPropagation(); onSyncExxasOrderLinks(o.orderNo); }}
                    >
                      <RefreshCw />
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  className="op-row-action-btn"
                  title={exxasRowTitle(o)}
                  aria-label={exxasRowTitle(o)}
                  onClick={(e) => { e.stopPropagation(); onCreateExxasOrder(o.orderNo); }}
                  style={o.exxasStatus === "error" ? { color: "#B85C3D" } : undefined}
                >
                  <FileText />
                </button>
              )
            ) : null}
            {onCreateBexioOrder ? (
              o.bexioOrderId ? (
                <span
                  className="op-row-action-btn is-on"
                  title={bexioRowTitle(o)}
                  aria-label={bexioRowTitle(o)}
                >
                  <Receipt />
                </span>
              ) : (
                <button
                  type="button"
                  className="op-row-action-btn"
                  title={bexioRowTitle(o)}
                  aria-label={bexioRowTitle(o)}
                  onClick={(e) => { e.stopPropagation(); onCreateBexioOrder(o.orderNo); }}
                  style={o.bexioStatus === "error" ? { color: "#B85C3D" } : undefined}
                >
                  <Receipt />
                </button>
              )
            ) : null}
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
        <div className="op-table-wrap">
          <table className="op-table">
            <thead>
              <tr>
                <th className="op-th-check">
                  <input
                    ref={headerSelectRef}
                    type="checkbox"
                    className="op-check"
                    checked={allVisibleSelected}
                    onChange={(e) => onToggleAllVisible(e.target.checked)}
                    aria-label={t(lang, "orders.bulk.selectAllVisible")}
                  />
                </th>
                <th className="op-th-num"><PaperSortHeader label={t(lang, "orders.table.orderNo")} keyName="orderNo" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th><PaperSortHeader label={t(lang, "orders.table.customer")} keyName="customer" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th><PaperSortHeader label={t(lang, "orders.table.address")} keyName="address" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th className="op-th-termin"><PaperSortHeader label={t(lang, "orders.table.appointment")} keyName="appointment" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th className="op-th-staff">{t(lang, "orders.table.employee")}</th>
                <th className="op-th-total"><PaperSortHeader label={t(lang, "orders.table.total")} keyName="total" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></th>
                <th className="op-th-exxas">{t(lang, "orders.table.exxas")}</th>
                <th className="op-th-actions" />
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const expanded = isSectionExpanded(section.key);
                const sorted = sortOrders(section.orders);
                const i18nKey = `orders.section.${section.key}` as const;
                const baseLabel = t(lang, i18nKey).replace("{{count}}", "").replace(/\(\s*\)/g, "").trim() || section.key;

                const sectionKeysD = sorted.map(orderKey);
                const sectionAllD = sectionKeysD.length > 0 && sectionKeysD.every((id) => selectedNos.has(id));
                const sectionSomeD = sectionKeysD.some((id) => selectedNos.has(id));
                const sectionSum = section.orders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
                const sumLabel = `${t(lang, "orders.section.total") || "Total"} CHF ${formatChfParts(sectionSum).amount}`;

                return (
                  <PaperGroupRows
                    key={section.key}
                    label={baseLabel}
                    statusKey={section.key}
                    count={section.orders.length}
                    sumLabel={sumLabel}
                    expanded={expanded}
                    sectionAll={sectionAllD}
                    sectionSome={sectionSomeD}
                    onToggleExpanded={() => toggleSection(section.key)}
                    onToggleSection={(sel) => onToggleSection(sectionKeysD, sel)}
                    selectLabel={t(lang, "orders.bulk.selectSection")}
                  >
                    {expanded ? sorted.map((o) => renderOrderRow(o)) : null}
                  </PaperGroupRows>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function PaperSortHeader({
  label,
  keyName,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  keyName: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onToggle: (key: SortKey) => void;
}) {
  const isActive = sortKey === keyName;
  return (
    <button
      type="button"
      onClick={() => onToggle(keyName)}
      className={`op-th-sort${isActive ? " is-sorted" : ""}`}
    >
      <span>{label}</span>
      {isActive ? (
        sortDir === "asc" ? <ArrowUp /> : <ArrowDown />
      ) : (
        <ArrowUpDown />
      )}
    </button>
  );
}

function PaperGroupRows({
  label,
  statusKey,
  count,
  sumLabel,
  expanded,
  sectionAll,
  sectionSome,
  onToggleExpanded,
  onToggleSection,
  selectLabel,
  children,
}: {
  label: string;
  statusKey: StatusKey;
  count: number;
  sumLabel: string;
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
      <tr className="op-section-row" onClick={onToggleExpanded}>
        <td colSpan={9}>
          <div className="op-section-content">
            <label className="op-section-check" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                className="op-check"
                checked={sectionAll}
                ref={(el) => {
                  if (el) el.indeterminate = sectionSome && !sectionAll;
                }}
                onChange={(e) => onToggleSection(e.target.checked)}
                aria-label={selectLabel}
              />
            </label>
            <button
              type="button"
              className={`op-section-toggle${expanded ? "" : " is-collapsed"}`}
              onClick={(e) => { e.stopPropagation(); onToggleExpanded(); }}
              aria-label={expanded ? "collapse" : "expand"}
            >
              {expanded ? <ChevronDown /> : <ChevronUp />}
            </button>
            <span className="op-section-dot" data-status={statusKey} />
            <span className="op-section-label">{label}</span>
            <span className="op-section-count">{count}</span>
            <span className="op-section-sum">{sumLabel}</span>
          </div>
        </td>
      </tr>
      {children}
    </>
  );
}
