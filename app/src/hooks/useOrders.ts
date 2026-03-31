import { useMemo } from "react";
import { getOrders } from "../api/orders";
import { ordersQueryKey } from "../lib/queryKeys";
import { useQuery } from "./useQuery";
import { useOrderStore } from "../store/orderStore";

/**
 * @deprecated Bitte `useQuery(ordersQueryKey(token), () => getOrders(token))` direkt verwenden.
 */
export function useOrders(token: string) {
  const query = useOrderStore((s) => s.query);
  const statusFilter = useOrderStore((s) => s.statusFilter);
  const key = ordersQueryKey(token);
  const { data = [], loading, error, refetch } = useQuery(key, () => getOrders(token), {
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(
    () =>
      data.filter((o) => {
        const q = query.toLowerCase();
        const matchQ =
          !q || [o.orderNo, o.customerName, o.customerEmail, o.address].join(" ").toLowerCase().includes(q);
        const matchS = statusFilter === "all" || o.status === statusFilter;
        return matchQ && matchS;
      }),
    [data, query, statusFilter],
  );

  return { orders: filtered, loading, error, refresh: () => refetch({ force: true }) };
}
