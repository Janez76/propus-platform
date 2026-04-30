import { createMemory } from "@/lib/assistant/memory-store";
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";

export const memoriesTools: ToolDefinition[] = [
  {
    name: "save_memory",
    description:
      'Speichert eine kurze Erinnerung für diesen Benutzer (auch unter „remember_fact“ gedacht). Nutze dieses Tool wenn der Benutzer ausdrücklich etwas festhalten möchte (z. B. „merk dir …“, „notiere …“, „speichere …“) oder wenn du eine verlässliche Präferenz/Fachinfo wiederkehrend brauchst. Keine Passwörter oder Secrets.',
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Kurzer Merksatz (max. 2000 Zeichen)" },
        expires_in_days: {
          type: "number",
          description: "Optional: Erinnerung nach N Tagen verfallen lassen",
        },
        conversation_id: {
          type: "string",
          description: "Optional: UUID der Assistant-Konversation",
        },
      },
      required: ["content"],
    },
  },
];

export function createMemoriesHandlers(): Record<string, ToolHandler> {
  return {
    save_memory: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const content = typeof input.content === "string" ? input.content.trim() : "";
      if (!content) return { error: "content ist leer" };

      let expiresAt: Date | undefined;
      const days = Number(input.expires_in_days);
      if (Number.isFinite(days) && days > 0 && days <= 3650) {
        expiresAt = new Date();
        expiresAt.setUTCDate(expiresAt.getUTCDate() + Math.trunc(days));
      }

      const convRaw = typeof input.conversation_id === "string" ? input.conversation_id.trim() : "";
      const convFromInput =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(convRaw)
          ? convRaw
          : undefined;
      const conversationId = convFromInput || ctx.conversationId;

      try {
        const row = await createMemory(ctx.userId, content, "explicit_user", conversationId, expiresAt);
        return {
          ok: true,
          id: row.id,
          message: "Erinnerung gespeichert.",
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  };
}

export const memoriesHandlers = createMemoriesHandlers();
