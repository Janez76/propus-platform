import { describe, expect, it, vi } from "vitest";
import { createOrdersHandlers } from "@/lib/assistant/tools/orders";
import { createToursHandlers } from "@/lib/assistant/tools/tours";
import { createInvoicesHandlers } from "@/lib/assistant/tools/invoices";
import { createCustomersHandlers } from "@/lib/assistant/tools/customers";
import { createPosteingangHandlers } from "@/lib/assistant/tools/posteingang";
import { createWriteHandlers } from "@/lib/assistant/tools/writes";
import { toAnthropicTools, type ToolDefinition } from "@/lib/assistant/tools";
import { deriveConversationLinksFromToolCalls } from "@/lib/assistant/store";

describe("assistant tool schema", () => {
  it("strips internal metadata before sending tools to Anthropic", () => {
    const tools: ToolDefinition[] = [
      {
        name: "create_ticket",
        description: "Ticket erstellen",
        input_schema: { type: "object", properties: { subject: { type: "string" } } },
        kind: "write",
        requiresConfirmation: true,
      },
    ];

    expect(toAnthropicTools(tools)).toEqual([
      {
        name: "create_ticket",
        description: "Ticket erstellen",
        input_schema: { type: "object", properties: { subject: { type: "string" } } },
      },
    ]);
  });

  it("strips accidental internal metadata from input schemas", () => {
    const tools = [
      {
        name: "create_ticket",
        description: "Ticket erstellen",
        input_schema: {
          type: "object",
          properties: { subject: { type: "string" } },
          required: ["subject"],
          kind: "write",
          requiresConfirmation: true,
        },
      },
    ] as unknown as ToolDefinition[];

    expect(toAnthropicTools(tools)).toEqual([
      {
        name: "create_ticket",
        description: "Ticket erstellen",
        input_schema: {
          type: "object",
          properties: { subject: { type: "string" } },
          required: ["subject"],
        },
      },
    ]);
  });
});

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

describe("assistant order detail tool", () => {
  it("returns full order context with folders, invoices and chat", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{
        order_no: 101,
        status: "confirmed",
        address: "Musterstrasse 5",
        object: { type: "Büro" },
        services: ["photo"],
        photographer: { name: "Max" },
        schedule: { date: "2026-05-10", time: "09:00" },
        billing: { name: "Test GmbH", email: "test@gmbh.ch" },
        customer_id: 5,
        created_at: "2026-04-01T10:00:00.000Z",
        done_at: null,
        cust_name: "Test GmbH",
        cust_email: "test@gmbh.ch",
        photographer_event_id: "ev-123",
        office_event_id: null,
      }])
      .mockResolvedValueOnce([{ folder_type: "raw", status: "uploaded", display_name: "RAW-Fotos" }])
      .mockResolvedValueOnce([{ source: "renewal", invoice_number: "R-2026-01", status: "open", amount: 590, due_at: "2026-06-01" }])
      .mockResolvedValueOnce([{ sender_role: "customer", sender_name: "Hans", body_text: "Hallo", created_at: "2026-04-20T08:00:00.000Z" }]);

    const handlers = createOrdersHandlers({ query });
    const result = await handlers.get_order_detail({ order_no: 101 }, { userId: "u", userEmail: "u@example.com" }) as Record<string, unknown>;

    expect(query).toHaveBeenCalledTimes(4);
    expect(result.orderNo).toBe(101);
    expect(result.customer).toEqual({ id: 5, name: "Test GmbH", email: "test@gmbh.ch" });
    expect(result.calendarLinked).toEqual({ photographer: true, office: false });
    expect(result.folders).toEqual([{ type: "raw", status: "uploaded", displayName: "RAW-Fotos" }]);
    expect(result.invoices).toEqual([{ source: "renewal", number: "R-2026-01", status: "open", amount: 590, dueAt: "2026-06-01" }]);
    expect(result.recentChat).toEqual([{ role: "customer", name: "Hans", text: "Hallo", at: "2026-04-20T08:00:00.000Z" }]);
  });

  it("returns error for invalid order_no", async () => {
    const query = vi.fn();
    const handlers = createOrdersHandlers({ query });
    const result = await handlers.get_order_detail({ order_no: -1 }, { userId: "u", userEmail: "u@example.com" });
    expect(result).toEqual({ error: "Ungültige Auftragsnummer" });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("assistant tour detail tool", () => {
  it("returns full tour context with invoices, actions, and tickets", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{
        id: 55,
        bezeichnung: "Alt",
        object_label: "Legacy",
        canonical_object_label: "Kanon-Label",
        customer_name: "Firma X",
        customer_email: "info@firmax.ch",
        customer_id: 10,
        status: "ACTIVE",
        matterport_space_id: "old-space",
        canonical_matterport_space_id: "space-abc",
        term_end_date: "2026-08-01",
        ablaufdatum: null,
        canonical_term_end_date: "2026-08-15",
        booking_order_no: 101,
        tour_url: "https://my.matterport.com/show/?m=space-abc",
        customer_verified: true,
        customer_intent: "weiterfuehren",
        cleanup_action: "weiterfuehren",
        cleanup_action_at: "2026-04-10T10:00:00.000Z",
        cleanup_completed: false,
        delete_requested_at: null,
        delete_after_at: null,
      }])
      .mockResolvedValueOnce([{ invoice_number: "R-2026-05", invoice_status: "open", amount_chf: 590, due_at: "2026-07-01" }])
      .mockResolvedValueOnce([{ nummer: "EX-100", exxas_status: "bz", preis_brutto: 200 }])
      .mockResolvedValueOnce([{ action: "STATUS_CHANGE", actor_ref: "admin@propus.ch", created_at: "2026-04-09T12:00:00.000Z", details_json: { from: "expired", to: "active" } }])
      .mockResolvedValueOnce([{ subject: "Startpunkt ändern", status: "open", category: "startpunkt" }]);

    const handlers = createToursHandlers({ query });
    const result = await handlers.get_tour_detail({ tour_id: 55 }, { userId: "u", userEmail: "u@example.com" }) as Record<string, unknown>;

    expect(query).toHaveBeenCalledTimes(5);
    expect(result.id).toBe(55);
    expect(result.label).toBe("Kanon-Label");
    expect(result.tourUrl).toBe("https://my.matterport.com/show/?m=space-abc");
    expect(result.customerVerified).toBe(true);
    expect(result.cleanup).toEqual({
      action: "weiterfuehren",
      actionLabel: "Weiterführen",
      actionAt: "2026-04-10T10:00:00.000Z",
      completed: false,
      deleteRequestedAt: null,
      deleteAfterAt: null,
    });
    expect(result.renewalInvoices).toEqual([{ number: "R-2026-05", status: "open", amount: 590, dueAt: "2026-07-01" }]);
    expect(result.exxasInvoices).toEqual([{ nummer: "EX-100", status: "bz", amount: 200 }]);
    expect(result.actionsLog).toHaveLength(1);
    expect(result.tickets).toEqual([{ subject: "Startpunkt ändern", status: "open", category: "startpunkt" }]);
  });
});

describe("assistant invoice tools", () => {
  it("search_invoices passes query and status to invoices_central_v", async () => {
    const query = vi.fn().mockResolvedValue([
      { invoice_type: "renewal", invoice_number: "R-2026-01", invoice_status: "open", amount: 590, due_at: "2026-06-01", customer_name: "Muster AG", tour_id: 12, tour_label: "Objekt A" },
    ]);

    const handlers = createInvoicesHandlers({ query });
    const result = await handlers.search_invoices({ query: "Muster", status: "open" }, { userId: "u", userEmail: "u@example.com" }) as { count: number; invoices: unknown[] };

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("invoices_central_v"),
      ["%Muster%", "open", 20],
    );
    expect(result.count).toBe(1);
    expect(result.invoices[0]).toEqual({
      type: "renewal",
      number: "R-2026-01",
      status: "open",
      amount: 590,
      dueAt: "2026-06-01",
      customerName: "Muster AG",
      tourId: 12,
      tourLabel: "Objekt A",
    });
  });

  it("search_invoices returns empty for blank query", async () => {
    const query = vi.fn();
    const handlers = createInvoicesHandlers({ query });
    const result = await handlers.search_invoices({ query: "" }, { userId: "u", userEmail: "u@example.com" });
    expect(result).toEqual({ count: 0, invoices: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it("get_invoice_stats aggregates renewal and exxas counts", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ status: "open", cnt: "5" }, { status: "paid", cnt: "20" }])
      .mockResolvedValueOnce([{ cnt: "3" }])
      .mockResolvedValueOnce([{ status: "bz", cnt: "8" }, { status: "offen", cnt: "2" }]);

    const handlers = createInvoicesHandlers({ query });
    const result = await handlers.get_invoice_stats({}, { userId: "u", userEmail: "u@example.com" }) as Record<string, unknown>;

    expect(result).toEqual({
      renewal: {
        byStatus: [{ status: "open", count: 5 }, { status: "paid", count: 20 }],
        overdue: 3,
      },
      exxas: {
        byStatus: [{ status: "bz", count: 8 }, { status: "offen", count: 2 }],
      },
    });
  });
});

describe("assistant customer tools", () => {
  it("search_customers uses notes (not notiz) column and returns mapped results", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 7,
        name: "Polleti Immobilien AG",
        email: "info@polleti.ch",
        email_aliases: [],
        phone: "+41 44 123 45 67",
        company: "Polleti Immobilien AG",
        notes: "Stammkunde seit 2020",
        created_at: "2020-01-15T10:00:00.000Z",
        contact_names: "Max Polleti",
      },
    ]);
    const queryOne = vi.fn();

    const handlers = createCustomersHandlers({ query, queryOne });
    const result = await handlers.search_customers({ query: "polleti" }, { userId: "u", userEmail: "u@example.com" }) as { count: number; customers: unknown[] };

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("c.notes"),
      ["%polleti%", 20],
    );
    expect(result.count).toBe(1);
    expect(result.customers[0]).toEqual({
      id: 7,
      name: "Polleti Immobilien AG",
      email: "info@polleti.ch",
      emailAliases: null,
      phone: "+41 44 123 45 67",
      company: "Polleti Immobilien AG",
      note: "Stammkunde seit 2020",
      contactNames: "Max Polleti",
      createdAt: "2020-01-15T10:00:00.000Z",
    });
  });

  it("search_customers returns empty for blank query", async () => {
    const query = vi.fn();
    const queryOne = vi.fn();
    const handlers = createCustomersHandlers({ query, queryOne });
    const result = await handlers.search_customers({ query: "" }, { userId: "u", userEmail: "u@example.com" });
    expect(result).toEqual({ count: 0, customers: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it("get_customer_detail uses street (not address) and notes (not notiz) columns", async () => {
    const queryOne = vi.fn().mockResolvedValueOnce({
      id: 7,
      name: "Polleti Immobilien AG",
      email: "info@polleti.ch",
      email_aliases: ["alt@polleti.ch"],
      phone: "+41 44 123 45 67",
      company: "Polleti Immobilien AG",
      street: "Bahnhofstrasse 10",
      city: "Zürich",
      zip: "8001",
      country: "Schweiz",
      notes: "VIP-Kunde",
      exxas_customer_id: "EX-007",
      created_at: "2020-01-15T10:00:00.000Z",
    });
    const query = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const handlers = createCustomersHandlers({ query, queryOne });
    const result = await handlers.get_customer_detail({ customer_id: 7 }, { userId: "u", userEmail: "u@example.com" }) as Record<string, unknown>;

    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("street"),
      [7],
    );
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("notes"),
      [7],
    );
    expect((result.customer as Record<string, unknown>).address).toBe("Bahnhofstrasse 10, 8001, Zürich, Schweiz");
    expect((result.customer as Record<string, unknown>).note).toBe("VIP-Kunde");
  });

  it("update_customer_note uses notes (not notiz) column", async () => {
    const queryOne = vi.fn().mockResolvedValueOnce({ id: 7 });
    const query = vi.fn().mockResolvedValue([]);

    const handlers = createCustomersHandlers({ query, queryOne });
    const result = await handlers.update_customer_note(
      { customer_id: 7, note: "Neue Notiz" },
      { userId: "u", userEmail: "u@example.com" },
    ) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET notes ="),
      [7, "Neue Notiz"],
    );
    expect(result.ok).toBe(true);
    expect(result.customerId).toBe(7);
  });

  it("update_customer_note returns error for missing customer", async () => {
    const queryOne = vi.fn().mockResolvedValueOnce(null);
    const query = vi.fn();
    const handlers = createCustomersHandlers({ query, queryOne });
    const result = await handlers.update_customer_note(
      { customer_id: 999, note: "Test" },
      { userId: "u", userEmail: "u@example.com" },
    );
    expect(query).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Kunde 999 nicht gefunden" });
  });
});

describe("assistant posteingang recent messages tool", () => {
  it("defaults to 20 messages, passes limit to SQL, and returns metadata plus mapped rows", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 1,
        conversation_id: 10,
        direction: "inbound",
        from_name: "A",
        from_email: "a@x.ch",
        subject: "S1",
        body_text: "Hi",
        sent_at: "2026-04-20T10:00:00.000Z",
        conversation_status: "open",
      },
      {
        id: 2,
        conversation_id: 10,
        direction: "outbound",
        from_name: "Office",
        from_email: "office@propus.ch",
        subject: "Re: S1",
        body_text: "Ok",
        sent_at: "2026-04-19T09:00:00.000Z",
        conversation_status: "open",
      },
      {
        id: 3,
        conversation_id: 11,
        direction: "inbound",
        from_name: "B",
        from_email: "b@y.ch",
        subject: "S2",
        body_text: "Ping",
        sent_at: "2026-04-18T08:00:00.000Z",
        conversation_status: "open",
      },
    ]);

    const handlers = createPosteingangHandlers({ query });
    const result = (await handlers.get_recent_posteingang_messages({}, { userId: "u", userEmail: "u@example.com" })) as Record<
      string,
      unknown
    >;

    expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT $1"), [20]);
    expect(result.requested_limit).toBe(20);
    expect(result.returned_count).toBe(3);
    expect(result.conversation_count).toBe(2);
    expect(typeof result.summary_note).toBe("string");
    expect(result.count).toBe(3);
    expect(Array.isArray(result.messages)).toBe(true);
    expect((result.messages as unknown[])[0]).toMatchObject({
      id: 1,
      conversationId: 10,
      direction: "inbound",
      bodyPreview: "Hi",
    });
  });

  it("respects explicit limit up to 30", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const handlers = createPosteingangHandlers({ query });
    await handlers.get_recent_posteingang_messages({ limit: 25 }, { userId: "u", userEmail: "u@example.com" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT $1"), [25]);
  });
});

describe("assistant posteingang detail tools", () => {
  it("get_posteingang_conversation_detail returns thread with messages and tags", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{
        id: 77, subject: "Anfrage", status: "open", priority: "normal",
        customer_id: 3, customer_name: "Firma Y", customer_email: "info@firmay.ch",
        assigned_to: "admin@propus.ch", created_at: "2026-04-15T08:00:00.000Z", last_message_at: "2026-04-16T09:00:00.000Z",
      }])
      .mockResolvedValueOnce([
        { direction: "inbound", from_name: "Firma Y", from_email: "info@firmay.ch", subject: "Anfrage", body_text: "Bitte info...", sent_at: "2026-04-15T08:00:00.000Z" },
      ])
      .mockResolvedValueOnce([{ name: "Neukunde?" }])
      .mockResolvedValueOnce([{ id: 1, title: "Antworten", status: "open", due_at: "2026-04-20" }]);

    const handlers = createPosteingangHandlers({ query });
    const result = await handlers.get_posteingang_conversation_detail({ conversation_id: 77 }, { userId: "u", userEmail: "u@example.com" }) as Record<string, unknown>;

    expect(query).toHaveBeenCalledTimes(4);
    const conv = result.conversation as Record<string, unknown>;
    expect(conv.id).toBe(77);
    expect(conv.subject).toBe("Anfrage");
    expect(conv.customer).toEqual({ id: 3, name: "Firma Y", email: "info@firmay.ch" });
    expect(result.tags).toEqual(["Neukunde?"]);
    expect(result.tasks).toEqual([{ id: 1, title: "Antworten", status: "open", dueAt: "2026-04-20" }]);
  });

  it("get_posteingang_stats returns status counts and task count", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ status: "open", cnt: "10" }, { status: "resolved", cnt: "50" }])
      .mockResolvedValueOnce([{ cnt: "4" }])
      .mockResolvedValueOnce([{ avg_hours: 12.567 }]);

    const handlers = createPosteingangHandlers({ query });
    const result = await handlers.get_posteingang_stats({}, { userId: "u", userEmail: "u@example.com" }) as Record<string, unknown>;

    expect(result).toEqual({
      conversations: { open: 10, resolved: 50 },
      openTasks: 4,
      avgResponseTimeHours: 12.6,
    });
  });
});

describe("assistant list_photographers tool", () => {
  it("returns active bookable photographers with settings", async () => {
    const query = vi.fn().mockResolvedValue([
      { key: "janez", name: "Janez Svajcer", display_name: "Janez Svajcer", home_address: "Zürich", skills: { photography: true, drone: true } },
      { key: "marco", name: "Marco Rossi", display_name: "Marco Rossi", home_address: null, skills: null },
    ]);

    const handlers = createOrdersHandlers({ query });
    const result = await handlers.list_photographers({}, { userId: "u", userEmail: "u@example.com" });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("booking.photographers"), []);
    expect(result).toEqual({
      count: 2,
      photographers: [
        { key: "janez", displayName: "Janez Svajcer", homeAddress: "Zürich", skills: { photography: true, drone: true } },
        { key: "marco", displayName: "Marco Rossi", homeAddress: null, skills: null },
      ],
    });
  });
});

describe("assistant list_available_services tool", () => {
  it("returns active products sorted by sort_order", async () => {
    const query = vi.fn().mockResolvedValue([
      { id: 1, code: "PHOTO", name: "Fotografie", kind: "package", category_key: "photo", description: "Professionelle Immobilienfotografie" },
      { id: 2, code: "DRONE", name: "Drohne", kind: "addon", category_key: "aerial", description: null },
    ]);

    const handlers = createOrdersHandlers({ query });
    const result = await handlers.list_available_services({}, { userId: "u", userEmail: "u@example.com" });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("booking.products"), []);
    expect(result).toEqual({
      count: 2,
      services: [
        { id: 1, code: "PHOTO", name: "Fotografie", kind: "package", categoryKey: "photo", description: "Professionelle Immobilienfotografie" },
        { id: 2, code: "DRONE", name: "Drohne", kind: "addon", categoryKey: "aerial", description: null },
      ],
    });
  });
});

describe("assistant create_order write tool", () => {
  const ctx = { userId: "u", userEmail: "admin@propus.ch" };

  it("creates an order with all fields and returns order number", async () => {
    const query = vi.fn();
    const queryOne = vi.fn()
      .mockResolvedValueOnce({ id: 5, name: "Muster AG", email: "info@muster.ch", company: "Muster AG" })
      .mockResolvedValueOnce({ key: "janez" })
      .mockResolvedValueOnce({ order_no: 142 });

    const handlers = createWriteHandlers({ query, queryOne });
    const result = await handlers.create_order({
      customer_id: 5,
      address: "Bahnhofstrasse 1, Zürich",
      services: { photography: true, drone: true, matterport: false },
      schedule_date: "2026-05-15",
      schedule_time: "10:00",
      photographer_key: "janez",
      notes: "Schlüssel beim Hausmeister",
    }, ctx) as Record<string, unknown>;

    expect(queryOne).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
    expect(result.orderNo).toBe(142);
    expect(result.customerId).toBe(5);
    expect(result.services).toEqual(["photography", "drone"]);
    expect(result.schedule).toEqual({ date: "2026-05-15", time: "10:00" });
    expect(result.photographer).toBe("janez");
  });

  it("rejects when customer_id is missing", async () => {
    const handlers = createWriteHandlers({ query: vi.fn(), queryOne: vi.fn() });
    const result = await handlers.create_order({ address: "Test", services: { photography: true } }, ctx);
    expect(result).toEqual({ error: "customer_id ist erforderlich" });
  });

  it("rejects when address is empty", async () => {
    const queryOne = vi.fn().mockResolvedValueOnce({ id: 1, name: "Test", email: "t@t.ch", company: null });
    const handlers = createWriteHandlers({ query: vi.fn(), queryOne });
    await expect(
      handlers.create_order({ customer_id: 1, address: "", services: { photography: true } }, ctx),
    ).rejects.toThrow("address ist erforderlich");
  });

  it("rejects when no services are selected", async () => {
    const queryOne = vi.fn().mockResolvedValueOnce({ id: 1, name: "Test", email: "t@t.ch", company: null });
    const handlers = createWriteHandlers({ query: vi.fn(), queryOne });
    const result = await handlers.create_order({ customer_id: 1, address: "Musterweg 5", services: {} }, ctx);
    expect(result).toEqual({ error: "Mindestens eine Dienstleistung muss ausgewählt sein" });
  });

  it("rejects when customer is not found", async () => {
    const queryOne = vi.fn().mockResolvedValueOnce(null);
    const handlers = createWriteHandlers({ query: vi.fn(), queryOne });
    const result = await handlers.create_order({ customer_id: 999, address: "Test", services: { photography: true } }, ctx);
    expect(result).toEqual({ error: "Kunde 999 nicht gefunden" });
  });

  it("rejects when photographer is not found", async () => {
    const queryOne = vi.fn()
      .mockResolvedValueOnce({ id: 1, name: "Test", email: "t@t.ch", company: null })
      .mockResolvedValueOnce(null);
    const handlers = createWriteHandlers({ query: vi.fn(), queryOne });
    const result = await handlers.create_order({
      customer_id: 1,
      address: "Musterweg 5",
      services: { photography: true },
      photographer_key: "unknown",
    }, ctx);
    expect(result).toEqual({ error: 'Fotograf "unknown" nicht gefunden oder nicht aktiv' });
  });

  it("creates order without optional fields", async () => {
    const query = vi.fn();
    const queryOne = vi.fn()
      .mockResolvedValueOnce({ id: 3, name: null, email: "test@test.ch", company: "TestCo" })
      .mockResolvedValueOnce({ order_no: 143 });

    const handlers = createWriteHandlers({ query, queryOne });
    const result = await handlers.create_order({
      customer_id: 3,
      address: "Seestrasse 10, Luzern",
      services: { matterport: true },
    }, ctx) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.orderNo).toBe(143);
    expect(result.schedule).toBeNull();
    expect(result.photographer).toBeNull();
    expect(result.customerName).toBe("TestCo");
  });
});
