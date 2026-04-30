import { MODEL_IDS, type ModelTier, tierOrder } from "./model-router";

/** Client localStorage key — keep in sync with ConversationView */
export const ASSISTANT_MODEL_MODE_STORAGE_KEY = "propus-assistant-model-mode";

export type AssistantModelMode = "auto" | "sonnet" | "opus";

/**
 * Per-request model preference from browser:
 * - Header `X-Assistant-Model-Mode: auto|sonnet|opus` (preferred)
 * - OR JSON body `modelMode` (same values) — header wins if both are set
 */
export function parseAssistantModelMode(raw: string | null | undefined): AssistantModelMode {
  const v = raw?.trim().toLowerCase();
  if (v === "sonnet" || v === "opus" || v === "auto") return v;
  return "auto";
}

export function parseAssistantModelModeFromRequest(header: string | null, bodyField: unknown): AssistantModelMode {
  if (header && header.trim()) return parseAssistantModelMode(header);
  if (typeof bodyField === "string") return parseAssistantModelMode(bodyField);
  return "auto";
}

/** Never run a tier above server max (`settings.maxModelTier` / `ASSISTANT_MAX_MODEL_TIER`). */
export function clampTierToMax(tier: ModelTier, maxTier: ModelTier): ModelTier {
  return tierOrder(tier) > tierOrder(maxTier) ? maxTier : tier;
}

export type ResolvedAssistantModelRequest = {
  /** For `runAssistantTurnStreaming`: `model` param; `undefined` = Auto-Routing */
  streamingExplicitModel: string | undefined;
  /** For `runAssistantTurn`: `forceModel`; `undefined` = tier ladder + escalation */
  nonStreamingForceModel: string | undefined;
  autoEscalation: boolean;
  maxModelTier: ModelTier;
  requestedMode: AssistantModelMode;
  effectiveMode: AssistantModelMode;
  appliedTier: ModelTier;
  notice?: string;
};

/**
 * How client override interacts with server max tier:
 * - `auto`: keep admin `streamingEnabled` / `autoEscalation` behavior; cap for the ladder is still `maxModelTier`.
 * - `sonnet` / `opus`: force that tier's Anthropic model ID (`MODEL_IDS`), but **clamped** to `maxModelTier`
 *   (e.g. user "Opus fix" + env/DB max `sonnet` → `claude-sonnet-4-6`; "Sonnet fix" + max `haiku` → haiku).
 * Server max comes from assistant settings + optional env hard cap (`ANTHROPIC_MAX_MODEL_TIER`/`ASSISTANT_MAX_MODEL_TIER`).
 */
export function resolveAssistantModelForRequest(input: {
  clientMode: AssistantModelMode;
  settingsAutoEscalation: boolean;
  settingsMaxModelTier: ModelTier;
  envMaxModelTier?: ModelTier;
}): ResolvedAssistantModelRequest {
  const maxModelTier = input.envMaxModelTier
    ? clampTierToMax(input.settingsMaxModelTier, input.envMaxModelTier)
    : input.settingsMaxModelTier;

  if (input.clientMode === "auto") {
    return {
      streamingExplicitModel: undefined,
      nonStreamingForceModel: undefined,
      autoEscalation: input.settingsAutoEscalation,
      maxModelTier,
      requestedMode: "auto",
      effectiveMode: "auto",
      appliedTier: maxModelTier,
    };
  }

  const requestedTier: ModelTier = input.clientMode === "opus" ? "opus" : "sonnet";
  const tier = clampTierToMax(requestedTier, maxModelTier);
  const id = MODEL_IDS[tier];
  const requestedLabel = input.clientMode === "opus" ? "Opus fix" : "Sonnet fix";
  const tierLabel = tier === "opus" ? "Opus" : tier === "sonnet" ? "Sonnet" : "Haiku";
  const effectiveMode: AssistantModelMode =
    input.clientMode === "opus" && tier === "sonnet" ? "sonnet" : input.clientMode;
  return {
    streamingExplicitModel: id,
    nonStreamingForceModel: id,
    autoEscalation: false,
    maxModelTier: tier,
    requestedMode: input.clientMode,
    effectiveMode,
    appliedTier: tier,
    notice: tier !== requestedTier
      ? `${requestedLabel} wurde wegen Server-Limit auf ${tierLabel} begrenzt.`
      : undefined,
  };
}
