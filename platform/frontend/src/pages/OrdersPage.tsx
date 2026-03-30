import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Plus, Search, Filter } from "lucide-react";
import { deleteOrder, getOrders, updateOrderStatus, type Order } from "../api/orders";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { OrderDetail } from "../components/orders/OrderDetail";
import { OrderMessages } from "../components/orders/OrderMessages";
import { OrderTable } from "../components/orders/OrderTable";
import { useMutation } from "../hooks/useMutation";
import { useQuery } from "../hooks/useQuery";
import { ordersQueryKey } from "../lib/queryKeys";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { getStatusLabel, STATUS_KEYS, statusMatches, type StatusKey } from "../lib/status";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useOrderStore } from "../store/orderStore";
import { useQueryStore } from "../store/queryStore";

export function OrdersPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useOrderStore((s) => s.query);
  const setQuery = useOrderStore((s) => s.setQuery);
  const statusFilter = useOrderStore((s) => s.statusFilter);
  const setStatusFilter = useOrderStore((s) => s.setStatusFilter);
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

  const orders = useMemo(
    () =>
      allOrders.filter((o) => {
        const q = query.toLowerCase();
        const matchQ =
          !q || [o.orderNo, o.customerName, o.customerEmail, o.address].join(" ").toLowerCase().includes(q);
        const matchS = statusMatches(o.status, statusFilter);
        return matchQ && matchS;
      }),
    [allOrders, query, statusFilter],
  );

  const [detailNo, setDetailNo] = useState<string | null>(null);
  const [msgNo, setMsgNo] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedNos, setSelectedNos] = useState<Set<string>>(() => new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState<StatusKey>("pending");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const visibleOrderNoSet = useMemo(() => new Set(orders.map((o) => String(o.orderNo))), [orders]);
  useEffect(() => {
    setSelectedNos((prev) => {
      const next = new Set([...prev].filter((n) => visibleOrderNoSet.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleOrderNoSet]);

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

  const statuses = useMemo(() => ["all", ...STATUS_KEYS] as string[], []);

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

  const openOrders = orders.filter((o) => {
    const k = (o.status || "").toLowerCase();
    return !statusMatches(k, "done") && !statusMatches(k, "archived") && !statusMatches(k, "cancelled");
  }).length;

  const effectiveDetailNo = detailNo || searchParams.get("open");


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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="cust-page-header-title text-3xl mb-2">{t(lang, "orders.title")}</h1>
          <p className="cust-page-header-sub">{t(lang, "orders.description")}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="cust-btn-new"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">{t(lang, "orders.button.newOrder")}</span>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="rounded-xl p-4 shadow-sm" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)" }}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="cust-search-wrap flex-1 max-w-none">
            <Search className="h-4 w-4" />
            <input
              type="text"
              placeholder={t(lang, "orders.placeholder.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="cust-search-input"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 hidden sm:block" style={{ color: "var(--text-subtle)" }} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="cust-filter-select min-w-[140px]"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? t(lang, "orders.filter.allStatus") : getStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="cust-status-badge cust-status-pending px-4 py-2 rounded-lg">
            <span className="text-xs font-semibold uppercase tracking-wider">{t(lang, "orders.label.openCount")}</span>
            <span className="text-sm font-bold ml-1">{openOrders}</span>
          </div>
        </div>
      </div>

      {bulkFeedback ? (
        <div className="cust-alert cust-alert--info rounded-xl px-4 py-3 text-sm">{bulkFeedback}</div>
      ) : null}

      {selectedNos.size > 0 ? (
        <div
          className="flex flex-col gap-3 rounded-xl p-4 shadow-md sm:flex-row sm:flex-wrap sm:items-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border-soft)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>
            {t(lang, "orders.bulk.selected").replace("{{count}}", String(selectedNos.size))}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
              {t(lang, "orders.bulk.targetStatus")}
            </label>
            <select
              value={bulkTargetStatus}
              onChange={(e) => setBulkTargetStatus(e.target.value as StatusKey)}
              className="cust-filter-select min-w-[180px]"
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
              className="btn-primary min-h-0 px-4 py-2 text-sm"
              disabled={bulkBusy}
              onClick={() => void runBulkSetStatus()}
            >
              {bulkBusy ? t(lang, "orders.bulk.applying") : t(lang, "orders.bulk.applyStatus")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              type="button"
              className="btn-secondary min-h-0 px-4 py-2 text-sm"
              disabled={bulkBusy}
              onClick={() => setSelectedNos(new Set())}
            >
              {t(lang, "orders.bulk.clearSelection")}
            </button>
            <button
              type="button"
              className="min-h-0 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              disabled={bulkBusy}
              onClick={() => setShowBulkDelete(true)}
            >
              {t(lang, "orders.bulk.deleteSelected")}
            </button>
          </div>
        </div>
      ) : null}

      {/* Orders Table */}
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

      {/* Modals */}
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

