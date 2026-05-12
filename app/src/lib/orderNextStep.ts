import type { Order } from "../api/orders";
import { normalizeStatusKey } from "./status";

export type NextStepAction = "schedule" | "photographer" | "confirm" | "invoice" | "deliver" | "none";

export interface OrderNextStep {
  /** Short imperative label, e.g. "Fotograf zuweisen". */
  label: string;
  /** Even shorter form for inline status suffixes, e.g. "Fotograf fehlt". */
  short: string;
  action: NextStepAction;
  /** Anchor on the full order page that the CTA should jump to. */
  anchor: string;
  tone: "warn" | "info" | "default";
}

function hasPhotographer(o: Order): boolean {
  const name = o.photographer?.name?.trim() || "";
  const key = o.photographer?.key?.trim() || "";
  return Boolean(name || key);
}

/**
 * Derives the single most relevant "what to do next" hint for an order so the
 * UI can communicate the next step actively instead of only showing a status.
 */
export function orderNextStep(o: Order | null | undefined): OrderNextStep {
  const none: OrderNextStep = { label: "", short: "", action: "none", anchor: "", tone: "default" };
  if (!o) return none;
  const key = normalizeStatusKey(o.status);

  if (key === "cancelled" || key === "archived") return none;

  if (key === "done" || key === "completed") {
    if (!o.bexioOrderNumber && !o.bexioOrderId) {
      return { label: "Rechnung stellen", short: "Rechnung offen", action: "invoice", anchor: "#invoice", tone: "info" };
    }
    return none;
  }

  // Flexible bookings that still sit in disposition need a date/photographer.
  const isDispo = key === "disposition_offen" || (o.bookingKind === "flexible" && !o.appointmentDate);
  if (isDispo) {
    return { label: "Termin disponieren", short: "Termin offen", action: "schedule", anchor: "#schedule", tone: "warn" };
  }

  if (!o.appointmentDate) {
    return { label: "Termin festlegen", short: "Termin offen", action: "schedule", anchor: "#schedule", tone: "warn" };
  }

  if (!hasPhotographer(o)) {
    return { label: "Fotograf zuweisen", short: "Fotograf fehlt", action: "photographer", anchor: "#photographer", tone: "warn" };
  }

  if (key === "pending" || key === "provisional") {
    return { label: "Termin bestätigen", short: "noch nicht bestätigt", action: "confirm", anchor: "#status", tone: "info" };
  }

  if (key === "confirmed") {
    return { label: "Als erledigt markieren", short: "Shooting steht an", action: "deliver", anchor: "#status", tone: "default" };
  }

  return none;
}
