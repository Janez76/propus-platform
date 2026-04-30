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
