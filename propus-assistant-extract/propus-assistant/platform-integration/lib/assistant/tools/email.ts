/**
 * Email-Tools — Microsoft Graph (Outlook).
 * Nutzt denselben Token-Cache wie calendar.ts.
 */

import type { ToolDefinition, ToolHandler } from './index';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function getToken(): Promise<string> {
  // Reuse — siehe calendar.ts. Hier nochmal eingebettet, damit Module unabhängig sind.
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error('MS Graph ENV fehlt');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  if (!res.ok) throw new Error(`Token-Fehler: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function graphFetch(path: string, init?: RequestInit) {
  const token = await getToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Graph ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 202 ? null : res.json();
}

export const emailTools: ToolDefinition[] = [
  {
    name: 'search_emails',
    description: 'Sucht Outlook-Mails nach Stichwort, Absender oder Betreff.',
    input_schema: {
      type: 'object',
      properties: {
        user_email: { type: 'string' },
        query: { type: 'string', description: 'Suchbegriff (KQL-kompatibel)' },
        limit: { type: 'number', description: 'Default 10' },
      },
      required: ['user_email', 'query'],
    },
  },
  {
    name: 'send_email_draft',
    description:
      'Erstellt einen E-Mail-Entwurf in Outlook (wird NICHT direkt versendet — User muss in Outlook bestätigen). SCHREIBENDE AKTION.',
    input_schema: {
      type: 'object',
      properties: {
        user_email: { type: 'string' },
        to: { type: 'array', items: { type: 'string' } },
        cc: { type: 'array', items: { type: 'string' } },
        subject: { type: 'string' },
        body_html: { type: 'string' },
      },
      required: ['user_email', 'to', 'subject', 'body_html'],
    },
  },
  {
    name: 'send_email_now',
    description:
      'Versendet eine E-Mail SOFORT. NUR bei expliziter Bestätigung des Users verwenden.',
    input_schema: {
      type: 'object',
      properties: {
        user_email: { type: 'string' },
        to: { type: 'array', items: { type: 'string' } },
        subject: { type: 'string' },
        body_html: { type: 'string' },
      },
      required: ['user_email', 'to', 'subject', 'body_html'],
    },
  },
];

export const emailHandlers: Record<string, ToolHandler> = {
  search_emails: async (input) => {
    const limit = (input.limit as number) ?? 10;
    const data = (await graphFetch(
      `/users/${encodeURIComponent(input.user_email as string)}/messages?$search="${encodeURIComponent(
        input.query as string,
      )}"&$top=${limit}&$select=subject,from,receivedDateTime,bodyPreview,webLink`,
    )) as { value: Array<{ subject: string; from: { emailAddress: { address: string; name: string } }; receivedDateTime: string; bodyPreview: string; webLink: string }> };
    return {
      count: data.value.length,
      messages: data.value.map((m) => ({
        subject: m.subject,
        from: m.from?.emailAddress?.address,
        from_name: m.from?.emailAddress?.name,
        received: m.receivedDateTime,
        preview: m.bodyPreview,
        link: m.webLink,
      })),
    };
  },

  send_email_draft: async (input) => {
    const message = {
      subject: input.subject,
      body: { contentType: 'HTML', content: input.body_html },
      toRecipients: (input.to as string[]).map((a) => ({ emailAddress: { address: a } })),
      ccRecipients: ((input.cc as string[]) ?? []).map((a) => ({ emailAddress: { address: a } })),
    };
    const data = await graphFetch(
      `/users/${encodeURIComponent(input.user_email as string)}/messages`,
      { method: 'POST', body: JSON.stringify(message) },
    );
    return { ok: true, draft: data, hint: 'Entwurf liegt in Outlook unter "Entwürfe".' };
  },

  send_email_now: async (input) => {
    await graphFetch(
      `/users/${encodeURIComponent(input.user_email as string)}/sendMail`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: 'HTML', content: input.body_html },
            toRecipients: (input.to as string[]).map((a) => ({
              emailAddress: { address: a },
            })),
          },
          saveToSentItems: true,
        }),
      },
    );
    return { ok: true, hint: 'E-Mail wurde versendet.' };
  },
};
