export type ModelTier = "haiku" | "sonnet" | "opus";
export type ModelMode = "auto" | "sonnet" | "opus";

export const MODEL_IDS: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

const COMPLEXITY_KEYWORDS =
  /\b(erkläre|analysiere|vergleiche|warum|zusammenfassung|plane|strategie|bewerte|überblick)\b/i;

const UNCERTAINTY_PATTERNS =
  /ich (weiss|weiß) nicht|kann ich (leider )?nicht|keine (ausreichenden )?informationen|nicht sicher|kann das nicht beantworten|dazu habe ich keine/i;

export function selectInitialModel(userMessage: string, maxTier: ModelTier): ModelTier {
  if (maxTier === "haiku") return "haiku";

  if (userMessage.length > 500) return "sonnet";
  if (COMPLEXITY_KEYWORDS.test(userMessage)) return "sonnet";

  return "haiku";
}

export function shouldEscalate(
  result: { finalText: string; toolCallsCount: number },
  currentTier: ModelTier,
  maxTier: ModelTier,
): ModelTier | null {
  if (currentTier === "opus") return null;
  if (currentTier === maxTier) return null;

  const text = result.finalText;
  const uncertain = UNCERTAINTY_PATTERNS.test(text);
  const tooManyToolsNoAnswer = result.toolCallsCount >= 4 && text.length < 100;
  const veryShort = text.length < 30 && result.toolCallsCount === 0;

  if (uncertain || tooManyToolsNoAnswer || veryShort) {
    if (currentTier === "haiku") return "sonnet";
    if (currentTier === "sonnet" && maxTier === "opus") return "opus";
  }

  return null;
}

export function tierOrder(tier: ModelTier): number {
  return tier === "haiku" ? 0 : tier === "sonnet" ? 1 : 2;
}

export function clampTier(requested: ModelTier, maxTier: ModelTier): ModelTier {
  return tierOrder(requested) <= tierOrder(maxTier) ? requested : maxTier;
}

export function parseTier(value: string | undefined, fallback: ModelTier): ModelTier {
  if (value === "haiku" || value === "sonnet" || value === "opus") return value;
  return fallback;
}

export function parseModelMode(value: unknown, fallback: ModelMode = "auto"): ModelMode {
  if (value === "auto" || value === "sonnet" || value === "opus") return value;
  return fallback;
}
