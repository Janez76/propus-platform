/**
 * SPA route for Bestell-Kanban.
 *
 * `/orders/kanban` must not be handled by `orders/[id]` (dynamic segment),
 * otherwise Next treats "kanban" as order id → invalid number → 404.
 */
import ClientShellLoader from "@/components/ClientShellLoader";

export default function OrdersKanbanSpaPage() {
  return <ClientShellLoader />;
}
