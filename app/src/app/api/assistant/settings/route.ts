import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth.server";
import { isAssistantSettingsAdminUi, isAssistantSettingsSuperAdmin } from "@/lib/assistant/access-env";
import { isAssistantCookieSessionRole } from "@/lib/assistant/auth";
import { getAssistantSettings, updateAssistantSettings } from "@/lib/assistant/settings";
import { getAssistantUsageToday } from "@/lib/assistant/store";
import { allTools } from "@/lib/assistant/tools";
import { isOpenAiWhisperConfigured } from "@/lib/assistant/whisper";

export const runtime = "nodejs";

/** Erlaubte Default-Modelle fuer Assistant-Settings. Haiku wurde im
 *  Polish-Pass aus dem Auto-Routing entfernt; soll daher auch nicht mehr
 *  als persistierter Default-Modell-Wert gesetzt werden koennen. */
const ALLOWED_MODEL_IDS = new Set<string>([
  "claude-sonnet-4-6",
  "claude-opus-4-7",
]);

const DEFAULT_AVAILABLE_MODELS: Array<{ id: string; label: string }> = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
];

export async function GET() {
  const session = await getAdminSession();
  if (!session || !isAssistantCookieSessionRole(session.role)) {
    return NextResponse.json({ error: "Nicht authentifiziert", code: "auth_failed" }, { status: 401 });
  }

  const settings = await getAssistantSettings();
  // Bug-Hunt LOW L03: Vorher liefen Sessions ohne userKey/userName auf einen
  // gemeinsamen "admin"-Bucket. Lieber leere Usage zurueckgeben als
  // Bucket-Pollution zwischen fehlkonfigurierten Sessions zu riskieren.
  const sessionId = String(session.userKey || session.userName || "").trim();
  const usage = sessionId
    ? await getAssistantUsageToday(sessionId)
    : { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 0 };

  // Fallback: Falls das aktuell persistierte settings.model nicht (mehr) in
  // der Allowlist steht (z.B. Bestand mit "claude-haiku-4-5"), als
  // veralteten Eintrag mit anhaengen — sonst zeigt der <select> in der
  // Settings-UI einen leeren Wert ohne matchende <option>.
  const availableModels = [...DEFAULT_AVAILABLE_MODELS];
  const currentModel = typeof settings.model === "string" ? settings.model : "";
  if (currentModel && !availableModels.some((m) => m.id === currentModel)) {
    availableModels.push({ id: currentModel, label: `${currentModel} (veraltet)` });
  }

  return NextResponse.json({
    settings,
    usage,
    /** OpenAI Whisper — nur Spracheingabe; Text-Chat nutzt ANTHROPIC_API_KEY. */
    voiceTranscriptionConfigured: isOpenAiWhisperConfigured(),
    availableTools: allTools.map((t) => ({ name: t.name, description: t.description })),
    availableModels,
    isAdmin: isAssistantSettingsAdminUi(session),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !isAssistantSettingsSuperAdmin(session)) {
    return NextResponse.json({ error: "Nur Admin oder Super-Admin darf Einstellungen ändern", code: "auth_failed" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON", code: "validation_error" }, { status: 400 });
  }

  const patch: Partial<{
    model: string;
    enabledTools: string[];
    dailyTokenLimit: number;
    streamingEnabled: boolean;
  }> = {};

  if (typeof body.model === "string") {
    if (!ALLOWED_MODEL_IDS.has(body.model)) {
      return NextResponse.json(
        { error: `Modell '${body.model}' ist nicht erlaubt`, code: "validation_error" },
        { status: 400 },
      );
    }
    patch.model = body.model;
  }
  if (Array.isArray(body.enabledTools)) patch.enabledTools = body.enabledTools as string[];
  if (typeof body.dailyTokenLimit === "number") patch.dailyTokenLimit = body.dailyTokenLimit;
  if (typeof body.streamingEnabled === "boolean") patch.streamingEnabled = body.streamingEnabled;

  const updated = await updateAssistantSettings(patch);
  return NextResponse.json({ settings: updated });
}
