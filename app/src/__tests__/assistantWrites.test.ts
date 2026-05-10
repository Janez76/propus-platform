import { describe, expect, it, vi } from "vitest";
import { createWriteHandlers } from "@/lib/assistant/tools/writes";
import type { ToolContext } from "@/lib/assistant/tools";

const ctx: ToolContext = { userId: "test-user", userEmail: "admin@propus.ch" };

function makeDeps(overrides?: { queryRows?: unknown[]; queryOneRow?: unknown }) {
  return {
    query: vi.fn().mockResolvedValue(overrides?.queryRows ?? []),
    queryOne: vi.fn().mockResolvedValue(overrides?.queryOneRow ?? null),
  };
}

describe("create_posteingang_task", () => {
  it("creates a task with valid input", async () => {
    const deps = makeDeps({ queryOneRow: { id: 42 } });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_posteingang_task({ title: "Test-Aufgabe", priority: "high" }, ctx);

    expect(deps.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tour_manager.posteingang_tasks"),
      expect.arrayContaining(["Test-Aufgabe", null, "high"]),
    );
    expect(result).toEqual({ ok: true, taskId: 42, message: 'Aufgabe "Test-Aufgabe" erstellt.' });
  });

  it("rejects missing title", async () => {
    const deps = makeDeps();
    const handlers = createWriteHandlers(deps);
    await expect(handlers.create_posteingang_task({}, ctx)).rejects.toThrow("title ist erforderlich");
  });

  it("rejects invalid priority", async () => {
    const deps = makeDeps();
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_posteingang_task({ title: "Task", priority: "urgent" }, ctx);
    expect(result).toEqual({ error: "Ungültige Priorität: urgent. Erlaubt: normal, high, low" });
  });
});

describe("create_ticket", () => {
  it("creates a ticket with valid input", async () => {
    const deps = makeDeps({ queryOneRow: { id: 99 } });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_ticket(
      { module: "tours", subject: "Startpunkt anpassen", category: "startpunkt", reference_id: "123", reference_type: "tour" },
      ctx,
    );

    expect(deps.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tour_manager.tickets"),
      expect.arrayContaining(["tours", "Startpunkt anpassen"]),
    );
    expect(result).toEqual({ ok: true, ticketId: 99, message: 'Ticket "Startpunkt anpassen" erstellt.' });
  });

  it("rejects invalid module", async () => {
    const deps = makeDeps();
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_ticket({ module: "crm", subject: "Test" }, ctx);
    expect(result).toEqual({ error: "Ungültiges Modul: crm. Erlaubt: tours, booking" });
  });

  it("rejects invalid category", async () => {
    const deps = makeDeps();
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_ticket({ module: "tours", subject: "Test", category: "invalid" }, ctx);
    expect(result).toEqual({ error: "Ungültige Kategorie: invalid. Erlaubt: startpunkt, name_aendern, blur_request, sweep_verschieben, sonstiges" });
  });
});

describe("create_posteingang_note", () => {
  it("creates a note when conversation exists", async () => {
    const deps = makeDeps();
    deps.queryOne
      .mockResolvedValueOnce({ id: 10 })   // conversation exists
      .mockResolvedValueOnce({ id: 77 });   // inserted message
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_posteingang_note({ conversation_id: 10, body_text: "Interne Notiz" }, ctx);

    expect(result).toEqual({ ok: true, messageId: 77, message: "Interne Notiz erstellt." });
    expect(deps.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tour_manager.posteingang_conversations"),
      [10],
    );
  });

  it("rejects when conversation not found", async () => {
    const deps = makeDeps({ queryOneRow: null });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_posteingang_note({ conversation_id: 999, body_text: "Test" }, ctx);
    expect(result).toEqual({ error: "Konversation 999 nicht gefunden" });
  });

  it("rejects missing conversation_id", async () => {
    const deps = makeDeps();
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_posteingang_note({ body_text: "Test" }, ctx);
    expect(result).toEqual({ error: "conversation_id ist erforderlich" });
  });
});

describe("draft_email", () => {
  it("returns draft without sending", async () => {
    const deps = makeDeps();
    const handlers = createWriteHandlers(deps);
    const result = await handlers.draft_email(
      { to: "kunde@test.ch", subject: "Verlängerung", body_html: "<p>Guten Tag</p>" },
      ctx,
    );

    expect(result).toEqual({
      ok: true,
      draft: { to: "kunde@test.ch", subject: "Verlängerung", bodyHtml: "<p>Guten Tag</p>" },
      message: "E-Mail-Entwurf an kunde@test.ch vorbereitet. Bitte manuell über Posteingang oder Outlook versenden.",
    });
    expect(deps.query).not.toHaveBeenCalled();
    expect(deps.queryOne).not.toHaveBeenCalled();
  });
});

describe("create_order service_items resolution", () => {
  it("rejects unknown product codes before INSERT", async () => {
    const deps = makeDeps();
    deps.queryOne.mockResolvedValueOnce({ id: 7, name: "CSL", email: "csl@example.ch", company: "CSL Immobilien AG" });
    // products query returns only one of two requested codes
    deps.query.mockResolvedValueOnce([
      { id: 5, code: "camera:foto20", name: "20 Bodenfotos", kind: "addon", group_key: "camera", rule_type: "fixed", config_json: { price: 199 } },
    ]);
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_order(
      {
        customer_id: 7,
        address: "Attenhoferstrasse 37, 8645 Jona",
        service_items: ["camera:foto20", "imaginary:xyz"],
        booking_kind: "fixed",
        schedule_date: "2026-05-20",
      },
      ctx,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("imaginary:xyz") });
    // Tx never opened — keine INSERT-Aufrufe trotz gefundenem Kunden.
    expect(deps.queryOne).toHaveBeenCalledTimes(1);
  });

  it("resolves codes to products + prices and persists addons + pricing JSON", async () => {
    const deps = makeDeps();
    deps.queryOne
      .mockResolvedValueOnce({ id: 7, name: "CSL", email: "csl@example.ch", company: "CSL Immobilien AG" })
      .mockResolvedValueOnce({ order_no: 100107 });
    deps.query.mockResolvedValueOnce([
      { id: 5, code: "camera:foto20", name: "20 Bodenfotos", kind: "addon", group_key: "camera", rule_type: "fixed", config_json: { price: 199 } },
      { id: 8, code: "dronePhoto:foto8", name: "8 Luftaufnahmen", kind: "addon", group_key: "dronePhoto", rule_type: "fixed", config_json: { price: 159 } },
      { id: 10, code: "tour:main", name: "360° Tour", kind: "addon", group_key: "tour", rule_type: "area_tier", config_json: { tiers: [{ maxArea: 99, price: 199 }, { maxArea: 199, price: 299 }, { maxArea: 299, price: 399 }], basePrice: 399, incrementArea: 100, incrementPrice: 79 } },
      { id: 11, code: "floorplans:tour", name: "2D Grundriss von Tour", kind: "addon", group_key: "floorplans", rule_type: "per_floor", config_json: { unitPrice: 79 } },
    ]);

    // Ersatz fuer withTransaction + outbox, sonst reisst der Default-Pfad gegen
    // die echte DB.
    const tx = {} as any;
    const withTransaction = vi.fn(async (fn: any) => fn(tx));
    const enqueueOutbox = vi.fn().mockResolvedValue({ id: 1 });

    const handlers = createWriteHandlers({ ...deps, withTransaction, enqueueOutbox });
    const result = await handlers.create_order(
      {
        customer_id: 7,
        address: "Attenhoferstrasse 37, 8645 Jona",
        service_items: [
          "camera:foto20",
          "dronePhoto:foto8",
          "tour:main",
          "floorplans:tour",
        ],
        area_sqm: 100,
        floors: 1,
        booking_kind: "flexible",
        deadline_at: "2026-05-20",
      },
      ctx,
    );

    expect(result).toMatchObject({
      ok: true,
      orderNo: 100107,
      bookingKind: "flexible",
      pricing: expect.objectContaining({
        // 199 (20 Bodenfotos fixed) + 159 (8 Luftaufnahmen fixed)
        // + 299 (tour:main area_tier @ 100m² → 2. Stufe)
        // + 79 (floorplans:tour per_floor @ 1 Geschoss) = 736
        subtotal: 736,
        vat: expect.any(Number),
        total: expect.any(Number),
      }),
    });
    expect(Array.isArray(result.services)).toBe(true);
    expect(result.services).toEqual(
      expect.arrayContaining([
        expect.stringContaining("20 Bodenfotos"),
        expect.stringContaining("360° Tour"),
        expect.stringContaining("2D Grundriss"),
      ]),
    );

    // INSERT bekommt das aufgeloeste services-JSON mit echten addons und
    // ein gefuelltes pricing-JSON (nicht mehr leer wie im Boolean-Fallback).
    const insertCall = deps.queryOne.mock.calls.find((c: any[]) =>
      String(c[0]).includes("INSERT INTO booking.orders"),
    );
    expect(insertCall).toBeTruthy();
    const insertParams = insertCall![1] as unknown[];
    const servicesJsonStr = insertParams[4] as string;
    const pricingJsonStr = insertParams[8] as string;
    const services = JSON.parse(servicesJsonStr);
    const pricing = JSON.parse(pricingJsonStr);
    expect(services.addons).toHaveLength(4);
    expect(services.addons[0]).toMatchObject({ id: "camera:foto20", label: "20 Bodenfotos", price: 199, group: "camera" });
    expect(services.addons[2]).toMatchObject({ id: "tour:main", price: 299 });
    expect(pricing.subtotal).toBe(736);
    expect(pricing.total).toBeGreaterThan(736);

    // object{} traegt area + (default 1 → kein floors-Eintrag) — wichtig fuers
    // spaetere Pricing-Re-Compute im Admin.
    const objectJsonStr = insertParams[3] as string;
    expect(JSON.parse(objectJsonStr)).toMatchObject({ type: "Immobilie", area: "100" });

    expect(enqueueOutbox).toHaveBeenCalled();
  });

  it("rejects when neither service_items nor services boolean flags provided", async () => {
    const deps = makeDeps({
      queryOneRow: { id: 7, name: "X", email: "x@example.ch", company: null },
    });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_order(
      { customer_id: 7, address: "Test 1, 8001 Zuerich", schedule_date: "2026-06-01" },
      ctx,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("Mindestens eine Dienstleistung") });
  });
});

describe("create_order (Bug-Hunt HIGH-5)", () => {
  it("rejects when customer has no email so the workflow mail is never silently dropped", async () => {
    const deps = makeDeps({
      queryOneRow: { id: 7, name: "Mustermann AG", email: null, company: "Mustermann AG" },
    });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_order(
      {
        customer_id: 7,
        address: "Bahnhofstrasse 1, 8001 Zuerich",
        services: { photography: true },
      },
      ctx,
    );
    expect(result).toEqual({
      error:
        "Kunde 7 hat keine E-Mail-Adresse hinterlegt — bitte E-Mail beim Kunden ergaenzen, dann erneut versuchen.",
    });
    // Wichtig: weder INSERT noch Outbox-Enqueue duerfen passieren —
    // weder ueber `query` noch ueber `queryOne` (CodeRabbit nitpick).
    expect(deps.query).not.toHaveBeenCalled();
    expect(deps.queryOne).toHaveBeenCalledTimes(1);
    expect(deps.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id, name, email, company FROM core.customers WHERE id = $1"),
      [7],
    );
  });

  it("rejects when customer email is whitespace-only", async () => {
    const deps = makeDeps({
      queryOneRow: { id: 8, name: "X", email: "   ", company: null },
    });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.create_order(
      { customer_id: 8, address: "Test 1, 8001 Zuerich", services: { photography: true } },
      ctx,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("E-Mail-Adresse hinterlegt") });
    expect(deps.query).not.toHaveBeenCalled();
    expect(deps.queryOne).toHaveBeenCalledTimes(1);
    expect(deps.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id, name, email, company FROM core.customers WHERE id = $1"),
      [8],
    );
  });
});

describe("update_order_status", () => {
  it("updates status for valid transition", async () => {
    const deps = makeDeps();
    deps.queryOne.mockResolvedValueOnce({ status: "confirmed" });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.update_order_status({ order_no: 100, new_status: "completed" }, ctx);

    expect(result).toEqual({
      ok: true,
      orderNo: 100,
      oldStatus: "confirmed",
      newStatus: "completed",
      message: 'Auftrag 100: Status von "confirmed" auf "completed" geändert.',
    });
    expect(deps.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE booking.orders SET status"),
      ["completed", 100],
    );
    expect(deps.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO booking.order_status_audit"),
      expect.arrayContaining([100, "confirmed", "completed", "admin@propus.ch"]),
    );
  });

  it("rejects invalid transition (confirmed → pending)", async () => {
    const deps = makeDeps();
    deps.queryOne.mockResolvedValueOnce({ status: "confirmed" });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.update_order_status({ order_no: 100, new_status: "pending" }, ctx);

    expect(result).toEqual({
      error: expect.stringContaining("nicht erlaubt"),
    });
    expect(deps.query).not.toHaveBeenCalled();
  });

  it("rejects invalid transition (done → confirmed)", async () => {
    const deps = makeDeps();
    deps.queryOne.mockResolvedValueOnce({ status: "done" });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.update_order_status({ order_no: 200, new_status: "confirmed" }, ctx);

    expect(result).toEqual({
      error: expect.stringContaining("nicht erlaubt"),
    });
  });

  it("rejects unknown order", async () => {
    const deps = makeDeps({ queryOneRow: null });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.update_order_status({ order_no: 9999, new_status: "done" }, ctx);
    expect(result).toEqual({ error: "Auftrag 9999 nicht gefunden" });
  });

  it("rejects invalid status value", async () => {
    const deps = makeDeps();
    const handlers = createWriteHandlers(deps);
    const result = await handlers.update_order_status({ order_no: 100, new_status: "bogus" }, ctx);
    expect(result).toEqual({ error: "Ungültiger Status: bogus" });
  });

  it("accepts legacy status values (Bestätigt → completed)", async () => {
    const deps = makeDeps();
    deps.queryOne.mockResolvedValueOnce({ status: "Bestätigt" });
    const handlers = createWriteHandlers(deps);
    const result = await handlers.update_order_status({ order_no: 300, new_status: "completed" }, ctx);

    expect(result).toMatchObject({ ok: true, newStatus: "completed" });
  });
});
