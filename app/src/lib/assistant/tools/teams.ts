/**
 * Microsoft Teams Tools für den KI-Assistenten — Phase 1 (read-only).
 *
 * Auth: gleiche App-Registration wie Mail (M365_TENANT_ID/CLIENT_ID/CLIENT_SECRET,
 * Application Permissions). Schreibende Tools (send_*) folgen in Phase 2 mit
 * Delegated-Tokens (siehe app/src/lib/assistant/teams-delegated.ts).
 *
 * Read-Tools (alle Phase 1):
 *   - list_ms_teams              alle Teams im Tenant
 *   - list_team_channels         Channels eines Teams
 *   - list_team_members          Mitglieder eines Teams
 *   - find_user_in_teams         User per Name/E-Mail suchen
 *   - read_channel_messages      letzte Channel-Nachrichten (Protected API)
 *   - read_channel_message_replies   Antworten auf einen Channel-Post
 *   - list_user_chats            1:1 / Group-Chats eines Users (Protected API)
 *   - read_chat_messages         Nachrichten eines Chats (Protected API)
 */
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";
import { delegatedGraphRequest as defaultDelegatedRequest } from "@/lib/assistant/teams-delegated";

type FetchFn = typeof globalThis.fetch;

type DelegatedRequestFn = typeof defaultDelegatedRequest;

type TeamsDeps = {
  fetch?: FetchFn;
  platformUrl?: string;
  /** Optional: für Tests injizierbarer Delegated-Graph-Caller. */
  delegatedGraphRequest?: DelegatedRequestFn;
};

function runtimeEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

function getPlatformUrl(deps: TeamsDeps): string {
  return deps.platformUrl || runtimeEnv("PLATFORM_INTERNAL_URL") || "http://127.0.0.1:3100";
}

function text(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function boundedNumber(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

export const teamsTools: ToolDefinition[] = [
  {
    name: "list_ms_teams",
    description:
      "Listet alle Microsoft-Teams im Propus-Tenant (Team.ReadBasic.All). Liefert id, displayName, description, visibility, createdDateTime. Nutze als Discovery wenn der User nach einem Team sucht.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max. Anzahl (Default 50, max. 200)" } },
    },
  },
  {
    name: "list_team_channels",
    description:
      "Listet alle Channels eines Teams. team_id muss vorher via list_ms_teams ermittelt werden.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: { team_id: { type: "string", description: "Team-ID (Graph)" } },
      required: ["team_id"],
    },
  },
  {
    name: "list_team_members",
    description:
      "Listet die Mitglieder eines Teams (Name, E-Mail, Rollen). team_id aus list_ms_teams.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        team_id: { type: "string", description: "Team-ID (Graph)" },
        limit: { type: "number", description: "Max. Anzahl (Default 50, max. 200)" },
      },
      required: ["team_id"],
    },
  },
  {
    name: "find_user_in_teams",
    description:
      "Sucht User im Microsoft-Tenant per Name, E-Mail oder UPN (Substring-Match). Liefert id, displayName, mail, userPrincipalName, jobTitle, department. Nutze um Empfänger für Chats / Channel-Mentions zu finden.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Name, Mail oder Teil davon" } },
      required: ["query"],
    },
  },
  {
    name: "read_channel_messages",
    description:
      "Liest die letzten Nachrichten eines Channels (Protected API – Billing in Azure aktiviert). Liefert id, fromName, createdAt, bodyText, replyToId, mentions. Optional sinceDate filter.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        team_id: { type: "string", description: "Team-ID" },
        channel_id: { type: "string", description: "Channel-ID" },
        limit: { type: "number", description: "Max. Anzahl (Default 20, max. 50)" },
        since: { type: "string", description: "ISO-Datum YYYY-MM-DD oder ISO-Timestamp (optional)" },
      },
      required: ["team_id", "channel_id"],
    },
  },
  {
    name: "read_channel_message_replies",
    description:
      "Liest die Antworten (Thread) auf eine Channel-Nachricht.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        team_id: { type: "string" },
        channel_id: { type: "string" },
        message_id: { type: "string" },
      },
      required: ["team_id", "channel_id", "message_id"],
    },
  },
  {
    name: "list_user_chats",
    description:
      "Listet die 1:1- und Group-Chats eines Users (Protected API). Default: konfigurierter Mailbox-User (z.B. office@propus.ch). Liefert chatId, topic, chatType, members, lastMessagePreview.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        user: { type: "string", description: "User-UPN (z.B. js@propus.ch). Default: konfigurierter Mailbox-User." },
        limit: { type: "number", description: "Max. Anzahl (Default 20, max. 50)" },
      },
    },
  },
  {
    name: "read_chat_messages",
    description:
      "Liest die letzten Nachrichten eines Teams-Chats (Protected API). chat_id aus list_user_chats.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "Chat-ID (Graph)" },
        limit: { type: "number", description: "Max. Anzahl (Default 20, max. 50)" },
      },
      required: ["chat_id"],
    },
  },
  // Phase 2 (Delegated) — Stubs. Werden aktiv sobald Teams-OAuth konfiguriert ist.
  {
    name: "send_chat_message",
    description:
      "Sendet eine Nachricht in einem Teams-Chat. (Phase 2: Delegated OAuth nötig — Tool meldet sich, falls nicht eingerichtet.)",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "Chat-ID" },
        body_text: { type: "string", description: "Nachrichten-Inhalt (Plaintext, wird zu HTML escaped)" },
        body_html: { type: "string", description: "Alternativ: HTML-Inhalt" },
      },
      required: ["chat_id"],
    },
  },
  {
    name: "send_channel_message",
    description:
      "Postet eine Nachricht in einen Team-Channel. (Phase 2: Delegated OAuth nötig.)",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        team_id: { type: "string" },
        channel_id: { type: "string" },
        subject: { type: "string", description: "Optional: Betreff der Channel-Nachricht" },
        body_text: { type: "string" },
        body_html: { type: "string" },
      },
      required: ["team_id", "channel_id"],
    },
  },
  {
    name: "reply_channel_message",
    description:
      "Antwortet im Thread einer Channel-Nachricht. (Phase 2: Delegated OAuth nötig.)",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        team_id: { type: "string" },
        channel_id: { type: "string" },
        message_id: { type: "string", description: "ID des Eltern-Posts" },
        body_text: { type: "string" },
        body_html: { type: "string" },
      },
      required: ["team_id", "channel_id", "message_id"],
    },
  },
];

export function createTeamsHandlers(deps: TeamsDeps = {}): Record<string, ToolHandler> {
  const doFetch = deps.fetch || globalThis.fetch;
  const delegated = deps.delegatedGraphRequest || defaultDelegatedRequest;

  function buildBody(input: Record<string, unknown>) {
    const html = typeof input.body_html === "string" ? input.body_html.trim() : "";
    const txt = typeof input.body_text === "string" ? input.body_text.trim() : "";
    if (html) return { body: { contentType: "html" as const, content: html } };
    if (txt) {
      const escaped = txt
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return { body: { contentType: "html" as const, content: escaped.replace(/\n/g, "<br/>") } };
    }
    return null;
  }

  async function get(path: string, params: Record<string, string | number | undefined> = {}) {
    const baseUrl = getPlatformUrl(deps);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const url = `${baseUrl}/api/tours/admin${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
    try {
      const res = await doFetch(url, { headers: { "x-internal-call": "assistant" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: (body as { error?: string }).error || `HTTP ${res.status}` };
      }
      return body as Record<string, unknown>;
    } catch (err) {
      return { error: `Teams-API nicht erreichbar: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  function delegatedAuthNotConfigured(error: string) {
    return {
      error: `Delegated-OAuth nicht aktiv: ${error}. Admin → GET /api/teams-oauth/start aufrufen.`,
    };
  }

  return {
    list_ms_teams: async (input) => {
      const limit = boundedNumber(input.limit, 50, 200);
      const result = await get("/teams", { top: limit });
      return result;
    },

    list_team_channels: async (input) => {
      const teamId = text(input.team_id);
      if (!teamId) return { error: "team_id ist erforderlich" };
      return get(`/teams/${encodeURIComponent(teamId)}/channels`);
    },

    list_team_members: async (input) => {
      const teamId = text(input.team_id);
      if (!teamId) return { error: "team_id ist erforderlich" };
      const limit = boundedNumber(input.limit, 50, 200);
      return get(`/teams/${encodeURIComponent(teamId)}/members`, { top: limit });
    },

    find_user_in_teams: async (input) => {
      const q = text(input.query);
      if (!q) return { error: "query ist erforderlich" };
      return get("/teams/users/search", { q });
    },

    read_channel_messages: async (input) => {
      const teamId = text(input.team_id);
      const channelId = text(input.channel_id);
      if (!teamId || !channelId) return { error: "team_id und channel_id sind erforderlich" };
      const limit = boundedNumber(input.limit, 20, 50);
      const since = text(input.since);
      return get(
        `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
        { top: limit, since: since || undefined },
      );
    },

    read_channel_message_replies: async (input) => {
      const teamId = text(input.team_id);
      const channelId = text(input.channel_id);
      const messageId = text(input.message_id);
      if (!teamId || !channelId || !messageId) {
        return { error: "team_id, channel_id und message_id sind erforderlich" };
      }
      return get(
        `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`,
      );
    },

    list_user_chats: async (input) => {
      const user = text(input.user);
      const limit = boundedNumber(input.limit, 20, 50);
      return get("/teams/chats", { user: user || undefined, top: limit });
    },

    read_chat_messages: async (input) => {
      const chatId = text(input.chat_id);
      if (!chatId) return { error: "chat_id ist erforderlich" };
      const limit = boundedNumber(input.limit, 20, 50);
      return get(`/teams/chats/${encodeURIComponent(chatId)}/messages`, { top: limit });
    },

    send_chat_message: async (input: Record<string, unknown>, _ctx: ToolContext) => {
      const chatId = text(input.chat_id);
      if (!chatId) return { error: "chat_id ist erforderlich" };
      const bodyPart = buildBody(input);
      if (!bodyPart) return { error: "body_text oder body_html erforderlich" };
      const { data, error } = await delegated<{ id?: string; webUrl?: string }>(
        `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(chatId)}/messages`,
        { method: "POST", body: bodyPart },
      );
      if (error) return delegatedAuthNotConfigured(error);
      return { ok: true, messageId: data?.id ?? null, webUrl: data?.webUrl ?? null };
    },

    send_channel_message: async (input: Record<string, unknown>, _ctx: ToolContext) => {
      const teamId = text(input.team_id);
      const channelId = text(input.channel_id);
      if (!teamId || !channelId) return { error: "team_id und channel_id sind erforderlich" };
      const bodyPart = buildBody(input);
      if (!bodyPart) return { error: "body_text oder body_html erforderlich" };
      const subject = text(input.subject);
      const payload: Record<string, unknown> = { ...bodyPart };
      if (subject) payload.subject = subject;
      const { data, error } = await delegated<{ id?: string; webUrl?: string }>(
        `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
        { method: "POST", body: payload },
      );
      if (error) return delegatedAuthNotConfigured(error);
      return { ok: true, messageId: data?.id ?? null, webUrl: data?.webUrl ?? null };
    },

    reply_channel_message: async (input: Record<string, unknown>, _ctx: ToolContext) => {
      const teamId = text(input.team_id);
      const channelId = text(input.channel_id);
      const messageId = text(input.message_id);
      if (!teamId || !channelId || !messageId) {
        return { error: "team_id, channel_id und message_id sind erforderlich" };
      }
      const bodyPart = buildBody(input);
      if (!bodyPart) return { error: "body_text oder body_html erforderlich" };
      const { data, error } = await delegated<{ id?: string; webUrl?: string }>(
        `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`,
        { method: "POST", body: bodyPart },
      );
      if (error) return delegatedAuthNotConfigured(error);
      return { ok: true, replyId: data?.id ?? null, webUrl: data?.webUrl ?? null };
    },
  };
}

export const teamsHandlers = createTeamsHandlers();
