import { describe, expect, it } from "vitest";
import { formatModelLabel, inferTierFromAnthropicModelId, MODEL_IDS } from "@/lib/assistant/model-router";

describe("formatModelLabel", () => {
  it("maps configured Anthropic ids to German family + version", () => {
    expect(formatModelLabel(MODEL_IDS.haiku)).toBe("Haiku 4.5");
    expect(formatModelLabel(MODEL_IDS.sonnet)).toBe("Sonnet 4.6");
    expect(formatModelLabel(MODEL_IDS.opus)).toBe("Opus 4.7");
  });

  it("infers tier from legacy-style ids", () => {
    expect(formatModelLabel("claude-3-5-haiku-20241022")).toMatch(/Haiku/);
    expect(inferTierFromAnthropicModelId("claude-3-5-haiku-20241022")).toBe("haiku");
  });

  it("handles empty input", () => {
    expect(formatModelLabel("")).toBe("Unbekannt");
    expect(formatModelLabel("   ")).toBe("Unbekannt");
  });
});
