import { ORDER_STATUS, VALID_STATUSES } from "./orderStatus";

const ALLOWED: Record<string, string[]> = {
  [ORDER_STATUS.PENDING]: [
    ORDER_STATUS.PROVISIONAL,
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.PAUSED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.ARCHIVED,
    ORDER_STATUS.DONE,
    ORDER_STATUS.COMPLETED,
  ],
  [ORDER_STATUS.PROVISIONAL]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.PAUSED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PAUSED]: [
    ORDER_STATUS.PENDING,
    ORDER_STATUS.PROVISIONAL,
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.CONFIRMED]: [
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.DONE,
    ORDER_STATUS.PAUSED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.COMPLETED]: [ORDER_STATUS.DONE, ORDER_STATUS.ARCHIVED],
  [ORDER_STATUS.DONE]: [ORDER_STATUS.ARCHIVED],
  [ORDER_STATUS.CANCELLED]: [ORDER_STATUS.ARCHIVED, ORDER_STATUS.PENDING],
  [ORDER_STATUS.ARCHIVED]: [ORDER_STATUS.PENDING],
};

function isTransitionAllowed(
  from: string,
  to: string,
  context?: { source?: string },
): boolean {
  const f = String(from || "").toLowerCase();
  const t = String(to || "").toLowerCase();
  if (!VALID_STATUSES.includes(t)) return false;
  const allowed = ALLOWED[f] || [];
  if (allowed.includes(t)) return true;
  if (f === ORDER_STATUS.PROVISIONAL && t === ORDER_STATUS.PENDING) {
    return context?.source === "expiry_job";
  }
  return false;
}

export type OrderShape = {
  photographerKey?: string | null;
  schedule?: { date?: string; time?: string } | null;
  photographer?: { key?: string } | null;
};

/**
 * @returns Fehlermeldung oder null wenn erlaubt
 */
export function getTransitionError(
  fromStatus: string,
  toStatus: string,
  order: OrderShape,
  context?: { source?: string },
): string | null {
  const from = String(fromStatus || "").toLowerCase();
  const to = String(toStatus || "").toLowerCase();
  if (!VALID_STATUSES.includes(to)) {
    return `Ungültiger Status: "${to}". Erlaubt: ${VALID_STATUSES.join(", ")}.`;
  }
  if (!isTransitionAllowed(from, to, context)) {
    if (from === ORDER_STATUS.PROVISIONAL && to === ORDER_STATUS.PENDING) {
      return 'Statusübergang von "provisional" zu "pending" ist nur via Ablauf-Job erlaubt.';
    }
    return `Statusübergang von "${from}" zu "${to}" ist nicht erlaubt.`;
  }
  if (to === ORDER_STATUS.CONFIRMED || to === ORDER_STATUS.PROVISIONAL) {
    const photographerKey =
      order.photographer?.key || (order as { photographerKey?: string }).photographerKey || "";
    if (!photographerKey) {
      return `Status "${to}" erfordert einen zugewiesenen Mitarbeiter.`;
    }
    const scheduleDate = order.schedule?.date || "";
    const scheduleTime = order.schedule?.time || "";
    if (!scheduleDate || !scheduleTime) {
      return `Status "${to}" erfordert einen gültigen Termin (Datum + Uhrzeit).`;
    }
  }
  return null;
}

export function getSideEffects(fromStatus: string, toStatus: string): string[] {
  const from = String(fromStatus || "").toLowerCase();
  const to = String(toStatus || "").toLowerCase();
  const effects: string[] = [];
  if (to === ORDER_STATUS.PROVISIONAL) {
    effects.push("calendar.create_provisional", "email.provisional_created");
  }
  if (to === ORDER_STATUS.CONFIRMED) {
    if (from === ORDER_STATUS.PROVISIONAL) {
      effects.push("calendar.upgrade_to_final");
    } else {
      effects.push("calendar.create_final");
    }
    effects.push("email.confirmed_customer", "email.confirmed_photographer", "email.confirmed_office");
  }
  if (to === ORDER_STATUS.PAUSED) {
    effects.push("calendar.delete");
    if (from !== ORDER_STATUS.PENDING) {
      effects.push("email.paused_customer", "email.paused_photographer", "email.paused_office");
    }
  }
  if (to === ORDER_STATUS.CANCELLED) {
    effects.push("calendar.delete", "calendar.send_ics_cancel", "email.cancelled_all");
    if (from === ORDER_STATUS.PROVISIONAL) {
      effects.push("provisional.clear");
    }
  }
  if (to === ORDER_STATUS.PENDING && from === ORDER_STATUS.PROVISIONAL) {
    effects.push("calendar.delete_provisional", "provisional.clear");
  }
  if (to === ORDER_STATUS.PENDING && from !== ORDER_STATUS.PROVISIONAL) {
    effects.push("calendar.delete_if_exists");
  }
  if (to === ORDER_STATUS.DONE) {
    effects.push("review.schedule", "timestamp.set_done_at", "timestamp.set_closed_at");
  }
  if (to === ORDER_STATUS.ARCHIVED) {
    effects.push("chat.close_permanently");
  }
  return effects;
}

/** Effekte, die Mails triggern (Präfix email.) */
export function getEmailEffects(effects: string[]): string[] {
  return effects.filter((e) => e.startsWith("email."));
}
