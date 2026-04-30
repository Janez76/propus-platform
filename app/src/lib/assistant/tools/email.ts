import { query as defaultQuery, queryOne as defaultQueryOne } from "@/lib/db";
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
type QueryOneFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | null>;

type FetchFn = typeof globalThis.fetch;

type EmailDeps = {
  query: QueryFn;
  queryOne: QueryOneFn;
  fetch?: FetchFn;
  platformUrl?: string;
};

function runtimeEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

function boundedNumber(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function text(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function optionalPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) + "…" : value;
}

function isoDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function getPlatformUrl(deps: EmailDeps): string {
  return deps.platformUrl || runtimeEnv("PLATFORM_INTERNAL_URL") || "http://127.0.0.1:3100";
}

export const emailTools: ToolDefinition[] = [
  {
    name: "search_emails",
    description:
      "Sucht E-Mails im Postfach über die bestehende Admin-API. Zeigt Absender, Betreff, Datum und Body-Vorschau.",
    input_schema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Ordner: inbox (Default) oder sentitems" },
        since: { type: "string", description: "Nur E-Mails seit diesem Datum (ISO 8601, optional)" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 20, max. 20)" },
      },
    },
  },
  {
    name: "get_email_thread",
    description:
      "Gibt den vollständigen E-Mail-Thread einer Posteingang-Konversation zurück (conversation_id).",
    input_schema: {
      type: "object",
      properties: { conversation_id: { type: "number", description: "Posteingang-Konversations-ID" } },
      required: ["conversation_id"],
    },
  },
  {
    name: "send_email",
    description:
      "Sendet eine E-Mail über das Posteingang-System (Microsoft Graph). Erstellt ggf. eine neue Konversation.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Empfänger-E-Mail" },
        subject: { type: "string", description: "Betreff" },
        body_html: { type: "string", description: "E-Mail-Inhalt (HTML)" },
        cc: { type: "string", description: "CC-Empfänger (optional)" },
        reply_to_conversation_id: { type: "number", description: "Antwort auf bestehende Konversation (optional)" },
      },
      required: ["to", "subject", "body_html"],
    },
  },
  {
    name: "draft_email_reply",
    description:
      "Sendet eine Antwort in einem bestehenden E-Mail-Thread über das Posteingang-System.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        conversation_id: { type: "number", description: "Posteingang-Konversations-ID" },
        body_html: { type: "string", description: "Antwort-Inhalt (HTML)" },
      },
      required: ["conversation_id", "body_html"],
    },
  },
];

export function createEmailHandlers(deps: EmailDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;
  const doFetch = deps.fetch || globalThis.fetch;

  return {
    search_emails: async (input: Record<string, unknown>) => {
      const folder = text(input.folder) || "inbox";
      const since = text(input.since);
      const limit = boundedNumber(input.limit, 20, 20);

      const baseUrl = getPlatformUrl(deps);
      const params = new URLSearchParams({ top: String(limit) });
      if (folder !== "inbox") params.set("folder", folder);
      if (since) params.set("since", since);

      try {
        const res = await doFetch(`${baseUrl}/api/tours/admin/mail/inbox?${params.toString()}`, {
          headers: { "x-internal-call": "assistant" },
        });
        if (!res.ok) {
          return { error: `Mail-API Fehler: ${res.status} ${res.statusText}` };
        }
        const data = (await res.json()) as { emails?: Array<Record<string, unknown>> };
        const emails = Array.isArray(data.emails) ? data.emails : Array.isArray(data) ? data as Record<string, unknown>[] : [];

        return {
          count: emails.length,
          emails: emails.slice(0, limit).map((e) => ({
            from: e.from || e.sender || e.from_email,
            subject: e.subject,
            date: e.date || e.receivedDateTime || e.sent_at,
            bodyPreview: truncate(String(e.bodyPreview || e.body_preview || e.body_text || ""), 200),
            conversationId: e.conversationId || e.conversation_id || null,
          })),
        };
      } catch (err) {
        return { error: `Mail-API nicht erreichbar: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    get_email_thread: async (input: Record<string, unknown>) => {
      const convId = optionalPositiveInt(input.conversation_id);
      if (!convId) return { error: "Ungültige Konversations-ID" };

      const messages = await runQuery<{
        id: number;
        direction: string;
        from_name: string | null;
        from_email: string | null;
        to_recipients: string | null;
        subject: string | null;
        body_text: string | null;
        sent_at: string | Date | null;
      }>(
        `SELECT m.id, m.direction, m.from_name, m.from_email,
                m.to_recipients, m.subject,
                LEFT(m.body_text, 500) AS body_text, m.sent_at
         FROM tour_manager.posteingang_messages m
         WHERE m.conversation_id = $1
         ORDER BY m.sent_at ASC NULLS LAST, m.id ASC
         LIMIT 50`,
        [convId],
      );

      if (messages.length === 0) return { error: "Keine Nachrichten in dieser Konversation gefunden" };

      return {
        conversationId: convId,
        count: messages.length,
        messages: messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          from: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
          to: m.to_recipients,
          subject: m.subject,
          body: truncate(m.body_text, 500),
          sentAt: isoDateTime(m.sent_at),
        })),
      };
    },

    send_email: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const to = text(input.to);
      if (!to) return { error: "to ist erforderlich" };
      const subject = text(input.subject);
      if (!subject) return { error: "subject ist erforderlich" };
      const bodyHtml = text(input.body_html);
      if (!bodyHtml) return { error: "body_html ist erforderlich" };
      const cc = text(input.cc);
      const replyConvId = optionalPositiveInt(input.reply_to_conversation_id);

      const baseUrl = getPlatformUrl(deps);

      try {
        let conversationId = replyConvId;

        if (!conversationId) {
          const res = await doFetch(`${baseUrl}/api/tours/admin/posteingang/conversations`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-call": "assistant" },
            body: JSON.stringify({ subject, customer_email: to, source: "assistant" }),
          });
          if (!res.ok) return { error: `Konversation erstellen fehlgeschlagen: ${res.status}` };
          const conv = (await res.json()) as { id?: number; conversation?: { id?: number } };
          conversationId = conv.id ?? conv.conversation?.id ?? null;
          if (!conversationId) return { error: "Konversation konnte nicht erstellt werden" };
        }

        const res = await doFetch(
          `${baseUrl}/api/tours/admin/posteingang/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-call": "assistant" },
            body: JSON.stringify({
              direction: "outbound",
              to_email: to,
              cc_email: cc,
              subject,
              body_html: bodyHtml,
              sent_by: ctx.userEmail,
            }),
          },
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          return { error: `E-Mail senden fehlgeschlagen: ${res.status} ${errBody}`.slice(0, 300) };
        }

        return {
          ok: true,
          conversationId,
          message: `E-Mail an ${to} gesendet (Betreff: "${subject}").`,
        };
      } catch (err) {
        return { error: `E-Mail senden fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    draft_email_reply: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const convId = optionalPositiveInt(input.conversation_id);
      if (!convId) return { error: "conversation_id ist erforderlich" };
      const bodyHtml = text(input.body_html);
      if (!bodyHtml) return { error: "body_html ist erforderlich" };

      const baseUrl = getPlatformUrl(deps);

      try {
        const res = await doFetch(
          `${baseUrl}/api/tours/admin/posteingang/conversations/${convId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-call": "assistant" },
            body: JSON.stringify({
              direction: "outbound",
              body_html: bodyHtml,
              sent_by: ctx.userEmail,
            }),
          },
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          return { error: `Antwort senden fehlgeschlagen: ${res.status} ${errBody}`.slice(0, 300) };
        }

        return { ok: true, conversationId: convId, message: `Antwort in Konversation ${convId} gesendet.` };
      } catch (err) {
        return { error: `Antwort senden fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}

export const emailHandlers = createEmailHandlers({
  query: defaultQuery,
  queryOne: defaultQueryOne,
});
