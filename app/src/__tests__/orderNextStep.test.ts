import { describe, expect, it } from "vitest";
import { orderNextStep } from "@/lib/orderNextStep";
import type { Order } from "@/api/orders";

function mk(partial: Partial<Order>): Order {
  return {
    orderNo: "100000",
    status: "pending",
    ...partial,
  } as unknown as Order;
}

describe("orderNextStep", () => {
  it("returns none for null/undefined", () => {
    expect(orderNextStep(null).action).toBe("none");
    expect(orderNextStep(undefined).action).toBe("none");
  });

  it("returns none for cancelled / archived / paused", () => {
    expect(orderNextStep(mk({ status: "cancelled" })).action).toBe("none");
    expect(orderNextStep(mk({ status: "archived" })).action).toBe("none");
    expect(orderNextStep(mk({ status: "paused", appointmentDate: null })).action).toBe("none");
  });

  it("done without bexio order → invoice", () => {
    const s = orderNextStep(mk({ status: "done" }));
    expect(s.action).toBe("invoice");
    expect(s.anchor).toBe("#invoice");
    expect(s.labelKey).toBe("orders.nextStep.invoice.label");
  });

  it("completed with bexio order number → none", () => {
    expect(orderNextStep(mk({ status: "completed", bexioOrderNumber: "AB-1" })).action).toBe("none");
    expect(orderNextStep(mk({ status: "done", bexioOrderId: 42 })).action).toBe("none");
  });

  it("disposition_offen → schedule", () => {
    const s = orderNextStep(mk({ status: "disposition_offen" }));
    expect(s.action).toBe("schedule");
    expect(s.tone).toBe("warn");
  });

  it("flexible booking without appointment → schedule", () => {
    expect(orderNextStep(mk({ status: "confirmed", bookingKind: "flexible", appointmentDate: null })).action).toBe("schedule");
  });

  it("missing appointment date → schedule", () => {
    expect(orderNextStep(mk({ status: "pending", appointmentDate: null })).action).toBe("schedule");
  });

  it("appointment set but no photographer → photographer", () => {
    const s = orderNextStep(mk({ status: "pending", appointmentDate: "2026-06-01T10:00:00Z", photographer: null }));
    expect(s.action).toBe("photographer");
    expect(s.anchor).toBe("#photographer");
  });

  it("pending/provisional with appointment + photographer → confirm", () => {
    const base = { appointmentDate: "2026-06-01T10:00:00Z", photographer: { key: "anna", name: "Anna" } };
    expect(orderNextStep(mk({ status: "pending", ...base })).action).toBe("confirm");
    expect(orderNextStep(mk({ status: "provisional", ...base })).action).toBe("confirm");
  });

  it("confirmed with appointment + photographer → deliver", () => {
    const s = orderNextStep(mk({
      status: "confirmed",
      appointmentDate: "2026-06-01T10:00:00Z",
      photographer: { key: "anna", name: "Anna" },
    }));
    expect(s.action).toBe("deliver");
    expect(s.tone).toBe("default");
  });
});
