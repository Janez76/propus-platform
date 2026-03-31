import { Edit2, Lock, Unlock, ShoppingBag, Eye, UserPlus, ExternalLink, GitMerge } from "lucide-react";
import { motion } from "framer-motion";
import type { Customer } from "../../api/customers";
import { cn, toDisplayString } from "../../lib/utils";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

export type CustomerSortKey = "name" | "address" | "role" | "status" | "orders";

type Props = {
  items: Customer[];
  onEdit: (item: Customer) => void;
  onToggleBlocked: (id: number, blocked: boolean) => void;
  onView?: (item: Customer) => void;
  onOpenAsCustomer?: (item: Customer) => void;
  onAddContact?: (item: Customer) => void;
  /** Zwei Kunden zusammenführen (Zielzeile = behalten) */
  onMerge?: (item: Customer) => void;
  sortKey: CustomerSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: CustomerSortKey) => void;
};

function customerInitials(c: Customer): string {
  const label = String(c.company || c.name || "").trim() || "?";
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function customerCityLine(c: Customer): string {
  const city = (c.city || "").trim();
  if (city) return city;
  const zc = (c.zipcity || "").trim();
  if (!zc) return "–";
  const comma = zc.indexOf(",");
  if (comma >= 0) {
    const rest = zc.slice(comma + 1).trim();
    if (rest) return rest;
  }
  const parts = zc.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(" ");
  return zc;
}

function SortLabel({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-inherit bg-transparent border-0 p-0 cursor-pointer">
      <span>{label}</span>
      <span className={cn("text-[10px] opacity-50", active && "opacity-100")} aria-hidden>
        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

export function CustomerList({ items, onEdit, onToggleBlocked, onView, onOpenAsCustomer, onAddContact, onMerge, sortKey, sortDir, onSort }: Props) {
  const lang = useAuthStore((s) => s.language);
  const isSyntheticCompanyEmail = (value?: string) => String(value || "").toLowerCase().endsWith("@company.local");
  /** Listenzeile: nur Firma; Personen-/Kontaktdaten siehe Kontakte. */
  const customerListPrimaryLine = (item: Customer) => String(item.company || "").trim() || "-";

  if (items.length === 0) {
    return (
      <div className="cust-table-wrap p-12 text-center">
        <p className="p-text-muted">{t(lang, "customerList.empty")}</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Cards */}
      <div className="space-y-4 lg:hidden">
        {items.map((c, index) => (
          <motion.article
            key={c.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
            className="cust-table-wrap p-4 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="cust-customer-cell min-w-0 flex-1">
                <div className="cust-avatar">{customerInitials(c)}</div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tabular-nums p-text-subtle mb-0.5">
                    {t(lang, "customerList.table.id")}: {c.id}
                  </p>
                  <h3 className="cust-customer-name">{customerListPrimaryLine(c)}</h3>
                  <p className="cust-customer-city">{customerCityLine(c)}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 flex-wrap justify-end gap-2">
                <span className={cn("cust-role-badge", c.is_admin ? "cust-role-admin" : "cust-role-kunde")}>
                  {c.is_admin ? t(lang, "customerView.role.admin") : t(lang, "customerView.role.customer")}
                </span>
                <span className={cn("cust-status-badge", c.blocked ? "cust-status-inaktiv" : "cust-status-aktiv")}>
                  {c.blocked ? t(lang, "customerView.status.blocked") : t(lang, "customerView.status.active")}
                </span>
              </div>
            </div>

            {toDisplayString(c.street, "") || toDisplayString(c.zipcity, "") ? (
              <p className="cust-td-address mb-3 text-xs">
                <span className="cust-td-address-line">{[toDisplayString(c.street), toDisplayString(c.zipcity)].filter((s) => s).join(", ")}</span>
              </p>
            ) : null}

            <div className="cust-td-orders mb-3 border-t p-border-soft pt-3">
              <ShoppingBag className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.8} />
              <span className="text-xs font-semibold p-text-muted">
                {t(lang, "customerList.label.orderCount").replace("{{n}}", String(c.order_count || 0))}
              </span>
            </div>

            <div
              className={cn(
                "grid gap-2",
                onAddContact && onMerge ? "grid-cols-2 sm:grid-cols-4" : onAddContact || onMerge ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2",
              )}
            >
              {onView && (
                <button type="button" onClick={() => onView(c)} className="cust-action-view justify-center text-xs" title={t(lang, "customerList.tooltip.view")}>
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  {t(lang, "customerList.button.viewShort")}
                </button>
              )}
              <button type="button" onClick={() => onEdit(c)} className="cust-action-view justify-center bg-[var(--surface-raised)] text-[var(--text-main)] text-xs hover:bg-[var(--surface)]" title={t(lang, "customerList.tooltip.edit")}>
                <Edit2 className="h-3.5 w-3.5 shrink-0" />
                {t(lang, "common.edit")}
              </button>
              {onMerge && (
                <button type="button" onClick={() => onMerge(c)} className="cust-action-view justify-center bg-[var(--surface-raised)] text-[var(--text-main)] text-xs" title={t(lang, "customerList.tooltip.merge")}>
                  <GitMerge className="h-3.5 w-3.5 shrink-0" />
                  {t(lang, "customerList.button.merge")}
                </button>
              )}
              {onAddContact && (
                <button type="button" onClick={() => onAddContact(c)} className="cust-action-view justify-center text-xs" title={t(lang, "customerList.tooltip.addContact")}>
                  <UserPlus className="h-3.5 w-3.5 shrink-0" />
                  {t(lang, "customerList.button.contact")}
                </button>
              )}
              <button
                type="button"
                onClick={() => onToggleBlocked(c.id, !c.blocked)}
                className={cn(
                  "cust-action-view justify-center text-xs border-0",
                  c.blocked
                    ? "bg-[color-mix(in_srgb,#2ecc71_12%,transparent)] text-[#2ecc71]"
                    : "bg-[var(--surface-raised)] text-[var(--text-main)] hover:bg-[color-mix(in_srgb,#e74c3c_12%,transparent)] hover:text-[#e74c3c]",
                )}
                title={c.blocked ? t(lang, "common.unblock") : t(lang, "common.block")}
              >
                {c.blocked ? <Unlock className="h-3.5 w-3.5 shrink-0" /> : <Lock className="h-3.5 w-3.5 shrink-0" />}
                {c.blocked ? t(lang, "common.unblock") : t(lang, "common.block")}
              </button>
            </div>
            {onOpenAsCustomer && !c.blocked && !isSyntheticCompanyEmail(c.email) && (
              <button type="button" onClick={() => onOpenAsCustomer(c)} className="cust-btn-new mt-2 w-full justify-center text-xs py-2" title={t(lang, "customerList.tooltip.openAsCustomer")}>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {t(lang, "customerList.button.openAsCustomer")}
              </button>
            )}
          </motion.article>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="cust-table-wrap hidden overflow-hidden lg:block" style={{ padding: 0 }}>
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[6%]" />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[24%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="cust-td-id">{t(lang, "customerList.table.id")}</th>
              <th className={cn(sortKey === "name" && "cust-th-sorted")}>
                <SortLabel label={`${t(lang, "customerList.table.customer")}/${t(lang, "common.company")}`} active={sortKey === "name"} dir={sortDir} onClick={() => onSort("name")} />
              </th>
              <th className={cn(sortKey === "address" && "cust-th-sorted")}>
                <SortLabel label={t(lang, "customerList.table.address")} active={sortKey === "address"} dir={sortDir} onClick={() => onSort("address")} />
              </th>
              <th className={cn(sortKey === "role" && "cust-th-sorted")}>
                <SortLabel label={t(lang, "customerList.table.role")} active={sortKey === "role"} dir={sortDir} onClick={() => onSort("role")} />
              </th>
              <th className={cn(sortKey === "status" && "cust-th-sorted")}>
                <SortLabel label={t(lang, "customerList.table.status")} active={sortKey === "status"} dir={sortDir} onClick={() => onSort("status")} />
              </th>
              <th className={cn(sortKey === "orders" && "cust-th-sorted")}>
                <SortLabel label={t(lang, "customerList.table.orders")} active={sortKey === "orders"} dir={sortDir} onClick={() => onSort("orders")} />
              </th>
              <th className="text-right pr-5">{t(lang, "customerList.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c, index) => (
              <motion.tr
                key={c.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02, duration: 0.2 }}
                onClick={() => onView?.(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onView?.(c);
                  }
                }}
                tabIndex={onView ? 0 : undefined}
                role={onView ? "button" : undefined}
                className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
              >
                <td className="cust-td-id">{c.id}</td>
                <td>
                  <div className="cust-customer-cell">
                    <div className="cust-avatar">{customerInitials(c)}</div>
                    <div className="min-w-0">
                      <div className="cust-customer-name">{customerListPrimaryLine(c)}</div>
                      <div className="cust-customer-city">{customerCityLine(c)}</div>
                    </div>
                  </div>
                </td>
                <td className="cust-td-address">
                  <div className="cust-td-address-line">{[toDisplayString(c.street), toDisplayString(c.zipcity)].filter(Boolean).join(", ") || "–"}</div>
                </td>
                <td>
                  <span className={cn("cust-role-badge", c.is_admin ? "cust-role-admin" : "cust-role-kunde")}>
                    {c.is_admin ? t(lang, "customerView.role.admin") : t(lang, "customerView.role.customer")}
                  </span>
                </td>
                <td>
                  <span className={cn("cust-status-badge", c.blocked ? "cust-status-inaktiv" : "cust-status-aktiv")}>
                    {c.blocked ? t(lang, "customerView.status.blocked") : t(lang, "customerView.status.active")}
                  </span>
                </td>
                <td>
                  <div className="cust-td-orders">
                    <ShoppingBag className="h-3 w-3 shrink-0 opacity-70" strokeWidth={1.8} />
                    <span className={cn((c.order_count || 0) === 0 ? "cust-orders-zero" : "cust-orders-count")}>{c.order_count || 0}</span>
                  </div>
                </td>
                <td className="text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <div className="cust-row-actions">
                    {onView && (
                      <button type="button" className="cust-action-view" onClick={() => onView(c)} title={t(lang, "customerList.tooltip.view")}>
                        <Eye className="h-3 w-3 shrink-0" strokeWidth={2} />
                        {t(lang, "customerList.button.viewShort")}
                      </button>
                    )}
                    <button type="button" className="cust-action-icon" onClick={() => onEdit(c)} title={t(lang, "customerList.tooltip.edit")}>
                      <Edit2 className="h-3 w-3" strokeWidth={2} />
                    </button>
                    {onMerge && (
                      <button type="button" className="cust-action-icon" onClick={() => onMerge(c)} title={t(lang, "customerList.tooltip.merge")}>
                        <GitMerge className="h-3 w-3" strokeWidth={2} />
                      </button>
                    )}
                    {onAddContact && (
                      <button type="button" className="cust-action-icon" onClick={() => onAddContact(c)} title={t(lang, "customerList.tooltip.addContact")}>
                        <UserPlus className="h-3 w-3" strokeWidth={2} />
                      </button>
                    )}
                    {onOpenAsCustomer && !c.blocked && !isSyntheticCompanyEmail(c.email) && (
                      <button type="button" className="cust-action-icon" onClick={() => onOpenAsCustomer(c)} title={t(lang, "customerList.tooltip.openAsCustomer")}>
                        <ExternalLink className="h-3 w-3" strokeWidth={2} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={cn("cust-action-icon", !c.blocked && "cust-action-icon--danger")}
                      onClick={() => onToggleBlocked(c.id, !c.blocked)}
                      title={c.blocked ? t(lang, "common.unblock") : t(lang, "common.block")}
                    >
                      {c.blocked ? <Unlock className="h-3 w-3" strokeWidth={2} /> : <Lock className="h-3 w-3" strokeWidth={2} />}
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

