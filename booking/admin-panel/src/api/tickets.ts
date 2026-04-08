import { apiRequest } from "./client";

export type Ticket = {
  id: number;
  module: string;
  reference_id: string | null;
  reference_type: string | null;
  category: string;
  subject: string;
  description?: string;
  link_url?: string;
  attachment_path?: string;
  status: string;
  priority: string;
  created_by?: string;
  created_by_role?: string;
  assigned_to?: string;
  created_at: string;
  updated_at?: string;
  customer_id?: number;
};

export const getTickets = (token: string, params?: { status?: string; module?: string }) => {
  const query = new URLSearchParams();
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.module && params.module !== "all") query.set("module", params.module);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<{ ok: boolean; tickets: Ticket[] }>(`/api/tours/admin/tickets${qs}`, "GET", token);
};

export const patchTicket = (token: string, id: number, data: Partial<Ticket>) =>
  apiRequest<{ ok: boolean; ticket: Ticket }>(`/api/tours/admin/tickets/${id}`, "PATCH", token, data);

export const createTicket = (
  token: string,
  data: Pick<Ticket, "subject" | "category"> & Partial<Ticket>,
) =>
  apiRequest<{ ok: boolean; ticket: Ticket }>("/api/tours/admin/tickets", "POST", token, data);
