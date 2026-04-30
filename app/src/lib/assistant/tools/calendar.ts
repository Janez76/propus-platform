/**
 * Calendar-Tools — Outlook via Microsoft Graph.
 */

import type { ToolDefinition, ToolHandler } from "./index";
import { graphFetch } from "../graph-client";

interface GraphEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string | null };
}

export const calendarTools: ToolDefinition[] = [
  {
    name: "get_upcoming_events",
    description: "Holt die nächsten Outlook-Termine einer Mailbox.",
    input_schema: {
      type: "object",
      properties: {
        user_email: { type: "string", description: "Mailbox-Adresse (z.B. office@propus.ch)" },
        hours_ahead: { type: "number", description: "Default 48" },
        limit: { type: "number", description: "Default 10" },
      },
      required: ["user_email"],
    },
  },
  {
    name: "create_calendar_event",
    description: "Erstellt einen Outlook-Termin. SCHREIBENDE AKTION.",
    input_schema: {
      type: "object",
      properties: {
        user_email: { type: "string" },
        subject: { type: "string" },
        start: { type: "string", description: "ISO 8601" },
        end: { type: "string", description: "ISO 8601" },
        location: { type: "string" },
        body: { type: "string" },
        attendees: { type: "array", items: { type: "string" } },
      },
      required: ["user_email", "subject", "start", "end"],
    },
  },
];

export const calendarHandlers: Record<string, ToolHandler> = {
  get_upcoming_events: async (input) => {
    const hours = Math.max(1, Math.min(720, Number(input.hours_ahead) || 48));
    const limit = Math.max(1, Math.min(50, Number(input.limit) || 10));
    const userEmail = encodeURIComponent(String(input.user_email));
    const start = new Date().toISOString();
    const end = new Date(Date.now() + hours * 3_600_000).toISOString();
    const data = (await graphFetch<{ value: GraphEvent[] }>(
      `/users/${userEmail}/calendarView?startDateTime=${start}&endDateTime=${end}&$top=${limit}&$orderby=start/dateTime`,
    )) ?? { value: [] };
    return {
      count: data.value.length,
      events: data.value.map((e) => ({
        subject: e.subject,
        start: e.start.dateTime,
        end: e.end.dateTime,
        location: e.location?.displayName ?? null,
      })),
    };
  },

  create_calendar_event: async (input) => {
    const attendees = ((input.attendees as string[]) ?? []).map((email) => ({
      emailAddress: { address: email },
      type: "required" as const,
    }));
    const body = {
      subject: input.subject,
      body: { contentType: "text", content: (input.body as string) ?? "" },
      start: { dateTime: input.start, timeZone: "Europe/Zurich" },
      end: { dateTime: input.end, timeZone: "Europe/Zurich" },
      location: input.location ? { displayName: input.location } : undefined,
      attendees,
    };
    const data = await graphFetch(
      `/users/${encodeURIComponent(String(input.user_email))}/events`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return { ok: true, event: data };
  },
};
