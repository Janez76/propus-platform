import { query, queryOne } from "@/lib/db";

const SETTINGS_KEY = "assistant_config";

export type AssistantSettings = {
  model: string;
  enabledTools: string[];
  dailyTokenLimit: number;
  streamingEnabled: boolean;
};

const DEFAULT_SETTINGS: AssistantSettings = {
  model: "claude-sonnet-4-6",
  enabledTools: [], // empty = all enabled (filled at runtime)
  dailyTokenLimit: Number(process.env.ASSISTANT_DAILY_TOKEN_LIMIT) || 500_000,
  streamingEnabled: true,
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
  // Fill missing fields with defaults
  return {
    model: stored.model || DEFAULT_SETTINGS.model,
    enabledTools: Array.isArray(stored.enabledTools) && stored.enabledTools.length > 0
      ? stored.enabledTools
      : (await import("./tools")).allTools.map((t) => t.name),
    dailyTokenLimit: stored.dailyTokenLimit || DEFAULT_SETTINGS.dailyTokenLimit,
    streamingEnabled: stored.streamingEnabled !== false,
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
  };

  await query(
    `INSERT INTO booking.app_settings (key, value_json, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = $2::jsonb, updated_at = NOW()`,
    [SETTINGS_KEY, JSON.stringify(updated)],
  );

  return updated;
}
