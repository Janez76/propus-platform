import { apiRequest } from "./client";

export interface InvoiceCreditor {
  name: string;
  street: string;
  buildingNumber: string;
  zip: string;
  city: string;
  country: string;
  iban: string;
  email: string;
  phone: string;
  website: string;
  vatId: string;
  footerNote: string;
}

export interface InvoiceEmailTemplate {
  name?: string;
  description?: string;
  subject: string;
  html: string;
  text: string;
}

export interface InvoiceTemplateData {
  ok: true;
  creditor: InvoiceCreditor;
  defaultCreditor: InvoiceCreditor;
  invoiceEmailTemplate: InvoiceEmailTemplate;
  defaultInvoiceEmailTemplate: InvoiceEmailTemplate;
}

const BASE = "/api/tours/admin";

export async function getInvoiceTemplate(token?: string): Promise<InvoiceTemplateData> {
  return apiRequest<InvoiceTemplateData>(`${BASE}/invoice-template`, "GET", token);
}

export async function patchInvoiceTemplate(
  token: string | undefined,
  patch: { creditor?: Partial<InvoiceCreditor>; emailTemplate?: Partial<InvoiceEmailTemplate> },
): Promise<InvoiceTemplateData & { invoiceEmailTemplate: InvoiceEmailTemplate }> {
  return apiRequest(`${BASE}/invoice-template`, "PATCH", token, patch);
}
