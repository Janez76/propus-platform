import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition, ToolHandler, ToolContext } from "./tools";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 8;
const MAX_TOOL_RESULT_CHARS = 12_000;

export type AssistantHistory = Anthropic.Messages.MessageParam[];

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
};

function serializeToolResult(output: unknown): string {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n… Ergebnis gekürzt (${text.length} Zeichen).`;
}

export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt");

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const history: AssistantHistory = [...input.history, { role: "user", content: input.userMessage }];
  const toolCallsExecuted: AssistantTurnResult["toolCallsExecuted"] = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: input.systemPrompt,
      tools: input.tools as Anthropic.Messages.Tool[],
      messages: history,
    });

    history.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter((block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use");
    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      const finalText = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return { finalText, history, toolCallsExecuted };
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
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: serializeToolResult(output),
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
  };
}
