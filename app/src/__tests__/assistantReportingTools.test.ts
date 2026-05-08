import { describe, expect, it, vi } from "vitest";
import { query as dbQuery } from "@/lib/db";
import { createReportingHandlers } from "@/lib/assistant/tools/reporting";
import type { ToolContext } from "@/lib/assistant/tools";

type DbQueryFn = typeof dbQuery;

async function mockEmptyRows<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): Promise<T[]> {
  return [] as T[];
}

async function mockAdminUserRows<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): Promise<T[]> {
  return [{ id: 1, email: "a@b.c", full_name: "Admin User", role: "admin", active: true }] as T[];
}

function ctx(role: string): ToolContext {
  return { userId: "u1", userEmail: "test@example.com", role };
}

describe("propus_report RBAC", () => {
  it("denies admin-tier report for photographer", async () => {
    const query = vi.fn(mockEmptyRows) as unknown as DbQueryFn;
    const handlers = createReportingHandlers({ query });
    const out = await handlers.propus_report(
      { report: "admin_users_roles", limit: 10 },
      ctx("photographer"),
    );
    expect(query).not.toHaveBeenCalled();
    expect(out).toMatchObject({ error: expect.stringMatching(/Keine Berechtigung/i) });
  });

  it("allows admin-tier report for admin", async () => {
    const query = vi.fn(mockAdminUserRows) as unknown as DbQueryFn;
    const handlers = createReportingHandlers({ query });
    const out = await handlers.propus_report({ report: "admin_users_roles" }, ctx("admin"));
    expect(query).toHaveBeenCalled();
    expect(out).toMatchObject({ report: "admin_users_roles", count: 1 });
  });

  it("allows ops-tier report for photographer", async () => {
    const query = vi.fn(mockEmptyRows) as unknown as DbQueryFn;
    const handlers = createReportingHandlers({ query });
    await handlers.propus_report({ report: "orders_week_calendar" }, ctx("photographer"));
    expect(query).toHaveBeenCalled();
  });

  it("denies business-tier report for photographer", async () => {
    const query = vi.fn(mockEmptyRows) as unknown as DbQueryFn;
    const handlers = createReportingHandlers({ query });
    const out = await handlers.propus_report({ report: "customers_top_volume" }, ctx("photographer"));
    expect(query).not.toHaveBeenCalled();
    expect(out).toMatchObject({ error: expect.stringMatching(/Keine Berechtigung/i) });
  });

  it("allows business-tier report for employee", async () => {
    const query = vi.fn(mockEmptyRows) as unknown as DbQueryFn;
    const handlers = createReportingHandlers({ query });
    await handlers.propus_report({ report: "customers_top_volume" }, ctx("employee"));
    expect(query).toHaveBeenCalled();
  });
});
