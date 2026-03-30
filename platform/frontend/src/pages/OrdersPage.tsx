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

