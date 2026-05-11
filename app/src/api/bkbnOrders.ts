import { apiRequest } from "./client";

/** Ein als BKBN-Auftrag erkannter Outlook-Termin aus einem der konfigurierten 365-Postfaecher. */
export type BkbnOrderEvent = {
  id: string;
  graphId?: string;
  graphIds?: string[];
  graphMailbox?: string;
  /** Postfach, in dem der Termin gefunden wurde (erster Treffer). */
  mailbox: string;
  /** Alle Postfaecher, in denen derselbe Termin (gleiche iCalUId) gefunden wurde. */
  mailboxes?: string[];
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  status?: string;
  type?: string;
  source?: string;
  address?: string;
  organizerEmail?: string;
  organizerName?: string;
  category?: string;
  bodyPreview?: string;
  webLink?: string;
  showAs?: string;
  color?: string;
};

export type BkbnOrdersMeta = {
  enabled: boolean;
  count: number;
  error: string | null;
};

export type BkbnOrdersResponse = {
  events: BkbnOrderEvent[];
  mailboxes: string[];
  matchDomains: string[];
  range: { from: string; to: string };
  meta: BkbnOrdersMeta;
};

export async function getBkbnOrders(
  token: string,
  opts?: { from?: string; to?: string },
): Promise<BkbnOrdersResponse> {
  const params = new URLSearchParams();
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  const qs = params.toString();
  const data = await apiRequest<unknown>(
    `/api/admin/bkbn-orders${qs ? `?${qs}` : ""}`,
    "GET",
    token,
  );
  const obj = (data && typeof data === "object" ? data : {}) as Partial<BkbnOrdersResponse>;
  return {
    events: Array.isArray(obj.events) ? (obj.events as BkbnOrderEvent[]) : [],
    mailboxes: Array.isArray(obj.mailboxes) ? obj.mailboxes : [],
    matchDomains: Array.isArray(obj.matchDomains) ? obj.matchDomains : [],
    range: obj.range && typeof obj.range === "object" ? obj.range : { from: "", to: "" },
    meta:
      obj.meta && typeof obj.meta === "object"
        ? obj.meta
        : { enabled: false, count: 0, error: null },
  };
}
