import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Calendar, List, Map as MapIcon, Plus, Search } from "lucide-react";
import { deleteOrder, getOrders, updateOrderStatus, type Order } from "../api/orders";
import { getPhotographers, type Photographer } from "../api/photographers";
import { getAdminProfile, type AdminProfile } from "../api/profile";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { OrderDetail } from "../components/orders/OrderDetail";
import { OrderMessages } from "../components/orders/OrderMessages";
import { OrderTable } from "../components/orders/OrderTable";
import { OrderWeekCalendar } from "../components/orders/OrderWeekCalendar";
import { useMutation } from "../hooks/useMutation";
import { useQuery } from "../hooks/useQuery";
import { ordersQueryKey } from "../lib/queryKeys";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { getStatusLabel, normalizeStatusKey, STATUS_KEYS, type StatusKey } from "../lib/status";
import { getTerminInfo, startOfWeek, addDays, sameDay } from "../lib/orderTermin";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useOrderStore } from "../store/orderStore";
import { useQueryStore } from "../store/queryStore";

type ViewMode = "list" | "calendar";
type QuickFilter = "none" | "today" | "thisWeek" | "nextWeek" | "overdue" | "mine";

const STATUS_DOT: Record<StatusKey, string> = {
  pending: "#f59e0b",
  provisional: "#8b5cf6",
  confirmed: "#3b82f6",
  paused: "#71717a",
  completed: "#14b8a6",
  done: "#10b981",
  cancelled: "#ef4444",
  archived: "#94a3b8",
};

const CHIP_ORDER: StatusKey[] = [
  "pending",
  "provisional",
  "confirmed",
  "paused",
  "completed",
  "done",
  "cancelled",
  "archived",
];

function isOpenOrder(key: StatusKey | null): boolean {
  if (!key) return true;
  return key !== "done" && key !== "archived" && key !== "cancelled";
}

export function OrdersPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useOrderStore((s) => s.query);
  const setQuery = useOrderStore((s) => s.setQuery);
  const updateCachedOrders = useQueryStore((s) => s.updateData);

  const queryKey = ordersQueryKey(token);
  const {
    data: allOrders = [],
    loading,
    error,
    refetch,
  } = useQuery<Order[]>(
    queryKey,
    () => getOrders(token),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
  );

  const { data: photographers = [] } = useQuery<Photographer[]>(
    `photographers:${token || "anon"}`,
    () => getPhotographers(token),
    { enabled: Boolean(token), staleTime: 10 * 60 * 1000 },
  );

  const { data: adminProfile } = useQuery<{ profile: AdminProfile } | undefined>(
    `adminProfile:${token || "anon"}`,
    async () => {
      const r = await getAdminProfile(token);
      return { profile: r.profile };
    },
    { enabled: Boolean(token), staleTime: 30 * 60 * 1000 },
  );

  const [view, setView] = useState<ViewMode>("list");
  const [statusSelection, setStatusSelection] = useState<Set<StatusKey>>(() => new Set());
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none");
  const [photographerFilter, setPhotographerFilter] = useState<string>("all");

  const [detailNo, setDetailNo] = useState<string | null>(null);
  const [msgNo, setMsgNo] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedNos, setSelectedNos] = useState<Set<string>>(() => new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState<StatusKey>("pending");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(now, true), [now]);
  const nextWeekStart = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const thisWeekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const nextWeekEnd = useMemo(() => addDays(nextWeekStart, 6), [nextWeekStart]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusKey, number> = {
      pending: 0,
      provisional: 0,
      confirmed: 0,
      paused: 0,
      completed: 0,
      done: 0,
      cancelled: 0,
      archived: 0,
    };
    for (const o of allOrders) {
      const k = normalizeStatusKey(o.status);
      if (k) counts[k] += 1;
    }
    return counts;
  }, [allOrders]);

  function matchesStatusSelection(o: Order): boolean {
    if (statusSelection.size === 0) {
      const k = normalizeStatusKey(o.status);
      return isOpenOrder(k);
    }
    const k = normalizeStatusKey(o.status);
    return k ? statusSelection.has(k) : false;
  }

  function matchesQuickFilter(o: Order): boolean {
    if (quickFilter === "none") return true;
    if (quickFilter === "mine") {
      const myEmail = adminProfile?.profile?.email?.toLowerCase() || "";
      const pEmail = o.photographer?.email?.toLowerCase() || "";
      return Boolean(myEmail && pEmail && myEmail === pEmail);
    }
    if (!o.appointmentDate) return quickFilter === "overdue" ? false : false;
    const d = new Date(o.appointmentDate);
    if (Number.isNaN(d.getTime())) return false;
    if (quickFilter === "today") return sameDay(d, now);
    if (quickFilter === "overdue") {
      return d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        && normalizeStatusKey(o.status) !== "done"
        && normalizeStatusKey(o.status) !== "cancelled"
        && normalizeStatusKey(o.status) !== "archived";
    }
    if (quickFilter === "thisWeek") {
      return d >= weekStart && d <= new Date(thisWeekEnd.getFullYear(), thisWeekEnd.getMonth(), thisWeekEnd.getDate(), 23, 59, 59);
    }
    if (quickFilter === "nextWeek") {
      return d >= nextWeekStart && d <= new Date(nextWeekEnd.getFullYear(), nextWeekEnd.getMonth(), nextWeekEnd.getDate(), 23, 59, 59);
    }
    return true;
  }

  const orders = useMemo(
    () =>
      allOrders.filter((o) => {
        const q = query.toLowerCase();
        const matchQ =
          !q || [o.orderNo, o.customerName, o.customerEmail, o.address, o.billing?.company].filter(Boolean).join(" ").toLowerCase().includes(q);
        if (!matchQ) return false;
        if (!matchesStatusSelection(o)) return false;
        if (photographerFilter !== "all") {
          if ((o.photographer?.key || "") !== photographerFilter) return false;
        }
        if (!matchesQuickFilter(o)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allOrders, query, statusSelection, photographerFilter, quickFilter, adminProfile, now],
  );

  const visibleOrderNoSet = useMemo(() => new Set(orders.map((o) => String(o.orderNo))), [orders]);
  useEffect(() => {
    setSelectedNos((prev) => {
      const next = new Set([...prev].filter((n) => visibleOrderNoSet.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleOrderNoSet]);

  function toggleStatusChip(key: StatusKey) {
    setStatusSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleRowSelection(orderNo: string) {
    setSelectedNos((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  }

  function toggleAllVisible(select: boolean) {
    setSelectedNos((prev) => {
      const next = new Set(prev);
      const visible = orders.map((o) => String(o.orderNo));
      if (select) visible.forEach((n) => next.add(n));
      else visible.forEach((n) => next.delete(n));
      return next;
    });
  }

  function toggleSectionSelection(orderNos: string[], select: boolean) {
    setSelectedNos((prev) => {
      const next = new Set(prev);
      if (select) orderNos.forEach((n) => next.add(n));
      else orderNos.forEach((n) => next.delete(n));
      return next;
    });
  }

  async function runBulkSetStatus() {
    const list = [...selectedNos];
    if (!list.length || !token) return;
    setBulkBusy(true);
    setBulkFeedback(null);
    let ok = 0;
    let fail = 0;
    for (const no of list) {
      try {
        await updateOrderStatus(token, no, bulkTargetStatus, { sendEmails: false });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    await refetch({ force: true });
    setSelectedNos(new Set());
    if (fail > 0) {
      setBulkFeedback(
        t(lang, "orders.bulk.partialResult")
          .replace("{{ok}}", String(ok))
          .replace("{{fail}}", String(fail))
          .replace("{{total}}", String(list.length)),
      );
    } else {
      setBulkFeedback(t(lang, "orders.bulk.allStatusOk").replace("{{count}}", String(ok)));
    }
    window.setTimeout(() => setBulkFeedback(null), 8000);
  }

  async function runBulkDelete() {
    const list = [...selectedNos];
    if (!list.length || !token) return;
    setBulkBusy(true);
    setBulkFeedback(null);
    let ok = 0;
    let fail = 0;
    for (const no of list) {
      try {
        await deleteOrder(token, no);
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    setShowBulkDelete(false);
    if (detailNo && list.includes(detailNo)) {
      setDetailNo(null);
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
    await refetch({ force: true });
    setSelectedNos(new Set());
    if (fail > 0) {
      setBulkFeedback(
        t(lang, "orders.bulk.partialDeleteResult")
          .replace("{{ok}}", String(ok))
          .replace("{{fail}}", String(fail))
          .replace("{{total}}", String(list.length)),
      );
    } else {
      setBulkFeedback(t(lang, "orders.bulk.allDeleteOk").replace("{{count}}", String(ok)));
    }
    window.setTimeout(() => setBulkFeedback(null), 8000);
  }

  const deleteMutation = useMutation<void, { orderNo: string }, { previous?: Order[] }>(
    async ({ orderNo }) => {
      await deleteOrder(token, orderNo);
    },
    {
      mutationKey: `orders:delete:${token}`,
      invalidateKeys: [queryKey],
      onMutate: ({ orderNo }) => {
        const previous = useQueryStore.getState().queries[queryKey]?.data as Order[] | undefined;
        updateCachedOrders<Order[]>(queryKey, (current = []) =>
          current.filter((order) => order.orderNo !== orderNo),
        );
        return { previous: previous ? [...previous] : undefined };
      },
      onError: (_error, _variables, context) => {
        if (!context?.previous) return;
        useQueryStore.getState().setData(queryKey, context.previous);
      },
    },
  );

  async function onDelete(orderNo: string) {
    await deleteMutation.mutate({ orderNo });
    setDetailNo(null);
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
    await refetch({ force: true });
  }

  function closeDetail() {
    setDetailNo(null);
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
  }

  const overdueCount = useMemo(
    () =>
      allOrders.filter((o) => {
        const info = getTerminInfo(o.appointmentDate, lang, now);
        if (info.kind !== "overdue") return false;
        const k = normalizeStatusKey(o.status);
        return k !== "done" && k !== "cancelled" && k !== "archived";
      }).length,
    [allOrders, lang, now],
  );

  const effectiveDetailNo = detailNo || searchParams.get("open");

  const hasAnyActiveFilter = statusSelection.size > 0 || quickFilter !== "none" || photographerFilter !== "all" || query.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-2"
          style={{ borderColor: "var(--accent-subtle)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="cust-alert cust-alert--error rounded-xl p-6 text-center">
        <p className="font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cust-page-header-title text-3xl mb-1">{t(lang, "orders.title")}</h1>
          <p className="cust-page-header-sub">{t(lang, "orders.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            items={[
              { key: "list", label: t(lang, "orders.view.list"), icon: <List className="h-3.5 w-3.5" /> },
              { key: "calendar", label: t(lang, "orders.view.calendar"), icon: <Calendar className="h-3.5 w-3.5" /> },
              { key: "map", label: t(lang, "orders.view.map"), icon: <MapIcon className="h-3.5 w-3.5" />, disabled: true },
            ]}
            value={view}
            onChange={(v) => v !== "map" && setView(v as ViewMode)}
          />
          <button
            onClick={() => setShowCreate(true)}
            className="cust-btn-new"
          >
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">{t(lang, "orders.button.newOrder")}</span>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type="text"
              placeholder={t(lang, "orders.placeholder.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            />
          </div>
          <Segmented
            items={[
              { key: "none", label: t(lang, "orders.quick.all") },
              { key: "today", label: t(lang, "orders.quick.today") },
              { key: "thisWeek", label: t(lang, "orders.quick.thisWeek") },
              { key: "nextWeek", label: t(lang, "orders.quick.nextWeek") },
              { key: "overdue", label: `${t(lang, "orders.quick.overdue")}${overdueCount > 0 ? ` (${overdueCount})` : ""}`, tone: overdueCount > 0 ? "danger" : undefined },
              { key: "mine", label: t(lang, "orders.quick.mine") },
            ]}
            value={quickFilter}
            onChange={(v) => setQuickFilter(v as QuickFilter)}
          />
          <select
            value={photographerFilter}
            onChange={(e) => setPhotographerFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
          >
            <option value="all">{t(lang, "orders.filter.allEmployees")}</option>
            {photographers.map((p) => (
              <option key={p.key} value={p.key}>{p.name || p.key}</option>
            ))}
          </select>
          {hasAnyActiveFilter ? (
            <button
              type="button"
              onClick={() => {
                setStatusSelection(new Set());
                setQuickFilter("none");
                setPhotographerFilter("all");
                setQuery("");
              }}
              className="h-9 rounded-lg border border-[var(--border-soft)] bg-transparent px-3 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
            >
              {t(lang, "orders.filter.reset")}
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-[var(--border-soft)] pt-3">
          {CHIP_ORDER.map((key) => {
            const n = statusCounts[key];
            const active = statusSelection.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleStatusChip(key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]"
                  : "border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]"}`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[key] }} />
                {getStatusLabel(key)}
                <span
                  className={`rounded-full px-1.5 py-0 text-[10px] ${active
                    ? "bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                    : "bg-[color-mix(in_srgb,var(--text-subtle)_20%,transparent)] text-[var(--text-muted)]"}`}
                >
                  {n}
                </span>
              </button>
            );
          })}
          {statusSelection.size === 0 ? (
            <span className="text-[11px] text-[var(--text-subtle)]">{t(lang, "orders.filter.chipsHint")}</span>
          ) : null}
        </div>
      </div>

      {bulkFeedback ? (
        <div className="cust-alert cust-alert--info rounded-xl px-4 py-3 text-sm">{bulkFeedback}</div>
      ) : null}

      {selectedNos.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[var(--primary-contrast)] shadow-md" style={{ color: "#1a1200" }}>
          <span className="rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-semibold">
            {t(lang, "orders.bulk.selected").replace("{{count}}", String(selectedNos.size))}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
              {t(lang, "orders.bulk.targetStatus")}
            </label>
            <select
              value={bulkTargetStatus}
              onChange={(e) => setBulkTargetStatus(e.target.value as StatusKey)}
              className="h-7 rounded-md border border-black/20 bg-white/30 px-2 text-xs font-medium text-[#1a1200]"
              disabled={bulkBusy}
            >
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {getStatusLabel(s)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="h-7 rounded-md bg-black/15 px-3 text-xs font-semibold hover:bg-black/25 disabled:opacity-50"
              disabled={bulkBusy}
              onClick={() => void runBulkSetStatus()}
            >
              {bulkBusy ? t(lang, "orders.bulk.applying") : t(lang, "orders.bulk.applyStatus")}
            </button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="h-7 rounded-md bg-black/15 px-3 text-xs font-semibold hover:bg-black/25 disabled:opacity-50"
              disabled={bulkBusy}
              onClick={() => setShowBulkDelete(true)}
            >
              {t(lang, "orders.bulk.deleteSelected")}
            </button>
            <button
              type="button"
              className="h-7 rounded-md bg-transparent px-3 text-xs font-semibold hover:bg-black/15 disabled:opacity-50"
              disabled={bulkBusy}
              onClick={() => setSelectedNos(new Set())}
            >
              {t(lang, "orders.bulk.clearSelection")}
            </button>
          </div>
        </div>
      ) : null}

      {/* View */}
      {view === "list" ? (
        orders.length === 0 ? (
          <EmptyState lang={lang} />
        ) : (
          <OrderTable
            orders={orders}
            onOpenDetail={setDetailNo}
            onOpenMessages={setMsgNo}
            onOpenUpload={(no) => navigate(`/upload?order=${encodeURIComponent(no)}`)}
            selectedNos={selectedNos}
            onToggleRow={toggleRowSelection}
            onToggleAllVisible={toggleAllVisible}
            onToggleSection={toggleSectionSelection}
          />
        )
      ) : (
        <OrderWeekCalendar orders={orders} onOpenDetail={setDetailNo} />
      )}

      <Dialog open={showBulkDelete} onOpenChange={(open) => !bulkBusy && setShowBulkDelete(open)}>
        <DialogContent className="max-w-md border-red-500/25">
          <DialogClose onClose={() => !bulkBusy && setShowBulkDelete(false)} />
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <DialogTitle className="text-lg">{t(lang, "orders.bulk.confirmDeleteTitle")}</DialogTitle>
            </div>
          </DialogHeader>
          <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
            {t(lang, "orders.bulk.confirmDeleteMessage").replace("{{count}}", String(selectedNos.size))}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-secondary flex-1 justify-center"
              disabled={bulkBusy}
              onClick={() => setShowBulkDelete(false)}
            >
              {t(lang, "common.cancel")}
            </button>
            <button
              type="button"
              className="flex-1 justify-center rounded-lg border-none bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              disabled={bulkBusy}
              onClick={() => void runBulkDelete()}
            >
              {bulkBusy ? t(lang, "orders.bulk.deleting") : t(lang, "orders.bulk.confirmDelete")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateOrderWizard
        token={token}
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={async () => {
          await refetch({ force: true });
        }}
      />
      {effectiveDetailNo ? (
        <OrderDetail
          token={token}
          orderNo={effectiveDetailNo}
          onClose={closeDetail}
          onDelete={onDelete}
          onRefresh={async () => {
            await refetch({ force: true });
          }}
          onOpenUpload={(no) => navigate(`/upload?order=${encodeURIComponent(no)}`)}
        />
      ) : null}
      {msgNo ? <OrderMessages token={token} orderNo={msgNo} onClose={() => setMsgNo(null)} /> : null}
    </div>
  );
}

type SegmentedItem = { key: string; label: string; icon?: React.ReactNode; disabled?: boolean; tone?: "danger" };

function Segmented({ items, value, onChange }: { items: SegmentedItem[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] p-0.5">
      {items.map((item) => {
        const active = value === item.key;
        const danger = item.tone === "danger" && !active;
        return (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active
              ? "bg-[var(--surface)] text-[var(--text-main)] shadow-sm"
              : danger
                ? "text-red-600 hover:bg-[var(--surface)]/50"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"} ${item.disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ lang }: { lang: "de" | "en" | "fr" | "it" }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface)] p-10 text-center">
      <p className="text-sm font-medium text-[var(--text-main)]">{t(lang, "orders.empty.title")}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t(lang, "orders.empty.description")}</p>
    </div>
  );
}
