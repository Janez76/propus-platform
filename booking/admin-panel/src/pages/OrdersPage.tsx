import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Filter } from "lucide-react";
import { deleteOrder, getOrders, type Order } from "../api/orders";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { OrderDetail } from "../components/orders/OrderDetail";
import { OrderMessages } from "../components/orders/OrderMessages";
import { OrderTable } from "../components/orders/OrderTable";
import { useMutation } from "../hooks/useMutation";
import { useQuery } from "../hooks/useQuery";
import { ordersQueryKey } from "../lib/queryKeys";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { getStatusLabel, STATUS_KEYS, statusMatches } from "../lib/status";
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-6 text-center">
        <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-main)] mb-2">
            {t(lang, "orders.title")}
          </h1>
          <p className="text-[var(--text-subtle)]">
            {t(lang, "orders.description")}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm hover:bg-[var(--accent-hover)] transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">{t(lang, "orders.button.newOrder")}</span>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="bg-[var(--surface)] rounded-xl border border-slate-200/60 border-[var(--border-soft)] shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-subtle)]" />
            <input
              type="text"
              placeholder={t(lang, "orders.placeholder.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-main)] text-sm placeholder:text-slate-400 placeholder:text-[var(--text-subtle)] hover:border-slate-300 hover:border-[var(--border-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--text-subtle)] hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-main)] text-sm font-medium hover:border-slate-300 hover:border-[var(--border-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-colors min-w-[140px]"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? t(lang, "orders.filter.allStatus") : getStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">{t(lang, "orders.label.openCount")}</span>
            <span className="text-sm font-bold text-amber-900 dark:text-amber-300">{openOrders}</span>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <OrderTable 
        orders={orders} 
        onOpenDetail={setDetailNo} 
        onOpenMessages={setMsgNo} 
        onOpenUpload={(no) => navigate(`/upload?order=${encodeURIComponent(no)}`)} 
      />

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


