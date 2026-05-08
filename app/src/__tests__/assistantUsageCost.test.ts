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

  it("weights cache writes at 1.25x and cache reads at 0.1x of the input rate", () => {
    expect(computeAssistantCostChf(0, 0, 1_000_000, 0)).toBeCloseTo(2.75 * 1.25, 6);
    expect(computeAssistantCostChf(0, 0, 0, 1_000_000)).toBeCloseTo(2.75 * 0.1, 6);
  });

  it("treats cache token args as optional (legacy callers)", () => {
    expect(computeAssistantCostChf(1_000_000, 1_000_000)).toBeCloseTo(
      computeAssistantCostChf(1_000_000, 1_000_000, 0, 0),
      6,
    );
  });
});
