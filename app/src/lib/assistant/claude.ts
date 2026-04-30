/**
 * Claude API Client — Tool-Use-Schleife mit Prompt-Caching.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition, ToolHandler, ToolContext } from "./tools";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 8;
const ANTHROPIC_TIMEOUT_MS = 60_000;

export interface AssistantTurnInput {
  systemPrompt: string;
  history: Anthropic.Messages.MessageParam[];
  userMessage: string;
  tools: ToolDefinition[];
  toolHandlers: Record<string, ToolHandler>;
  context: ToolContext;
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, output: unknown, durationMs: number) => void;
}

export interface AssistantTurnResult {
  finalText: string;
  history: Anthropic.Messages.MessageParam[];
  toolCallsExecuted: Array<{
    name: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    error?: string;
  }>;
}

export async function runAssistantTurn(
  input: AssistantTurnInput,
): Promise<AssistantTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt");

  const client = new Anthropic({ apiKey, timeout: ANTHROPIC_TIMEOUT_MS });

  // Cache-Markierung auf System-Prompt + letztem Tool. Reduziert Input-Token-
  // Kosten bei Folge-Turns drastisch (Tools + System bleiben gleich).
  const cachedSystem = [
    {
      type: "text" as const,
      text: input.systemPrompt,
      cache_control: { type: "ephemeral" as const },
    },
  ];
  const cachedTools = input.tools.map((t, i) =>
    i === input.tools.length - 1
      ? ({ ...t, cache_control: { type: "ephemeral" as const } } as Anthropic.Messages.Tool)
      : (t as Anthropic.Messages.Tool),
  );

  const history: Anthropic.Messages.MessageParam[] = [
    ...input.history,
    { role: "user", content: input.userMessage },
  ];

  const toolCallsExecuted: AssistantTurnResult["toolCallsExecuted"] = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: cachedSystem,
      tools: cachedTools,
      messages: history,
    });

    history.push({ role: "assistant", content: response.content });

    if (
      response.stop_reason === "end_turn" ||
      !response.content.some((b) => b.type === "tool_use")
    ) {
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { finalText: text, history, toolCallsExecuted };
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const handler = input.toolHandlers[block.name];
      input.onToolCall?.(block.name, block.input);
      const start = Date.now();

      if (!handler) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Fehler: Tool "${block.name}" ist nicht verfügbar.`,
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
          content: typeof output === "string" ? output : JSON.stringify(output),
        });
        toolCallsExecuted.push({
          name: block.name,
          input: block.input,
          output,
          durationMs,
        });
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
    finalText:
      "Ich habe das Tool-Limit erreicht, ohne zu einer endgültigen Antwort zu kommen. Bitte konkretisiere deine Anfrage.",
    history,
    toolCallsExecuted,
  };
}
