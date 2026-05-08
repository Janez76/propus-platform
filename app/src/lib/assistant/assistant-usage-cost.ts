/**
 * Server-only: derived CHF estimate from token counts (no billing integration).
 *
 * Defaults approximate a Claude Sonnet–class public API tier (~USD 3 / 15 per MTok)
 * converted with a rough FX and rounded; override with:
 * - ASSISTANT_PRICE_INPUT_PER_MTOK_CHF
 * - ASSISTANT_PRICE_OUTPUT_PER_MTOK_CHF
 *
 * Cache tokens are weighted relative to the base input rate per Anthropic pricing:
 *   cache_creation_input_tokens: 1.25x (write)
 *   cache_read_input_tokens:     0.10x (read)
 */
const DEFAULT_INPUT_PER_MTOK_CHF = 2.75;
const DEFAULT_OUTPUT_PER_MTOK_CHF = 13.75;
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

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

function safe(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function computeAssistantCostChf(
  inputTokens: number,
  outputTokens: number,
  cacheCreationInputTokens: number = 0,
  cacheReadInputTokens: number = 0,
): number {
  const { input, output } = getAssistantTokenRatesChfPerMillion();
  const safeIn = safe(inputTokens);
  const safeOut = safe(outputTokens);
  const safeCacheWrite = safe(cacheCreationInputTokens);
  const safeCacheRead = safe(cacheReadInputTokens);
  return (
    (safeIn / 1_000_000) * input +
    (safeOut / 1_000_000) * output +
    (safeCacheWrite / 1_000_000) * input * CACHE_WRITE_MULTIPLIER +
    (safeCacheRead / 1_000_000) * input * CACHE_READ_MULTIPLIER
  );
}
