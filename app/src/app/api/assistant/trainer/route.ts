/**
 * Trainer-Chat-API: eigener Mini-Chat im Training-Panel.
 * - Auth: Super-Admin (gleicher Gate wie /api/assistant/training/*).
 * - Toolset: ausschließlich `trainerTools` — kein Zugriff auf Kunden-/Auftrags-Tools.
 * - Persistenz: aktuell nicht — der Trainer-Chat lebt im Browser-State (jede Session
 *   beginnt frisch). Die getätigten Aktionen sind in `assistant_trainer_actions`
 *   audit-protokolliert.
 */
import { NextRequest, NextResponse } from "next/server";
import { runAssistantTurn, type AssistantHistory } from "@/lib/assistant/claude";
import { trainerTools, trainerHandlers } from "@/lib/assistant/trainer-tools";
import { buildTrainerSystemPrompt } from "@/lib/assistant/trainer-prompt";
import { requireAssistantTrainingAccess } from "@/lib/assistant/training-auth";
import { MODEL_IDS } from "@/lib/assistant/model-router";

export const runtime = "nodejs";
export const maxDuration = 90;

type ErrorCode = "auth_failed" | "rate_limited" | "model_error" | "tool_error" | "validation_error";

function errorResponse(message: string, code: ErrorCode, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  const access = await requireAssistantTrainingAccess(req);
  if (!access.ok) {
    const msg = access.status === 403 ? "Nur Super-Admin" : "Nicht authentifiziert";
    return errorResponse(msg, "auth_failed", access.status);
  }
  const user = access.user;

  let body: { userMessage?: unknown; history?: unknown; conversationContext?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse("Ungültiges JSON", "validation_error", 400);
  }

  const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  if (!userMessage) return errorResponse("userMessage fehlt", "validation_error", 400);
  if (userMessage.length > 8_000) return errorResponse("userMessage ist zu lang", "validation_error", 413);

  const history = Array.isArray(body.history) ? (body.history as AssistantHistory) : [];

  // conversationContext ist ein optionaler Block, den die UI mitschickt, wenn der
  // Admin per "✏ trainieren"-Button aus dem Hauptchat einsteigt — damit der Trainer
  // den Original-Austausch sieht ohne dass der Admin ihn copy-pasten muss.
  const conversationContext = typeof body.conversationContext === "string" ? body.conversationContext.trim() : "";

  const now = new Date();
  let systemPrompt = buildTrainerSystemPrompt({
    userName: user.name,
    userEmail: user.email,
    currentTime: now.toLocaleString("de-CH", { timeZone: "Europe/Zurich" }),
  });

  if (conversationContext) {
    systemPrompt += `\n\nKONTEXT AUS DEM HAUPTCHAT (vom Admin als Referenz mitgegeben):\n${conversationContext.slice(0, 4000)}`;
  }

  try {
    const result = await runAssistantTurn({
      systemPrompt,
      history,
      userMessage,
      tools: trainerTools,
      toolHandlers: trainerHandlers,
      context: {
        userId: user.id,
        userEmail: user.email,
        role: user.role,
      },
      forceModel: MODEL_IDS.sonnet,
      autoEscalation: false,
    });

    return NextResponse.json({
      finalText: result.finalText,
      history: result.history,
      toolCallsExecuted: result.toolCallsExecuted.map((c) => ({
        name: c.name,
        durationMs: c.durationMs,
        error: c.error,
        // Output ist für Trainer-Tools meist klein — ganz schicken, damit UI z. B.
        // die neue Few-Shot-ID anzeigen kann.
        output: c.output,
      })),
      pendingConfirmation: result.pendingConfirmation
        ? {
            id: result.pendingConfirmation.id,
            toolName: result.pendingConfirmation.toolName,
            description: result.pendingConfirmation.description,
            input: result.pendingConfirmation.input,
          }
        : undefined,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trainer-Fehler";
    console.error("[trainer]", err);
    if (message.includes("rate_limit") || message.includes("429")) {
      return errorResponse("Anfragelimit erreicht. Bitte warten.", "rate_limited", 429);
    }
    return errorResponse(message, "model_error", 500);
  }
}
