import { apiRequest } from "./client";

export type Customer = {
  id: number;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  onsite_name?: string;
  onsite_phone?: string;
  street?: string;
  zipcity?: string;
  notes?: string;
  blocked?: boolean;
  is_admin?: boolean;
  order_count?: number;
  customer_type?: 'customer' | 'employee' | 'both';
  // Exxas
  salutation?: string;
  first_name?: string;
  address_addon_1?: string;
  address_addon_2?: string;
  address_addon_3?: string;
  po_box?: string;
  zip?: string;
  city?: string;
  country?: string;
  phone_2?: string;
  phone_mobile?: string;
  phone_fax?: string;
  website?: string;
  exxas_customer_id?: string;
  exxas_address_id?: string;
  /** Relativ zu Kunden-NAS-Root; Auftragsordner = Basis + / + Objektordner */
  nas_customer_folder_base?: string | null;
  /** Relativ zu Rohmaterial-NAS-Root */
  nas_raw_folder_base?: string | null;
  /** Frühere/alternative E-Mail-Domains (z.B. nach Firmenzusammenführung). Touren, Bestellungen und Portal-Login
   *  funktionieren unter diesen Adressen genauso wie unter der primären E-Mail. */
  email_aliases?: string[];
};

export type CustomerContact = {
  id: number;
  customer_id: number;
  name: string;
  role: string;
  phone: string;
  email: string;
  sort_order?: number;
  created_at?: string;
  // Exxas
  salutation?: string;
  first_name?: string;
  last_name?: string;
  phone_direct?: string;
  phone_mobile?: string;
  department?: string;
  exxas_contact_id?: string;
};

export type Contact = {
  id: number;
  customer_id?: number | null;
  customer_name?: string;
  customer_company?: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  sort_order?: number;
  created_at?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  phone_direct?: string;
  phone_mobile?: string;
  department?: string;
  exxas_contact_id?: string;
};

export type CustomerContactPayload = {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
  sort_order?: number;
  customer_id?: number | null;
  // Exxas
  salutation?: string;
  first_name?: string;
  last_name?: string;
  phone_direct?: string;
  phone_mobile?: string;
  department?: string;
};

export type ContactPayload = CustomerContactPayload;

export type CustomerOrder = {
  orderNo?: number | string;
  status?: string;
  address?: string;
  appointmentDate?: string;
};

function normalizeCustomer(raw: unknown): Customer {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const customerType = String(r.customer_type || "customer");
  const isValidType = (t: string): t is 'customer' | 'employee' | 'both' => 
    t === "customer" || t === "employee" || t === "both";
  
  return {
    id: Number(r.id || 0),
    name: String(r.name || ""),
    email: String(r.email || ""),
    company: String(r.company || ""),
    phone: String(r.phone || ""),
    onsite_name: String(r.onsite_name || ""),
    onsite_phone: String(r.onsite_phone || ""),
    street: String(r.street || ""),
    zipcity: String(r.zipcity || ""),
    notes: String(r.notes || ""),
    blocked: Boolean(r.blocked),
    is_admin: Boolean(r.is_admin),
    order_count: Number(r.order_count || 0),
    customer_type: isValidType(customerType) ? customerType : "customer",
    salutation: String(r.salutation || ""),
    first_name: String(r.first_name || ""),
    address_addon_1: String(r.address_addon_1 || ""),
    address_addon_2: String(r.address_addon_2 || ""),
    address_addon_3: String(r.address_addon_3 || ""),
    po_box: String(r.po_box || ""),
    zip: String(r.zip || ""),
    city: String(r.city || ""),
    country: String(r.country || "Schweiz"),
    phone_2: String(r.phone_2 || ""),
    phone_mobile: String(r.phone_mobile || ""),
    phone_fax: String(r.phone_fax || ""),
    website: String(r.website || ""),
    exxas_customer_id: String(r.exxas_customer_id || ""),
    exxas_address_id: String(r.exxas_address_id || ""),
    nas_customer_folder_base:
      r.nas_customer_folder_base != null && String(r.nas_customer_folder_base).trim()
        ? String(r.nas_customer_folder_base).trim()
        : "",
    nas_raw_folder_base:
      r.nas_raw_folder_base != null && String(r.nas_raw_folder_base).trim()
        ? String(r.nas_raw_folder_base).trim()
        : "",
    email_aliases: Array.isArray(r.email_aliases)
      ? (r.email_aliases as string[]).filter(Boolean)
      : [],
  };
}

export async function getCustomers(token: string): Promise<Customer[]> {
  const data = await apiRequest<unknown>("/api/admin/customers", "GET", token);
  if (Array.isArray(data)) return data.map(normalizeCustomer);
  if (data && typeof data === "object" && Array.isArray((data as { customers?: unknown[] }).customers)) {
    return (data as { customers: unknown[] }).customers.map(normalizeCustomer);
  }
  return [];
}

export async function getCustomer(token: string, id: number): Promise<Customer> {
  const data = await apiRequest<unknown>(`/api/admin/customers/${id}`, "GET", token);
  return normalizeCustomer(data);
}

export const createCustomer = (token: string, payload: Record<string, unknown>) =>
  apiRequest<Customer>("/api/admin/customers", "POST", token, payload);

export const updateCustomer = (token: string, id: number, payload: Record<string, unknown>) =>
  apiRequest(`/api/admin/customers/${id}`, "PUT", token, payload);

export const patchCustomerNasFolderBases = (
  token: string,
  id: number,
  body: { nasCustomerFolderBase?: string | null; nasRawFolderBase?: string | null },
) =>
  apiRequest<{ ok: boolean }>(`/api/admin/customers/${id}/nas-folder-bases`, "PATCH", token, body);

export const updateCustomerEmail = (token: string, id: number, email: string) =>
  apiRequest(`/api/admin/customers/${id}/email`, "PATCH", token, { email });

export const updateCustomerEmailAliases = (token: string, id: number, emailAliases: string[]) =>
  apiRequest<{ ok: boolean; email_aliases: string[] }>(
    `/api/admin/customers/${id}/email-aliases`,
    "PATCH",
    token,
    { email_aliases: emailAliases },
  );

export const updateCustomerBlocked = (token: string, id: number, blocked: boolean) =>
  apiRequest(`/api/admin/customers/${id}/blocked`, "PATCH", token, { blocked });

export const updateCustomerAdmin = (token: string, id: number, is_admin: boolean) =>
  apiRequest(`/api/admin/customers/${id}/admin`, "PATCH", token, { is_admin });

export const resetCustomerPassword = (token: string, id: number, newPassword: string) =>
  apiRequest(`/api/admin/customers/${id}/reset-password`, "POST", token, { newPassword });

export const getCustomerImpersonateUrl = (token: string, id: number) =>
  apiRequest<{ ok: true; url: string }>(`/api/admin/customers/${id}/impersonate`, "POST", token);

export const getCustomerOrders = (token: string, id: number) =>
  apiRequest<CustomerOrder[]>(`/api/admin/customers/${id}/orders`, "GET", token);

export const getCustomerContacts = (token: string, customerId: number) =>
  apiRequest<CustomerContact[]>(`/api/admin/customers/${customerId}/contacts`, "GET", token);

export const createCustomerContact = (token: string, customerId: number, payload: CustomerContactPayload) =>
  apiRequest<{ ok: true; contact: CustomerContact }>(`/api/admin/customers/${customerId}/contacts`, "POST", token, payload);

export const updateCustomerContact = (token: string, customerId: number, contactId: number, payload: CustomerContactPayload) =>
  apiRequest<{ ok: true; contact: CustomerContact }>(`/api/admin/customers/${customerId}/contacts/${contactId}`, "PUT", token, payload);

export const deleteCustomerContact = (token: string, customerId: number, contactId: number) =>
  apiRequest<{ ok: true }>(`/api/admin/customers/${customerId}/contacts/${contactId}`, "DELETE", token);

export const getContacts = (token: string) =>
  apiRequest<Contact[]>("/api/admin/contacts", "GET", token);

export const createContact = (token: string, payload: ContactPayload) =>
  apiRequest<{ ok: true; contact: Contact }>("/api/admin/contacts", "POST", token, payload);

export const updateContact = (token: string, contactId: number, payload: ContactPayload) =>
  apiRequest<{ ok: true; contact: Contact }>(`/api/admin/contacts/${contactId}`, "PUT", token, payload);

export const deleteContact = (token: string, contactId: number) =>
  apiRequest<{ ok: true }>(`/api/admin/contacts/${contactId}`, "DELETE", token);

export const deleteCustomer = (token: string, id: number, force = false) =>
  apiRequest<{ ok: true } | { error: string; orderCount: number; requiresForce: true }>(
    `/api/admin/customers/${id}${force ? "?force=true" : ""}`,
    "DELETE",
    token,
  );

export const mergeCustomers = (token: string, keepId: number, mergeId: number) =>
  apiRequest<{ ok: true; keepId: number }>("/api/admin/customers/merge", "POST", token, { keepId, mergeId });
