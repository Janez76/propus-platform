import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const listAssistantHistory = vi.fn();

vi.mock("@/lib/assistant/auth", () => ({
  resolveAssistantUser: vi.fn(async () => ({
    id: "user-1",
    email: "a@propus.ch",
    name: "Test",
    role: "admin",
    source: "cookie" as const,
  })),
}));

vi.mock("@/lib/assistant/store", () => ({
  listAssistantHistory,
}));

describe("GET /api/assistant/history", () => {
  beforeEach(() => {
    vi.resetModules();
    listAssistantHistory.mockResolvedValue([]);
  });

  it("returns Cache-Control no-store and forwards filter active by default", async () => {
    const { GET } = await import("@/app/api/assistant/history/route");
    const req = new NextRequest("http://localhost/api/assistant/history");
    const res = await GET(req);

    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(listAssistantHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        filter: "active",
      }),
    );
  });

  it("respects filter=trash query param", async () => {
    const { GET } = await import("@/app/api/assistant/history/route");
    const req = new NextRequest("http://localhost/api/assistant/history?filter=trash");
    await GET(req);

    expect(listAssistantHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "trash",
      }),
    );
  });
});
