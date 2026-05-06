import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  query: queryMock,
  queryOne: vi.fn(),
}));

import { matterportHandlers } from "@/lib/assistant/tools/matterport";
import type { ToolContext } from "@/lib/assistant/tools";

const ctx: ToolContext = { userId: "test-user", userEmail: "admin@propus.ch", role: "admin" };

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  queryMock.mockReset();
  process.env.MATTERPORT_TOKEN_ID = "id";
  process.env.MATTERPORT_TOKEN_SECRET = "secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("matterport_live_status_for_orders", () => {
  it("queries today's orders by default and joins matterport state live", async () => {
    queryMock.mockResolvedValueOnce([
      {
        order_no: 1234,
        status: "scheduled",
        address: "Bahnhofstrasse 1, 8001 Zürich",
        scheduled_date: "2026-05-06",
        scheduled_time: "10:00",
        customer_name: "Muster AG",
        photographer_name: "Janez Smirmaul",
        services: { matterport: true, photography: true },
        tour_id: 42,
        matterport_space_id: "abcXYZ",
        tour_url: "https://propus.ch/tour/42",
      },
      {
        order_no: 1235,
        status: "scheduled",
        address: "Seestrasse 5, 8002 Zürich",
        scheduled_date: "2026-05-06",
        scheduled_time: "14:00",
        customer_name: "Test GmbH",
        photographer_name: "Janez Smirmaul",
        services: { photography: true },
        tour_id: null,
        matterport_space_id: null,
        tour_url: null,
      },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            data: {
              model: {
                id: "abcXYZ",
                name: "Bahnhofstrasse 1",
                state: "active",
                visibility: "unlisted",
                modified: "2026-05-06T08:30:00Z",
                created: "2026-05-01T00:00:00Z",
                publication: { url: "https://my.matterport.com/show/?m=abcXYZ", published: true, address: "Bahnhofstrasse 1" },
              },
            },
          }),
        ),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = (await matterportHandlers.matterport_live_status_for_orders({}, ctx)) as {
      ok: boolean;
      total: number;
      withMatterportSpace: number;
      orders: Array<{
        orderNo: number;
        matterportSpaceId: string | null;
        matterport: unknown;
        services: string[];
      }>;
    };

    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("booking.orders");
    expect(sql).toContain("LEFT JOIN tour_manager.tours");
    expect(sql).toContain("CURRENT_DATE");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][0] as string)).toMatch(/api\.matterport\.com/);

    expect(result.ok).toBe(true);
    expect(result.total).toBe(2);
    expect(result.withMatterportSpace).toBe(1);

    const withSpace = result.orders.find((o) => o.orderNo === 1234)!;
    expect(withSpace.matterport).toMatchObject({
      spaceId: "abcXYZ",
      state: "active",
      visibility: "unlisted",
      shareUrl: "https://my.matterport.com/show/?m=abcXYZ",
      modified: "2026-05-06T08:30:00Z",
    });
    expect(withSpace.services).toEqual(expect.arrayContaining(["matterport", "photography"]));

    const withoutSpace = result.orders.find((o) => o.orderNo === 1235)!;
    expect(withoutSpace.matterport).toBeNull();
  });

  it("filters by explicit ISO date", async () => {
    queryMock.mockResolvedValueOnce([]);
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;

    await matterportHandlers.matterport_live_status_for_orders({ date: "2026-04-15" }, ctx);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["2026-04-15"]);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("$1::date");
  });

  it("ignores invalid date format and falls back to today", async () => {
    queryMock.mockResolvedValueOnce([]);
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;

    await matterportHandlers.matterport_live_status_for_orders({ date: "morgen" }, ctx);

    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("CURRENT_DATE");
    expect(queryMock.mock.calls[0][1]).toEqual([]);
  });

  it("targets a single order_no when provided", async () => {
    queryMock.mockResolvedValueOnce([
      {
        order_no: 999,
        status: "completed",
        address: "X",
        scheduled_date: "2026-04-01",
        scheduled_time: null,
        customer_name: null,
        photographer_name: null,
        services: null,
        tour_id: 7,
        matterport_space_id: null,
        tour_url: null,
      },
    ]);
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;

    await matterportHandlers.matterport_live_status_for_orders({ order_no: 999 }, ctx);

    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("WHERE o.order_no = $1");
    expect(queryMock.mock.calls[0][1]).toEqual([999]);
  });

  it("surfaces matterport API errors per order without failing whole batch", async () => {
    queryMock.mockResolvedValueOnce([
      {
        order_no: 100,
        status: "scheduled",
        address: "A",
        scheduled_date: "2026-05-06",
        scheduled_time: "09:00",
        customer_name: null,
        photographer_name: null,
        services: { matterport: true },
        tour_id: 1,
        matterport_space_id: "missingId",
        tour_url: null,
      },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ errors: [{ message: "Model not found" }] }),
        ),
    }) as unknown as typeof globalThis.fetch;

    const result = (await matterportHandlers.matterport_live_status_for_orders({}, ctx)) as {
      ok: boolean;
      orders: Array<{ matterport: { error?: string } | null }>;
    };

    expect(result.ok).toBe(true);
    expect(result.orders[0].matterport).toMatchObject({ error: expect.stringContaining("Model not found") });
  });
});
