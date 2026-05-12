import type { Order } from "../api/orders";
import { normalizeStatusKey } from "./status";

export type NextStepAction = "schedule" | "photographer" | "confirm" | "invoice" | "deliver" | "none";

export interface OrderNextStep {
  /** i18n key for the imperative CTA label, e.g. "orders.nextStep.photographer.label". */
  labelKey: string;
  /** German fallback for {@link labelKey}. */
  label: string;
  /** i18n key for the short inline status suffix. */
  shortKey: string;
  /** German fallback for {@link shortKey}. */
  short: string;
  action: NextStepAction;
  /** Anchor on the full order page that the CTA should jump to. */
  anchor: string;
  tone: "warn" | "info" | "default";
}

const NONE: OrderNextStep = { labelKey: "", label: "", shortKey: "", short: "", action: "none", anchor: "", tone: "default" };

function step(
  action: Exclude<NextStepAction, "none">,
  label: string,
  short: string,
  anchor: string,
  tone: OrderNextStep["tone"],
): OrderNextStep {
  return { action, label, short, anchor, tone, labelKey: `orders.nextStep.${action}.label`, shortKey: `orders.nextStep.${action}.short` };
}

function hasPhotographer(o: Order): boolean {
  const name = o.photographer?.name?.trim() || "";
  const key = o.photographer?.key?.trim() || "";
  return Boolean(name || key);
}

/**
 * Derives the single most relevant "what to do next" hint for an order so the
 * UI can communicate the next step actively instead of only showing a status.
 * Returns i18n keys plus German fallbacks; callers resolve via `t(lang, key)`.
 */
export function orderNextStep(o: Order | null | undefined): OrderNextStep {
  if (!o) return NONE;
  const key = normalizeStatusKey(o.status);

  // Paused/cancelled/archived orders have no actionable next step here — the
  // detailed form disables scheduling/photographer edits in those states.
  if (key === "cancelled" || key === "archived" || key === "paused") return NONE;

  if (key === "done" || key === "completed") {
    if (!o.bexioOrderNumber && !o.bexioOrderId) {
      return step("invoice", "Rechnung stellen", "Rechnung offen", "#invoice", "info");
    }
    return NONE;
  }

  // Flexible bookings that still sit in disposition need a date/photographer.
  const isDispo = key === "disposition_offen" || (o.bookingKind === "flexible" && !o.appointmentDate);
  if (isDispo) return step("schedule", "Termin disponieren", "Termin offen", "#schedule", "warn");

  if (!o.appointmentDate) return step("schedule", "Termin festlegen", "Termin offen", "#schedule", "warn");

  if (!hasPhotographer(o)) return step("photographer", "Fotograf zuweisen", "Fotograf fehlt", "#photographer", "warn");

  if (key === "pending" || key === "provisional") {
    return step("confirm", "Termin bestätigen", "noch nicht bestätigt", "#status", "info");
  }

  if (key === "confirmed") {
    return step("deliver", "Als erledigt markieren", "Shooting steht an", "#status", "default");
  }

  return NONE;
}
