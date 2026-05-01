import { describe, expect, it } from "vitest";
import type { EvalSuiteSummary } from "../../scripts/eval-assistant";
import { serializeEvalSummary } from "@/lib/assistant/training-runner";

describe("serializeEvalSummary", () => {
  it("liefert stable JSON-fähige Kurzform", () => {
    const summary = {
      passed: 1,
      total: 2,
      totalInputTokens: 100,
      totalOutputTokens: 200,
      results: [
        {
          id: "ok-case",
          pass: true,
          reason: "ok",
          model: "claude",
          tools: [] as string[],
          inputTokens: 50,
          outputTokens: 100,
          finalText: "Antwort",
        },
        {
          id: "bad-case",
          pass: false,
          reason: "mustContain",
          model: "claude",
          tools: ["search_customers"],
          inputTokens: 50,
          outputTokens: 100,
          finalText: "x".repeat(3000),
        },
      ],
      failedCases: [],
    } satisfies EvalSuiteSummary;

    const s = serializeEvalSummary(summary);
    expect(s.passed).toBe(1);
    expect(s.failedCaseIds).toEqual(["bad-case"]);
    expect(s.results[1]!.finalTextPreview.length).toBeLessThanOrEqual(2000);
    expect(() => JSON.stringify(s)).not.toThrow();
  });
});
