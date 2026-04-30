import { describe, expect, it, vi } from "vitest";
import { maybeSummarize } from "@/lib/assistant/claude";

// Mock DB for settings/token tests
const mockQueryOne = vi.fn();
const mockQuery = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}));

describe("token limit enforcement", () => {
  it("getAssistantUsageToday sums tokens correctly", async () => {
    mockQueryOne.mockResolvedValueOnce({ input_tokens: "120000", output_tokens: "30000" });
    const { getAssistantUsageToday } = await import("@/lib/assistant/store");
    const usage = await getAssistantUsageToday("user-1");
    expect(usage.totalTokens).toBe(150_000);
    expect(usage.inputTokens).toBe(120_000);
    expect(usage.outputTokens).toBe(30_000);
  });

  it("returns zero for new users", async () => {
    mockQueryOne.mockResolvedValueOnce({ input_tokens: "0", output_tokens: "0" });
    const { getAssistantUsageToday } = await import("@/lib/assistant/store");
    const usage = await getAssistantUsageToday("new-user");
    expect(usage.totalTokens).toBe(0);
  });
});

describe("settings validation", () => {
  it("returns defaults when no settings stored", async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const { getAssistantSettings } = await import("@/lib/assistant/settings");
    const settings = await getAssistantSettings();
    expect(settings.model).toBe("claude-sonnet-4-6");
    expect(settings.streamingEnabled).toBe(true);
    expect(settings.dailyTokenLimit).toBeGreaterThan(0);
    expect(Array.isArray(settings.enabledTools)).toBe(true);
  });

  it("merges stored settings with defaults", async () => {
    mockQueryOne.mockResolvedValueOnce({
      value_json: {
        model: "claude-opus-4-7",
        enabledTools: ["get_open_orders"],
        dailyTokenLimit: 100_000,
        streamingEnabled: false,
      },
    });
    const { getAssistantSettings } = await import("@/lib/assistant/settings");
    const settings = await getAssistantSettings();
    expect(settings.model).toBe("claude-opus-4-7");
    expect(settings.streamingEnabled).toBe(false);
    expect(settings.dailyTokenLimit).toBe(100_000);
    expect(settings.enabledTools).toEqual(["get_open_orders"]);
  });

  it("updateAssistantSettings persists partial patch", async () => {
    mockQueryOne.mockResolvedValueOnce({
      value_json: {
        model: "claude-sonnet-4-6",
        enabledTools: ["get_open_orders", "search_tours"],
        dailyTokenLimit: 500_000,
        streamingEnabled: true,
      },
    });
    mockQuery.mockResolvedValueOnce([]);
    const { updateAssistantSettings } = await import("@/lib/assistant/settings");
    const result = await updateAssistantSettings({ model: "claude-haiku-4-5" });
    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.streamingEnabled).toBe(true);
    expect(result.dailyTokenLimit).toBe(500_000);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO booking.app_settings"),
      expect.any(Array),
    );
  });
});

describe("tool result summaries", () => {
  it("does not summarize short results", () => {
    const short = JSON.stringify({ id: 1, name: "Test" });
    expect(maybeSummarize(short)).toBe(short);
  });

  it("summarizes results over threshold", () => {
    const longResult = "x".repeat(2001) + "\n" + JSON.stringify({ a: 1 });
    const summarized = maybeSummarize(longResult);
    expect(summarized).toContain("[Zusammenfassung:");
    expect(summarized).toContain(longResult);
  });

  it("counts JSON items for multi-object results", () => {
    const items = Array.from({ length: 10 }, (_, i) => JSON.stringify({ id: i, name: `Item ${i}` })).join("\n");
    const padded = items + "x".repeat(2001 - items.length);
    const summarized = maybeSummarize(padded);
    expect(summarized).toContain("Einträge gefunden");
  });
});
