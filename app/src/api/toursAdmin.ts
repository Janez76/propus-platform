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

export function deleteAdminInvoice(type: "renewal" | "exxas", invoiceId: string | number) {
  return toursAdminFetch<{ ok: true }>(`/invoices/${type}/${invoiceId}`, {
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

export function getToursAdminBankImport() {
  return toursAdminFetch<Record<string, unknown>>("/bank-import");
}

export async function uploadToursAdminBankFile(file: File) {
  const fd = new FormData();
  fd.append("bankFile", file);
  const res = await fetch(`${BASE}/bank-import/upload`, { method: "POST", credentials: "include", body: fd });
  const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function confirmBankImportTransaction(txId: number, invoiceId: string) {
  return toursAdminPost(`/bank-import/transactions/${txId}/confirm`, { invoiceId });
}

export function ignoreBankImportTransaction(txId: number) {
  return toursAdminPost(`/bank-import/transactions/${txId}/ignore`, {});
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
  paymentMethod: "payrexx" | "qr_invoice",
): Promise<{ ok: true; via: "payrexx" | "qr_invoice"; redirectUrl?: string }> {
  return toursAdminPost(
    `/tours/${tourId}/reactivate`,
    { paymentMethod },
  ) as Promise<{ ok: true; via: "payrexx" | "qr_invoice"; redirectUrl?: string }>;
}

export function deleteToursAdminTour(tourId: string) {
  return toursAdminDelete<{ ok: boolean; message?: string }>(`/tours/${tourId}`);
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

export function postToursAdminContactPortalRole(
  customerId: string,
  contactId: string | number,
  body: { portal_role: string },
) {
  return toursAdminPost(`/customers/${customerId}/contacts/${contactId}/portal-role`, body as Record<string, unknown>);
}

export function getToursAdminPortalRoles(tab?: string) {
  const qs = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  return toursAdminFetch<Record<string, unknown>>(`/portal-roles${qs}`);
}

export function getToursAdminPortalExternContacts(ownerEmail?: string, customerId?: string | number) {
  const p = new URLSearchParams();
  if (ownerEmail) p.set("owner_email", ownerEmail);
  if (customerId != null && customerId !== "") p.set("customer_id", String(customerId));
  const qs = p.toString();
  return toursAdminFetch<Record<string, unknown>>(`/portal-roles/extern-contacts${qs ? `?${qs}` : ""}`);
}

export function postPortalStaffAdd(email: string) {
  return toursAdminPost("/portal-roles/staff/add", { email });
}

export function postPortalStaffRemove(email: string) {
  return toursAdminPost("/portal-roles/staff/remove", { email });
}

export function postPortalExternSet(ownerEmail: string, memberEmail: string) {
  return toursAdminPost("/portal-roles/extern/set", { owner_email: ownerEmail, member_email: memberEmail });
}

export function postPortalExternRemove(ownerEmail: string, memberEmail: string) {
  return toursAdminPost("/portal-roles/extern/remove", { owner_email: ownerEmail, member_email: memberEmail });
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
  // JOIN fields
  tour_label?: string | null;
  tour_bezeichnung?: string | null;
  tour_space_id?: string | null;
  /** JOIN booking.orders bei reference_type = order */
  reference_order_no?: number | null;
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
}

export function postCreateTicket(payload: TicketCreatePayload) {
  return toursAdminPost("/tickets", payload as unknown as Record<string, unknown>) as Promise<{ ok: true; ticket: TicketRow }>;
}

export function getTicketsList(filters?: {
  status?: TicketStatus;
  module?: string;
  reference_id?: string;
  reference_type?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.module) params.set("module", filters.module);
  if (filters?.reference_id) params.set("reference_id", filters.reference_id);
  if (filters?.reference_type) params.set("reference_type", filters.reference_type);
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
