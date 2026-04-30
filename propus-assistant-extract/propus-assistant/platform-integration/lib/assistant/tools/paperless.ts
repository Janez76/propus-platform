/**
 * Paperless-ngx-Tools.
 * Suche und Abruf von Dokumenten aus Janez' Paperless-Instance.
 */

import type { ToolDefinition, ToolHandler } from './index';

async function paperless(path: string, init?: RequestInit) {
  const base = process.env.PAPERLESS_BASE_URL;
  const token = process.env.PAPERLESS_API_TOKEN;
  if (!base || !token) throw new Error('PAPERLESS_BASE_URL / PAPERLESS_API_TOKEN fehlen');
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Paperless ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export const paperlessTools: ToolDefinition[] = [
  {
    name: 'paperless_search',
    description:
      'Volltextsuche in Paperless-ngx. Findet Rechnungen, Verträge, Korrespondenz etc.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Default 10' },
      },
      required: ['query'],
    },
  },
  {
    name: 'paperless_get_document',
    description: 'Einzelnes Dokument abrufen (Metadata + Vorschau-Text).',
    input_schema: {
      type: 'object',
      properties: { document_id: { type: 'number' } },
      required: ['document_id'],
    },
  },
];

export const paperlessHandlers: Record<string, ToolHandler> = {
  paperless_search: async (input) => {
    const limit = (input.limit as number) ?? 10;
    const data = (await paperless(
      `/documents/?query=${encodeURIComponent(input.query as string)}&page_size=${limit}`,
    )) as {
      results: Array<{
        id: number;
        title: string;
        created: string;
        correspondent: number | null;
        document_type: number | null;
        tags: number[];
      }>;
      count: number;
    };
    return { count: data.count, results: data.results };
  },

  paperless_get_document: async (input) => {
    const data = await paperless(`/documents/${input.document_id}/`);
    return data;
  },
};
