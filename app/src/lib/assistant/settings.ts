import { query, queryOne } from "@/lib/db";
import type { ModelTier } from "./model-router";

const SETTINGS_KEY = "assistant_config";

export type AssistantSettings = {
  model: string;
  enabledTools: string[];
  dailyTokenLimit: number;
  streamingEnabled: boolean;
  autoEscalation: boolean;
  maxModelTier: ModelTier;
};

const DEFAULT_SETTINGS: AssistantSettings = {
  model: "claude-sonnet-4-6",
  enabledTools: [],
  // Default for production assistant usage; override via ASSISTANT_DAILY_TOKEN_LIMIT or app_settings.
  dailyTokenLimit: Number(process.env.ASSISTANT_DAILY_TOKEN_LIMIT) || 2_000_000,
  streamingEnabled: true,
  autoEscalation: process.env.ASSISTANT_AUTO_ESCALATION !== "false",
  maxModelTier: (process.env.ASSISTANT_MAX_MODEL_TIER as ModelTier) || "opus",
};

export async function getAssistantSettings(): Promise<AssistantSettings> {
  const row = await queryOne<{ value_json: AssistantSettings }>(
    `SELECT value_json FROM booking.app_settings WHERE key = $1`,
    [SETTINGS_KEY],
  );

  if (!row?.value_json) {
    // Return defaults; fill enabledTools dynamically
    const { allTools } = await import("./tools");
    return {
      ...DEFAULT_SETTINGS,
      enabledTools: allTools.map((t) => t.name),
    };
  }

  const stored = row.value_json;
  return {
    model: stored.model || DEFAULT_SETTINGS.model,
    enabledTools: Array.isArray(stored.enabledTools) && stored.enabledTools.length > 0
      ? stored.enabledTools
      : (await import("./tools")).allTools.map((t) => t.name),
    dailyTokenLimit: stored.dailyTokenLimit || DEFAULT_SETTINGS.dailyTokenLimit,
    streamingEnabled: stored.streamingEnabled !== false,
    autoEscalation: stored.autoEscalation !== false,
    maxModelTier: stored.maxModelTier || DEFAULT_SETTINGS.maxModelTier,
  };
}

export async function updateAssistantSettings(patch: Partial<AssistantSettings>): Promise<AssistantSettings> {
  const current = await getAssistantSettings();
  const updated: AssistantSettings = {
    model: patch.model || current.model,
    enabledTools: Array.isArray(patch.enabledTools) ? patch.enabledTools : current.enabledTools,
    dailyTokenLimit: typeof patch.dailyTokenLimit === "number" && patch.dailyTokenLimit > 0
      ? patch.dailyTokenLimit
      : current.dailyTokenLimit,
    streamingEnabled: typeof patch.streamingEnabled === "boolean" ? patch.streamingEnabled : current.streamingEnabled,
    autoEscalation: typeof patch.autoEscalation === "boolean" ? patch.autoEscalation : current.autoEscalation,
    maxModelTier: patch.maxModelTier || current.maxModelTier,
  };

  await query(
    `INSERT INTO booking.app_settings (key, value_json, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = $2::jsonb, updated_at = NOW()`,
    [SETTINGS_KEY, JSON.stringify(updated)],
  );

  return updated;
}
