import { Edit2, Lock, Unlock, ShoppingBag, Eye, UserPlus, ArrowUpDown, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import type { Customer } from "../../api/customers";
import { Badge } from "../ui/badge";
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
  sortKey: CustomerSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: CustomerSortKey) => void;
};

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
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
    >
      <span>{label}</span>
      {active ? (dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />}
    </button>
  );
}

export function CustomerList({ items, onEdit, onToggleBlocked, onView, onOpenAsCustomer, onAddContact, sortKey, sortDir, onSort }: Props) {
  const lang = useAuthStore((s) => s.language);
  const isSyntheticCompanyEmail = (value?: string) => String(value || "").toLowerCase().endsWith("@company.local");
  /** Listenzeile: nur Firma; Personen-/Kontaktdaten siehe Kontakte. */
  const customerListPrimaryLine = (item: Customer) => String(item.company || "").trim() || "-";

  if (items.length === 0) {
    return (
      <div className="surface-card p-12 text-center">
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
            className="surface-card hover:shadow-md transition-shadow p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <p className="text-[11px] font-medium tabular-nums p-text-subtle mb-0.5">
                  {t(lang, "customerList.table.id")}: {c.id}
                </p>
                <h3 className="font-bold p-text-main mb-1">{customerListPrimaryLine(c)}</h3>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Badge variant={c.is_admin ? "gold" : "secondary"}>
                  {c.is_admin ? t(lang, "customerView.role.admin") : t(lang, "customerView.role.customer")}
                </Badge>
                <Badge variant={c.blocked ? "destructive" : "default"}>
                  {c.blocked ? t(lang, "customerView.status.blocked") : t(lang, "customerView.status.active")}
                </Badge>
              </div>
            </div>

            {(toDisplayString(c.street, "") || toDisplayString(c.zipcity, "")) ? (
              <p className="text-xs p-text-muted mb-3">
                {[toDisplayString(c.street), toDisplayString(c.zipcity)].filter((s) => s).join(", ")}
              </p>
            ) : null}

            <div className="flex items-center gap-2 mb-3 pt-3 border-t p-border-soft">
              <ShoppingBag className="h-4 w-4 p-text-subtle" />
              <span className="text-xs font-semibold p-text-muted">
                {t(lang, "customerList.label.orderCount").replace("{{n}}", String(c.order_count || 0))}
              </span>
            </div>

            <div className={cn("grid gap-2", onAddContact ? "grid-cols-3" : "grid-cols-2")}>
              <button
                onClick={() => onEdit(c)}
                className="btn-secondary inline-flex items-center justify-center gap-2 px-3 py-2 text-sm"
                title={t(lang, "customerList.tooltip.edit")}
              >
                <Edit2 className="h-4 w-4" />
                {t(lang, "common.edit")}
              </button>
              {onAddContact && (
                <button
                  onClick={() => onAddContact(c)}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors p-text-accent"
                  style={{ background: "var(--accent-subtle)" }}
                  title={t(lang, "customerList.tooltip.addContact")}
                >
                  <UserPlus className="h-4 w-4" />
                  {t(lang, "customerList.button.contact")}
                </button>
              )}
              <button
                onClick={() => onToggleBlocked(c.id, !c.blocked)}
                className={cn(
                  "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  c.blocked
                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/50"
                    : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50"
                )}
                title={c.blocked ? t(lang, "common.unblock") : t(lang, "common.block")}
              >
                {c.blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {c.blocked ? t(lang, "common.unblock") : t(lang, "common.block")}
              </button>
            </div>
            {onView && (
              <button
                onClick={() => onView(c)}
                className="btn-secondary w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm"
                title={t(lang, "customerList.tooltip.view")}
              >
                <Eye className="h-4 w-4" />
                {t(lang, "customerList.button.view")}
              </button>
            )}
            {onOpenAsCustomer && !c.blocked && !isSyntheticCompanyEmail(c.email) && (
              <button
                onClick={() => onOpenAsCustomer(c)}
                className="btn-primary w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm"
                title={t(lang, "customerList.tooltip.openAsCustomer")}
              >
                <ExternalLink className="h-4 w-4" />
                {t(lang, "customerList.button.openAsCustomer")}
              </button>
            )}
          </motion.article>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block surface-card overflow-hidden" style={{ padding: 0 }}>
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[7%]" />
              <col className="w-[27%]" />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "2px solid color-mix(in srgb, var(--accent) 20%, var(--border-soft))" }}>
                <th className="px-2 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent tabular-nums">
                  {t(lang, "customerList.table.id")}
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">
                  <SortLabel label={`${t(lang, "customerList.table.customer")}/${t(lang, "common.company")}`} active={sortKey === "name"} dir={sortDir} onClick={() => onSort("name")} />
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">
                  <SortLabel label={t(lang, "customerList.table.address")} active={sortKey === "address"} dir={sortDir} onClick={() => onSort("address")} />
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">
                  <SortLabel label={t(lang, "customerList.table.role")} active={sortKey === "role"} dir={sortDir} onClick={() => onSort("role")} />
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">
                  <SortLabel label={t(lang, "customerList.table.status")} active={sortKey === "status"} dir={sortDir} onClick={() => onSort("status")} />
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">
                  <SortLabel label={t(lang, "customerList.table.orders")} active={sortKey === "orders"} dir={sortDir} onClick={() => onSort("orders")} />
                </th>
                <th className="px-3 py-4 text-right text-xs font-bold uppercase tracking-wider p-text-accent">{t(lang, "customerList.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {items.map((c, index) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.2 }}
                  className="propus-table-row transition-colors"
                >
                  <td className="px-2 py-3 text-xs tabular-nums p-text-subtle whitespace-nowrap">
                    {c.id}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold p-text-main truncate">{customerListPrimaryLine(c)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-600 dark:text-zinc-400 truncate">
                    {[toDisplayString(c.street), toDisplayString(c.zipcity)].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={c.is_admin ? "gold" : "secondary"}>
                      {c.is_admin ? t(lang, "customerView.role.admin") : t(lang, "customerView.role.customer")}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={c.blocked ? "destructive" : "default"}>
                      {c.blocked ? t(lang, "customerView.status.blocked") : t(lang, "customerView.status.active")}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 p-text-subtle" />
                      <span className="text-sm font-semibold p-text-muted">{c.order_count || 0}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-1 flex-nowrap">
                      {onOpenAsCustomer && !c.blocked && !isSyntheticCompanyEmail(c.email) && (
                        <button
                          onClick={() => onOpenAsCustomer(c)}
                          className="btn-primary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs min-h-0 min-w-0"
                          title={t(lang, "customerList.tooltip.openAsCustomer")}
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[90px]">{t(lang, "customerList.button.openAsCustomer")}</span>
                        </button>
                      )}
                      {onView && (
                        <button
                          onClick={() => onView(c)}
                          className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs min-h-0 min-w-0"
                          title={t(lang, "customerList.tooltip.view")}
                        >
                          <Eye className="h-3.5 w-3.5 shrink-0" />
                          <span>{t(lang, "customerList.button.viewShort")}</span>
                        </button>
                      )}
                      <button
                        onClick={() => onEdit(c)}
                        className="btn-secondary inline-flex items-center justify-center px-2 py-1.5 text-xs min-h-0 min-w-0"
                        title={t(lang, "customerList.tooltip.edit")}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      {onAddContact && (
                        <button
                          onClick={() => onAddContact(c)}
                          className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg text-xs font-medium transition-colors p-text-accent min-h-0 min-w-0"
                          style={{ background: "var(--accent-subtle)" }}
                          title={t(lang, "customerList.tooltip.addContact")}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => onToggleBlocked(c.id, !c.blocked)}
                        className={cn(
                          "inline-flex items-center justify-center px-2 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-0 min-w-0",
                          c.blocked
                            ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/50"
                            : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50"
                        )}
                        title={c.blocked ? t(lang, "common.unblock") : t(lang, "common.block")}
                      >
                        {c.blocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
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
