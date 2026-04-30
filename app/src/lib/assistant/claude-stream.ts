import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition, ToolHandler, ToolContext } from "./tools";
import { toAnthropicTools } from "./tools";
import { type ModelTier, MODEL_IDS, selectInitialModel, parseTier } from "./model-router";

const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 12;
const MAX_TOOL_RESULT_CHARS = 12_000;
const TOOL_RESULT_SUMMARY_THRESHOLD = 2_000;

function runtimeEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

export type StreamingTurnInput = {
  systemPrompt: string;
  history: Anthropic.Messages.MessageParam[];
  userMessage: string;
  tools: ToolDefinition[];
  toolHandlers: Record<string, ToolHandler>;
  context: ToolContext;
  model?: string;
  autoEscalation?: boolean;
  maxModelTier?: ModelTier;
  responseMeta?: {
    modelModeRequested: "auto" | "sonnet" | "opus";
    modelModeEffective: "auto" | "sonnet" | "opus";
    modelTierApplied: ModelTier;
    modelModeNotice?: string;
  };
};

export type StreamingTurnMeta = {
  history: Anthropic.Messages.MessageParam[];
  toolCallsExecuted: Array<{
    name: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    error?: string;
  }>;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
  escalated: boolean;
};

function toolResultContextPrefix(output: unknown): string {
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (obj.error) return `[Fehler: ${String(obj.error).slice(0, 120)}]\n`;
    if (obj.count === 0) return "[Keine Ergebnisse]\n";
    if (Array.isArray(obj) && obj.length === 0) return "[Keine Ergebnisse]\n";
  }
  return "";
}

function serializeToolResult(output: unknown): string {
  const prefix = toolResultContextPrefix(output);
  const text = typeof output === "string" ? output : JSON.stringify(output);
  const full = prefix + text;
  if (full.length <= MAX_TOOL_RESULT_CHARS) return full;
  return `${full.slice(0, MAX_TOOL_RESULT_CHARS)}\n… Ergebnis gekürzt (${text.length} Zeichen).`;
}

function maybeSummarize(result: string): string {
  if (result.length <= TOOL_RESULT_SUMMARY_THRESHOLD) return result;
  const lines = result.split("\n").length;
  const itemCount = (result.match(/\{/g) || []).length;
  const summary = itemCount > 1
    ? `[Zusammenfassung: ~${itemCount} Einträge gefunden, Details folgen]`
    : `[Zusammenfassung: ${lines} Zeilen Ergebnis, Details folgen]`;
  return `${summary}\n\n${result}`;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function runAssistantTurnStreaming(input: StreamingTurnInput): {
  stream: ReadableStream<Uint8Array>;
  metaPromise: Promise<StreamingTurnMeta>;
} {
  const apiKey = runtimeEnv("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt");

  const client = new Anthropic({ apiKey });

  const autoEscalation = input.autoEscalation !== false;
  const maxTier = input.maxModelTier || parseTier(runtimeEnv("ASSISTANT_MAX_MODEL_TIER"), "opus");

  let selectedModel: string;
  if (input.model) {
    selectedModel = input.model;
  } else if (autoEscalation) {
    const tier = selectInitialModel(input.userMessage, maxTier);
    selectedModel = MODEL_IDS[tier];
  } else {
    selectedModel = MODEL_IDS[maxTier];
  }

  const model = selectedModel;
  const escalated = autoEscalation && model !== MODEL_IDS[maxTier] ? false : false;
  const history: Anthropic.Messages.MessageParam[] = [...input.history, { role: "user", content: input.userMessage }];
  const toolCallsExecuted: StreamingTurnMeta["toolCallsExecuted"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  let resolveMetaPromise: (meta: StreamingTurnMeta) => void;
  let rejectMetaPromise: (err: Error) => void;
  const metaPromise = new Promise<StreamingTurnMeta>((resolve, reject) => {
    resolveMetaPromise = resolve;
    rejectMetaPromise = reject;
  });

  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  function enqueue(data: Record<string, unknown>) {
    try {
      controllerRef?.enqueue(encoder.encode(sseEvent(data)));
    } catch {
      // Client disconnected
    }
  }

  async function run() {
    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const stream = client.messages.stream({
          model,
          max_tokens: MAX_TOKENS,
          system: input.systemPrompt,
          tools: toAnthropicTools(input.tools) as Anthropic.Messages.Tool[],
          messages: history,
        });

        let currentToolName = "";
        let accumulatedText = "";
        const contentBlocks: Anthropic.Messages.ContentBlock[] = [];

        stream.on("text", (text) => {
          accumulatedText += text;
          enqueue({ type: "text_delta", text });
        });

        stream.on("contentBlock", (block) => {
          contentBlocks.push(block);
          if (block.type === "tool_use") {
            currentToolName = block.name;
            enqueue({ type: "tool_start", name: block.name });
          }
        });

        const finalMessage = await stream.finalMessage();
        totalInputTokens += finalMessage.usage?.input_tokens || 0;
        totalOutputTokens += finalMessage.usage?.output_tokens || 0;

        history.push({ role: "assistant", content: finalMessage.content });

        const toolUseBlocks = finalMessage.content.filter(
          (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use",
        );

        if (finalMessage.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
          break;
        }

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          const handler = input.toolHandlers[block.name];
          const start = Date.now();

          if (!handler) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Tool "${block.name}" ist nicht verfügbar.`,
              is_error: true,
            });
            toolCallsExecuted.push({
              name: block.name,
              input: block.input,
              output: null,
              durationMs: 0,
              error: "Tool nicht gefunden",
            });
            enqueue({ type: "tool_result", name: block.name, duration: 0, error: "Tool nicht gefunden" });
            continue;
          }

          try {
            const output = await handler(block.input as Record<string, unknown>, input.context);
            const durationMs = Date.now() - start;
            const serialized = serializeToolResult(output);
            const withSummary = maybeSummarize(serialized);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: withSummary,
            });
            toolCallsExecuted.push({ name: block.name, input: block.input, output, durationMs });
            enqueue({ type: "tool_result", name: block.name, duration: durationMs });
          } catch (err) {
            const durationMs = Date.now() - start;
            const message = err instanceof Error ? err.message : String(err);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Fehler: ${message}`,
              is_error: true,
            });
            toolCallsExecuted.push({
              name: block.name,
              input: block.input,
              output: null,
              durationMs,
              error: message,
            });
            enqueue({ type: "tool_result", name: block.name, duration: durationMs, error: message });
          }
        }

        history.push({ role: "user", content: toolResults });
      }

      const meta: StreamingTurnMeta = {
        history,
        toolCallsExecuted,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        modelUsed: model,
        escalated,
      };

      const memorySaved = toolCallsExecuted.some(
        (c) =>
          c.name === "save_memory" &&
          !c.error &&
          c.output &&
          typeof c.output === "object" &&
          (c.output as Record<string, unknown>).ok === true,
      );

      enqueue({
        type: "done",
        toolCallsExecuted: toolCallsExecuted.map((c) => ({
          name: c.name,
          durationMs: c.durationMs,
          error: c.error,
        })),
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        modelUsed: model,
        escalated,
        memorySaved,
        modelModeRequested: input.responseMeta?.modelModeRequested,
        modelModeEffective: input.responseMeta?.modelModeEffective,
        modelTierApplied: input.responseMeta?.modelTierApplied,
        modelModeNotice: input.responseMeta?.modelModeNotice,
      });

      controllerRef?.close();
      resolveMetaPromise!(meta);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Streaming-Fehler";
      try {
        enqueue({ type: "error", error: message });
        controllerRef?.close();
      } catch { /* already closed */ }
      rejectMetaPromise!(err instanceof Error ? err : new Error(message));
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      void run();
    },
    cancel() {
      controllerRef = null;
    },
  });

  return { stream, metaPromise };
}
