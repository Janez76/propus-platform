import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition, ToolHandler, ToolContext } from "./tools";
import { isWriteTool, toolRequiresConfirmation } from "./tools";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 12;
const MAX_TOOL_RESULT_CHARS = 12_000;
const TOOL_RESULT_SUMMARY_THRESHOLD = 2_000;

function runtimeEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

export type AssistantHistory = Anthropic.Messages.MessageParam[];

export type PendingConfirmation = {
  id: string;
  toolName: string;
  description: string;
  input: Record<string, unknown>;
};

export type AssistantTurnInput = {
  systemPrompt: string;
  history: AssistantHistory;
  userMessage: string;
  tools: ToolDefinition[];
  toolHandlers: Record<string, ToolHandler>;
  context: ToolContext;
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, output: unknown, durationMs: number) => void;
};

export type AssistantTurnResult = {
  finalText: string;
  history: AssistantHistory;
  toolCallsExecuted: Array<{
    name: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    error?: string;
  }>;
  pendingConfirmation?: PendingConfirmation;
  inputTokens: number;
  outputTokens: number;
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

export function maybeSummarize(result: string): string {
  if (result.length <= TOOL_RESULT_SUMMARY_THRESHOLD) return result;
  const lines = result.split("\n").length;
  const itemCount = (result.match(/\{/g) || []).length;
  const summary = itemCount > 1
    ? `[Zusammenfassung: ~${itemCount} Einträge gefunden, Details folgen]`
    : `[Zusammenfassung: ${lines} Zeilen Ergebnis, Details folgen]`;
  return `${summary}\n\n${result}`;
}

const WRITE_TOOL_LABELS: Record<string, string> = {
  create_posteingang_task: "Posteingang-Aufgabe erstellen",
  create_ticket: "Ticket erstellen",
  create_posteingang_note: "Interne Notiz erstellen",
  draft_email: "E-Mail-Entwurf vorbereiten",
  update_order_status: "Auftragsstatus ändern",
};

export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const apiKey = runtimeEnv("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt");

  const client = new Anthropic({ apiKey });
  const model = runtimeEnv("ANTHROPIC_MODEL") || DEFAULT_MODEL;
  const history: AssistantHistory = [...input.history, { role: "user", content: input.userMessage }];
  const toolCallsExecuted: AssistantTurnResult["toolCallsExecuted"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: input.systemPrompt,
      tools: input.tools as Anthropic.Messages.Tool[],
      messages: history,
    });

    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;
    history.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter((block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use");
    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      const finalText = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return { finalText, history, toolCallsExecuted, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
    }

    const writeBlock = toolUseBlocks.find((b) => isWriteTool(b.name) && toolRequiresConfirmation(b.name));

    if (writeBlock) {
      const finalText = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      return {
        finalText,
        history,
        toolCallsExecuted,
        pendingConfirmation: {
          id: writeBlock.id,
          toolName: writeBlock.name,
          description: WRITE_TOOL_LABELS[writeBlock.name] || writeBlock.name,
          input: writeBlock.input as Record<string, unknown>,
        },
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    }

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const handler = input.toolHandlers[block.name];
      input.onToolCall?.(block.name, block.input);
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
        continue;
      }

      try {
        const output = await handler(block.input as Record<string, unknown>, input.context);
        const durationMs = Date.now() - start;
        const serialized = serializeToolResult(output);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: maybeSummarize(serialized),
        });
        toolCallsExecuted.push({ name: block.name, input: block.input, output, durationMs });
        input.onToolResult?.(block.name, output, durationMs);
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
      }
    }

    history.push({ role: "user", content: toolResults });
  }

  return {
    finalText: "Ich habe das Tool-Limit erreicht. Bitte stelle die Anfrage enger oder konkreter.",
    history,
    toolCallsExecuted,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
