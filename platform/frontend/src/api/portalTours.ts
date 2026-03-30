/**
 * API-Client für das Kunden-Portal (tour manager JSON-API).
 * Alle Requests laufen über Session-Cookies (kein Bearer-Token erforderlich).
 */

export type PortalTour = {
  id: number;
  status: string;
  object_label?: string;
  bezeichnung?: string;
  customer_email?: string;
  matterport_model_id?: string;
  term_end_date?: string;
  ablaufdatum?: string;
  created_at?: string;
  assigned_to?: string;
  archiv?: boolean;
  archiv_datum?: string;
};

export type PortalInvoice = {
  id: number;
  tour_id: number;
  invoice_status?: string;
  invoice_date?: string;
  betrag?: number;
  amount_chf?: number;
  object_label?: string;
  bezeichnung?: string;
  customer_email?: string;
};

export type PortalTeamMember = {
  id: number;
  member_email: string;
  display_name?: string;
  role: string;
  status: string;
  accepted_at?: string;
  created_at?: string;
};

export type PortalMe = {
  email: string;
  name: string;
  role: "tour_manager" | "customer_admin" | "customer_user";
  permissions: string[];
};

const BASE = "/portal/api";

async function portalFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const getPortalMe = () =>
  portalFetch<{ ok: true } & PortalMe>("/me");

export const getPortalTours = () =>
  portalFetch<{ ok: true; tours: PortalTour[] }>("/tours");

export const getPortalTour = (id: number) =>
  portalFetch<{ ok: true; tour: PortalTour; actions_log: unknown[] }>(`/tours/${id}`);

export const getPortalInvoices = () =>
  portalFetch<{ ok: true; invoices: PortalInvoice[] }>("/invoices");

export const getPortalTeam = () =>
  portalFetch<{ ok: true; team: PortalTeamMember[]; canManage: boolean }>("/team");

export const invitePortalTeamMember = (inviteEmail: string, role?: string) =>
  portalFetch<{ ok: true }>("/team/invite", {
    method: "POST",
    body: JSON.stringify({ inviteEmail, role }),
  });

export const removePortalTeamMember = (memberId: number) =>
  portalFetch<{ ok: true }>(`/team/${memberId}`, { method: "DELETE" });
