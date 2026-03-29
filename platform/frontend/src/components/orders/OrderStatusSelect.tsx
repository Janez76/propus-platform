import { useState } from "react";
import { updateOrderStatus } from "../../api/orders";
import { getStatusLabel, normalizeStatusKey, STATUS_KEYS, type StatusKey } from "../../lib/status";
import { useQueryStore } from "../../store/queryStore";
import { ordersQueryKey } from "../../lib/queryKeys";
import type { Order } from "../../api/orders";

type Props = {
  orderNo: string | number;
  value: string;
  token: string;
  disabled?: boolean;
  autoSave?: boolean;
  sendEmails?: boolean;
  onChanged?: (nextStatus: StatusKey) => void;
  onError?: (message: string) => void;
  onPendingChange?: (pending: boolean) => void;
  className?: string;
};

/**
 * Zentrale Status-Auswahl-Komponente.
 *
 * - Zeigt alle Status aus der UI-SSOT (backend validiert final).
 * - Ruft direkt PATCH /api/admin/orders/:orderNo/status auf.
 * - Während Request: disabled.
 * - Erfolg: onChanged(nextStatus) + optimistisches Cache-Update.
 * - Fehler: alten Status wiederherstellen + onError(message).
 */
export function OrderStatusSelect({
  orderNo,
  value,
  token,
  disabled,
  autoSave = true,
  sendEmails = false,
  onChanged,
  onError,
  onPendingChange,
  className,
}: Props) {
  const currentKey = normalizeStatusKey(value) ?? "pending";
  const [isPending, setIsPending] = useState(false);

  const ordersKey = ordersQueryKey(token);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as StatusKey;
    if (next === currentKey || isPending) return;

    if (!autoSave) {
      onChanged?.(next);
      return;
    }

    // Optimistisches Cache-Update
    const queryStore = useQueryStore.getState();
    const previous = queryStore.queries[ordersKey]?.data as Order[] | undefined;
    queryStore.updateData<Order[]>(ordersKey, (current = []) =>
      current.map((o) =>
        String(o.orderNo) === String(orderNo) ? { ...o, status: next } : o,
      ),
    );

    setIsPending(true);
    onPendingChange?.(true);
    try {
      await updateOrderStatus(token, String(orderNo), next, { sendEmails });
      queryStore.invalidate(ordersKey);
      onChanged?.(next);
    } catch (err) {
      // Rollback
      if (previous) {
        useQueryStore.getState().setData(ordersKey, previous);
      }
      const message = err instanceof Error ? err.message : "Statusänderung fehlgeschlagen";
      onError?.(message);
    } finally {
      setIsPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <select
      className={className ?? "ui-input"}
      value={currentKey}
      onChange={handleChange}
      disabled={disabled || isPending}
      aria-busy={isPending}
    >
      {STATUS_KEYS.map((s) => (
        <option key={s} value={s}>
          {getStatusLabel(s)}
        </option>
      ))}
    </select>
  );
}
