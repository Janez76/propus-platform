/**
 * Calendar-Tools — Microsoft Graph (Outlook).
 * Nutzt die im Memory dokumentierten Credentials:
 *   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET
 */

import type { ToolDefinition, ToolHandler } from './index';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGraphToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET fehlen');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Graph-Token-Fehler ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function graphFetch(path: string, init?: RequestInit) {
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Graph ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export const calendarTools: ToolDefinition[] = [
  {
    name: 'get_upcoming_events',
    description: 'Holt die nächsten Outlook-Termine.',
    input_schema: {
      type: 'object',
      properties: {
        user_email: { type: 'string', description: 'Mailbox-Adresse, z.B. office@propus.ch' },
        hours_ahead: { type: 'number', description: 'Default 48' },
        limit: { type: 'number', description: 'Default 10' },
      },
      required: ['user_email'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Erstellt einen Outlook-Termin. SCHREIBENDE AKTION.',
    input_schema: {
      type: 'object',
      properties: {
        user_email: { type: 'string' },
        subject: { type: 'string' },
        start: { type: 'string', description: 'ISO 8601' },
        end: { type: 'string', description: 'ISO 8601' },
        location: { type: 'string' },
        body: { type: 'string' },
        attendees: { type: 'array', items: { type: 'string' } },
      },
      required: ['user_email', 'subject', 'start', 'end'],
    },
  },
];

export const calendarHandlers: Record<string, ToolHandler> = {
  get_upcoming_events: async (input) => {
    const hours = (input.hours_ahead as number) ?? 48;
    const limit = (input.limit as number) ?? 10;
    const start = new Date().toISOString();
    const end = new Date(Date.now() + hours * 3600_000).toISOString();
    const data = (await graphFetch(
      `/users/${encodeURIComponent(input.user_email as string)}/calendarView?startDateTime=${start}&endDateTime=${end}&$top=${limit}&$orderby=start/dateTime`,
    )) as { value: Array<{ subject: string; start: { dateTime: string }; end: { dateTime: string }; location: { displayName: string } }> };
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
      type: 'required',
    }));
    const body = {
      subject: input.subject,
      body: { contentType: 'text', content: (input.body as string) ?? '' },
      start: { dateTime: input.start, timeZone: 'Europe/Zurich' },
      end: { dateTime: input.end, timeZone: 'Europe/Zurich' },
      location: input.location ? { displayName: input.location } : undefined,
      attendees,
    };
    const data = await graphFetch(
      `/users/${encodeURIComponent(input.user_email as string)}/events`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return { ok: true, event: data };
  },
};
