import { describe, expect, it, vi } from "vitest";
import { createOrdersHandlers } from "@/lib/assistant/tools/orders";
import { createToursHandlers } from "@/lib/assistant/tools/tours";

describe("assistant order tools", () => {
  it("caps open-order limits and maps booking.orders JSON fields", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        order_no: 42,
        status: "confirmed",
        address: "Bahnhofstrasse 1, Zürich",
        object: { type: "Wohnung" },
        services: { photography: true, drone: true },
        photographer: { name: "Janez" },
        schedule: { date: "2026-05-01", time: "10:30" },
        billing: { name: "Muster AG", email: "info@muster.ch" },
        customer_id: 7,
        created_at: "2026-04-30T10:00:00.000Z",
      },
    ]);

    const handlers = createOrdersHandlers({ query });
    const result = await handlers.get_open_orders({ days_ahead: 90, limit: 500 }, { userId: "u", userEmail: "u@example.com" });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("booking.orders"), [90, 50]);
    expect(result).toEqual({
      count: 1,
      orders: [
        {
          orderNo: 42,
          status: "confirmed",
          address: "Bahnhofstrasse 1, Zürich",
          customerId: 7,
          customerName: "Muster AG",
          customerEmail: "info@muster.ch",
          objectLabel: "Wohnung",
          services: ["photography", "drone"],
          photographerName: "Janez",
          scheduledDate: "2026-05-01",
          scheduledTime: "10:30",
          createdAt: "2026-04-30T10:00:00.000Z",
        },
      ],
    });
  });
});

describe("assistant tour tools", () => {
  it("prefers canonical tour fields and caps expiring-tour limits", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 12,
        bezeichnung: "Legacy Label",
        object_label: "Legacy Objekt",
        canonical_object_label: "Kanonisches Objekt",
        customer_name: "Kunde AG",
        customer_email: "kunde@example.com",
        customer_id: 3,
        status: "ACTIVE",
        matterport_space_id: "legacy-space",
        canonical_matterport_space_id: "space-123",
        term_end_date: "2026-06-01",
        ablaufdatum: "2026-05-30",
        canonical_term_end_date: "2026-06-15",
        booking_order_no: 99,
      },
    ]);

    const handlers = createToursHandlers({ query });
    const result = await handlers.get_tours_expiring_soon({ days_ahead: 365, limit: 999 }, { userId: "u", userEmail: "u@example.com" });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("tour_manager.tours"), [365, 50]);
    expect(result).toEqual({
      count: 1,
      tours: [
        {
          id: 12,
          label: "Kanonisches Objekt",
          customerName: "Kunde AG",
          customerEmail: "kunde@example.com",
          customerId: 3,
          status: "ACTIVE",
          matterportSpaceId: "space-123",
          termEndDate: "2026-06-15",
          bookingOrderNo: 99,
        },
      ],
    });
  });
});
