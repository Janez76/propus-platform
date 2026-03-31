/**
 * Gemeinsame TypeScript-Typen für den Tour Manager.
 * Alle Felder entsprechen 1:1 den tatsächlichen DB-Feldern und API-Responses
 * aus tours/lib/normalize.js und tours/routes/portal-api.js / admin-api.js.
 *
 * Kanonische Felder (canonical_*) werden serverseitig durch normalizeTourRow() gesetzt.
 */

// ─── Status-Enums ─────────────────────────────────────────────────────────────

export type TourStatus =
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'AWAITING_CUSTOMER_DECISION'
  | 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'
  | 'CUSTOMER_DECLINED'
  | 'EXPIRED_PENDING_ARCHIVE'
  | 'ARCHIVED'
  | 'SUSPENDED_NONPAYMENT';

export const TOUR_STATUS_LABELS: Record<TourStatus, string> = {
  ACTIVE: 'Aktiv',
  EXPIRING_SOON: 'Läuft bald ab',
  AWAITING_CUSTOMER_DECISION: 'Wartet auf Kunde',
  CUSTOMER_ACCEPTED_AWAITING_PAYMENT: 'Wartet auf Zahlung',
  CUSTOMER_DECLINED: 'Keine Verlängerung',
  EXPIRED_PENDING_ARCHIVE: 'Abgelaufen',
  ARCHIVED: 'Archiviert',
  SUSPENDED_NONPAYMENT: 'Gesperrt',
};

export type MatterportState =
  | 'active'
  | 'inactive'
  | 'processing'
  | 'failed'
  | 'pending'
  | 'staging'
  | 'activating'
  | 'inactivating'
  | 'activation_pending'
  | 'inactivation_pending'
  | 'unknown';

export const MATTERPORT_STATE_LABELS: Record<MatterportState, string> = {
  active: 'Aktiv',
  inactive: 'Archiviert',
  processing: 'In Bearbeitung',
  failed: 'Fehlgeschlagen',
  pending: 'Ausstehend',
  staging: 'Upload',
  activating: 'Aktivierung…',
  inactivating: 'Archivierung…',
  activation_pending: 'Wartet Aktivierung',
  inactivation_pending: 'Wartet Archivierung',
  unknown: 'Unbekannt',
};

export type TourVisibility = 'PRIVATE' | 'LINK_ONLY' | 'PUBLIC' | 'PASSWORD';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export type RenewalInvoiceKind = 'portal_extension' | 'portal_reactivation' | 'manual';

export type InvoiceStatusTone = 'none' | 'success' | 'warning' | 'danger';

export type CustomerIntent =
  | 'renew_yes'
  | 'renew_no'
  | 'transfer_requested'
  | 'billing_question'
  | 'unclear';

export const CUSTOMER_INTENT_LABELS: Record<CustomerIntent, string> = {
  renew_yes: 'Kunde will verlängern',
  renew_no: 'Kunde will nicht verlängern',
  transfer_requested: 'Transfer gewünscht',
  billing_question: 'Rechnungsfrage',
  unclear: 'Kundenwunsch unklar',
};

// ─── Kern-Entitäten ───────────────────────────────────────────────────────────

/**
 * Tour wie sie von normalizeTourRow() zurückkommt.
 * Alle dual-name-Felder (object_label/bezeichnung, customer_name/kunde_ref, …)
 * sind über canonical_*-Felder zugänglich.
 */
export interface Tour {
  id: number;
  status: TourStatus;

  // Duale Namen (legacy + neu) – immer canonical_* bevorzugen
  object_label?: string | null;
  bezeichnung?: string | null;
  canonical_object_label?: string | null;

  customer_name?: string | null;
  kunde_ref?: string | null;
  canonical_customer_name?: string | null;

  customer_email?: string | null;
  customer_contact?: string | null;

  term_end_date?: string | null;
  ablaufdatum?: string | null;
  canonical_term_end_date?: string | null;

  matterport_space_id?: string | null;
  tour_url?: string | null;
  canonical_matterport_space_id?: string | null;

  exxas_abo_id?: string | null;
  exxas_subscription_id?: string | null;
  canonical_exxas_contract_id?: string | null;

  matterport_start_sweep?: string | null;
  matterport_created_at?: string | null;
  matterport_is_own?: boolean | null;

  created_at?: string | null;
  updated_at?: string | null;

  // Zustand
  customer_verified?: boolean | null;
  customer_intent?: CustomerIntent | null;
  customer_transfer_requested?: boolean | null;
  customer_billing_attention?: boolean | null;
  archiv?: boolean | null;
  archiv_datum?: string | null;
  last_email_sent_at?: string | null;

  // Exxas-Verknüpfung
  exxas_customer_id?: string | null;
  customer_id?: number | null;
  assigned_to?: string | null;
}

/** Tour in der Admin-Liste – mit berechneten Anzeigefeldern */
export interface AdminTourListItem extends Tour {
  days_until_expiry?: number | null;
  live_matterport_state?: MatterportState | null;
  displayed_status?: string;
  displayed_status_label?: string;
  displayed_status_note?: string | null;
  invoice_status_tone?: InvoiceStatusTone;
  invoice_status_label?: string;
  exxas_paid_count?: number;
  exxas_open_count?: number;
  exxas_overdue_count?: number;
  has_customer_connection?: boolean;
  has_renewal_mail?: boolean;
  incoming_mail_count?: number;
  needs_renewal_mail?: boolean;
  waiting_customer_reply?: boolean;
  awaiting_payment_without_invoice?: boolean;
  exxas_created_at?: string | null;
}

export interface RenewalInvoice {
  id: number;
  tour_id: number;
  invoice_status: InvoiceStatus;
  invoice_kind?: RenewalInvoiceKind | null;
  invoice_number?: string | null;
  amount_chf?: number | null;
  betrag?: number | null;
  sent_at?: string | null;
  paid_at?: string | null;
  due_at?: string | null;
  created_at?: string | null;
  invoice_date?: string | null;
  payment_method?: string | null;
  payment_source?: string | null;
  payment_note?: string | null;
  recorded_by?: string | null;
  payrexx_payment_url?: string | null;
  subscription_start_at?: string | null;
  subscription_end_at?: string | null;
  // Joins aus Admin-Queries
  tour_object_label?: string | null;
  tour_customer_name?: string | null;
  tour_contract_id?: string | null;
  // Portal-View: berechnet
  object_label?: string | null;
  bezeichnung?: string | null;
  customer_email?: string | null;
  tourLabel?: string | null;
}

export interface ExxasInvoice {
  id: number;
  nummer?: string | null;
  kunde_name?: string | null;
  bezeichnung?: string | null;
  betrag?: number | null;
  status?: string | null;
  exxas_status?: string | null;
  zahlungstermin?: string | null;
  tour_id?: number | null;
}

export interface ActionLogEntry {
  id: number;
  tour_id: number;
  actor_type: 'admin' | 'customer' | 'system';
  actor_id?: string | null;
  action_type: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

// ─── Kunden ───────────────────────────────────────────────────────────────────

export interface Customer {
  id: number;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
}

export interface CustomerContact {
  id: number;
  customer_id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  portal_role?: string | null;
  created_at?: string | null;
}

// ─── Portal-Team ──────────────────────────────────────────────────────────────

export type TeamMemberRole = 'inhaber' | 'admin' | 'mitarbeiter' | 'exxas';
export type TeamMemberStatus = 'active' | 'pending' | 'revoked';

export const TEAM_ROLE_LABELS: Record<string, string> = {
  inhaber: 'Inhaber',
  admin: 'Administrator',
  mitarbeiter: 'Mitarbeiter',
  exxas: 'In System gefunden',
  pending_admin: 'Einladung · Administrator',
  pending_mitarbeiter: 'Einladung · Mitarbeiter',
};

export interface PortalTeamMember {
  id: number;
  owner_email: string;
  member_email: string;
  display_name?: string | null;
  role: TeamMemberRole | string;
  status: TeamMemberStatus | string;
  accepted_at?: string | null;
  created_at?: string | null;
  customer_id?: number | null;
}

/** Erweiterter Zeilentyp für die Team-Ansicht (mit Exxas-Peers und Inhaber-Zeile) */
export interface TeamAccessRow {
  rowId: string;
  name: string;
  email: string;
  state: 'active' | 'pending' | 'exxas' | 'billing';
  role: string;
  source?: 'db' | 'exxas' | 'billing';
  memberId?: number;
  canRevoke?: boolean;
  canChangeRole?: boolean;
  isSelf?: boolean;
}

// ─── Admin-Team ───────────────────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  email: string;
  display_name?: string | null;
  active?: boolean;
  created_at?: string | null;
}

export interface AdminInvite {
  id: number;
  email: string;
  created_at?: string | null;
  expires_at?: string | null;
}

// ─── Einstellungen ────────────────────────────────────────────────────────────

export interface DashboardWidgets {
  total?: boolean;
  expiringSoon?: boolean;
  awaitingPayment?: boolean;
  active?: boolean;
  declined?: boolean;
  archived?: boolean;
  unlinked?: boolean;
  fremdeTouren?: boolean;
  invoicesOffen?: boolean;
  invoicesUeberfaellig?: boolean;
  invoicesBezahlt?: boolean;
  activeTours?: boolean;
  archivedTours?: boolean;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export type EmailTemplateKey =
  | 'renewal_request'
  | 'payment_confirmed'
  | 'expiry_reminder'
  | 'extension_confirmed'
  | 'reactivation_confirmed'
  | 'archive_notice'
  | 'payment_failed'
  | 'team_invite';

export type EmailTemplates = Partial<Record<EmailTemplateKey, EmailTemplate>>;

export interface AiPromptSettings {
  mailSystemPrompt?: string;
}

export interface MatterportCredentials {
  tokenId?: string;
  hasSecret?: boolean;
}

export interface AutomationSettings {
  [key: string]: unknown;
}

// ─── Matterport-Linking ───────────────────────────────────────────────────────

export interface MatterportSpace {
  id: string;
  name?: string | null;
  created?: string | null;
  state?: MatterportState | null;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

// ─── Filter / Sort ────────────────────────────────────────────────────────────

export type TourSortColumn =
  | 'customer'
  | 'matterport_created'
  | 'ablaufdatum'
  | 'days'
  | 'status';

export type SortOrder = 'asc' | 'desc';

export interface TourListFilters {
  status?: TourStatus;
  expiringSoon?: '1';
  awaitingPayment?: '1';
  unlinkedOnly?: '1';
  fremdeOnly?: '1';
  activeRunning?: '1';
  unverifiedOnly?: '1';
  verifiedOnly?: '1';
  invoiceOpenOnly?: '1';
  invoiceOverdueOnly?: '1';
  noCustomerOnly?: '1';
  q?: string;
  sort?: TourSortColumn;
  order?: SortOrder;
  page?: number;
}

// ─── Statistiken ─────────────────────────────────────────────────────────────

export interface TourStats {
  total?: number;
  ACTIVE?: number;
  EXPIRING_SOON?: number;
  AWAITING_CUSTOMER_DECISION?: number;
  CUSTOMER_ACCEPTED_AWAITING_PAYMENT?: number;
  CUSTOMER_DECLINED?: number;
  EXPIRED_PENDING_ARCHIVE?: number;
  ARCHIVED?: number;
  noCustomer?: number;
  activeRunning?: number;
  archivedMatterport?: number;
  invoicesOffen?: number;
  invoicesBezahlt?: number;
  invoicesUeberfaellig?: number;
  invoicesOpenTotal?: number;
}

// ─── Preise ───────────────────────────────────────────────────────────────────

export interface PortalPricing {
  months: number;
  isReactivation: boolean;
  amountCHF: number;
  basePriceCHF: number;
  reactivationFeeCHF: number;
  actionLabel: string;
  invoiceKind: RenewalInvoiceKind;
}

// ─── API-Antwort-Hülle ────────────────────────────────────────────────────────

export interface ApiOk {
  ok: true;
}

export interface ApiError {
  ok?: false;
  error: string;
}

export type ApiResult<T> = (ApiOk & T) | ApiError;
