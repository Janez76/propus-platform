/**
 * Email-Tools — Outlook via Microsoft Graph.
 */

import type { ToolDefinition, ToolHandler } from "./index";
import { graphFetch } from "../graph-client";

interface GraphMessage {
  subject: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime: string;
  bodyPreview: string;
  webLink: string;
}

export const emailTools: ToolDefinition[] = [
  {
    name: "search_emails",
    description: "Sucht Outlook-Mails nach Stichwort, Absender oder Betreff (KQL-Syntax).",
    input_schema: {
      type: "object",
      properties: {
        user_email: { type: "string" },
        query: { type: "string", description: "KQL-kompatibler Suchbegriff" },
        limit: { type: "number", description: "Default 10" },
      },
      required: ["user_email", "query"],
    },
  },
  {
    name: "send_email_draft",
    description:
      'Erstellt einen E-Mail-Entwurf in Outlook (wird NICHT versendet, User bestätigt in Outlook). SCHREIBENDE AKTION.',
    input_schema: {
      type: "object",
      properties: {
        user_email: { type: "string" },
        to: { type: "array", items: { type: "string" } },
        cc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        body_html: { type: "string" },
      },
      required: ["user_email", "to", "subject", "body_html"],
    },
  },
  {
    name: "send_email_now",
    description:
      "Versendet eine E-Mail SOFORT. Nur bei expliziter Bestätigung verwenden.",
    input_schema: {
      type: "object",
      properties: {
        user_email: { type: "string" },
        to: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        body_html: { type: "string" },
      },
      required: ["user_email", "to", "subject", "body_html"],
    },
  },
];

export const emailHandlers: Record<string, ToolHandler> = {
  search_emails: async (input) => {
    const limit = Math.max(1, Math.min(25, Number(input.limit) || 10));
    const userEmail = encodeURIComponent(String(input.user_email));
    const q = encodeURIComponent(String(input.query ?? ""));
    const data = (await graphFetch<{ value: GraphMessage[] }>(
      `/users/${userEmail}/messages?$search=%22${q}%22&$top=${limit}&$select=subject,from,receivedDateTime,bodyPreview,webLink`,
    )) ?? { value: [] };
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
      body: { contentType: "HTML", content: input.body_html },
      toRecipients: ((input.to as string[]) ?? []).map((a) => ({
        emailAddress: { address: a },
      })),
      ccRecipients: ((input.cc as string[]) ?? []).map((a) => ({
        emailAddress: { address: a },
      })),
    };
    const data = await graphFetch(
      `/users/${encodeURIComponent(String(input.user_email))}/messages`,
      { method: "POST", body: JSON.stringify(message) },
    );
    return { ok: true, draft: data, hint: 'Entwurf liegt in Outlook unter "Entwürfe".' };
  },

  send_email_now: async (input) => {
    await graphFetch(
      `/users/${encodeURIComponent(String(input.user_email))}/sendMail`,
      {
        method: "POST",
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: "HTML", content: input.body_html },
            toRecipients: ((input.to as string[]) ?? []).map((a) => ({
              emailAddress: { address: a },
            })),
          },
          saveToSentItems: true,
        }),
      },
    );
    return { ok: true, hint: "E-Mail wurde versendet." };
  },
};
