/** Single source of truth — booking/order-status.js (subset) */
export const ORDER_STATUS = {
  PENDING: "pending",
  PROVISIONAL: "provisional",
  CONFIRMED: "confirmed",
  PAUSED: "paused",
  COMPLETED: "completed",
  DONE: "done",
  CANCELLED: "cancelled",
  ARCHIVED: "archived",
} as const;

export const VALID_STATUSES = Object.values(ORDER_STATUS) as string[];
