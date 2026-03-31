import { apiRequest } from "./client";

export type BookingConfig = {
  googleMapsKey: string | null;
  googleMapId: string | null;
  dbFieldHintsEnabled: boolean;
  provisionalBookingEnabled: boolean;
  vatRate: number;
  chfRoundingStep: number;
  keyPickupPrice: number;
  lookaheadDays: number;
  minAdvanceHours: number;
};

export type CatalogCategory = {
  key: string;
  name: string;
  description?: string;
  active: boolean;
  sort_order: number;
  kind_scope?: "addon" | "both" | "package";
};

export type CatalogPackage = {
  key: string;
  label: string;
  description?: string;
  price: number;
  categoryKey?: string;
  sortOrder?: number;
  pricingType?: string;
};

export type CatalogAddon = {
  id: string;
  group: string;
  label: string;
  price: number;
  unitPrice?: number;
  pricingType?: string;
  categoryKey?: string;
  sortOrder?: number;
  pricingNote?: string;
};

export type CatalogProduct = {
  id: number;
  code: string;
  name: string;
  kind: "package" | "addon" | "service" | "extra";
  group_key: string;
  category_key?: string;
  description?: string;
  affects_duration?: boolean;
  duration_minutes?: number;
  active: boolean;
  sort_order: number;
  rules?: unknown[];
};

export type CatalogData = {
  categories: CatalogCategory[];
  packages: CatalogPackage[];
  addons: CatalogAddon[];
  products: CatalogProduct[];
};

export type PhotographerInfo = {
  key: string;
  name: string;
  initials: string;
  image: string;
};

export type AvailabilityParams = {
  photographer: string;
  date: string;
  duration?: number;
  sqm?: number;
  lat?: number;
  lon?: number;
  packageKey?: string;
  addonIds?: string[];
  includeSkillWarning?: boolean;
};

export type AvailabilityResult = {
  photographer: string;
  date: string;
  free: string[];
  wishPhotographerSkillWarning?: boolean;
  missingSkills?: string[];
  recommendedPhotographer?: { key: string; name: string } | null;
  reason?: string;
};

export type BookingPayload = {
  address: { text: string; coords: { lat: number; lng: number } | null };
  object: {
    type: string;
    area: string;
    floors: number;
    rooms: string;
    specials?: string;
    desc?: string;
    onsiteName?: string;
    onsitePhone?: string;
    onsiteEmail?: string;
    onsiteCalendarInvite?: boolean;
    additionalOnsiteContacts?: Array<{
      name: string;
      phone: string;
      email: string;
      calendarInvite: boolean;
    }>;
  };
  services: {
    package: { key: string; price: number; label: string; labelKey?: string } | null;
    addons: Array<{ id: string; group: string; label: string; labelKey?: string; price: number }>;
  };
  schedule: {
    photographer: { key: string; name: string };
    date: string;
    time: string;
    provisional?: boolean;
  };
  billing: Record<string, string>;
  pricing: { subtotal: number; discountAmount: number; vat: number; total: number };
  discountCode?: string;
  keyPickup?: { enabled: boolean; address: string; floor?: string; info?: string };
};

export type BookingResult = {
  ok: boolean;
  orderNo: number;
  warnings?: Array<{ stage: string; code: string; message: string }>;
  requestId?: string;
};

export type DiscountResult = {
  valid: boolean;
  type?: string;
  percent?: number;
  amount?: number;
  reason?: string;
};

export async function fetchConfig(): Promise<BookingConfig> {
  return apiRequest<BookingConfig>("/api/config");
}

export async function fetchCatalog(): Promise<CatalogData> {
  return apiRequest<CatalogData>("/api/catalog/products");
}

export async function fetchPhotographers(): Promise<PhotographerInfo[]> {
  const res = await apiRequest<{ ok: boolean; photographers: PhotographerInfo[] }>("/api/catalog/photographers");
  return res.photographers ?? [];
}

export async function fetchAvailability(params: AvailabilityParams): Promise<AvailabilityResult> {
  const qs = new URLSearchParams({
    photographer: params.photographer,
    date: params.date,
  });
  if (params.duration) qs.set("duration", String(params.duration));
  if (params.sqm) qs.set("sqm", String(params.sqm));
  if (params.lat != null) qs.set("lat", String(params.lat));
  if (params.lon != null) qs.set("lon", String(params.lon));
  if (params.packageKey) qs.set("package", params.packageKey);
  if (params.addonIds?.length) qs.set("addons", params.addonIds.join(","));
  if (params.includeSkillWarning) qs.set("includeSkillWarning", "true");
  return apiRequest<AvailabilityResult>(`/api/availability?${qs.toString()}`);
}

function addOneDayIso(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Erstes Datum im Bereich mit mindestens einem freien Slot (sequentielle /api/availability-Aufrufe). */
export async function findFirstDateWithAvailability(
  params: Omit<AvailabilityParams, "date" | "includeSkillWarning"> & { minDate: string; maxDate: string },
): Promise<string | null> {
  const { minDate, maxDate, photographer, duration, sqm, lat, lon, packageKey, addonIds } = params;
  let d = minDate;
  const endMs = new Date(`${maxDate}T12:00:00.000Z`).getTime();
  for (let i = 0; i < 370 && new Date(`${d}T12:00:00.000Z`).getTime() <= endMs; i++) {
    try {
      const res = await fetchAvailability({
        photographer,
        date: d,
        duration,
        sqm,
        lat,
        lon,
        packageKey,
        addonIds,
        includeSkillWarning: false,
      });
      if (Array.isArray(res.free) && res.free.length > 0) return d;
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (/lookahead|ausserhalb/i.test(m)) break;
    }
    d = addOneDayIso(d);
  }
  return null;
}

export async function submitBooking(payload: BookingPayload): Promise<BookingResult> {
  return apiRequest<BookingResult>("/api/booking", "POST", undefined, payload);
}

export async function validateDiscount(code: string, customerEmail?: string): Promise<DiscountResult> {
  const res = await apiRequest<DiscountResult & { action: string }>("/api/bot", "POST", undefined, {
    action: "validate_discount",
    code,
    customerEmail: customerEmail || "",
  });
  return { valid: res.valid, type: res.type, percent: res.percent, amount: res.amount, reason: res.reason };
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ addr: string; parsed: { street: string; houseNumber: string; zip: string; city: string } | null }> {
  return apiRequest(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
}
