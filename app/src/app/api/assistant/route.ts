import { NextRequest, NextResponse } from "next/server";
import { runAssistantTurn, type AssistantHistory } from "@/lib/assistant/claude";
import { allHandlers, allTools } from "@/lib/assistant/tools";
import { buildSystemPrompt } from "@/lib/assistant/system-prompt";
import { ensureConversation, insertAssistantMessage, insertAssistantToolCalls, updateConversationLinksFromToolCalls, writeAudit } from "@/lib/assistant/store";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";

export const runtime = "nodejs";
export const maxDuration = 60;

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

function sessionUser(session: AdminSession) {
  const userId = String(session.userKey || session.userName || session.role || "admin").trim();
  const email = String(session.userKey || "").includes("@") ? String(session.userKey) : "";
  return {
    id: userId || "admin",
    email: email || "admin@propus.local",
    name: session.userName || userId || "Admin",
  };
}

function clientIp(req: NextRequest): string | undefined {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  if (!INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Keine Berechtigung für den Assistant" }, { status: 403 });
  }

  let body: { userMessage?: unknown; history?: unknown; conversationId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  if (!userMessage) return NextResponse.json({ error: "userMessage fehlt" }, { status: 400 });
  if (userMessage.length > 8_000) return NextResponse.json({ error: "userMessage ist zu lang" }, { status: 413 });

  const history = Array.isArray(body.history) ? (body.history as AssistantHistory) : [];
  const user = sessionUser(session);
  const ipAddress = clientIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;

  try {
    const conversationId = await ensureConversation({
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      userId: user.id,
      userEmail: user.email,
      title: userMessage.slice(0, 120),
    });
    await insertAssistantMessage({ conversationId, role: "user", content: { text: userMessage } });

    const now = new Date();
    const systemPrompt = buildSystemPrompt({
      userName: user.name,
      userEmail: user.email,
      currentTime: now.toLocaleString("de-CH", { timeZone: "Europe/Zurich" }),
      timezone: "Europe/Zurich",
    });

    const result = await runAssistantTurn({
      systemPrompt,
      history,
      userMessage,
      tools: allTools,
      toolHandlers: allHandlers,
      context: { userId: user.id, userEmail: user.email, ipAddress, userAgent },
    });

    const assistantMessageId = await insertAssistantMessage({
      conversationId,
      role: "assistant",
      content: { text: result.finalText, toolCalls: result.toolCallsExecuted.map((call) => ({ name: call.name, error: call.error })) },
    });
    await insertAssistantToolCalls({ conversationId, messageId: assistantMessageId, toolCalls: result.toolCallsExecuted });
    await updateConversationLinksFromToolCalls({ conversationId, toolCalls: result.toolCallsExecuted });

    for (const call of result.toolCallsExecuted) {
      if (/^(create_|update_|delete_|send_|ha_call_service|mailerlite_add)/.test(call.name)) {
        await writeAudit({
          userId: user.id,
          conversationId,
          action: call.name,
          payload: { input: call.input, output: call.output, error: call.error },
          ipAddress,
          userAgent,
        });
      }
    }

    return NextResponse.json({
      finalText: result.finalText,
      history: result.history,
      toolCallsExecuted: result.toolCallsExecuted,
      conversationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assistant-Fehler";
    console.error("[assistant]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
