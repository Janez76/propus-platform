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

export async function portalLogin(email: string, password: string, rememberMe: boolean) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, rememberMe }),
  });
  const body = await res.json() as { ok: boolean; error?: string };
  if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export async function portalLogout() {
  await fetch(`${BASE}/logout`, { method: "POST", credentials: "same-origin" });
}

export async function portalForgotPassword(email: string) {
  return portalFetch<{ ok: true; message: string }>("/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function portalResetPassword(token: string, password: string) {
  return portalFetch<{ ok: true }>("/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function portalCheckResetToken(token: string) {
  return portalFetch<{ ok: true; valid: boolean; email: string | null }>(`/check-reset-token?token=${encodeURIComponent(token)}`);
}

export const getPortalMe = () =>
  portalFetch<{ ok: true } & PortalMe>("/me");

export async function getPortalProfile() {
  return portalFetch<{ ok: true; email: string; displayName: string; hasProfilePhoto?: boolean }>("/profile/me");
}

export async function updatePortalProfile(data: FormData) {
  const res = await fetch(`${BASE}/profile/me`, {
    method: "POST",
    credentials: "same-origin",
    body: data,
  });
  const body = await res.json() as { ok: boolean; error?: string };
  if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export async function changePortalPassword(currentPassword: string, newPassword: string) {
  return portalFetch<{ ok: true }>("/profile/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

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

export type PortalTourDetail = {
  ok: true;
  tour: PortalTour & {
    canonical_object_label?: string;
    canonical_matterport_space_id?: string;
    canonical_term_end_date?: string;
    tour_url?: string;
    matterport_start_sweep?: string;
    matterport_created_at?: string;
    customer_name?: string;
    customer_contact?: string;
  };
  invoices: {
    id: number;
    invoice_status?: string;
    invoice_date?: string;
    amount_chf?: number;
    betrag?: number;
    exxas_document_id?: string;
    invoice_number?: string;
    sent_at?: string;
    paid_at?: string;
    due_at?: string;
    created_at?: string;
    payrexx_payment_url?: string;
  }[];
  actions_log: Record<string, unknown>[];
  mpVisibility: string | null;
  pricing: {
    extensionPriceCHF: number;
    reactivationPriceCHF: number;
    isExtension: boolean;
    isReactivation: boolean;
    label: string;
  } | null;
  payrexxConfigured: boolean;
  assigneeBundle: {
    assigneeByTourId: Record<string, string>;
    canManageByTourId: Record<string, boolean>;
    candidatesByWorkspace: Record<string, { email: string; name: string }[]>;
  } | null;
  paymentSummary: {
    paidCount: number;
    openCount: number;
    paidAmount: number;
    openAmount: number;
    lastPayment: { label: string; at: string; amount: number | null } | null;
  } | null;
  paymentTimeline: {
    title: string;
    status: string;
    statusLabel: string;
    amount: number | null;
    primaryDate: string | null;
  }[];
  displayedTourStatus: {
    code: string;
    label: string;
    note: string | null;
  } | null;
};

export const getPortalTourDetail = (id: number) =>
  portalFetch<PortalTourDetail>(`/tours/${id}/detail`);

export const editPortalTour = (id: number, data: { object_label?: string; customer_contact?: string; customer_name?: string; start_sweep?: string }) =>
  portalFetch<{ ok: true; matterportNameOk?: boolean }>(`/tours/${id}/edit`, { method: "POST", body: JSON.stringify(data) });

export const extendPortalTour = (id: number, paymentMethod: "payrexx" | "qr_invoice") =>
  portalFetch<{ ok: true; redirectUrl?: string; successKey?: string }>(`/tours/${id}/extend`, { method: "POST", body: JSON.stringify({ paymentMethod }) });

export const changePortalTourVisibility = (id: number, visibility: string, password?: string) =>
  portalFetch<{ ok: true }>(`/tours/${id}/visibility`, { method: "POST", body: JSON.stringify({ visibility, password }) });

export const archivePortalTour = (id: number) =>
  portalFetch<{ ok: true }>(`/tours/${id}/archive`, { method: "POST" });

export const setPortalTourAssignee = (id: number, assigneeEmail: string) =>
  portalFetch<{ ok: true }>(`/tours/${id}/assignee`, { method: "POST", body: JSON.stringify({ assigneeEmail }) });

export const payPortalInvoice = (tourId: number, invoiceId: number) =>
  portalFetch<{ ok: true; paymentUrl: string }>(`/tours/${tourId}/pay/${invoiceId}`);

export type InvoicePrintData = {
  ok: true;
  invLabel: string;
  invoiceDate: string;
  statusLabel: string;
  status: string;
  paymentDueLabel: string;
  customerName: string;
  customerEmail: string;
  bezeichnung: string;
  amount: string;
  tourLabel: string;
  tourLink: string | null;
  tourAddress: string | null;
  billingPeriodLabel: string;
  creditor: { name: string; email: string; website: string };
  creditorLines: string[];
  creditorIbanFormatted: string;
  qrReferenceFormatted: string;
  tourId: number;
  invoiceId: number;
};

export const getInvoicePrintData = (tourId: number, invoiceId: number) =>
  portalFetch<InvoicePrintData>(`/tours/${tourId}/invoices/${invoiceId}/print-data`);
