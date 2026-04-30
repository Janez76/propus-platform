/**
 * POST /api/assistant
 *
 * Body:
 *   - userMessage: string
 *   - history?:    Anthropic.MessageParam[] (clientseitig gehaltener Verlauf)
 *   - conversationId?: string
 *
 * Antwort:
 *   - finalText, history, toolCallsExecuted
 *
 * Auth: admin_session-Cookie ODER Bearer-Token (siehe lib/assistant/auth.ts).
 *       Portal-only-Rollen werden abgelehnt.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAssistantTurn } from "@/lib/assistant/claude";
import { allTools, allHandlers } from "@/lib/assistant/tools";
import { buildSystemPrompt } from "@/lib/assistant/system-prompt";
import { writeAudit } from "@/lib/assistant/audit";
import { getAssistantSession, resolveAdminEmail } from "@/lib/assistant/auth";
import { logger } from "@/lib/logger";

const WRITE_TOOL_REGEX = /^(create_|update_|delete_|send_|ha_call_service|mailerlite_add)/;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Sehr lockere IP-Plausibilitaets-Pruefung; INET-Cast in Postgres macht die echte Validierung.
const IP_REGEX = /^(?:[0-9a-f.:]+)$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * x-forwarded-for kann eine Komma-Liste sein: "client, proxy1, proxy2".
 * Postgres INET akzeptiert nur eine einzelne Adresse. Erste Adresse nehmen,
 * trimmen und nur durchlassen, wenn sie wie eine IP aussieht.
 */
function parseFirstIp(header: string | null): string | undefined {
  if (!header) return undefined;
  const first = header.split(",")[0]?.trim();
  if (!first) return undefined;
  return IP_REGEX.test(first) ? first : undefined;
}

export async function POST(req: NextRequest) {
  const session = await getAssistantSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userMessage?: string; history?: unknown[]; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  if (!body.userMessage || typeof body.userMessage !== "string") {
    return NextResponse.json({ error: "userMessage fehlt" }, { status: 400 });
  }
  if (body.userMessage.length > 8000) {
    return NextResponse.json({ error: "userMessage zu lang" }, { status: 413 });
  }

  const userId = session.userKey ?? session.userName ?? "admin";
  const resolvedEmail = await resolveAdminEmail(session);
  const userEmail = resolvedEmail ?? "";
  const userName = session.userName ?? session.userKey ?? "Admin";

  const now = new Date();
  const systemPrompt = buildSystemPrompt({
    userName,
    userEmail,
    currentTime: now.toLocaleString("de-CH", { timeZone: "Europe/Zurich" }),
    timezone: "Europe/Zurich",
  });

  const ipAddress = parseFirstIp(req.headers.get("x-forwarded-for"));
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const conversationId = isUuid(body.conversationId) ? body.conversationId : undefined;

  try {
    const result = await runAssistantTurn({
      systemPrompt,
      history: (body.history as never[]) ?? [],
      userMessage: body.userMessage,
      tools: allTools,
      toolHandlers: allHandlers,
      context: {
        userId,
        userEmail,
        ipAddress,
        userAgent,
      },
      onToolCall: (name, toolInput) => {
        logger.info("[ASSISTANT] tool-call", { name, input: toolInput, userId });
      },
    });

    for (const tc of result.toolCallsExecuted) {
      if (WRITE_TOOL_REGEX.test(tc.name)) {
        await writeAudit({
          userId,
          conversationId,
          action: tc.name,
          payload: { input: tc.input, output: tc.output, error: tc.error },
          ipAddress,
          userAgent,
        });
      }
    }

    return NextResponse.json({
      finalText: result.finalText,
      history: result.history,
      toolCallsExecuted: result.toolCallsExecuted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    logger.error("[ASSISTANT] turn failed", { error: message, userId });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
