/**
 * POST /api/assistant
 *
 * Nimmt:
 *   - userMessage: string (Text aus Whisper oder direkt vom User)
 *   - conversationId?: string (vorhandene Konversation fortsetzen)
 *   - history?: Anthropic.MessageParam[] (Client-seitig gehaltener Verlauf)
 *
 * Liefert:
 *   - finalText: string (Antwort an den User)
 *   - history: vollständiger Verlauf inkl. Tool-Calls
 *   - toolCallsExecuted: Auflistung der Tools, die ausgeführt wurden
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAssistantTurn } from '@/lib/assistant/claude';
import { allTools, allHandlers } from '@/lib/assistant/tools';
import { buildSystemPrompt } from '@/lib/assistant/system-prompt';
import { writeAudit } from '@/lib/assistant/audit';

// TODO: deine Auth-Helper einsetzen — z.B. `getServerSession`, `auth()` etc.
async function getCurrentUser(req: NextRequest): Promise<{ id: string; email: string; name: string } | null> {
  // Fallback für Single-User-Setup (Janez):
  return {
    id: 'janez',
    email: 'janez@propus.ch',
    name: 'Janez',
  };
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  }

  let body: { userMessage?: string; history?: unknown[]; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 });
  }

  if (!body.userMessage || typeof body.userMessage !== 'string') {
    return NextResponse.json({ error: 'userMessage fehlt' }, { status: 400 });
  }

  const now = new Date();
  const systemPrompt = buildSystemPrompt({
    userName: user.name,
    userEmail: user.email,
    currentTime: now.toLocaleString('de-CH', { timeZone: 'Europe/Zurich' }),
    timezone: 'Europe/Zurich',
  });

  const ipAddress = req.headers.get('x-forwarded-for') ?? undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;

  try {
    const result = await runAssistantTurn({
      systemPrompt,
      history: (body.history as any[]) ?? [],
      userMessage: body.userMessage,
      tools: allTools,
      toolHandlers: allHandlers,
      context: {
        userId: user.id,
        userEmail: user.email,
        ipAddress,
        userAgent,
      },
      onToolCall: (name, input) => {
        console.log(`[ASSISTANT] Tool-Call: ${name}`, input);
      },
    });

    // Schreibende Tool-Calls auditieren
    for (const tc of result.toolCallsExecuted) {
      const isWrite = /^(create_|update_|delete_|send_|ha_call_service|mailerlite_add)/.test(tc.name);
      if (isWrite) {
        await writeAudit({
          userId: user.id,
          conversationId: body.conversationId,
          action: tc.name,
          payload: { input: tc.input, output: tc.output, error: tc.error },
          ipAddress,
          userAgent,
        });
      }
    }

    return NextResponse.json({
      finalText: result.finalText,
      history: result.history,
      toolCallsExecuted: result.toolCallsExecuted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    console.error('[ASSISTANT] Fehler:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
