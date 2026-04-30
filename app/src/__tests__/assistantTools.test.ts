import { describe, expect, it, vi } from "vitest";
import { createOrdersHandlers } from "@/lib/assistant/tools/orders";
import { createToursHandlers } from "@/lib/assistant/tools/tours";
import { deriveConversationLinksFromToolCalls } from "@/lib/assistant/store";

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

describe("assistant conversation links", () => {
  it("derives customer, order and tour links from tool call inputs and outputs", () => {
    expect(
      deriveConversationLinksFromToolCalls([
        {
          name: "get_order_by_id",
          input: { order_id: "101" },
          output: { orderNo: 101, customerId: 12, tours: [{ tourId: 55 }] },
          durationMs: 5,
        },
      ]),
    ).toEqual({ customerId: 12, bookingOrderNo: 101, tourId: 55 });
  });

  it("ignores generic id fields when deriving conversation links", () => {
    expect(
      deriveConversationLinksFromToolCalls([
        {
          name: "search_posteingang_conversations",
          input: { query: "Kunde" },
          output: { conversations: [{ id: 999, subject: "Keine direkte Tour-ID" }] },
          durationMs: 5,
        },
      ]),
    ).toEqual({});
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

  it("maps cleanup selections by customer email", async () => {
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
        confirmation_required: true,
        confirmation_sent_at: "2026-04-01T08:00:00.000Z",
        cleanup_sent_at: "2026-04-02T08:00:00.000Z",
        cleanup_action: "archivieren",
        cleanup_action_at: "2026-04-03T09:00:00.000Z",
        cleanup_completed: true,
        delete_requested_at: null,
        delete_after_at: null,
        latest_session_created_at: "2026-04-02T08:00:00.000Z",
        latest_session_expires_at: "2026-05-02T08:00:00.000Z",
        latest_session_accessed_at: "2026-04-02T08:30:00.000Z",
        latest_cleanup_log_action: "CLEANUP_DASHBOARD_ARCHIVIEREN",
        latest_cleanup_log_at: "2026-04-03T09:00:01.000Z",
        latest_cleanup_log_actor: "kunde@example.com",
        latest_cleanup_log_details: { matterport_space_id: "space-123" },
      },
    ]);

    const handlers = createToursHandlers({ query });
    const result = await handlers.get_cleanup_selections(
      { customer_email: " Kunde@Example.com ", limit: 999 },
      { userId: "u", userEmail: "u@example.com" },
    );

    expect(query).toHaveBeenCalledWith(expect.stringContaining("cleanup_action"), ["kunde@example.com", null, null, null, 50]);
    expect(result).toEqual({
      count: 1,
      cleanupSelections: [
        {
          tour: {
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
          confirmationRequired: true,
          confirmationSentAt: "2026-04-01T08:00:00.000Z",
          cleanupSentAt: "2026-04-02T08:00:00.000Z",
          cleanupAction: "archivieren",
          cleanupActionLabel: "Archivieren",
          cleanupActionAt: "2026-04-03T09:00:00.000Z",
          cleanupCompleted: true,
          deleteRequestedAt: null,
          deleteAfterAt: null,
          customerIntent: null,
          latestSession: {
            createdAt: "2026-04-02T08:00:00.000Z",
            expiresAt: "2026-05-02T08:00:00.000Z",
            lastAccessedAt: "2026-04-02T08:30:00.000Z",
          },
          latestCleanupLog: {
            action: "CLEANUP_DASHBOARD_ARCHIVIEREN",
            createdAt: "2026-04-03T09:00:01.000Z",
            actorRef: "kunde@example.com",
            details: { matterport_space_id: "space-123" },
          },
        },
      ],
    });
  });

  it("requires at least one cleanup lookup filter", async () => {
    const query = vi.fn();
    const handlers = createToursHandlers({ query });
    const result = await handlers.get_cleanup_selections({}, { userId: "u", userEmail: "u@example.com" });

    expect(query).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Bitte Tour-ID, Kunden-ID, Kunden-E-Mail oder Suchbegriff angeben." });
  });
});
