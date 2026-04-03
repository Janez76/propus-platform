/** Antwortformen von GET /api/tours/admin/* */

export type ToursAdminMatterportSpace = {
  id?: string;
  name?: string;
  state?: string;
  created?: string;
  [key: string]: unknown;
};

export type ToursAdminTourRow = Record<string, unknown> & {
  id: number;
  status?: string;
  displayed_status?: string;
  displayed_status_label?: string;
  displayed_status_note?: string | null;
  canonical_object_label?: string | null;
  canonical_customer_name?: string | null;
  canonical_term_end_date?: string | null;
  days_until_expiry?: number | null;
  customer_email?: string | null;
  invoice_status_label?: string;
  invoice_status_tone?: string;
  booking_order_no?: number | null;
};

export type ToursAdminDashboardResponse = {
  ok: true;
  openMatterportSpaces: ToursAdminMatterportSpace[];
  toursWithoutCustomer: ToursAdminTourRow[];
  recentTours: ToursAdminTourRow[];
  expiringSoonTours: ToursAdminTourRow[];
  widgets: Record<string, boolean>;
  matterportError?: string | null;
};

export type ToursAdminTourListResponse = {
  ok: true;
  tours: ToursAdminTourRow[];
  filters: Record<string, string | undefined>;
  sort: string;
  order: "asc" | "desc";
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
  stats: Record<string, number>;
  dashboardWidgets: Record<string, boolean>;
};

export type ToursAdminDisplayedStatus = {
  code: string;
  label: string;
  note?: string | null;
};

export type ToursAdminDeclineWorkflow = Record<string, unknown> & {
  hasMatterport?: boolean;
  hasContract?: boolean;
  hasCustomer?: boolean;
  preferredInvoiceDocumentId?: string | null;
  openInvoices?: unknown[];
};

export type ToursAdminTourDetailResponse = {
  ok: true;
  tour: ToursAdminTourRow;
  displayedTourStatus: ToursAdminDisplayedStatus;
  actionsLog: Record<string, unknown>[];
  renewalInvoices: Record<string, unknown>[];
  exxasInvoices: Record<string, unknown>[];
  paymentSummary: Record<string, unknown>;
  paymentTimeline: Record<string, unknown>[];
  suggestedManualDueAt?: string | null;
  outgoingEmails: Record<string, unknown>[];
  incomingEmails: Record<string, unknown>[];
  apiBase: string;
  mpVisibility: string | null;
  declineWorkflow: ToursAdminDeclineWorkflow;
  payrexxConfigured: boolean;
};
