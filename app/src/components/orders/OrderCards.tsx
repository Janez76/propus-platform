import type { Order } from "../../api/orders";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import {
  STATUS_KEYS,
  getStatusLabel,
  getStatusBadgeClass,
  getStatusIcon,
  normalizeStatusKey,
  type StatusKey,
} from "../../lib/status";
import { OrderStatusSelect } from "./OrderStatusSelect";

type Props = {
  orders: Order[];
  token: string;
  onStatusChange?: (orderNo: string, status: string) => void;
  onOpenDetail: (orderNo: string) => void;
  onOpenMessages: (orderNo: string) => void;
  onOpenUpload: (orderNo: string) => void;
};

export function OrderCards({ orders, token, onStatusChange, onOpenDetail, onOpenMessages, onOpenUpload }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {orders.map((o) => {
        const currentKey = normalizeStatusKey(o.status) ?? "pending";
        const Icon = getStatusIcon(currentKey);

        return (
          <article key={o.orderNo} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm border-[var(--border-soft)] bg-[var(--surface)]">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold">#{o.orderNo}</h3>
              <span className={getStatusBadgeClass(currentKey)}>
                <Icon className="mr-1 h-3 w-3 shrink-0" />
                {getStatusLabel(currentKey)}
              </span>
            </div>
            <div className="text-sm font-semibold">{o.customerName || "-"}</div>
            <div className="text-xs text-zinc-500">{o.customerEmail || ""}</div>
            <div className="mt-2 text-xs text-zinc-600">{o.address || ""}</div>
            <div className="mt-1 text-xs text-zinc-600">{formatDateTime(o.appointmentDate)}</div>
            <div className="mt-3 text-lg font-bold">{formatCurrency(o.total || 0)}</div>
            <div className="mt-3 flex items-center gap-2">
              <OrderStatusSelect
                orderNo={o.orderNo}
                value={o.status}
                token={token}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs border-[var(--border-soft)] bg-[var(--surface-raised)]"
                onChanged={(next: StatusKey) => onStatusChange?.(o.orderNo, next)}
              />
              <button
                type="button"
                aria-label="Details"
                className="rounded border border-zinc-300 px-2 py-1 text-xs border-[var(--border-soft)]"
                onClick={() => onOpenDetail(o.orderNo)}
              >
                D
              </button>
              <button
                type="button"
                aria-label="Nachrichten"
                className="rounded border border-zinc-300 px-2 py-1 text-xs border-[var(--border-soft)]"
                onClick={() => onOpenMessages(o.orderNo)}
              >
                M
              </button>
              <button
                type="button"
                aria-label="Upload"
                className="rounded border border-zinc-300 px-2 py-1 text-xs border-[var(--border-soft)]"
                onClick={() => onOpenUpload(o.orderNo)}
              >
                U
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export { STATUS_KEYS };

