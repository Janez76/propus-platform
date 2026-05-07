import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth.server";
import { isAssistantSettingsAdminUi, isAssistantSettingsSuperAdmin } from "@/lib/assistant/access-env";
import { getAssistantSettings, updateAssistantSettings } from "@/lib/assistant/settings";
import { getAssistantUsageToday } from "@/lib/assistant/store";
import { allTools } from "@/lib/assistant/tools";
import { isOpenAiWhisperConfigured } from "@/lib/assistant/whisper";

export const runtime = "nodejs";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

export async function GET() {
  const session = await getAdminSession();
  if (!session || !INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Nicht authentifiziert", code: "auth_failed" }, { status: 401 });
  }

  const settings = await getAssistantSettings();
  // Bug-Hunt LOW L03: Vorher liefen Sessions ohne userKey/userName auf einen
  // gemeinsamen "admin"-Bucket. Lieber leere Usage zurueckgeben als
  // Bucket-Pollution zwischen fehlkonfigurierten Sessions zu riskieren.
  const sessionId = String(session.userKey || session.userName || "").trim();
  const usage = sessionId
    ? await getAssistantUsageToday(sessionId)
    : { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  return NextResponse.json({
    settings,
    usage,
    /** OpenAI Whisper — nur Spracheingabe; Text-Chat nutzt ANTHROPIC_API_KEY. */
    voiceTranscriptionConfigured: isOpenAiWhisperConfigured(),
    availableTools: allTools.map((t) => ({ name: t.name, description: t.description })),
    availableModels: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
    ],
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

  if (typeof body.model === "string") patch.model = body.model;
  if (Array.isArray(body.enabledTools)) patch.enabledTools = body.enabledTools as string[];
  if (typeof body.dailyTokenLimit === "number") patch.dailyTokenLimit = body.dailyTokenLimit;
  if (typeof body.streamingEnabled === "boolean") patch.streamingEnabled = body.streamingEnabled;

  const updated = await updateAssistantSettings(patch);
  return NextResponse.json({ settings: updated });
}
