/**
 * Tour-Manager Admin JSON-API (Session-Cookie, gleiche Origin).
 */
import type {
  ToursAdminDashboardResponse,
  ToursAdminTourDetailResponse,
  ToursAdminTourListResponse,
} from "../types/toursAdmin";

const BASE = "/api/tours/admin";

async function toursAdminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function getToursAdminDashboard() {
  return toursAdminFetch<ToursAdminDashboardResponse>("/dashboard");
}

export function getToursAdminToursList(queryString: string) {
  const q = queryString.startsWith("?") ? queryString : queryString ? `?${queryString}` : "";
  return toursAdminFetch<ToursAdminTourListResponse>(`/tours${q}`);
}

export function getToursAdminDashboardWidgets() {
  return toursAdminFetch<{ ok: true; widgets: Record<string, boolean> }>("/dashboard/widgets");
}

export function putToursAdminDashboardWidgets(widgets: Record<string, boolean>) {
  return toursAdminFetch<{ ok: true; widgets: Record<string, boolean> }>("/dashboard/widgets", {
    method: "PUT",
    body: JSON.stringify(widgets),
  });
}

export function getToursAdminTourDetail(tourId: string | number) {
  return toursAdminFetch<ToursAdminTourDetailResponse>(`/tours/${tourId}`);
}

/** POST mit JSON-Body; Fehler als Error mit Server-Message. */
export async function toursAdminPost(path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data;
}

export type TourCustomerOrder = {
  orderNo: number | string;
  status?: string;
  address?: string;
  appointmentDate?: string;
};

export function getToursAdminTourCustomerOrders(tourId: string | number) {
  return toursAdminFetch<{ ok: true; orders: TourCustomerOrder[]; needsCustomer: boolean }>(
    `/tours/${tourId}/customer-orders`
  );
}

export function postToursAdminTourSetBookingOrder(tourId: string | number, orderNo: number) {
  return toursAdminPost(`/tours/${tourId}/set-booking-order`, { orderNo });
}

export function getToursAdminRenewalInvoices(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return toursAdminFetch<Record<string, unknown>>(`/invoices${qs}`);
}

export function getAdminInvoicesCentral(type: "renewal" | "exxas", status?: string, search?: string) {
  const p = new URLSearchParams({ type });
  if (status) p.set("status", status);
  if (search) p.set("search", search);
  return toursAdminFetch<{
    ok: true;
    invoices: Record<string, unknown>[];
    stats: Record<string, number>;
    source: string;
  }>(`/invoices-central?${p.toString()}`);
}

export function syncAllExxasInvoices() {
  return toursAdminFetch<{
    ok: true;
    imported: number;
    updated: number;
    total: number;
  }>("/invoices/exxas/sync-all", { method: "POST" });
}

export function importExxasAdminInvoice(invoiceId: string | number) {
  return toursAdminFetch<{
    ok: true;
    created: boolean;
    invoiceId: number | string;
    tourId: number | null;
  }>(`/invoices/exxas/${invoiceId}/import`, {
    method: "POST",
  });
}

export function deleteAdminInvoice(type: "renewal" | "exxas", invoiceId: string | number) {
  return toursAdminFetch<{ ok: true }>(`/invoices/${type}/${invoiceId}`, {
    method: "DELETE",
  });
}

export type BulkDeleteHostingPreview = {
  ok: true;
  dryRun: true;
  count: number;
  invoices: Array<{ id: number; nummer: string; bezeichnung: string; kunde_name: string; preis_brutto: number | null }>;
};

export type BulkDeleteHostingResult = {
  ok: boolean;
  deleted: number;
  total: number;
  errors: Array<{ id: number; nummer: string; error: string }>;
  deletedInvoices: Array<{ id: number; nummer: string; bezeichnung: string; kunde_name: string }>;
};

export type BulkStornoHostingPreview = {
  ok: true;
  dryRun: true;
  count: number;
  invoices: Array<{ exxas_document_id: string | null; nummer: string | null; bezeichnung: string | null; kunde_name: string | null; exxas_status: string | null; preis_brutto: number | null }>;
};

export type BulkStornoHostingResult = {
  ok: boolean;
  storniert: number;
  total: number;
  errors: Array<{ nummer: string | null; error: string }>;
  storniertInvoices: Array<{ nummer: string | null; bezeichnung: string | null; kunde_name: string | null }>;
};

export function getHostingMatterportStornoPreview() {
  return toursAdminFetch<BulkStornoHostingPreview>("/invoices/exxas/bulk-storno-hosting/preview");
}

export function bulkStornoHostingMatterportInExxas() {
  return toursAdminFetch<BulkStornoHostingResult>("/invoices/exxas/bulk-storno-hosting", {
    method: "POST",
  });
}

export function getHostingMatterportDeletePreview() {
  return toursAdminFetch<BulkDeleteHostingPreview>("/invoices/exxas/bulk-delete-hosting/preview");
}

export function bulkDeleteHostingMatterportInvoices() {
  return toursAdminFetch<BulkDeleteHostingResult>("/invoices/exxas/bulk-delete-hosting", {
    method: "DELETE",
  });
}

export type BulkDeleteRenewal63Preview = {
  ok: true;
  dryRun: true;
  count: number;
  invoices: Array<{
    id: number;
    invoice_number: string | null;
    invoice_status: string;
    amount_chf: number;
    customer_name: string | null;
    tour_object_label: string | null;
  }>;
};

export type BulkDeleteRenewal63Result = {
  ok: boolean;
  deleted: number;
  total: number;
  errors: Array<{ id: number; invoice_number: string | null; error: string }>;
  deletedInvoices: Array<{
    id: number;
    invoice_number: string | null;
    invoice_status: string;
    amount_chf: number;
    customer_name: string | null;
    tour_object_label: string | null;
  }>;
};

export function getRenewal63DeletePreview() {
  return toursAdminFetch<BulkDeleteRenewal63Preview>("/invoices/renewal/bulk-delete-63/preview");
}

export function bulkDeleteRenewal63Invoices() {
  return toursAdminFetch<BulkDeleteRenewal63Result>("/invoices/renewal/bulk-delete-63", {
    method: "DELETE",
  });
}

export function archiveAdminInvoice(type: "renewal" | "exxas", invoiceId: string | number) {
  return toursAdminFetch<{ ok: true }>(`/invoices/${type}/${invoiceId}/archive`, {
    method: "PATCH",
  });
}

export function updateAdminInvoice(
  type: "renewal" | "exxas",
  invoiceId: string | number,
  body: Record<string, unknown>,
) {
  return toursAdminFetch<{ ok: true; invoice: Record<string, unknown> }>(`/invoices/${type}/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function resendAdminInvoice(type: "renewal" | "exxas", invoiceId: string | number) {
  return toursAdminFetch<{ ok: true }>(`/invoices/${type}/${invoiceId}/resend`, {
    method: "POST",
  });
}

export type RenewalRunTour = {
  id: number;
  object_label: string;
  customer_name: string;
  customer_email: string;
  tour_age_date: string;
  is_reactivation: boolean;
  amount_chf: number;
  canonical_term_end_date: string | null;
  term_end_date: string | null;
};

export type RenewalRunResult = {
  ok: true;
  created: number;
  skipped: number;
  errors: number;
  details: {
    created: { tourId: number; invoiceId: number; emailSent: boolean }[];
    skipped: { tourId: number; reason: string }[];
    errors: { tourId: number; invoiceId?: number; reason: string }[];
  };
};

export function previewRenewalInvoiceRun() {
  return toursAdminFetch<{ ok: true; tours: RenewalRunTour[]; count: number }>("/renewal-invoice-run", {
    method: "POST",
    body: JSON.stringify({ action: "preview" }),
  });
}

export function executeRenewalInvoiceRun(tourIds: number[]) {
  return toursAdminFetch<RenewalRunResult>("/renewal-invoice-run", {
    method: "POST",
    body: JSON.stringify({ action: "execute", tourIds }),
  });
}

export function getToursAdminBankImport() {
  return toursAdminFetch<Record<string, unknown>>("/bank-import");
}

export function getBankImportInvoiceSearch(q: string, amount?: string | number | null) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (amount != null && String(amount).trim() !== "") p.set("amount", String(amount));
  return toursAdminFetch<{
    ok: true;
    invoices: Record<string, unknown>[];
  }>(`/bank-import/invoice-search?${p.toString()}`);
}

export type OrderSearchInvoice = {
  invoice_source: "renewal";
  id: string | number;
  invoice_number?: string | null;
  invoice_status?: string | null;
  amount_chf?: number | string | null;
  due_at?: string | null;
  paid_at_date?: string | null;
  invoice_kind?: string | null;
  tour_id?: number | null;
  tour_object_label?: string | null;
  canConfirmDirectly: boolean;
  requiresImport: boolean;
};

export type OrderSearchResult = {
  order_no: number;
  customer_name: string;
  customer_email?: string | null;
  invoices: OrderSearchInvoice[];
};

export function getBankImportOrderSearch(q: string) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  return toursAdminFetch<{ ok: true; orders: OrderSearchResult[] }>(
    `/bank-import/order-search?${p.toString()}`
  );
}

export type OrderInvoiceRow = {
  id: number;
  invoice_number?: string | null;
  invoice_status: string;
  invoice_kind?: string | null;
  amount_chf?: number | string | null;
  due_at?: string | null;
  paid_at_date?: string | null;
  payment_channel?: string | null;
  skonto_chf?: number | string | null;
  writeoff?: boolean;
  tour_id: number;
  tour_label?: string | null;
};

export function getInvoicesByOrderNo(orderNo: string | number) {
  return toursAdminFetch<{ ok: true; invoices: OrderInvoiceRow[] }>(
    `/tours/invoices-by-order/${orderNo}`
  );
}

export type BankImportPreviewTx = {
  amount_chf: number | null;
  currency: string;
  booking_date: string | null;
  value_date: string | null;
  reference_raw: string | null;
  reference_structured: string | null;
  reference_unstructured: string | null;
  debtor_name: string | null;
  debtor_iban: string | null;
  creditor_name: string | null;
  creditor_iban: string | null;
  purpose: string | null;
  additional_info: string | null;
  match_status: "exact" | "review" | "none";
  confidence: number;
  match_reason: string | null;
  matched_invoice_id: string | number | null;
  matched_invoice_source: "renewal" | "exxas" | null;
  matched_invoice_number: string | null;
  matched_invoice_amount: number | null;
  matched_tour_id: number | null;
  matched_tour_label: string | null;
  matched_customer_name: string | null;
  requires_import: boolean;
};

export type BankImportPreviewResult = {
  ok: true;
  sourceFormat: string;
  fileName: string | null;
  totalRows: number;
  exactCount: number;
  reviewCount: number;
  noneCount: number;
  transactions: BankImportPreviewTx[];
};

export async function previewToursAdminBankFile(file: File): Promise<BankImportPreviewResult> {
  const fd = new FormData();
  fd.append("bankFile", file);
  const res = await fetch(`${BASE}/bank-import/preview`, { method: "POST", credentials: "include", body: fd });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<BankImportPreviewResult>;
  if (!res.ok || !data.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as BankImportPreviewResult;
}

export async function uploadToursAdminBankFile(file: File) {
  const fd = new FormData();
  fd.append("bankFile", file);
  const res = await fetch(`${BASE}/bank-import/upload`, { method: "POST", credentials: "include", body: fd });
  const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function confirmBankImportTransaction(
  txId: number,
  body: { invoiceId: string; invoiceSource: "renewal" | "exxas" },
) {
  return toursAdminPost(`/bank-import/transactions/${txId}/confirm`, body as Record<string, unknown>);
}

export function ignoreBankImportTransaction(txId: number) {
  return toursAdminPost(`/bank-import/transactions/${txId}/ignore`, {});
}

export function createTourManualInvoice(
  tourId: string | number,
  body: {
    invoiceNumber?: string;
    amountChf: string;
    dueAt?: string | null;
    paymentNote?: string | null;
    skontoChf?: string | null;
  },
) {
  return toursAdminPost(`/tours/${tourId}/invoices/create-manual`, body as Record<string, unknown>);
}

export function createFreeformInvoice(body: {
  customerName: string;
  customerEmail?: string;
  customerAddress?: string;
  description: string;
  amountChf: string;
  invoiceNumber?: string;
  dueAt?: string | null;
  invoiceDate?: string | null;
  paymentNote?: string | null;
  skontoChf?: string | null;
  tourId?: string | number | null;
  markPaidNow?: boolean;
  paidAt?: string | null;
  paymentMethod?: string | null;
}) {
  return toursAdminPost("/invoices/create-freeform", body as Record<string, unknown>);
}

export type InvoiceFormSuggestionsResponse = {
  ok: true;
  descriptions: string[];
  invoiceNumbers: string[];
  notes: string[];
};

export function getInvoiceFormSuggestions(q?: string) {
  const qs = q != null && String(q).trim() !== "" ? `?q=${encodeURIComponent(String(q).trim())}` : "";
  return toursAdminFetch<InvoiceFormSuggestionsResponse>(`/invoices/form-suggestions${qs}`);
}

export function freeformInvoicePdfUrl(invoiceId: string | number) {
  return `${BASE}/invoices/${invoiceId}/pdf`;
}

export function getToursAdminLinkMatterport(queryString: string) {
  const q = queryString.startsWith("?") ? queryString : queryString ? `?${queryString}` : "";
  return toursAdminFetch<Record<string, unknown>>(`/link-matterport${q}`);
}

export function getToursAdminLinkInvoice(tourId: string, search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return toursAdminFetch<Record<string, unknown>>(`/tours/${tourId}/link-invoice${qs}`);
}

export function postLinkMatterport(body: Record<string, unknown>) {
  return toursAdminPost("/link-matterport", body);
}

export function postLinkMatterportBatch(action: "auto" | "refresh-created" | "sync-status" | "check-ownership") {
  return toursAdminPost(`/link-matterport/${action}`, {});
}

export function getToursByOrderNo(orderNo: number | string) {
  return toursAdminFetch<{
    tours: {
      id: number; bezeichnung: string; tourUrl: string;
      matterportSpaceId: string; status: string; bookingOrderNo: number;
    }[];
  }>(`/tours/by-order/${encodeURIComponent(String(orderNo))}`);
}

export function getLinkMatterportBookingSearch(q: string) {
  return toursAdminFetch<{ orders: { id: number; order_no: number; status: string; address: string; company: string; email: string; contactSalutation: string; contactFirstName: string; contactName: string; contactEmail: string; contactPhone: string; date: string | null; created_at: string; coreCustomerId: string | null; coreCompany: string; coreEmail: string; contacts: { name: string; email: string; tel: string }[] }[] }>(
    `/link-matterport/booking-search?q=${encodeURIComponent(q)}`,
  );
}

export function postLinkInvoiceToTour(tourId: string, invoiceId: string | number) {
  return toursAdminPost(`/tours/${tourId}/link-invoice`, { invoice_id: String(invoiceId) });
}

export function renewalInvoicePdfUrl(tourId: string | number, invoiceId: string | number) {
  return `${BASE}/tours/${tourId}/invoices/${invoiceId}/pdf`;
}

// ─── Grundriss bestellen ──────────────────────────────────────────────────────

export interface FloorplanPricingResponse {
  ok: true;
  unitPrice: number;
  vatRate: number;
  vatPercent: number;
  floors: { id: string; label: string | null }[];
  floorCount: number;
  totalNet: number;
  totalGross: number;
}

export function getFloorplanPricing(tourId: string | number) {
  return toursAdminFetch<FloorplanPricingResponse>(`/tours/${tourId}/floorplan-pricing`);
}

export function postOrderFloorplan(
  tourId: string | number,
  payload: { paymentMethod: "payrexx" | "qr_invoice"; comment?: string; floorCount: number },
) {
  return toursAdminPost(`/tours/${tourId}/order-floorplan`, payload as unknown as Record<string, unknown>);
}

export function getLinkMatterportCustomerSearch(q: string) {
  return toursAdminFetch<Record<string, unknown>>(`/link-matterport/customer-search?q=${encodeURIComponent(q)}`);
}

export function getLinkMatterportCustomerDetail(customerId: number) {
  return toursAdminFetch<Record<string, unknown>>(
    `/link-matterport/customer-detail?customerId=${encodeURIComponent(String(customerId))}`,
  );
}

export function getToursAdminLinkExxasCustomer(tourId: string) {
  return toursAdminFetch<{ ok: true; tour: Record<string, unknown> }>(`/tours/${tourId}/link-exxas-customer`);
}

export function getToursAdminLinkCustomerAutocomplete(tourId: string, q: string) {
  return toursAdminFetch<{ customers: Record<string, unknown>[] }>(
    `/tours/${tourId}/link-customer/autocomplete?q=${encodeURIComponent(q)}`,
  );
}

export function postLinkExxasCustomerToTour(
  tourId: string,
  body: {
    customer_id: string | number;
    customer_name: string;
    customer_email?: string;
    customer_contact?: string;
  },
) {
  return toursAdminPost(`/tours/${tourId}/link-exxas-customer`, body as Record<string, unknown>);
}

export function deleteUnlinkCustomerFromTour(tourId: string) {
  return toursAdminDelete<{ ok: boolean }>(`/tours/${tourId}/link-exxas-customer`);
}

async function toursAdminPut<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

async function toursAdminDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface MatterportModelOptions {
  defurnishViewEnabled: boolean | null;
  defurnishViewOverride: string | null;
  dollhouseEnabled: boolean | null;
  dollhouseOverride: string | null;
  floorplanEnabled: boolean | null;
  floorplanOverride: string | null;
  socialSharingEnabled: boolean | null;
  socialSharingOverride: string | null;
  vrEnabled: boolean | null;
  vrOverride: string | null;
  highlightReelEnabled: boolean | null;
  highlightReelOverride: string | null;
  labelsEnabled: boolean | null;
  labelsOverride: string | null;
  tourAutoplayEnabled: boolean | null;
  tourAutoplayOverride: string | null;
  roomBoundsEnabled: boolean | null;
  roomBoundsOverride: string | null;
}

export interface MatterportModelFloor {
  id: string;
  label: string | null;
}

export interface MatterportModelLabel {
  id: string;
  label: string;
  enabled: boolean;
  floor: { id: string; label: string | null } | null;
  position: { x: number; y: number; z: number } | null;
}

export interface MatterportPanoLocation {
  id: string;
  label: string | null;
  variant?: string | null;
  position?: { x: number; y: number; z: number } | null;
}

export interface MatterportModelMeta {
  id: string;
  name: string | null;
  state: string | null;
  visibility: string | null;
  accessVisibility: string | null;
  description: string | null;
  created: string | null;
  modified: string | null;
  publication: {
    address: string | null;
    summary: string | null;
    description: string | null;
    externalUrl: string | null;
    presentedBy: string | null;
    published: boolean | null;
    url: string | null;
  } | null;
  options: MatterportModelOptions | null;
  floors: MatterportModelFloor[] | null;
  labels: MatterportModelLabel[] | null;
  panoLocations: MatterportPanoLocation[] | null;
}

export type MatterportSettingOverride = "enabled" | "disabled" | "default";

export type MatterportOptionsPatch = Partial<{
  defurnishViewOverride: MatterportSettingOverride;
  dollhouseOverride: MatterportSettingOverride;
  floorplanOverride: MatterportSettingOverride;
  socialSharingOverride: MatterportSettingOverride;
  vrOverride: MatterportSettingOverride;
  highlightReelOverride: MatterportSettingOverride;
  labelsOverride: MatterportSettingOverride;
  tourAutoplayOverride: MatterportSettingOverride;
  roomBoundsOverride: MatterportSettingOverride;
}>;

export function postToursAdminMatterportOptions(tourId: string, patch: MatterportOptionsPatch) {
  return toursAdminPost(`/tours/${tourId}/matterport-options`, patch as Record<string, unknown>);
}

export function getToursAdminMatterportModel(tourId: string) {
  return toursAdminFetch<{ ok: true; model: MatterportModelMeta; inactiveWarning?: boolean }>(`/tours/${tourId}/matterport-model`);
}

export function postUnarchiveMatterportTour(tourId: string) {
  return toursAdminPost(`/tours/${tourId}/unarchive-matterport`);
}

export function postReactivateTour(
  tourId: string,
  paymentMethod: "payrexx" | "qr_invoice" | "none",
): Promise<{ ok: true; via: "payrexx" | "qr_invoice" | "none"; redirectUrl?: string }> {
  return toursAdminPost(
    `/tours/${tourId}/reactivate`,
    { paymentMethod },
  ) as Promise<{ ok: true; via: "payrexx" | "qr_invoice" | "none"; redirectUrl?: string }>;
}

export function deleteToursAdminTour(tourId: string, alsoDeleteMatterport?: boolean) {
  const qs = alsoDeleteMatterport ? "?also_delete_matterport=1" : "";
  return toursAdminDelete<{ ok: boolean; message?: string; matterport_deleted?: boolean; matterport_error?: string | null }>(`/tours/${tourId}${qs}`);
}

export function postTransferMatterportSpace(tourId: string, toEmail: string) {
  return toursAdminPost(`/tours/${tourId}/transfer-matterport`, { toEmail });
}

export function postAdminImpersonate(email: string) {
  return toursAdminPost("/impersonate", { email });
}

export function postAdminImpersonateStop() {
  return toursAdminPost("/impersonate/stop");
}

export function getToursAdminCustomersList(queryString: string) {
  const q = queryString.startsWith("?") ? queryString : queryString ? `?${queryString}` : "";
  return toursAdminFetch<Record<string, unknown>>(`/customers${q}`);
}

export function getToursAdminExxasCustomerSearch(q: string) {
  return toursAdminFetch<Record<string, unknown>>(`/customers/exxas-search?q=${encodeURIComponent(q)}`);
}

export function postToursAdminCustomerNew(body: Record<string, unknown>) {
  return toursAdminPost("/customers", body);
}

export function getToursAdminCustomerDetail(customerId: string) {
  return toursAdminFetch<Record<string, unknown>>(`/customers/${customerId}`);
}

export function postToursAdminCustomerUpdate(customerId: string, body: Record<string, unknown>) {
  return toursAdminPost(`/customers/${customerId}`, body);
}

export function deleteToursAdminCustomer(customerId: string) {
  return toursAdminDelete<Record<string, unknown>>(`/customers/${customerId}`);
}

export function postToursAdminCustomerContact(customerId: string, body: Record<string, unknown>) {
  return toursAdminPost(`/customers/${customerId}/contacts`, body);
}

export function deleteToursAdminCustomerContact(customerId: string, contactId: string | number) {
  return toursAdminDelete<Record<string, unknown>>(`/customers/${customerId}/contacts/${contactId}`);
}

export function getToursAdminTourSettings() {
  return toursAdminFetch<Record<string, unknown>>("/tour-settings");
}

export function putToursAdminTourSettings(body: Record<string, unknown>) {
  return toursAdminPut<Record<string, unknown>>("/tour-settings", body);
}

export function getToursAdminEmailTemplatesBundle() {
  return toursAdminFetch<Record<string, unknown>>("/email-templates");
}

export function putToursAdminEmailTemplates(templates: Record<string, { subject?: string; html?: string; text?: string }>) {
  return toursAdminPut<Record<string, unknown>>("/email-templates", { templates });
}

export function getToursAdminAutomations() {
  return toursAdminFetch<Record<string, unknown>>("/automations");
}

export function putToursAdminAutomations(body: Record<string, unknown>) {
  return toursAdminPut<Record<string, unknown>>("/automations", body);
}

export function getToursAdminConfirmationPending() {
  return toursAdminFetch<{ ok: true; tours: Record<string, unknown>[] }>("/confirmation-pending");
}

export function getToursAdminTeam() {
  return toursAdminFetch<Record<string, unknown>>("/team");
}

export function postToursAdminTeamInvite(email: string, expiresDays?: number) {
  return toursAdminPost("/team/invite", { email, expiresDays: expiresDays ?? 7 });
}

export function postToursAdminTeamToggleActive(email: string, action: "enable" | "disable") {
  return toursAdminPost("/team/toggle-active", { email, action });
}

export function postToursAdminTeamRevokeInvite(id: string | number) {
  return toursAdminPost(`/team/invites/${id}/revoke`, {});
}

export function putToursAdminTeamUser(
  userId: string | number,
  body: { email: string; name: string; password?: string },
) {
  return toursAdminPut<Record<string, unknown>>(`/team/users/${userId}`, body as Record<string, unknown>);
}

export function deleteToursAdminTeamUser(userId: string | number) {
  return toursAdminDelete<Record<string, unknown>>(`/team/users/${userId}`);
}

export function getToursAdminAiChatConfig() {
  return toursAdminFetch<Record<string, unknown>>("/ai-chat-config");
}

export function postToursAdminAiChat(body: {
  message: string;
  history?: { role: string; content: string }[];
  model?: string;
  path?: string;
}) {
  return toursAdminPost("/ai-chat", body as Record<string, unknown>);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export type TicketCategory =
  | "startpunkt"
  | "name_aendern"
  | "blur_request"
  | "sweep_verschieben"
  | "sonstiges";

export type TicketStatus = "open" | "in_progress" | "done" | "rejected";

export interface TicketRow {
  id: number;
  module: string;
  reference_id: string | null;
  reference_type: string | null;
  category: TicketCategory | string;
  subject: string;
  description: string | null;
  link_url: string | null;
  attachment_path: string | null;
  status: TicketStatus;
  priority: string;
  created_by: string | null;
  created_by_role: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  customer_id?: number | null;
  // JOIN fields
  tour_label?: string | null;
  tour_bezeichnung?: string | null;
  tour_space_id?: string | null;
  /** JOIN booking.orders bei reference_type = order */
  reference_order_no?: number | null;
  /** JOIN core.customers */
  customer_name?: string | null;
  customer_email?: string | null;
}

export interface TicketCreatePayload {
  module?: string;
  reference_id?: string | null;
  reference_type?: string;
  category: TicketCategory;
  subject: string;
  description?: string;
  link_url?: string;
  attachment_path?: string;
  priority?: string;
  customer_id?: number | null;
}

export interface TicketPatchPayload {
  status?: TicketStatus;
  assigned_to?: string | null;
  customer_id?: number | null;
  reference_type?: string | null;
  reference_id?: string | null;
}

export interface InboxMessage {
  id?: string;
  graphMessageId?: string;
  subject: string;
  fromEmail: string;
  fromName?: string;
  receivedAt?: string;
  bodyPreview?: string;
  isRead?: boolean;
  matchedTours: Array<{
    id: number;
    bezeichnung: string | null;
    customer_name: string | null;
    customer_email: string | null;
    customer_id: number | null;
    status: string;
    matterport_space_id: string | null;
  }>;
  matchedCustomers: Array<{
    id: number;
    name: string;
    email: string;
  }>;
}

export interface InboxResponse {
  ok: true;
  mailbox: string;
  folder: string;
  total: number;
  withMatch?: number;
  withoutMatch?: number;
  messages: InboxMessage[];
}

export function postCreateTicket(payload: TicketCreatePayload) {
  return toursAdminPost("/tickets", payload as unknown as Record<string, unknown>) as Promise<{ ok: true; ticket: TicketRow }>;
}

export function getTicketsList(filters?: {
  status?: TicketStatus;
  module?: string;
  reference_id?: string;
  reference_type?: string;
  customer_id?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.module) params.set("module", filters.module);
  if (filters?.reference_id) params.set("reference_id", filters.reference_id);
  if (filters?.reference_type) params.set("reference_type", filters.reference_type);
  if (filters?.customer_id) params.set("customer_id", String(filters.customer_id));
  const qs = params.toString();
  return toursAdminFetch<{ ok: true; tickets: TicketRow[] }>(`/tickets${qs ? `?${qs}` : ""}`);
}

export function getTicketDetail(id: number | string) {
  return toursAdminFetch<{ ok: true; ticket: TicketRow }>(`/tickets/${id}`);
}

export function patchTicketStatus(id: number | string, status: TicketStatus, assigned_to?: string) {
  return toursAdminFetch<{ ok: true; ticket: TicketRow }>(`/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(assigned_to !== undefined ? { assigned_to } : {}) }),
  });
}

export function patchTicketAssignment(id: number | string, payload: TicketPatchPayload) {
  return toursAdminFetch<{ ok: true; ticket: TicketRow }>(`/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function postTicketUpload(file: File): Promise<{ ok: true; path: string; filename: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/tickets/upload`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Posteingang (zentrale Konversationen) ───────────────────────────────────

export type PosteingangChannel = "email" | "internal" | "task_only";
export type PosteingangConvStatus = "open" | "in_progress" | "waiting" | "resolved" | "archived";
export type PosteingangMsgDirection = "inbound" | "outbound" | "internal_note" | "system";

export type PosteingangConversationRow = {
  id: number;
  subject: string;
  channel: PosteingangChannel;
  status: PosteingangConvStatus;
  priority: string;
  customer_id: number | null;
  order_id: number | null;
  tour_id: number | null;
  assigned_admin_user_id: number | null;
  graph_conversation_id: string | null;
  graph_mailbox_address: string | null;
  last_message_at: string | null;
  message_count?: number;
  created_at: string;
};

export type PosteingangMessageRow = {
  id: number;
  conversation_id: number;
  direction: PosteingangMsgDirection;
  from_name: string | null;
  from_email: string | null;
  to_emails: string[];
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  graph_message_id: string | null;
  sent_at: string;
  author_email: string | null;
};

export type PosteingangTaskRow = {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  conversation_id: number | null;
  customer_id: number | null;
};

export function getPosteingangConversations(qs: string) {
  const q = qs.startsWith("?") ? qs : qs ? `?${qs}` : "";
  return toursAdminFetch<{ ok: true; conversations: PosteingangConversationRow[]; total: number }>(
    `/posteingang/conversations${q}`,
  );
}

export type PosteingangRelated = {
  tours: {
    id: number;
    bezeichnung: string | null;
    status: string;
    customer_email: string | null;
    matterport_space_id: string | null;
  }[];
  orders: { id: number; order_no: number; status: string; created_at: string }[];
  renewal_invoices: {
    id: number;
    invoice_number: string | null;
    invoice_status: string;
    amount_chf: string | null;
    created_at: string;
    tour_id: number;
    tour_bezeichnung: string | null;
  }[];
  exxas_invoices: {
    id: number;
    nummer: string | null;
    exxas_status: string | null;
    preis_brutto: string | null;
    synced_at: string;
    tour_id: number;
    tour_bezeichnung: string | null;
  }[];
};

export function getPosteingangConversation(id: string | number) {
  return toursAdminFetch<{
    ok: true;
    conversation: PosteingangConversationRow & {
      customer_name?: string | null;
      customer_email?: string | null;
      assignee_email?: string | null;
    };
    messages: PosteingangMessageRow[];
    tags: string[];
    tasks: PosteingangTaskRow[];
    related: PosteingangRelated;
  }>(`/posteingang/conversations/${id}`);
}

export function postPosteingangSyncPull(body?: { mailbox?: string }) {
  return toursAdminPost("/posteingang/sync/pull", body as Record<string, unknown> | undefined);
}

export function patchPosteingangConversation(id: string | number, body: Record<string, unknown>) {
  return toursAdminFetch<Record<string, unknown>>(`/posteingang/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function postPosteingangMessage(
  conversationId: string | number,
  body: { mode: "reply" | "note"; bodyHtml?: string; bodyText?: string },
) {
  return toursAdminFetch<{ ok: true } & Awaited<ReturnType<typeof getPosteingangConversation>>>(
    `/posteingang/conversations/${conversationId}/messages`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function getPosteingangTasks(qs: string) {
  const q = qs.startsWith("?") ? qs : qs ? `?${qs}` : "";
  return toursAdminFetch<{ ok: true; tasks: PosteingangTaskRow[]; total: number }>(`/posteingang/tasks${q}`);
}

export function postPosteingangTask(body: Record<string, unknown>) {
  return toursAdminPost("/posteingang/tasks", body);
}

export function patchPosteingangTask(id: string | number, body: Record<string, unknown>) {
  return toursAdminFetch<{ ok: true; task: PosteingangTaskRow }>(`/posteingang/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deletePosteingangTask(id: string | number) {
  return toursAdminFetch<{ ok: true }>(`/posteingang/tasks/${id}`, { method: "DELETE" });
}

export function postPosteingangConversation(body: { subject?: string; channel?: string; priority?: string; customer_id?: number | null }) {
  return toursAdminPost("/posteingang/conversations", body);
}

export function postPosteingangTag(conversationId: string | number, name: string) {
  return toursAdminPost(`/posteingang/conversations/${conversationId}/tags`, { name });
}

export function deletePosteingangTag(conversationId: string | number, name: string) {
  return toursAdminFetch<{ ok: true }>(`/posteingang/conversations/${conversationId}/tags/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export type PosteingangStats = {
  open_conversations: number | null;
  in_progress_conversations: number | null;
  waiting_conversations: number | null;
  resolved_conversations: number | null;
  open_tasks: number | null;
  avg_response_time_hours: number | null;
};

export function getPosteingangStats() {
  return toursAdminFetch<{ ok: true; stats: PosteingangStats }>("/posteingang/stats");
}

export type PosteingangAdminUser = { id: number; email: string; name: string; role: string };

export function getPosteingangAdminUsers() {
  return toursAdminFetch<{ ok: true; users: PosteingangAdminUser[] }>("/posteingang/admin-users");
}

export function postPosteingangRunTriggers() {
  return toursAdminPost("/posteingang/run-triggers");
}

export function getMailInbox(params?: {
  top?: number;
  folder?: string;
  since?: string;
  matchTours?: boolean;
}) {
  const p = new URLSearchParams();
  if (params?.top) p.set("top", String(params.top));
  if (params?.folder) p.set("folder", params.folder);
  if (params?.since) p.set("since", params.since);
  if (params?.matchTours === false) p.set("matchTours", "false");
  const qs = p.toString();
  return toursAdminFetch<InboxResponse>(`/mail/inbox${qs ? `?${qs}` : ""}`);
}

export function postTicketFromEmail(payload: {
  fromEmail: string;
  subject?: string;
  bodyPreview?: string;
  receivedAt?: string;
  graphMessageId?: string;
  customer_id?: number | null;
  reference_id?: string | null;
  reference_type?: string;
}) {
  return toursAdminPost("/tickets/from-email", payload as unknown as Record<string, unknown>) as Promise<{ ok: true; ticket: TicketRow }>;
}

export interface ExxasInventorySyncResult {
  ok: boolean;
  synced: boolean;
  inventoryId?: string;
  inventoryTitel?: string;
  inventoryStatus?: string;
  archived?: boolean;
  archiveNote?: string | null;
  invoiceLinked?: boolean;
  invoiceId?: string | null;
  invoiceNummer?: string | null;
  bezahlt?: boolean | null;
  message?: string;
  error?: string;
}

// ─── Bereinigungslauf (Cleanup) ───────────────────────────────────────────────

export interface CleanupRule {
  statusLabel: string;
  statusContext: string;
  weiterfuehrenHint: string;
  needsInvoice: boolean;
  invoiceAmount: number | null;
  paymentMethods: string[];
  needsManualReview: boolean;
  archivedWithin6Months: boolean;
  isWithin6Months: boolean;
}

export interface CleanupActionPlan {
  label: string;
  hint: string;
  needsInvoice?: boolean;
  invoiceAmount?: number | null;
  paymentMethods?: string[];
  needsManualReview?: boolean;
}

export interface CleanupSandboxPreview {
  dryRun: true;
  tourId: number;
  objectLabel: string;
  status: string;
  statusLabel: string;
  archivedWithin6Months: boolean;
  needsManualReview: boolean;
  withinCleanupWindow: boolean;
  withinCleanupWindowNote: string | null;
  isEligible: boolean;
  alreadySent: boolean;
  alreadyDone: boolean;
  email: string;
  rule: CleanupRule;
  actionPlan: Record<string, CleanupActionPlan>;
  mail: { subject: string; html: string; text: string };
}

export function getCleanupSandboxPreview(tourId: string | number) {
  return toursAdminFetch<{ ok: true } & CleanupSandboxPreview>(`/cleanup/sandbox/${tourId}`);
}

export function postCleanupBatchDryRun(tourIds?: number[]) {
  return toursAdminFetch<{ ok: true; dryRun: boolean; total: number; sent: number; skipped: number; failed: number; results: unknown[] }>(
    "/cleanup/batch-dry-run",
    { method: "POST", body: JSON.stringify(tourIds ? { tourIds } : {}) }
  );
}

export function postCleanupBatchSend(tourIds?: number[]) {
  return toursAdminFetch<{ ok: true; dryRun: boolean; total: number; sent: number; skipped: number; failed: number; results: unknown[] }>(
    "/cleanup/batch-send",
    { method: "POST", body: JSON.stringify(tourIds ? { tourIds } : {}) }
  );
}

export function postCleanupSendSingle(tourId: string | number) {
  return toursAdminFetch<{ ok: true; recipientEmail: string; subject: string; rule: CleanupRule }>(
    `/cleanup/send/${tourId}`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export function getCleanupCandidates() {
  return toursAdminFetch<{ ok: true; count: number; tours: unknown[] }>("/cleanup/candidates");
}

// ─── Bereinigungslauf v2: Dashboard (Kunden-gruppiert) ───────────────────────

export interface CleanupCustomerGroup {
  groupKey: string;
  customerEmail: string;
  customerEmails: string[];
  customerName: string | null;
  tourCount: number;
  pendingCount: number;
  doneCount: number;
  allSent: boolean;
  lastAccessedAt?: string | null;
  tours: Array<{
    id: number;
    object_label?: string;
    bezeichnung?: string;
    status: string;
    cleanup_sent_at?: string | null;
    cleanup_action?: string | null;
  }>;
}

export function getCleanupDashboardCandidates() {
  return toursAdminFetch<{ ok: true; count: number; customers: CleanupCustomerGroup[] }>("/cleanup/dashboard/candidates");
}

export function postCleanupDashboardBatchDryRun(customerEmails?: string[]) {
  return toursAdminFetch<{
    ok: true; dryRun: boolean; totalCustomers: number; totalTours: number;
    sent: number; skipped: number; failed: number; results: unknown[];
  }>("/cleanup/dashboard/batch-dry-run", {
    method: "POST",
    body: JSON.stringify(customerEmails ? { customerEmails } : {}),
  });
}

export function postCleanupDashboardBatchSend(customerEmails?: string[]) {
  return toursAdminFetch<{
    ok: true; dryRun: boolean; totalCustomers: number; totalTours: number;
    sent: number; skipped: number; failed: number; results: unknown[];
  }>("/cleanup/dashboard/batch-send", {
    method: "POST",
    body: JSON.stringify(customerEmails ? { customerEmails } : {}),
  });
}

export function postCleanupDashboardSendSingle(customerEmails: string | string[]) {
  const emails = Array.isArray(customerEmails) ? customerEmails : [customerEmails];
  return toursAdminFetch<{ ok: true; recipientEmail: string; recipientEmails: string[]; tourCount: number }>("/cleanup/dashboard/send-single", {
    method: "POST",
    body: JSON.stringify({ customerEmails: emails }),
  });
}

export function postCleanupDashboardGetLink(customerEmails: string | string[]) {
  const emails = Array.isArray(customerEmails) ? customerEmails : [customerEmails];
  return toursAdminFetch<{ ok: true; dashboardUrl: string; expiresAt: string; primaryEmail: string }>(
    "/cleanup/dashboard/get-link",
    { method: "POST", body: JSON.stringify({ customerEmails: emails }) }
  );
}

export function postCleanupDashboardBatchReminderDryRun(customerEmails?: string[]) {
  return toursAdminFetch<{
    ok: true; dryRun: boolean; totalCustomers: number; totalTours: number;
    sent: number; skipped: number; failed: number; results: unknown[];
  }>("/cleanup/dashboard/batch-reminder-dry-run", {
    method: "POST",
    body: JSON.stringify(customerEmails ? { customerEmails } : {}),
  });
}

export function postCleanupDashboardBatchReminder(customerEmails?: string[]) {
  return toursAdminFetch<{
    ok: true; dryRun: boolean; totalCustomers: number; totalTours: number;
    sent: number; skipped: number; failed: number; results: unknown[];
  }>("/cleanup/dashboard/batch-reminder", {
    method: "POST",
    body: JSON.stringify(customerEmails ? { customerEmails } : {}),
  });
}

export function postCleanupDashboardSendVouchers() {
  return toursAdminFetch<{ ok: true; total: number; sent: number; skipped: number; failed: number }>("/cleanup/dashboard/send-vouchers", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function postSyncExxasInventory(tourId: number) {
  return toursAdminFetch<ExxasInventorySyncResult>(`/tours/${tourId}/sync-exxas-inventory`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
