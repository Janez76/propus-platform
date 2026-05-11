import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTicketsList,
  getTicketComments,
  postTicketComment,
} from "../api/toursAdmin";

function mockFetch(json: unknown) {
  const fn = vi.fn(async () => ({
    ok: true,
    json: async () => json,
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fn);
  return fn as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("toursAdmin ticket client", () => {
  it("getTicketsList forwards search + pagination params", async () => {
    const fetchMock = mockFetch({ ok: true, tickets: [], total: 0, totalAll: 0, counts: {}, unassigned: 0, highPriority: 0, limit: 50, offset: 0 });
    await getTicketsList({ status: "open", search: "  hallo  ", limit: 25, offset: 50, module: "tours" });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/tours/admin/tickets?");
    expect(url).toContain("status=open");
    expect(url).toContain("module=tours");
    expect(url).toContain("search=hallo");
    expect(url).toContain("limit=25");
    expect(url).toContain("offset=50");
  });

  it("getTicketsList omits empty search", async () => {
    const fetchMock = mockFetch({ ok: true, tickets: [], total: 0, totalAll: 0, counts: {}, unassigned: 0, highPriority: 0, limit: 50, offset: 0 });
    await getTicketsList({ search: "   " });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toContain("search=");
  });

  it("getTicketComments hits the comments sub-resource", async () => {
    const fetchMock = mockFetch({ ok: true, comments: [] });
    await getTicketComments(42);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/tours/admin/tickets/42/comments");
  });

  it("postTicketComment POSTs the body", async () => {
    const fetchMock = mockFetch({ ok: true, comment: { id: 1 } });
    await postTicketComment(7, { body: "Notiz" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("/api/tours/admin/tickets/7/comments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ body: "Notiz" });
  });
});
