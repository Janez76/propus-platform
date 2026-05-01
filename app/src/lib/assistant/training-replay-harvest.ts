import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { EvalTestCase } from "../../../scripts/eval-assistant";
import { anonymizeReplayText } from "@/lib/assistant/replay-anonymize";
import {
  listAssistantHistory,
  listAssistantToolCallsForConversation,
  listConversationMessages,
} from "@/lib/assistant/store";

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "text" in content) {
    const t = (content as { text?: unknown }).text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

function toPriorMessages(
  rows: Awaited<ReturnType<typeof listConversationMessages>>,
  upToExclusiveId: string,
): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of rows) {
    if (m.id === upToExclusiveId) break;
    if (m.role === "user") {
      const t = anonymizeReplayText(extractUserText(m.content));
      if (t.trim()) out.push({ role: "user", content: t });
    } else if (m.role === "assistant") {
      const t = anonymizeReplayText(extractUserText(m.content));
      if (t.trim()) out.push({ role: "assistant", content: t });
    }
  }
  return out;
}

export type ReplayHarvestPayload = {
  version: 1;
  generatedAt: string;
  cases: EvalTestCase[];
};

export async function harvestReplayCases(input: { userId: string; limit?: number }): Promise<ReplayHarvestPayload> {
  const cap = Math.min(Math.max(Number(input.limit ?? 50), 1), 100);
  const convs = await listAssistantHistory({
    userId: input.userId,
    limit: cap,
    limitCap: 100,
    filter: "active",
  });

  const cases: EvalTestCase[] = [];

  for (const c of convs) {
    const msgs = await listConversationMessages({ conversationId: c.id, userId: input.userId });
    if (msgs.length === 0) continue;

    let lastUser: (typeof msgs)[0] | null = null;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === "user") {
        lastUser = msgs[i];
        break;
      }
    }
    if (!lastUser) continue;

    const userMessage = anonymizeReplayText(extractUserText(lastUser.content)).trim();
    if (!userMessage) continue;

    const priorMessages = toPriorMessages(msgs, lastUser.id);
    const observedTools = await listAssistantToolCallsForConversation({
      conversationId: c.id,
      userId: input.userId,
      afterCreatedAt: lastUser.createdAt,
    });

    cases.push({
      id: `replay-${c.id.slice(0, 8)}-${lastUser.id.slice(0, 8)}`,
      userMessage,
      priorMessages: priorMessages.length > 0 ? priorMessages : undefined,
      observedTools: observedTools.length > 0 ? observedTools : undefined,
    });
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    cases,
  };
}
