import { NextRequest, NextResponse } from "next/server";
import { runAssistantTurn, type AssistantHistory } from "@/lib/assistant/claude";
import { runAssistantTurnStreaming } from "@/lib/assistant/claude-stream";
import { allHandlers, allTools } from "@/lib/assistant/tools";
import { buildSystemPromptAsync } from "@/lib/assistant/system-prompt-resolved";
import { selectFewShotsAsync } from "@/lib/assistant/few-shot-loader";
import {
  ensureConversation,
  insertAssistantMessage,
  insertAssistantToolCalls,
  insertPendingConfirmation,
  updateConversationLinksFromToolCalls,
  updateConversationTokens,
  getAssistantUsageToday,
  writeAudit,
} from "@/lib/assistant/store";
import { createMemory, selectMemoriesForPrompt } from "@/lib/assistant/memory-store";
import { detectAndRecordImplicit } from "@/lib/assistant/implicit-detector";
import { getSelfLearningSettings } from "@/lib/assistant/self-learning-store";
import { resolveAssistantUser } from "@/lib/assistant/auth";
import { isAssistantDailyLimitExempt } from "@/lib/assistant/access-env";
import { getAssistantSettings } from "@/lib/assistant/settings";
import { parseAssistantModelModeFromRequest, resolveAssistantModelForRequest } from "@/lib/assistant/assistant-model-mode";
import { formatModelLabel, inferTierFromAnthropicModelId, parseTier } from "@/lib/assistant/model-router";

export const runtime = "nodejs";
export const maxDuration = 60;

type ErrorCode = "auth_failed" | "rate_limited" | "model_error" | "tool_error" | "validation_error";

function errorResponse(message: string, code: ErrorCode, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

function clientIp(req: NextRequest): string | undefined {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
}

/**
 * Per-User Burst-Rate-Limit (Bug-Hunt T03 MEDIUM). Daily-Token-Limit
 * deckt Kosten-Cap ab; ohne Burst-Limit kann ein einzelner User Burst-
 * traffic ueber den ganzen User-Pool hinweg eskalieren bis die Anthropic-
 * API antwortet — wir wollen lokal pro User ein Lower-Bound enforce.
 *
 * Default 20 req/min/user via in-memory Map. Konfigurierbar via env
 * `ASSISTANT_PER_MIN_LIMIT`. Map wird periodisch GC'd damit sie nicht
 * unbounded waechst.
 */
const ASSISTANT_PER_MIN_LIMIT = (() => {
  const raw = process.env.ASSISTANT_PER_MIN_LIMIT;
  const n = raw ? parseInt(raw, 10) : 20;
  return Number.isFinite(n) && n > 0 ? n : 20;
})();
const ASSISTANT_BURST_WINDOW_MS = 60_000;
const _assistantBurstBuckets = new Map<string, { count: number; resetAt: number }>();
function checkAssistantBurstLimit(userKey: string): boolean {
  const now = Date.now();
  const bucket = _assistantBurstBuckets.get(userKey);
  if (!bucket || bucket.resetAt <= now) {
    _assistantBurstBuckets.set(userKey, { count: 1, resetAt: now + ASSISTANT_BURST_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= ASSISTANT_PER_MIN_LIMIT;
}
// Periodischer Cleanup damit die Map nicht waechst.
if (typeof globalThis !== "undefined" && !(globalThis as { _assistantBurstGC?: boolean })._assistantBurstGC) {
  (globalThis as { _assistantBurstGC?: boolean })._assistantBurstGC = true;
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of _assistantBurstBuckets) {
      if (b.resetAt <= now) _assistantBurstBuckets.delete(k);
    }
  }, 5 * 60_000).unref?.();
}

export async function POST(req: NextRequest) {
  const user = await resolveAssistantUser(req);
  if (!user) return errorResponse("Nicht authentifiziert", "auth_failed", 401);

  // Per-Minute-Burst-Limit pro User. Tritt vor dem Daily-Limit-Check auf,
  // damit ein einziger Schleifen-Bug im Frontend nicht das Daily-Budget
  // in Sekunden verbrennt (Bug-Hunt T03 MEDIUM).
  if (!isAssistantDailyLimitExempt(user.email) && !checkAssistantBurstLimit(user.id)) {
    return errorResponse(
      "Zu viele Anfragen pro Minute. Bitte kurz warten.",
      "rate_limited",
      429,
    );
  }

  let body: { userMessage?: unknown; history?: unknown; conversationId?: unknown; modelMode?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse("Ungültiges JSON", "validation_error", 400);
  }

  const clientModelMode = parseAssistantModelModeFromRequest(
    req.headers.get("x-assistant-model-mode"),
    body.modelMode,
  );

  const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  if (!userMessage) return errorResponse("userMessage fehlt", "validation_error", 400);
  if (userMessage.length > 8_000) return errorResponse("userMessage ist zu lang", "validation_error", 413);

  const history = Array.isArray(body.history) ? (body.history as AssistantHistory) : [];
  const ipAddress = clientIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;

  // Load settings
  const settings = await getAssistantSettings();
  const dailyLimit = settings.dailyTokenLimit;

  // Check daily token limit
  const usage = await getAssistantUsageToday(user.id);
  if (!isAssistantDailyLimitExempt(user.email) && usage.totalTokens >= dailyLimit) {
    return errorResponse("Anfragelimit erreicht. Bitte morgen erneut versuchen.", "rate_limited", 429);
  }

  const streamParam = req.nextUrl.searchParams.get("stream");
  const useStreaming = streamParam === "false" ? false : settings.streamingEnabled;

  // "Merk dir" shortcut (nur Non-Streaming — bei SSE würde JSON den Event-Stream brechen)
  const merkDirMatch = userMessage.match(/^(?:merk\s+dir|merke\s+dir|notiere|speicher[en]?)\s*[:\s]+([\s\S]+)/i);
  if (merkDirMatch && !useStreaming) {
    try {
      const memBody = merkDirMatch[1].trim();
      const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
      await createMemory(user.id, memBody, "explicit_user", conversationId || undefined);
      return NextResponse.json({
        finalText: `Alles klar, ich habe mir gemerkt: „${memBody}"`,
        history,
        toolCallsExecuted: [],
        conversationId: conversationId || null,
        memorySaved: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fehler beim Speichern";
      return errorResponse(message, "tool_error", 400);
    }
  }

  // Filter tools based on settings
  const enabledToolNames = new Set(settings.enabledTools);
  const filteredTools = allTools.filter((t) => enabledToolNames.has(t.name));
  const filteredHandlers: Record<string, typeof allHandlers[string]> = {};
  for (const name of enabledToolNames) {
    if (allHandlers[name]) filteredHandlers[name] = allHandlers[name];
  }

  try {
    const conversationId = await ensureConversation({
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      userId: user.id,
      userEmail: user.email,
      title: userMessage.slice(0, 120),
    });
    await insertAssistantMessage({ conversationId, role: "user", content: { text: userMessage } });

    const [memories, fewShots, now] = await Promise.all([
      selectMemoriesForPrompt(user.id, userMessage, 40),
      selectFewShotsAsync(userMessage),
      Promise.resolve(new Date()),
    ]);
    const systemPrompt = await buildSystemPromptAsync({
      userName: user.name,
      userEmail: user.email,
      currentTime: now.toLocaleString("de-CH", { timeZone: "Europe/Zurich" }),
      timezone: "Europe/Zurich",
      memories,
      fewShots,
    });

    const modelResolution = resolveAssistantModelForRequest({
      clientMode: clientModelMode,
      settingsAutoEscalation: settings.autoEscalation,
      settingsMaxModelTier: settings.maxModelTier,
      envMaxModelTier: parseTier(
        process.env.ANTHROPIC_MAX_MODEL_TIER ?? process.env.ASSISTANT_MAX_MODEL_TIER,
        settings.maxModelTier,
      ),
    });

    // ──── Streaming Path ────
    if (useStreaming) {
      const { stream, metaPromise } = runAssistantTurnStreaming({
        systemPrompt,
        history,
        userMessage,
        tools: filteredTools,
        toolHandlers: filteredHandlers,
        context: {
          userId: user.id,
          userEmail: user.email,
          role: user.role,
          ipAddress,
          userAgent,
          conversationId,
        },
        model: modelResolution.streamingExplicitModel,
        autoEscalation: modelResolution.autoEscalation,
        maxModelTier: modelResolution.maxModelTier,
        responseMeta: {
          modelModeRequested: modelResolution.requestedMode,
          modelModeEffective: modelResolution.effectiveMode,
          modelTierApplied: modelResolution.appliedTier,
          modelModeNotice: modelResolution.notice,
        },
      });

      void metaPromise.then(async (meta) => {
        const lastAssistantContent = meta.history
          .filter((m) => m.role === "assistant")
          .pop();
        const finalText = lastAssistantContent && Array.isArray(lastAssistantContent.content)
          ? (lastAssistantContent.content as Array<{ type: string; text?: string }>)
              .filter((b) => b.type === "text")
              .map((b) => b.text || "")
              .join("\n")
              .trim()
          : "";

        const assistantMessageId = await insertAssistantMessage({
          conversationId,
          role: "assistant",
          content: {
            text: finalText,
            toolCalls: meta.toolCallsExecuted.map((c) => ({ name: c.name, error: c.error })),
          },
        });
        await insertAssistantToolCalls({ conversationId, messageId: assistantMessageId, toolCalls: meta.toolCallsExecuted });
        await updateConversationLinksFromToolCalls({ conversationId, toolCalls: meta.toolCallsExecuted });
        await updateConversationTokens({ conversationId, inputTokens: meta.inputTokens, outputTokens: meta.outputTokens });

        for (const call of meta.toolCallsExecuted) {
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

        // Self-Learning: passive Signal-Erfassung post-stream
        try {
          const sl = await getSelfLearningSettings();
          if (sl.implicitFeedbackEnabled) {
            const priorAssistant = (history as Array<{ role: string; content: unknown }>)
              .filter((m) => m.role === "assistant")
              .pop();
            const priorAssistantText = priorAssistant && Array.isArray(priorAssistant.content)
              ? (priorAssistant.content as Array<{ type: string; text?: string }>)
                  .filter((b) => b.type === "text")
                  .map((b) => b.text || "")
                  .join("\n")
                  .trim()
              : null;
            await detectAndRecordImplicit({
              userId: user.id,
              conversationId,
              userMessageId: null,
              assistantMessageId,
              currentUserMessage: userMessage,
              previousAssistantText: priorAssistantText,
              currentToolCalls: meta.toolCallsExecuted.map((c) => ({ name: c.name, error: c.error })),
              recentHistory: (history as Array<{ role: string; content: unknown }>)
                .slice(-6)
                .map((m) => ({
                  role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
                  content: Array.isArray(m.content)
                    ? (m.content as Array<{ type: string; text?: string }>)
                        .filter((b) => b.type === "text")
                        .map((b) => b.text || "")
                        .join("\n")
                    : String(m.content ?? ""),
                })),
            });
          }
        } catch (err) {
          console.warn("[assistant-stream] implicit-signal write failed:", err);
        }
      }).catch((err) => {
        console.error("[assistant-stream] post-stream persistence error:", err);
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Conversation-Id": conversationId,
        },
      });
    }

    // ──── Non-streaming Path ────
    const result = await runAssistantTurn({
      systemPrompt,
      history,
      userMessage,
      tools: filteredTools,
      toolHandlers: filteredHandlers,
      context: {
        userId: user.id,
        userEmail: user.email,
        role: user.role,
        ipAddress,
        userAgent,
        conversationId,
      },
      autoEscalation: modelResolution.autoEscalation,
      maxModelTier: modelResolution.maxModelTier,
      forceModel: modelResolution.nonStreamingForceModel,
    });

    const assistantMessageId = await insertAssistantMessage({
      conversationId,
      role: "assistant",
      content: { text: result.finalText, toolCalls: result.toolCallsExecuted.map((call) => ({ name: call.name, error: call.error })) },
    });
    await insertAssistantToolCalls({ conversationId, messageId: assistantMessageId, toolCalls: result.toolCallsExecuted });
    await updateConversationLinksFromToolCalls({ conversationId, toolCalls: result.toolCallsExecuted });
    await updateConversationTokens({ conversationId, inputTokens: result.inputTokens, outputTokens: result.outputTokens });

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

    // Self-Learning: passive Signal-Erfassung
    try {
      const sl = await getSelfLearningSettings();
      if (sl.implicitFeedbackEnabled) {
        const priorAssistant = (history as Array<{ role: string; content: unknown }>)
          .filter((m) => m.role === "assistant")
          .pop();
        const priorAssistantText = priorAssistant && Array.isArray(priorAssistant.content)
          ? (priorAssistant.content as Array<{ type: string; text?: string }>)
              .filter((b) => b.type === "text")
              .map((b) => b.text || "")
              .join("\n")
              .trim()
          : null;
        await detectAndRecordImplicit({
          userId: user.id,
          conversationId,
          userMessageId: null,
          assistantMessageId,
          currentUserMessage: userMessage,
          previousAssistantText: priorAssistantText,
          currentToolCalls: result.toolCallsExecuted.map((c) => ({ name: c.name, error: c.error })),
          recentHistory: (history as Array<{ role: string; content: unknown }>)
            .slice(-6)
            .map((m) => ({
              role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
              content: Array.isArray(m.content)
                ? (m.content as Array<{ type: string; text?: string }>)
                    .filter((b) => b.type === "text")
                    .map((b) => b.text || "")
                    .join("\n")
                : String(m.content ?? ""),
            })),
        });
      }
    } catch (err) {
      console.warn("[assistant] implicit-signal write failed:", err);
    }

    const memorySaved = result.toolCallsExecuted.some(
      (c) =>
        c.name === "save_memory" &&
        !c.error &&
        c.output &&
        typeof c.output === "object" &&
        (c.output as Record<string, unknown>).ok === true,
    );

    const modelTierFromId = inferTierFromAnthropicModelId(result.modelUsed);
    const responsePayload: Record<string, unknown> = {
      finalText: result.finalText,
      history: result.history,
      toolCallsExecuted: result.toolCallsExecuted,
      conversationId,
      model: result.modelUsed,
      modelUsed: result.modelUsed,
      modelLabel: formatModelLabel(result.modelUsed),
      ...(modelTierFromId ? { tier: modelTierFromId } : {}),
      escalated: result.escalated,
      memorySaved,
      modelModeRequested: modelResolution.requestedMode,
      modelModeEffective: modelResolution.effectiveMode,
      modelTierApplied: modelResolution.appliedTier,
      modelModeNotice: modelResolution.notice,
    };

    if (result.pendingConfirmation) {
      const confirmationId = await insertPendingConfirmation({
        conversationId,
        toolCallId: result.pendingConfirmation.id,
        toolName: result.pendingConfirmation.toolName,
        toolInput: result.pendingConfirmation.input,
        userId: user.id,
      });

      await writeAudit({
        userId: user.id,
        conversationId,
        action: `${result.pendingConfirmation.toolName}_proposed`,
        payload: { input: result.pendingConfirmation.input, confirmationId },
        ipAddress,
        userAgent,
      });

      responsePayload.pendingConfirmation = {
        id: confirmationId,
        toolName: result.pendingConfirmation.toolName,
        description: result.pendingConfirmation.description,
        input: result.pendingConfirmation.input,
      };
    }

    return NextResponse.json(responsePayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assistant-Fehler";
    console.error("[assistant]", err);

    if (message.includes("rate_limit") || message.includes("429")) {
      return errorResponse("Anfragelimit erreicht. Bitte warten.", "rate_limited", 429);
    }
    if (message.includes("overloaded") || message.includes("503") || message.includes("500")) {
      return errorResponse("Claude ist gerade nicht erreichbar. Bitte in 30s erneut versuchen.", "model_error", 503);
    }

    return errorResponse(message, "model_error", 500);
  }
}
