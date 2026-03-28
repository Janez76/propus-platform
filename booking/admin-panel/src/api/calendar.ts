import { apiRequest } from "./client";
export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  status?: string;
  type?: string;
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
};
export async function getCalendarEvents(token: string): Promise<CalendarEvent[]> {
  const data = await apiRequest<unknown>("/api/admin/calendar-events", "GET", token);
  if (Array.isArray(data)) return data as CalendarEvent[];
  if (data && typeof data === "object" && Array.isArray((data as { events?: unknown[] }).events)) {
    return (data as { events: CalendarEvent[] }).events;
  }
  return [];
}
