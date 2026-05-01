import { describe, expect, it, vi } from "vitest";
import { createCustomersHandlers } from "@/lib/assistant/tools/customers";
import { createEmailHandlers } from "@/lib/assistant/tools/email";
import { isSafeSelectQuery, ensureLimit } from "@/lib/assistant/tools/database";
import type { ToolContext } from "@/lib/assistant/tools";

const ctx: ToolContext = { userId: "test-user", userEmail: "admin@propus.ch", role: "admin" };
const superCtx: ToolContext = { userId: "super-user", userEmail: "boss@propus.ch", role: "super_admin" };

function makeDeps(overrides?: { queryRows?: unknown[]; queryOneRow?: unknown }) {
  return {
    query: vi.fn().mockResolvedValue(overrides?.queryRows ?? []),
    queryOne: vi.fn().mockResolvedValue(overrides?.queryOneRow ?? null),
  };
}

// ─── Customer Search ───

describe("search_customers", () => {
  it("searches by name across customers and contacts", async () => {
    const deps = makeDeps({
      queryRows: [
        {
          id: 1,
          name: "Muster AG",
          email: "info@muster.ch",
          email_aliases: ["office@muster.ch"],
          phone: "+41 44 123 45 67",
          company: "Muster AG",
          notiz: "VIP-Kunde",
          created_at: "2026-01-01T00:00:00.000Z",
          contact_names: "Hans Muster, Lisa Muster",
        },
      ],
    });

    const handlers = createCustomersHandlers(deps);
    const result = (await handlers.search_customers({ query: "Muster" }, ctx)) as {
      count: number;
      customers: Array<Record<string, unknown>>;
    };

    expect(deps.query).toHaveBeenCalledWith(
      expect.stringContaining("core.customers"),
      ["%Muster%", 20],
    );
    expect(deps.query).toHaveBeenCalledWith(
      expect.stringContaining("email_aliases"),
      expect.any(Array),
    );
    expect(result.count).toBe(1);
    expect(result.customers[0]).toMatchObject({
      id: 1,
      name: "Muster AG",
      email: "info@muster.ch",
      emailAliases: ["office@muster.ch"],
      contactNames: "Hans Muster, Lisa Muster",
    });
  });

  it("returns empty for blank query", async () => {
    const deps = makeDeps();
    const handlers = createCustomersHandlers(deps);
    const result = await handlers.search_customers({ query: "" }, ctx);
    expect(result).toEqual({ count: 0, customers: [] });
    expect(deps.query).not.toHaveBeenCalled();
  });

  it("caps limit to 20", async () => {
    const deps = makeDeps({ queryRows: [] });
    const handlers = createCustomersHandlers(deps);
    await handlers.search_customers({ query: "test", limit: 999 }, ctx);
    expect(deps.query).toHaveBeenCalledWith(expect.any(String), ["%test%", 20]);
  });
});

describe("get_customer_detail", () => {
  it("returns full profile with contacts, companies, orders, tours", async () => {
    const deps = makeDeps();
    deps.queryOne.mockResolvedValueOnce({
      id: 5,
      name: "Firma X",
      email: "info@firmax.ch",
      email_aliases: null,
      phone: "+41 44 000 00 00",
      company: "Firma X GmbH",
      address: "Hauptstrasse 1",
      city: "Zürich",
      zip: "8001",
      country: "CH",
      notiz: "Stammkunde",
      exxas_customer_id: "EX-100",
      created_at: "2025-06-01T00:00:00.000Z",
    });
    deps.query
      .mockResolvedValueOnce([{ id: 10, name: "Max Muster", email: "max@firmax.ch", phone: null, role: "CEO", is_primary_contact: true }])
      .mockResolvedValueOnce([{ company_id: 2, company_name: "Holding AG", role: "member" }])
      .mockResolvedValueOnce([{ order_no: 101, status: "done", address: "Bahnhofstr 1", created_at: "2026-04-01T10:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: 55, label: "Büro Zürich", status: "ACTIVE", term_end_date: "2027-01-01" }]);

    const handlers = createCustomersHandlers(deps);
    const result = (await handlers.get_customer_detail({ customer_id: 5 }, ctx)) as Record<string, unknown>;

    expect(result.customer).toMatchObject({ id: 5, name: "Firma X", email: "info@firmax.ch" });
    expect(result.contacts).toHaveLength(1);
    expect(result.companies).toHaveLength(1);
    expect(result.recentOrders).toHaveLength(1);
    expect(result.activeTours).toHaveLength(1);
  });

  it("returns error for invalid customer_id", async () => {
    const deps = makeDeps();
    const handlers = createCustomersHandlers(deps);
    const result = await handlers.get_customer_detail({ customer_id: -1 }, ctx);
    expect(result).toEqual({ error: "Ungültige Kunden-ID" });
  });
});

describe("create_customer_contact", () => {
  it("creates contact when customer exists", async () => {
    const deps = makeDeps();
    deps.queryOne
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce({ id: 99 });
    const handlers = createCustomersHandlers(deps);
    const result = await handlers.create_customer_contact(
      { customer_id: 5, name: "Neue Person", email: "neu@firma.ch", phone: "+41 79 000 0000", role: "CTO" },
      ctx,
    );
    expect(result).toMatchObject({ ok: true, contactId: 99 });
  });

  it("rejects when customer not found", async () => {
    const deps = makeDeps({ queryOneRow: null });
    const handlers = createCustomersHandlers(deps);
    const result = await handlers.create_customer_contact(
      { customer_id: 999, name: "Test", email: "a@b.ch" },
      ctx,
    );
    expect(result).toEqual({ error: "Kunde 999 nicht gefunden" });
  });
});

describe("create_customer", () => {
  it("inserts customer when email is free", async () => {
    const deps = makeDeps();
    deps.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 501 });
    const handlers = createCustomersHandlers(deps);
    const result = await handlers.create_customer(
      { name: "Ivan Fischer", email: "IF@Propus.CH", company: "", phone: "" },
      ctx,
    );
    expect(result).toMatchObject({ ok: true, customerId: 501 });
    expect(deps.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM core.customers"),
      ["if@propus.ch"],
    );
    expect(deps.queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO core.customers"),
      expect.arrayContaining(["Ivan Fischer", "if@propus.ch"]),
    );
  });

  it("rejects invalid email", async () => {
    const deps = makeDeps();
    const handlers = createCustomersHandlers(deps);
    const result = await handlers.create_customer({ name: "X", email: "not-an-email" }, ctx);
    expect(result).toEqual({
      error: "email ist erforderlich und muss eine gültige E-Mail-Adresse sein",
    });
    expect(deps.queryOne).not.toHaveBeenCalled();
  });

  it("returns existingId when email already used", async () => {
    const deps = makeDeps();
    deps.queryOne.mockResolvedValueOnce({ id: 12 });
    const handlers = createCustomersHandlers(deps);
    const result = await handlers.create_customer({ name: "Dup", email: "dup@firma.ch" }, ctx);
    expect(result).toEqual({
      error: "Ein Kunde mit dieser primären E-Mail existiert bereits.",
      existingId: 12,
    });
    expect(deps.queryOne).toHaveBeenCalledTimes(1);
  });
});

// ─── Database SQL Injection Prevention ───

describe("isSafeSelectQuery", () => {
  it("allows simple SELECT", () => {
    expect(isSafeSelectQuery("SELECT * FROM core.customers LIMIT 10")).toEqual({ safe: true });
  });

  it("allows WITH (CTE)", () => {
    expect(isSafeSelectQuery("WITH cte AS (SELECT 1) SELECT * FROM cte")).toEqual({ safe: true });
  });

  it("rejects INSERT", () => {
    expect(isSafeSelectQuery("INSERT INTO core.customers (name) VALUES ('hack')")).toEqual({
      safe: false,
      reason: "Verbotene Anweisung: INSERT",
    });
  });

  it("rejects UPDATE", () => {
    expect(isSafeSelectQuery("UPDATE core.customers SET name = 'hack'")).toEqual({
      safe: false,
      reason: "Verbotene Anweisung: UPDATE",
    });
  });

  it("rejects DELETE", () => {
    expect(isSafeSelectQuery("DELETE FROM core.customers")).toEqual({
      safe: false,
      reason: "Verbotene Anweisung: DELETE",
    });
  });

  it("rejects DROP", () => {
    expect(isSafeSelectQuery("DROP TABLE core.customers")).toEqual({
      safe: false,
      reason: "Verbotene Anweisung: DROP",
    });
  });

  it("rejects ALTER", () => {
    expect(isSafeSelectQuery("ALTER TABLE core.customers ADD COLUMN x TEXT")).toEqual({
      safe: false,
      reason: "Verbotene Anweisung: ALTER",
    });
  });

  it("rejects TRUNCATE", () => {
    expect(isSafeSelectQuery("TRUNCATE core.customers")).toEqual({
      safe: false,
      reason: "Verbotene Anweisung: TRUNCATE",
    });
  });

  it("rejects CREATE", () => {
    expect(isSafeSelectQuery("CREATE TABLE test (id int)")).toEqual({
      safe: false,
      reason: "Verbotene Anweisung: CREATE",
    });
  });

  it("rejects case-insensitive injection", () => {
    expect(isSafeSelectQuery("select 1; dRoP TABLE customers")).toEqual({
      safe: false,
      reason: expect.stringContaining("DROP"),
    });
  });

  it("rejects hidden DELETE in subquery", () => {
    expect(isSafeSelectQuery("SELECT * FROM (DELETE FROM customers RETURNING *)")).toEqual({
      safe: false,
      reason: expect.stringContaining("DELETE"),
    });
  });

  it("rejects UPDATE disguised with SELECT prefix", () => {
    expect(isSafeSelectQuery("SELECT 1; UPDATE customers SET name = 'x'")).toEqual({
      safe: false,
      reason: expect.stringContaining("UPDATE"),
    });
  });

  it("rejects INSERT in SQL comment bypass attempt", () => {
    const sql = "SELECT /* */ 1; INSERT INTO customers VALUES (1)";
    expect(isSafeSelectQuery(sql)).toEqual({
      safe: false,
      reason: expect.stringContaining("INSERT"),
    });
  });

  it("rejects GRANT", () => {
    expect(isSafeSelectQuery("GRANT ALL ON customers TO public")).toEqual({
      safe: false,
      reason: expect.stringContaining("GRANT"),
    });
  });

  it("rejects empty query", () => {
    expect(isSafeSelectQuery("")).toEqual({ safe: false, reason: "Leere Abfrage" });
  });

  it("rejects plain text (no SELECT)", () => {
    expect(isSafeSelectQuery("EXPLAIN ANALYZE SELECT 1")).toEqual({
      safe: false,
      reason: "Nur SELECT- und WITH-Abfragen erlaubt",
    });
  });

  it("strips comments before checking", () => {
    expect(isSafeSelectQuery("-- DROP TABLE\nSELECT 1")).toEqual({ safe: true });
  });

  it("strips block comments before checking", () => {
    expect(isSafeSelectQuery("/* DELETE FROM x */ SELECT 1")).toEqual({ safe: true });
  });
});

describe("ensureLimit", () => {
  it("appends LIMIT 100 when missing", () => {
    expect(ensureLimit("SELECT * FROM customers")).toBe("SELECT * FROM customers LIMIT 100");
  });

  it("preserves existing LIMIT", () => {
    expect(ensureLimit("SELECT * FROM customers LIMIT 10")).toBe("SELECT * FROM customers LIMIT 10");
  });

  it("strips trailing semicolons", () => {
    expect(ensureLimit("SELECT 1;")).toBe("SELECT 1 LIMIT 100");
  });
});

// ─── Database role check ───

describe("query_database role check", () => {
  it("rejects non-super_admin users", async () => {
    vi.doMock("@/lib/db", () => ({
      pool: { connect: vi.fn() },
      query: vi.fn(),
      queryOne: vi.fn(),
    }));
    const { createDatabaseHandlers } = await import("@/lib/assistant/tools/database");
    const handlers = createDatabaseHandlers();
    const result = await handlers.query_database({ sql: "SELECT 1" }, ctx);
    expect(result).toEqual({ error: "Nur super_admin darf SQL-Abfragen ausführen." });
  });
});

// ─── Email Search Params ───

describe("search_emails", () => {
  it("calls mail API with correct params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          emails: [
            { from: "kunde@test.ch", subject: "Anfrage", date: "2026-04-30T10:00:00Z", bodyPreview: "Guten Tag..." },
          ],
        }),
    });

    const deps = { ...makeDeps(), fetch: mockFetch as unknown as typeof globalThis.fetch, platformUrl: "http://mock:3100" };
    const handlers = createEmailHandlers(deps);
    const result = (await handlers.search_emails({ folder: "sentitems", since: "2026-04-01", limit: 5 }, ctx)) as {
      count: number;
      emails: Array<Record<string, unknown>>;
    };

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("http://mock:3100/api/tours/admin/mail/inbox"),
      expect.objectContaining({ headers: { "x-internal-call": "assistant" } }),
    );
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("top=5");
    expect(url).toContain("folder=sentitems");
    expect(url).toContain("since=2026-04-01");

    expect(result.count).toBe(1);
    expect(result.emails[0]).toMatchObject({ from: "kunde@test.ch", subject: "Anfrage" });
  });

  it("returns error on API failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal" });
    const deps = { ...makeDeps(), fetch: mockFetch as unknown as typeof globalThis.fetch, platformUrl: "http://mock:3100" };
    const handlers = createEmailHandlers(deps);
    const result = (await handlers.search_emails({}, ctx)) as { error: string };
    expect(result.error).toContain("500");
  });

  it("returns error on network failure", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const deps = { ...makeDeps(), fetch: mockFetch as unknown as typeof globalThis.fetch, platformUrl: "http://mock:3100" };
    const handlers = createEmailHandlers(deps);
    const result = (await handlers.search_emails({}, ctx)) as { error: string };
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("get_email_thread", () => {
  it("returns messages for valid conversation", async () => {
    const deps = makeDeps({
      queryRows: [
        {
          id: 1,
          direction: "inbound",
          from_name: "Kunde",
          from_email: "kunde@test.ch",
          to_recipients: "office@propus.ch",
          subject: "Anfrage",
          body_text: "Guten Tag...",
          sent_at: "2026-04-30T10:00:00Z",
        },
      ],
    });
    const handlers = createEmailHandlers(deps);
    const result = (await handlers.get_email_thread({ conversation_id: 77 }, ctx)) as {
      conversationId: number;
      count: number;
    };

    expect(deps.query).toHaveBeenCalledWith(
      expect.stringContaining("posteingang_messages"),
      [77],
    );
    expect(result.conversationId).toBe(77);
    expect(result.count).toBe(1);
  });

  it("rejects invalid conversation_id", async () => {
    const deps = makeDeps();
    const handlers = createEmailHandlers(deps);
    const result = await handlers.get_email_thread({ conversation_id: -1 }, ctx);
    expect(result).toEqual({ error: "Ungültige Konversations-ID" });
  });
});

describe("send_email", () => {
  it("creates conversation and sends email", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 42 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

    const deps = { ...makeDeps(), fetch: mockFetch as unknown as typeof globalThis.fetch, platformUrl: "http://mock:3100" };
    const handlers = createEmailHandlers(deps);
    const result = await handlers.send_email(
      { to: "kunde@test.ch", subject: "Hallo", body_html: "<p>Hi</p>" },
      ctx,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, conversationId: 42 });
  });

  it("rejects missing fields", async () => {
    const deps = { ...makeDeps(), fetch: vi.fn() as unknown as typeof globalThis.fetch, platformUrl: "http://mock:3100" };
    const handlers = createEmailHandlers(deps);
    expect(await handlers.send_email({ subject: "x", body_html: "y" }, ctx)).toEqual({ error: "to ist erforderlich" });
    expect(await handlers.send_email({ to: "a@b.ch", body_html: "y" }, ctx)).toEqual({ error: "subject ist erforderlich" });
    expect(await handlers.send_email({ to: "a@b.ch", subject: "x" }, ctx)).toEqual({ error: "body_html ist erforderlich" });
  });
});
