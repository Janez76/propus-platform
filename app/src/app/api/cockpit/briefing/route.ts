import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { z } from "zod";
import { MODEL_IDS } from "@/lib/assistant/model-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_ID = MODEL_IDS.sonnet;
const MAX_TOKENS = 700;
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min

const SYSTEM_PROMPT = `Du bist Propi, der Co-Pilot der Schweizer Foto-Tour-Agentur Propus.
Du bekommst tagesaktuelle Kennzahlen und formulierst daraus ein knappes operatives Tagesbriefing in deutscher Du-Form (Schweizer Hochdeutsch, kein "ß").

Dein Output ist STRIKT JSON, keine Markdown-Codefences, kein Prosa-Vorspann. Format:
{
  "summary": "Eine Headline in 1 Satz, max 12 Wörter.",
  "highlights": ["Bullet 1", "Bullet 2", "..."],
  "suggestions": [
    { "text": "Vorschlag in 1 Satz", "action": "navigate", "href": "/orders?overdue=1" }
  ]
}

Regeln:
- 2-4 Highlights, jeweils max 12 Wörter, faktisch aus den übergebenen Werten.
- 0-3 Suggestions. \`action\` ist entweder "navigate" (mit \`href\` aus der Liste unten) oder "noop" (rein informativ, kein href).
- Niemals Werte oder Personen erfinden. Wenn keine Probleme: positives Briefing, leere oder kurze suggestions.
- Wetter mit einbeziehen falls relevant für Outdoor-Shoots.

Erlaubte hrefs für action=navigate:
- /orders?overdue=1                     (überfällige Aufträge)
- /orders?withoutStaff=1                (Aufträge ohne Personal)
- /admin/finance/invoices/open          (offene Rechnungen)
- /admin/finance/reminders              (Mahnungen)
- /admin/posteingang                    (Posteingang)
- /admin/tickets                        (offene Tickets)
- /calendar                             (Kalender)
`;

const numberSchema = z.number().int().min(0).max(10_000);
const weatherDaySchema = z.object({
  kind: z.string().max(20),
  t_max: z.number().min(-50).max(60),
}).nullable().optional();

const payloadSchema = z.object({
  today: z.object({
    shoots: numberSchema,
    overdue: numberSchema,
    withoutStaff: numberSchema,
    invoicesOpen: numberSchema.optional(),
    capacity: z.number().int().min(0).max(200),
    kw: z.number().int().min(1).max(53),
  }),
  weather: z.object({
    today: weatherDaySchema,
    tomorrow: weatherDaySchema,
  }).optional(),
});

const ALLOWED_HREFS = new Set([
  "/orders?overdue=1",
  "/orders?withoutStaff=1",
  "/admin/finance/invoices/open",
  "/admin/finance/reminders",
  "/admin/posteingang",
  "/admin/tickets",
  "/calendar",
]);

const briefingSchema = z.object({
  summary: z.string().min(3).max(200),
  highlights: z.array(z.string().min(2).max(220)).min(0).max(6),
  suggestions: z.array(
    z.object({
      text: z.string().min(2).max(220),
      action: z.enum(["navigate", "noop"]),
      href: z.string().optional(),
    }).refine(
      (s) => s.action !== "navigate" || (s.href != null && ALLOWED_HREFS.has(s.href)),
      { message: "navigate-suggestion benötigt einen href aus der erlaubten Liste" },
    ),
  ).max(5),
});

type Briefing = z.infer<typeof briefingSchema>;
type Payload = z.infer<typeof payloadSchema>;

interface CacheEntry { data: Briefing; expiresAt: number }
const cache = new Map<string, CacheEntry>();

function cacheKey(p: Payload): string {
  return JSON.stringify(p);
}

function extractJson(text: string): unknown {
  // First try the whole string, then any { … } block.
  try { return JSON.parse(text); } catch { /* try block search */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Keine JSON-Struktur in der Modell-Antwort gefunden.");
  return JSON.parse(m[0]);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY ist nicht gesetzt." },
      { status: 500 },
    );
  }

  let payload: Payload;
  try {
    const json = await req.json();
    payload = payloadSchema.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ungültiger Request-Body.";
    return Response.json({ error: message }, { status: 400 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("refresh") === "1";
  const key = cacheKey(payload);
  if (!force) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return Response.json({ cached: true, ...hit.data });
    }
  }

  const client = new Anthropic({ apiKey });

  let briefing: Briefing;
  try {
    const resp = await client.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Aktuelle Kennzahlen (JSON):\n${JSON.stringify(payload, null, 2)}\n\nGib das Briefing als JSON zurück.`,
        },
      ],
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const raw = extractJson(text);
    briefing = briefingSchema.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Briefing fehlgeschlagen.";
    return Response.json({ error: message }, { status: 502 });
  }

  cache.set(key, { data: briefing, expiresAt: Date.now() + CACHE_TTL_MS });

  return Response.json({ cached: false, ...briefing });
}
