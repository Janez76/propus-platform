/**
 * MailerLite-Tools.
 * API-Doku: https://developers.mailerlite.com
 */

import type { ToolDefinition, ToolHandler } from './index';

const ML_BASE = 'https://connect.mailerlite.com/api';

async function ml(path: string, init?: RequestInit) {
  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) throw new Error('MAILERLITE_API_KEY fehlt');
  const res = await fetch(`${ML_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`MailerLite ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export const mailerliteTools: ToolDefinition[] = [
  {
    name: 'mailerlite_subscriber_count',
    description: 'Gesamtanzahl aktiver Subscriber.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'mailerlite_add_subscriber',
    description: 'Fügt einen Subscriber hinzu. SCHREIBENDE AKTION.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        firma: { type: 'string' },
        rolle: { type: 'string' },
        kanton: { type: 'string' },
        groups: { type: 'array', items: { type: 'string' } },
      },
      required: ['email'],
    },
  },
  {
    name: 'mailerlite_recent_campaigns',
    description: 'Letzte Kampagnen mit Open-/Click-Rate.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Default 5' } },
    },
  },
];

export const mailerliteHandlers: Record<string, ToolHandler> = {
  mailerlite_subscriber_count: async () => {
    const data = (await ml('/subscribers?filter[status]=active&limit=1')) as {
      meta: { total: number };
    };
    return { active: data.meta?.total ?? 0 };
  },

  mailerlite_add_subscriber: async (input) => {
    const fields: Record<string, string> = {};
    if (input.firma) fields.Firma = input.firma as string;
    if (input.rolle) fields.Rolle = input.rolle as string;
    if (input.kanton) fields.Kanton = input.kanton as string;

    const data = await ml('/subscribers', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        fields,
        groups: input.groups ?? [],
        status: 'active',
      }),
    });
    return { ok: true, subscriber: data };
  },

  mailerlite_recent_campaigns: async (input) => {
    const limit = (input.limit as number) ?? 5;
    const data = (await ml(`/campaigns?filter[status]=sent&limit=${limit}`)) as {
      data: Array<{ id: string; name: string; subject: string; sent_at: string; stats: { opens_count: number; clicks_count: number; sent_count: number } }>;
    };
    return {
      count: data.data.length,
      campaigns: data.data.map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        sent_at: c.sent_at,
        sent: c.stats?.sent_count,
        opens: c.stats?.opens_count,
        clicks: c.stats?.clicks_count,
      })),
    };
  },
};
