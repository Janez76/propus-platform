import { apiRequest } from "./client";
import type { ExxasMappingConfig } from "./exxas";

export type ExxasPreviewCustomer = {
  id: string;
  nummer: string;
  name: string;
  email: string;
  phone: string;
  phone2: string;
  phoneMobile: string;
  street: string;
  addressAddon1: string;
  zip: string;
  city: string;
  country: string;
  website: string;
  notes: string;
  billingCompany: string;
  billingStreet: string;
  billingZip: string;
  billingCity: string;
  billingCountry: string;
  firstName: string;
  salutation: string;
  exxasCustomerId: string;
  exxasAddressId: string;
  raw: Record<string, unknown>;
};

export type ExxasPreviewContact = {
  id: string;
  customerRef: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  phoneDirect: string;
  phoneMobile: string;
  role: string;
  salutation: string;
  briefAnrede: string;
  suchname: string;
  department: string;
  details: string;
  raw: Record<string, unknown>;
};

export type LocalCustomerCandidate = {
  localCustomerId: number;
  localCustomer: {
    id: number;
    email: string;
    name: string;
    company: string;
    phone: string;
    street: string;
    zipcity: string;
    zip: string;
    city: string;
    country: string;
    salutation: string;
    first_name: string;
    address_addon_1: string;
    address_addon_2: string;
    address_addon_3: string;
    po_box: string;
    phone_2: string;
    phone_mobile: string;
    phone_fax: string;
    website: string;
    notes: string;
    exxas_customer_id: string | null;
    exxas_address_id: string | null;
  };
  confidence: number;
  score: number;
  reasons: string[];
};

export type LocalContactCandidate = {
  localContactId: number;
  localContact: {
    id: number;
    customer_id: number;
    name: string;
    role: string;
    phone: string;
    phone_direct: string;
    email: string;
    salutation: string;
    first_name: string;
    last_name: string;
    phone_mobile: string;
    department: string;
    exxas_contact_id: string | null;
  };
  confidence: number;
  score: number;
  reasons: string[];
};

export type ExxasPreviewItem = {
  exxasCustomer: ExxasPreviewCustomer;
  customerSuggestions: LocalCustomerCandidate[];
  suggestedCustomerAction: "link_existing" | "create_customer";
  suggestedLocalCustomerId: number | null;
  contactSuggestions: Array<{
    exxasContact: ExxasPreviewContact;
    localCandidates: LocalContactCandidate[];
    suggestedAction: "link_existing" | "create_contact";
    suggestedLocalContactId: number | null;
  }>;
};

export type LocalCustomerIndexEntry = {
  id: number;
  label: string;
  email: string;
};

export type LocalContactIndexEntry = {
  id: number;
  label: string;
  email: string;
};

export type ExxasPreviewResponse = {
  ok: boolean;
  source: string;
  stats: {
    exxasCustomers: number;
    exxasContacts: number;
    localCustomers: number;
    localContacts: number;
    previewItems: number;
  };
  items: ExxasPreviewItem[];
  localCustomerIndex?: LocalCustomerIndexEntry[];
  localContactIndexByCustomer?: Record<string, LocalContactIndexEntry[]>;
};

export type ExxasConfirmDecision = {
  exxasCustomer: ExxasPreviewCustomer;
  customerAction: "link_existing" | "create_customer" | "skip";
  localCustomerId?: number | null;
  overwriteCustomerFields?: string[];
  contactDecisions: Array<{
    exxasContact: ExxasPreviewContact;
    action: "link_existing" | "create_contact" | "skip";
    localContactId?: number | null;
    overwriteFields?: string[];
  }>;
};

export type ExxasConfirmResponse = {
  ok: boolean;
  summary: {
    total: number;
    success: number;
    failed: number;
  };
  outcomes: Array<{
    ok: boolean;
    exxasCustomerId: string | null;
    localCustomerId?: number;
    skipped?: boolean;
    error?: string;
    contactOutcomes?: Array<{
      ok: boolean;
      exxasContactId: string | null;
      localContactId?: number;
      skipped?: boolean;
      error?: string;
    }>;
  }>;
};

export async function previewExxasReconciliation(
  token: string,
  config: Pick<ExxasMappingConfig, "apiKey" | "appPassword" | "endpoint" | "authMode">,
): Promise<ExxasPreviewResponse> {
  return apiRequest<ExxasPreviewResponse>(
    "/api/admin/integrations/exxas/reconcile/preview",
    "POST",
    token,
    {
      credentials: {
        apiKey: config.apiKey,
        appPassword: config.appPassword,
        endpoint: config.endpoint,
        authMode: config.authMode,
      },
    }
  );
}

export async function confirmExxasReconciliation(
  token: string,
  decisions: ExxasConfirmDecision[],
): Promise<ExxasConfirmResponse> {
  return apiRequest<ExxasConfirmResponse>(
    "/api/admin/integrations/exxas/reconcile/confirm",
    "POST",
    token,
    { decisions },
    { dedupe: false }
  );
}

