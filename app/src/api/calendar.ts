import { apiRequest } from "./client";
export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  status?: string;
  type?: string;
  source?: string;
  orderNo?: number | string;
  address?: string;
  customerName?: string;
  zipcity?: string;
  photographerKey?: string;
  photographerName?: string;
  photographerColor?: string;
  grund?: string;
  color?: string;
  allDay?: boolean;
  category?: string;
  bodyPreview?: string;
  webLink?: string;
  showAs?: string;
  /** BKBN-Auftrag (Backbone Photo): Postfach, in dem der Termin gefunden wurde. */
  mailbox?: string;
  mailboxes?: string[];
  organizerEmail?: string;
  organizerName?: string;
};

export type CalendarOutlookMeta = {
  enabled: boolean;
  user: string | null;
  count: number;
  error: string | null;
};

export type CalendarBkbnMeta = {
  enabled: boolean;
  mailboxes: string[];
  count: number;
  error: string | null;
};

export type CalendarEventsResponse = {
  events: CalendarEvent[];
  outlook?: CalendarOutlookMeta;
  bkbn?: CalendarBkbnMeta;
};

export type GetCalendarEventsOptions = {
  includeOutlook?: boolean;
  includeBkbn?: boolean;
  outlookFrom?: string;
  outlookTo?: string;
  outlookUser?: string;
};

function buildCalendarQuery(opts?: GetCalendarEventsOptions): string {
  if (!opts) return "";
  const params = new URLSearchParams();
  if (opts.includeOutlook === false) params.set("includeOutlook", "false");
  if (opts.includeBkbn === false) params.set("includeBkbn", "false");
  if (opts.outlookFrom) params.set("outlookFrom", opts.outlookFrom);
  if (opts.outlookTo) params.set("outlookTo", opts.outlookTo);
  if (opts.outlookUser) params.set("outlookUser", opts.outlookUser);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getCalendarEvents(
  token: string,
  opts?: GetCalendarEventsOptions,
): Promise<CalendarEvent[]> {
  const data = await apiRequest<unknown>(
    `/api/admin/calendar-events${buildCalendarQuery(opts)}`,
    "GET",
    token,
  );
  if (Array.isArray(data)) return data as CalendarEvent[];
  if (data && typeof data === "object" && Array.isArray((data as { events?: unknown[] }).events)) {
    return (data as { events: CalendarEvent[] }).events;
  }
  return [];
}

export async function getCalendarEventsWithMeta(
  token: string,
  opts?: GetCalendarEventsOptions,
): Promise<CalendarEventsResponse> {
  const data = await apiRequest<unknown>(
    `/api/admin/calendar-events${buildCalendarQuery(opts)}`,
    "GET",
    token,
  );
  if (Array.isArray(data)) return { events: data as CalendarEvent[] };
  if (data && typeof data === "object") {
    const obj = data as { events?: unknown[]; outlook?: CalendarOutlookMeta; bkbn?: CalendarBkbnMeta };
    const events = Array.isArray(obj.events) ? (obj.events as CalendarEvent[]) : [];
    return { events, outlook: obj.outlook, bkbn: obj.bkbn };
  }
  return { events: [] };
}
