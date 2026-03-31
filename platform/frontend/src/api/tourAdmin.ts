/**
 * API-Client für das Tour-Manager-Admin-Panel.
 * Alle Requests laufen über Session-Cookie (same-origin, identisch zu portalTours.ts).
 * Basis: /tour-manager/admin/api  (wird in tours/routes/admin-api.js gemountet)
 */

import type {
  AdminTourListItem,
  Tour,
  RenewalInvoice,
  ExxasInvoice,
  ActionLogEntry,
  Customer,
  CustomerContact,
  PortalTeamMember,
  AdminUser,
  AdminInvite,
  DashboardWidgets,
  EmailTemplate,
  EmailTemplateKey,
  EmailTemplates,
  AiPromptSettings,
  MatterportCredentials,
  MatterportSpace,
  TourListFilters,
  PaginationMeta,
  TourStats,
} from '../types/tourManager';

const BASE = '/tour-manager/admin/api';

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface AdminDashboardData {
  openMatterportSpaces: MatterportSpace[];
  recentTours: AdminTourListItem[];
  expiringSoonTours: AdminTourListItem[];
}

export const getAdminDashboard = () =>
  adminFetch<AdminDashboardData>('/dashboard');

// ─── Touren-Liste ─────────────────────────────────────────────────────────────

export interface AdminToursListData {
  tours: AdminTourListItem[];
  filters: TourListFilters;
  sort: string;
  order: 'asc' | 'desc';
  pagination: PaginationMeta;
  stats: TourStats;
  dashboardWidgets: DashboardWidgets;
}

export const getAdminTours = (filters: TourListFilters = {}) => {
  const params = new URLSearchParams();
  const entries = Object.entries(filters).filter(([, v]) => v != null && v !== '');
  for (const [k, v] of entries) params.set(k, String(v));
  const qs = params.toString();
  return adminFetch<AdminToursListData>(`/tours${qs ? `?${qs}` : ''}`);
};

// ─── Tour-Suche ───────────────────────────────────────────────────────────────

export interface AdminSearchResult {
  type: 'tour' | 'invoice';
  id: number;
  title: string;
  sub?: string;
  status?: string;
  url: string;
}

export const searchAdmin = (q: string) =>
  adminFetch<AdminSearchResult[]>(`/search?q=${encodeURIComponent(q)}`);

// ─── Tour-Detail ──────────────────────────────────────────────────────────────

export interface AdminTourDetailData {
  tour: AdminTourListItem & {
    live_matterport_state?: string | null;
    mpVisibility?: string | null;
    incomingMails?: unknown[];
    outgoingMails?: unknown[];
    suggestionGroups?: unknown[];
    manualInvoices?: RenewalInvoice[];
    relatedInvoices?: ExxasInvoice[];
    matterport_panel?: unknown;
  };
  actions_log: ActionLogEntry[];
  renewalInvoices: RenewalInvoice[];
  exxasInvoices: ExxasInvoice[];
  pricing: {
    extensionPriceCHF: number;
    reactivationPriceCHF: number;
  };
  customer?: Customer | null;
  customerContacts?: CustomerContact[];
}

export const getAdminTourDetail = (id: number) =>
  adminFetch<AdminTourDetailData>(`/tours/${id}`);

// ─── Tour-Mutationen ──────────────────────────────────────────────────────────

export const setAdminTourUrl = (id: number, tourUrl: string | null) =>
  adminFetch<{ ok: true }>(`/tours/${id}/set-tour-url`, {
    method: 'POST',
    body: JSON.stringify({ tour_url: tourUrl }),
  });

export const setAdminTourName = (
  id: number,
  name: string,
  syncMatterport?: boolean,
) =>
  adminFetch<{ ok: true; nameSyncFailed?: boolean }>(`/tours/${id}/set-name`, {
    method: 'POST',
    body: JSON.stringify({ name, syncMatterport: syncMatterport ? '1' : undefined }),
  });

export const setAdminTourStartSweep = (id: number, startSweep: string | null) =>
  adminFetch<{ ok: true }>(`/tours/${id}/set-start-sweep`, {
    method: 'POST',
    body: JSON.stringify({ start_sweep: startSweep }),
  });

export const setAdminTourVerified = (id: number, verified: boolean) =>
  adminFetch<{ ok: true }>(`/tours/${id}/set-verified`, {
    method: 'POST',
    body: JSON.stringify({ verified: verified ? '1' : '0' }),
  });

export const setAdminTourVisibility = (
  id: number,
  visibility: string,
  password?: string,
) =>
  adminFetch<{ ok: true; error?: string }>(`/tours/${id}/visibility`, {
    method: 'POST',
    body: JSON.stringify({ visibility, password }),
  });

export const archiveMatterportTour = (id: number) =>
  adminFetch<{ ok: true }>(`/tours/${id}/archive-matterport`, {
    method: 'POST',
  });

export const exxasCancelSubscription = (id: number) =>
  adminFetch<{ ok: true }>(`/tours/${id}/exxas-cancel-subscription`, {
    method: 'POST',
  });

export const exxasDeactivateCustomer = (id: number) =>
  adminFetch<{ ok: true }>(`/tours/${id}/exxas-deactivate-customer`, {
    method: 'POST',
  });

export const exxasCancelInvoice = (id: number, invoiceId: string) =>
  adminFetch<{ ok: true }>(`/tours/${id}/exxas-cancel-invoice`, {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
  });

// ─── Rechnungen ───────────────────────────────────────────────────────────────

export interface AdminInvoicesListData {
  invoices: RenewalInvoice[];
  status?: string;
}

export const getAdminInvoices = (status?: string) =>
  adminFetch<AdminInvoicesListData>(`/invoices${status ? `?status=${status}` : ''}`);

export const createManualInvoice = (
  tourId: number,
  data: {
    amount_chf: number;
    invoice_kind?: string;
    note?: string;
    due_at?: string;
    mark_paid?: boolean;
    payment_method?: string;
  },
) =>
  adminFetch<{ ok: true; invoiceId: number }>(
    `/tours/${tourId}/invoices/create-manual`,
    { method: 'POST', body: JSON.stringify(data) },
  );

export const markInvoicePaidManual = (
  tourId: number,
  invoiceId: number,
  data: { payment_method?: string; payment_note?: string },
) =>
  adminFetch<{ ok: true }>(
    `/tours/${tourId}/invoices/${invoiceId}/mark-paid-manual`,
    { method: 'POST', body: JSON.stringify(data) },
  );

export const deleteInvoice = (invoiceId: number) =>
  adminFetch<{ ok: true }>(`/invoices/${invoiceId}/delete`, { method: 'POST' });

export const linkInvoice = (tourId: number, invoiceId: string) =>
  adminFetch<{ ok: true }>(`/tours/${tourId}/link-invoice`, {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
  });

// ─── Bankimport ───────────────────────────────────────────────────────────────

export interface BankImportData {
  runs: unknown[];
  pendingTransactions: unknown[];
}

export const getAdminBankImport = () =>
  adminFetch<BankImportData>('/bank-import');

export const uploadBankFile = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE}/bank-import/upload`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  }).then((r) => r.json()) as Promise<{ ok: true; runId: number } | { error: string }>;
};

export const confirmBankTransaction = (id: number) =>
  adminFetch<{ ok: true }>(`/bank-import/transactions/${id}/confirm`, {
    method: 'POST',
  });

export const ignoreBankTransaction = (id: number) =>
  adminFetch<{ ok: true }>(`/bank-import/transactions/${id}/ignore`, {
    method: 'POST',
  });

// ─── Matterport-Linking ───────────────────────────────────────────────────────

export interface MatterportLinkData {
  openSpaces: MatterportSpace[];
  linkedTours: AdminTourListItem[];
}

export const getMatterportLinkData = (openSpaceId?: string) =>
  adminFetch<MatterportLinkData>(
    `/link-matterport${openSpaceId ? `?openSpaceId=${encodeURIComponent(openSpaceId)}` : ''}`,
  );

export const linkMatterportSpace = (data: {
  spaceId: string;
  tourId?: number;
  createNew?: boolean;
  customerName?: string;
  objectLabel?: string;
}) =>
  adminFetch<{ ok: true; tourId: number }>('/link-matterport', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const autoLinkMatterport = () =>
  adminFetch<{ ok: true; linked: number }>('/link-matterport/auto', {
    method: 'POST',
  });

export const syncMatterportStatus = () =>
  adminFetch<{ ok: true }>('/link-matterport/sync-status', { method: 'POST' });

export const checkMatterportOwnership = () =>
  adminFetch<{ ok: true }>('/link-matterport/check-ownership', { method: 'POST' });

export const refreshMatterportCreated = () =>
  adminFetch<{ ok: true }>('/link-matterport/refresh-created', { method: 'POST' });

export const searchMatterportCustomer = (q: string) =>
  adminFetch<{ customers: Customer[] }>(
    `/link-matterport/customer-search?q=${encodeURIComponent(q)}`,
  );

// ─── Exxas-Linking ────────────────────────────────────────────────────────────

export const linkExxasCustomer = (tourId: number, exxasCustomerId: string) =>
  adminFetch<{ ok: true }>(`/tours/${tourId}/link-exxas-customer`, {
    method: 'POST',
    body: JSON.stringify({ exxasCustomerId }),
  });

// ─── Kundenverwaltung ─────────────────────────────────────────────────────────

export interface AdminCustomersData {
  customers: Customer[];
  pagination: PaginationMeta;
}

export const getAdminCustomers = (q?: string, page?: number) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page) params.set('page', String(page));
  const qs = params.toString();
  return adminFetch<AdminCustomersData>(`/customers${qs ? `?${qs}` : ''}`);
};

export const getAdminCustomer = (id: number) =>
  adminFetch<{ customer: Customer; contacts: CustomerContact[]; tours: AdminTourListItem[] }>(
    `/customers/${id}`,
  );

export const createCustomer = (data: Partial<Customer>) =>
  adminFetch<{ ok: true; customerId: number }>('/customers/new', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateCustomer = (id: number, data: Partial<Customer>) =>
  adminFetch<{ ok: true }>(`/customers/${id}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteCustomer = (id: number) =>
  adminFetch<{ ok: true }>(`/customers/${id}/delete`, { method: 'POST' });

export const addCustomerContact = (
  customerId: number,
  data: Partial<CustomerContact>,
) =>
  adminFetch<{ ok: true }>(`/customers/${customerId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteCustomerContact = (customerId: number, contactId: number) =>
  adminFetch<{ ok: true }>(
    `/customers/${customerId}/contacts/${contactId}/delete`,
    { method: 'POST' },
  );

export const setCustomerContactPortalRole = (
  customerId: number,
  contactId: number,
  portalRole: string,
) =>
  adminFetch<{ ok: true }>(
    `/customers/${customerId}/contacts/${contactId}/portal-role`,
    { method: 'POST', body: JSON.stringify({ portalRole }) },
  );

// ─── Portal-Rollen ────────────────────────────────────────────────────────────

export interface PortalRolesData {
  staffRows: PortalTeamMember[];
  externRows: unknown[];
  tab: 'intern' | 'extern';
}

export const getPortalRoles = (tab?: 'intern' | 'extern') =>
  adminFetch<PortalRolesData>(`/portal-roles${tab ? `?tab=${tab}` : ''}`);

export const addPortalRole = (data: { email: string; role: string }) =>
  adminFetch<{ ok: true }>('/portal-roles/add', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const removePortalRole = (data: { email: string }) =>
  adminFetch<{ ok: true }>('/portal-roles/remove', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const setExternPortalRole = (data: {
  ownerEmail: string;
  memberEmail: string;
  role: string;
}) =>
  adminFetch<{ ok: true }>('/portal-roles/extern-set', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const removeExternPortalRole = (data: {
  ownerEmail: string;
  memberEmail: string;
}) =>
  adminFetch<{ ok: true }>('/portal-roles/extern-remove', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ─── Admin-Team ───────────────────────────────────────────────────────────────

export interface AdminTeamData {
  users: AdminUser[];
  pendingInvites: AdminInvite[];
}

export const getAdminTeam = () => adminFetch<AdminTeamData>('/team');

export const inviteAdminUser = (email: string) =>
  adminFetch<{ ok: true }>('/team/invite', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const toggleAdminUserActive = (email: string) =>
  adminFetch<{ ok: true }>(`/team/${encodeURIComponent(email)}/toggle`, {
    method: 'POST',
  });

export const revokeAdminInvite = (id: number) =>
  adminFetch<{ ok: true }>(`/team/invites/${id}/revoke`, { method: 'POST' });

export const updateAdminUser = (id: number, data: Partial<AdminUser>) =>
  adminFetch<{ ok: true }>(`/team/users/${id}/update`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteAdminUser = (id: number) =>
  adminFetch<{ ok: true }>(`/team/users/${id}/delete`, { method: 'POST' });

// ─── Einstellungen ────────────────────────────────────────────────────────────

export interface AdminSettingsData {
  widgets: DashboardWidgets;
  aiPromptSettings: AiPromptSettings;
  matterportStored: MatterportCredentials;
  exxasBase: string;
  actionDefinitions: unknown[];
  riskDefinitions: unknown[];
}

export const getAdminSettings = () =>
  adminFetch<AdminSettingsData>('/settings');

export const saveAdminSettings = (data: {
  widgets: DashboardWidgets;
  aiPromptSettings: AiPromptSettings;
  matterport?: {
    clearStored?: boolean;
    tokenId?: string;
    tokenSecret?: string;
  };
}) =>
  adminFetch<{ ok: true }>('/settings', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ─── E-Mail-Templates ─────────────────────────────────────────────────────────

export interface EmailTemplatesData {
  templates: EmailTemplates;
  defaultTemplates: EmailTemplates;
  placeholderHints: Partial<Record<EmailTemplateKey, string[]>>;
}

export const getEmailTemplates = () =>
  adminFetch<EmailTemplatesData>('/email-templates');

export const saveEmailTemplates = (templates: EmailTemplates) =>
  adminFetch<{ ok: true }>('/email-templates', {
    method: 'POST',
    body: JSON.stringify({ templates }),
  });

// ─── Automatisierungen ────────────────────────────────────────────────────────

export const getAutomations = () =>
  adminFetch<{ automations: unknown }>('/automations');

export const saveAutomations = (data: unknown) =>
  adminFetch<{ ok: true }>('/automations', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ─── KI-Assistenz ────────────────────────────────────────────────────────────

export const chatWithAiAssistant = (data: {
  message: string;
  history?: unknown[];
  model?: string;
}) =>
  adminFetch<{
    ok: true;
    reply: string;
    pendingAction?: unknown;
    sessionId?: string;
  }>('/chat-assistant', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const confirmAiAction = (sessionId: string) =>
  adminFetch<{ ok: true; result: string }>('/chat-assistant/confirm', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });

export const cancelAiAction = (sessionId: string) =>
  adminFetch<{ ok: true }>('/chat-assistant/cancel', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });

// ─── Profil ───────────────────────────────────────────────────────────────────

export const updateAdminProfile = (data: {
  displayName?: string;
  photo?: File | null;
}) => {
  const form = new FormData();
  if (data.displayName != null) form.append('displayName', data.displayName);
  if (data.photo) form.append('photo', data.photo);
  return fetch(`${BASE}/profile/me`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  }).then((r) => r.json()) as Promise<{ ok: true } | { error: string }>;
};

export const changeAdminPassword = (data: {
  currentPassword: string;
  newPassword: string;
}) =>
  adminFetch<{ ok: true }>('/profile/password', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const changeAdminEmail = (data: {
  newEmail: string;
  password: string;
}) =>
  adminFetch<{ ok: true }>('/profile/email', {
    method: 'POST',
    body: JSON.stringify(data),
  });
