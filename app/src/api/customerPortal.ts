/**
 * Customer-Portal API-Modul (`/api/customer/...`).
 *
 * Endpunkte sind cookie-Session-basiert (kein Bearer-Token), deshalb eigener
 * `portalFetch()`-Helper statt `apiRequest()` aus `client.ts` — der ist auf
 * Admin-Bearer ausgelegt.
 *
 * Single-Source-of-Truth fuer Order-Shape im Customer-Portal: `OrderRow`
 * (Liste) und `CustomerOrderDetail` (Detail). Beide leiten von
 * `CustomerOrderShape` ab, damit die Felder bei API-Vertragsaenderungen nur
 * an einer Stelle gepflegt werden muessen.
 */

/** Gemeinsame Felder, die das Customer-Portal aus `/api/customer/orders[/:no]` liest. */
export interface CustomerOrderShape {
  status?: string;
  address?: string;
  schedule?: { date?: string; time?: string };
  /** Migration 092: bei flexiblen Buchungen `'flexible'`, sonst `'fixed'` (default). */
  bookingKind?: "fixed" | "flexible";
  /** Spätestes Aufnahmedatum bei `booking_kind='flexible'`. */
  deadlineAt?: string | null;
  /** Frühestmögliches Aufnahmedatum bei `booking_kind='flexible'`. */
  flexibleEarliestAt?: string | null;
}

/** Ein Eintrag in `/api/customer/orders` (Listenansicht). */
export interface OrderRow extends CustomerOrderShape {
  orderNo?: number;
  id?: number;
}

/** Eine einzelne Bestellung aus `/api/customer/orders/:orderNo` (Detail). */
export interface CustomerOrderDetail extends CustomerOrderShape {
  orderNo?: number;
}

export interface CustomerOrdersResponse {
  ok?: boolean;
  orders?: OrderRow[];
}

export interface CustomerOrderDetailResponse {
  ok?: boolean;
  order?: CustomerOrderDetail;
}

/**
 * Kleine fetch-Wrapper-Funktion fuer Customer-Portal-Endpunkte.
 * Setzt `credentials: "include"` damit der Session-Cookie gesendet wird.
 *
 * Wirft bei nicht-2xx-Responses; 401 ist explizit ausgeklammert (Aufrufer
 * entscheidet, ob auf `/login` umgeleitet wird).
 */
export interface PortalFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

export async function portalFetch<T>(path: string, init?: RequestInit): Promise<PortalFetchResult<T>> {
  const response = await fetch(path, { credentials: "include", ...init });
  if (!response.ok) {
    return { ok: false, status: response.status, data: null };
  }
  const data = (await response.json()) as T;
  return { ok: true, status: response.status, data };
}

/** Lädt die Bestell-Liste des aktuellen Kunden. */
export async function getCustomerOrders(): Promise<PortalFetchResult<CustomerOrdersResponse>> {
  return portalFetch<CustomerOrdersResponse>("/api/customer/orders");
}

/** Lädt eine einzelne Bestellung des aktuellen Kunden. */
export async function getCustomerOrder(orderNo: string | number): Promise<PortalFetchResult<CustomerOrderDetailResponse>> {
  const safe = encodeURIComponent(String(orderNo));
  return portalFetch<CustomerOrderDetailResponse>(`/api/customer/orders/${safe}`);
}

/** Re-Export fuer die Rechnungsliste — gleicher Endpunkt-Stil. */
export interface CustomerInvoicesResponse {
  ok?: boolean;
  invoices?: Array<Record<string, unknown>>;
}

export async function getCustomerInvoices(): Promise<PortalFetchResult<CustomerInvoicesResponse>> {
  return portalFetch<CustomerInvoicesResponse>("/api/customer/invoices");
}
