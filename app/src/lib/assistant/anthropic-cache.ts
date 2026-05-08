import type Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition } from "./tools";
import { toAnthropicTools } from "./tools";

export type CachedRequestParts = {
  tools: Anthropic.Messages.Tool[];
  system: Anthropic.Messages.TextBlockParam[];
};

export function buildCachedRequestParts(
  tools: ToolDefinition[],
  systemPrompt: string,
): CachedRequestParts {
  const anthropicTools = toAnthropicTools(tools) as Anthropic.Messages.Tool[];
  if (anthropicTools.length > 0) {
    anthropicTools[anthropicTools.length - 1] = {
      ...anthropicTools[anthropicTools.length - 1],
      cache_control: { type: "ephemeral" },
    };
  }
  return {
    tools: anthropicTools,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
  };
}
