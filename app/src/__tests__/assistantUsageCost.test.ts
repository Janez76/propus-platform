import { afterEach, describe, expect, it, vi } from "vitest";
import { computeAssistantCostChf } from "@/lib/assistant/assistant-usage-cost";

describe("computeAssistantCostChf", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses default Sonnet-class rates (CHF / million tokens)", () => {
    expect(computeAssistantCostChf(1_000_000, 0)).toBeCloseTo(2.75, 6);
    expect(computeAssistantCostChf(0, 1_000_000)).toBeCloseTo(13.75, 6);
    expect(computeAssistantCostChf(1_000_000, 1_000_000)).toBeCloseTo(16.5, 6);
  });

  it("respects env overrides", () => {
    vi.stubEnv("ASSISTANT_PRICE_INPUT_PER_MTOK_CHF", "3");
    vi.stubEnv("ASSISTANT_PRICE_OUTPUT_PER_MTOK_CHF", "15");
    expect(computeAssistantCostChf(1_000_000, 1_000_000)).toBeCloseTo(18, 6);
  });
});
