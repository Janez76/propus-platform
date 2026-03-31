/**
 * API-Client für das Kunden-Portal (tour manager JSON-API).
 * Alle Requests laufen über Session-Cookies (kein Bearer-Token erforderlich).
 *
 * Lesende Endpunkte: /portal/api/* (portal-api.js)
 * Mutierende Endpunkte: /tour-manager/portal/api/* (portal-api-mutations.js)
 */

export type PortalTour = {
  id: number;
  status: string;
  object_label?: string;
  bezeichnung?: string;
  canonical_object_label?: string | null;
  canonical_customer_name?: string | null;
  canonical_term_end_date?: string | null;
  canonical_matterport_space_id?: string | null;
  customer_email?: string;
  matterport_model_id?: string;
  matterport_space_id?: string;
  matterport_start_sweep?: string | null;
  term_end_date?: string;
  ablaufdatum?: string;
  created_at?: string;
  assigned_to?: string;
  archiv?: boolean;
  archiv_datum?: string;
  customer_name?: string;
  customer_contact?: string;
};

export type PortalInvoice = {
  id: number;
  tour_id: number;
  invoice_status?: string;
  invoice_kind?: string;
  invoice_date?: string;
  invoice_number?: string | null;
  betrag?: number;
  amount_chf?: number;
  object_label?: string;
  bezeichnung?: string;
  customer_email?: string;
  sent_at?: string | null;
  paid_at?: string | null;
  due_at?: string | null;
  payrexx_payment_url?: string | null;
  tourLabel?: string;
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

export type PortalPricing = {
  months: number;
  isReactivation: boolean;
  amountCHF: number;
  basePriceCHF: number;
  reactivationFeeCHF: number;
  actionLabel: string;
  invoiceKind: string;
};

const BASE = "/portal/api";
const MUTATIONS_BASE = "/tour-manager/portal/api";

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

async function portalMutationFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${MUTATIONS_BASE}${path}`, {
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

// ─── Lesende Endpunkte (/portal/api) ─────────────────────────────────────────

export const getPortalMe = () =>
  portalFetch<{ ok: true } & PortalMe>("/me");

export const getPortalTours = () =>
  portalFetch<{ ok: true; tours: PortalTour[] }>("/tours");

export const getPortalTour = (id: number) =>
  portalFetch<{
    ok: true;
    tour: PortalTour;
    actions_log: unknown[];
    invoices: PortalInvoice[];
    mpVisibility: string | null;
    pricing: PortalPricing;
    payrexxConfigured: boolean;
    assigneeBundle: unknown;
  }>(`/tours/${id}`);

export const getPortalInvoices = () =>
  portalFetch<{ ok: true; invoices: PortalInvoice[] }>("/invoices");

export const getPortalTeam = () =>
  portalFetch<{
    ok: true;
    team: PortalTeamMember[];
    canManage: boolean;
    teamAccessRows: unknown[];
    ownerEmail: string;
    billingDisplayName: string;
    isBillingOwner: boolean;
    exxasPeersCount: number;
  }>("/team");

export const getPortalTeamSuggestions = () =>
  portalFetch<{ ok: true; suggestions: { email: string; name: string }[] }>(
    "/team/suggestions"
  );

export const invitePortalTeamMember = (inviteEmail: string, role?: string) =>
  portalFetch<{ ok: true }>("/team/invite", {
    method: "POST",
    body: JSON.stringify({ inviteEmail, role }),
  });

export const removePortalTeamMember = (memberId: number) =>
  portalFetch<{ ok: true }>(`/team/${memberId}`, { method: "DELETE" });

// ─── Mutierende Endpunkte (/tour-manager/portal/api) ─────────────────────────

/** Profil-Update (Name, Foto-Upload). Nutzt FormData – kein JSON. */
export const updatePortalProfile = (data: {
  displayName?: string;
  photo?: File | null;
}) => {
  const form = new FormData();
  if (data.displayName != null) form.append("displayName", data.displayName);
  if (data.photo) form.append("photo", data.photo);
  return fetch(`${MUTATIONS_BASE}/profile/me`, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  }).then((r) => r.json()) as Promise<{ ok: true } | { error: string }>;
};

export const changePortalPassword = (data: {
  currentPassword: string;
  newPassword: string;
}) =>
  portalMutationFetch<{ ok: true }>("/profile/password", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const setPortalTourAssignee = (tourId: number, assigneeEmail: string | null) =>
  portalMutationFetch<{ ok: true }>(`/tours/${tourId}/assignee`, {
    method: "POST",
    body: JSON.stringify({ assigneeEmail }),
  });

export const editPortalTour = (
  tourId: number,
  data: {
    object_label?: string | null;
    customer_contact?: string | null;
    customer_name?: string | null;
    start_sweep?: string | null;
  }
) =>
  portalMutationFetch<{ ok: true; matterportNameOk?: boolean }>(
    `/tours/${tourId}/edit`,
    { method: "POST", body: JSON.stringify(data) }
  );

export const extendPortalTour = (
  tourId: number,
  paymentMethod: "payrexx" | "qr_invoice"
) =>
  portalMutationFetch<{
    ok: true;
    redirectUrl?: string;
    successKey?: string;
  }>(`/tours/${tourId}/extend`, {
    method: "POST",
    body: JSON.stringify({ paymentMethod }),
  });

/** Gibt die Payrexx-URL zurück, zu der redirected werden soll. */
export const getPortalTourPayUrl = (tourId: number, invoiceId: number) =>
  portalMutationFetch<{ ok: true; paymentUrl: string }>(
    `/tours/${tourId}/pay/${invoiceId}`,
    { method: "GET" }
  );

export const setPortalTourVisibility = (
  tourId: number,
  visibility: string,
  password?: string
) =>
  portalMutationFetch<{ ok: true }>(`/tours/${tourId}/visibility`, {
    method: "POST",
    body: JSON.stringify({ visibility, password }),
  });

export const archivePortalTour = (tourId: number) =>
  portalMutationFetch<{ ok: true }>(`/tours/${tourId}/archive`, {
    method: "POST",
  });

export const inviteExxasTeamMember = (data: {
  ownerWorkspaceEmail: string;
  email: string;
  displayName?: string;
  role?: string;
}) =>
  portalMutationFetch<{ ok: true; mailSent: boolean }>("/team/exxas/invite", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const removeExxasTeamMember = (data: {
  ownerWorkspaceEmail: string;
  email: string;
}) =>
  portalMutationFetch<{ ok: true }>("/team/exxas/remove", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const revokePortalTeamMember = (memberId: number) =>
  portalMutationFetch<{ ok: true }>(`/team/members/${memberId}/revoke`, {
    method: "POST",
  });

export const setPortalTeamMemberRole = (memberId: number, role: string) =>
  portalMutationFetch<{ ok: true }>(`/team/members/${memberId}/role`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
