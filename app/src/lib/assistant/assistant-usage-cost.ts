/**
 * Server-only: derived CHF estimate from token counts (no billing integration).
 *
 * Defaults approximate a Claude Sonnet–class public API tier (~USD 3 / 15 per MTok)
 * converted with a rough FX and rounded; override with:
 * - ASSISTANT_PRICE_INPUT_PER_MTOK_CHF
 * - ASSISTANT_PRICE_OUTPUT_PER_MTOK_CHF
 */
const DEFAULT_INPUT_PER_MTOK_CHF = 2.75;
const DEFAULT_OUTPUT_PER_MTOK_CHF = 13.75;

function parseRate(raw: string | undefined, fallback: number): number {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getAssistantTokenRatesChfPerMillion(): { input: number; output: number } {
  return {
    input: parseRate(process.env.ASSISTANT_PRICE_INPUT_PER_MTOK_CHF, DEFAULT_INPUT_PER_MTOK_CHF),
    output: parseRate(process.env.ASSISTANT_PRICE_OUTPUT_PER_MTOK_CHF, DEFAULT_OUTPUT_PER_MTOK_CHF),
  };
}

export function computeAssistantCostChf(inputTokens: number, outputTokens: number): number {
  const { input, output } = getAssistantTokenRatesChfPerMillion();
  const safeIn = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const safeOut = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  return (safeIn / 1_000_000) * input + (safeOut / 1_000_000) * output;
}
