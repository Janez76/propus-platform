import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { z } from "zod";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat/system-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_ID = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;
const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 4000;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_HISTORY),
});

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY ist nicht gesetzt." },
      { status: 500 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    body = bodySchema.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ungültiger Request-Body.";
    return Response.json({ error: message }, { status: 400 });
  }

  if (body.messages[body.messages.length - 1].role !== "user") {
    return Response.json(
      { error: "Letzte Nachricht muss von der Userin/dem User stammen." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: MODEL_ID,
          max_tokens: MAX_TOKENS,
          system: CHAT_SYSTEM_PROMPT,
          messages: body.messages,
        });

        anthropicStream.on("text", (text) => {
          controller.enqueue(encoder.encode(sse("delta", { text })));
        });

        await anthropicStream.finalMessage();
        controller.enqueue(encoder.encode(sse("done", {})));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
        controller.enqueue(encoder.encode(sse("error", { error: message })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
