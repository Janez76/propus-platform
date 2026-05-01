import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth.server";
import { isAssistantSettingsAdminUi, isAssistantSettingsSuperAdmin } from "@/lib/assistant/access-env";
import { getAssistantSettings, updateAssistantSettings } from "@/lib/assistant/settings";
import { getAssistantUsageToday } from "@/lib/assistant/store";
import { allTools } from "@/lib/assistant/tools";

export const runtime = "nodejs";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

export async function GET() {
  const session = await getAdminSession();
  if (!session || !INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Nicht authentifiziert", code: "auth_failed" }, { status: 401 });
  }

  const settings = await getAssistantSettings();
  const userId = String(session.userKey || session.userName || "admin").trim() || "admin";
  const usage = await getAssistantUsageToday(userId);

  return NextResponse.json({
    settings,
    usage,
    availableTools: allTools.map((t) => ({ name: t.name, description: t.description })),
    availableModels: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
    isAdmin: isAssistantSettingsAdminUi(session),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !isAssistantSettingsSuperAdmin(session)) {
    return NextResponse.json({ error: "Nur Super-Admin darf Einstellungen ändern", code: "auth_failed" }, { status: 403 });
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
