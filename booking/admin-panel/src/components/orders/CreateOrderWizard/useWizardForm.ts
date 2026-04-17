import { useReducer, useMemo } from "react";
import type { Product } from "../../../api/products";
import type { Customer } from "../../../api/customers";
import { calculatePricing, type PricingResult } from "../../../lib/pricing";
import type { StatusKey } from "../../../lib/status";

export type WizardFormState = {
  // Customer
  salutation: string;
  first_name: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerPhoneMobile: string;
  company: string;
  // Rechnungsadresse Kunde
  billingStreet: string;
  billingHouseNumber: string;
  billingZip: string;
  billingCity: string;
  billingZipcity: string;
  // Kontakt vor Ort
  onsiteName: string;
  onsitePhone: string;
  // CC / Weitere eingeladene Personen
  attendeeEmails: string;
  // Objekt-Adresse
  address: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  zipcity: string;
  objectType: string;
  area: string;
  floors: string;
  rooms: string;
  desc: string;
  // Service
  packageLabel: string;
  packagePrice: string;
  addonsText: string;
  selectedPackageCode: string;
  selectedAddonCodes: string[];
  // Schedule
  date: string;
  time: string;
  durationMin: string;
  photographerKey: string;
  initialStatus: StatusKey;
  // Pricing overrides
  discount: string;
  discountCode: string;
  notes: string;
  keyPickupActive: boolean;
  keyPickupAddress: string;
  // Anfahrtszone
  objectCanton: string;
  travelZone: string;
  travelZoneProduct: string;
  travelZonePrice: number;
  travelZoneLabel: string;
  // Manueller Preis-Override (wenn User Subtotal im Summary manuell anpasst)
  manualSubtotal: string | null;
  // Status-E-Mail-Versand
  sendStatusEmails: boolean;
  statusEmailTargets: { customer: boolean; office: boolean; photographer: boolean; cc: boolean };
  // Aktiver Kontakt aus Kundenkontakten (für Dropdown)
  selectedContactId: string;
};

export const INITIAL_STATE: WizardFormState = {
  salutation: "",
  first_name: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  customerPhoneMobile: "",
  company: "",
  billingStreet: "",
  billingHouseNumber: "",
  billingZip: "",
  billingCity: "",
  billingZipcity: "",
  onsiteName: "",
  onsitePhone: "",
  attendeeEmails: "",
  address: "",
  street: "",
  houseNumber: "",
  zip: "",
  city: "",
  zipcity: "",
  objectType: "apartment",
  area: "",
  floors: "1",
  rooms: "",
  desc: "",
  packageLabel: "",
  packagePrice: "0",
  addonsText: "",
  selectedPackageCode: "",
  selectedAddonCodes: [],
  date: "",
  time: "",
  durationMin: "60",
  photographerKey: "",
  initialStatus: "pending",
  discount: "0",
  discountCode: "",
  notes: "",
  keyPickupActive: false,
  keyPickupAddress: "",
  objectCanton: "",
  travelZone: "",
  travelZoneProduct: "",
  travelZonePrice: 0,
  travelZoneLabel: "",
  manualSubtotal: null,
  sendStatusEmails: true,
  statusEmailTargets: { customer: true, office: false, photographer: false, cc: false },
  selectedContactId: "",
};

export type WizardAction =
  | { type: "reset" }
  | { type: "setField"; key: keyof WizardFormState; value: unknown }
  | { type: "patch"; patch: Partial<WizardFormState> }
  | { type: "selectCustomer"; customer: Customer }
  | { type: "selectContact"; contactId: string; fields?: Partial<WizardFormState> }
  | { type: "setObjectAddress"; parsed: { display: string; street: string; houseNumber: string; zip: string; city: string; canton?: string } }
  | { type: "setBillingAddress"; parsed: { street: string; houseNumber: string; zip: string; city: string } }
  | { type: "setTravelZone"; zone: string; product: string; price: number; label: string; canton?: string }
  | { type: "selectPackage"; code: string; label: string; price: number }
  | { type: "toggleAddon"; code: string; checked: boolean }
  | { type: "toggleKeyPickup"; active: boolean }
  | { type: "setKeyPickupAddress"; address: string }
  | { type: "setDiscount"; value: string }
  | { type: "setManualSubtotal"; value: string }
  | { type: "setSlot"; date: string; time: string }
  | { type: "setInitialStatus"; status: StatusKey }
  | { type: "setSendStatusEmails"; value: boolean }
  | { type: "setStatusEmailTarget"; key: keyof WizardFormState["statusEmailTargets"]; value: boolean };

function reducer(state: WizardFormState, action: WizardAction): WizardFormState {
  switch (action.type) {
    case "reset":
      return { ...INITIAL_STATE };
    case "setField":
      return { ...state, [action.key]: action.value } as WizardFormState;
    case "patch":
      return { ...state, ...action.patch };
    case "selectCustomer": {
      const c = action.customer;
      const zipcity = c.zipcity || [c.zip, c.city].filter(Boolean).join(" ");
      const zipMatch = zipcity.match(/^(\d{4,5})\s+(.+)$/);
      const isSynthEmail = String(c.email || "").toLowerCase().endsWith("@company.local");
      return {
        ...state,
        customerName: c.name || "",
        customerEmail: isSynthEmail ? "" : (c.email || ""),
        customerPhone: c.phone || "",
        company: c.company || "",
        onsiteName: "",
        onsitePhone: "",
        billingStreet: c.street || "",
        billingZipcity: zipcity,
        billingZip: zipMatch ? zipMatch[1] : (c.zip || ""),
        billingCity: zipMatch ? zipMatch[2] : (c.city || zipcity),
        billingHouseNumber: state.billingHouseNumber,
        selectedContactId: "",
      };
    }
    case "selectContact":
      return {
        ...state,
        selectedContactId: action.contactId,
        ...(action.fields || {}),
      };
    case "setObjectAddress": {
      const p = action.parsed;
      return {
        ...state,
        address: p.display,
        street: p.street,
        houseNumber: p.houseNumber,
        zip: p.zip,
        city: p.city,
        zipcity: `${p.zip} ${p.city}`.trim(),
        objectCanton: p.canton || state.objectCanton,
      };
    }
    case "setBillingAddress": {
      const p = action.parsed;
      return {
        ...state,
        billingStreet: `${p.street} ${p.houseNumber}`.trim(),
        billingHouseNumber: p.houseNumber,
        billingZip: p.zip,
        billingCity: p.city,
        billingZipcity: `${p.zip} ${p.city}`.trim(),
      };
    }
    case "setTravelZone":
      return {
        ...state,
        travelZone: action.zone,
        travelZoneProduct: action.product,
        travelZonePrice: action.price,
        travelZoneLabel: action.label,
        objectCanton: action.canton ?? state.objectCanton,
      };
    case "selectPackage":
      return {
        ...state,
        selectedPackageCode: action.code,
        packageLabel: action.label,
        packagePrice: String(action.price || 0),
        manualSubtotal: null,
      };
    case "toggleAddon": {
      const next = action.checked
        ? [...state.selectedAddonCodes, action.code]
        : state.selectedAddonCodes.filter((x) => x !== action.code);
      return { ...state, selectedAddonCodes: next, manualSubtotal: null };
    }
    case "toggleKeyPickup":
      return {
        ...state,
        keyPickupActive: action.active,
        keyPickupAddress: action.active ? state.keyPickupAddress : "",
      };
    case "setKeyPickupAddress":
      return { ...state, keyPickupAddress: action.address };
    case "setDiscount":
      return { ...state, discount: action.value };
    case "setManualSubtotal":
      return { ...state, manualSubtotal: action.value };
    case "setSlot":
      return { ...state, date: action.date, time: action.time };
    case "setInitialStatus":
      return { ...state, initialStatus: action.status };
    case "setSendStatusEmails":
      return { ...state, sendStatusEmails: action.value };
    case "setStatusEmailTarget":
      return {
        ...state,
        statusEmailTargets: { ...state.statusEmailTargets, [action.key]: action.value },
      };
    default:
      return state;
  }
}

export function estimatePrice(product: Product, floorsInput: string, areaInput: string): number {
  const rule = product.rules?.[0];
  const cfg = (rule?.config_json || {}) as Record<string, unknown>;
  const floors = Math.max(1, Number(floorsInput || 1));
  const area = Number(areaInput || 0);
  if (rule?.rule_type === "fixed") return Number(cfg.price || 0);
  if (rule?.rule_type === "per_floor") return Number(cfg.unitPrice || 0) * floors;
  if (rule?.rule_type === "per_room") return Number(cfg.unitPrice || 0);
  if (rule?.rule_type === "area_tier") {
    const tiers = Array.isArray(cfg.tiers) ? (cfg.tiers as Array<Record<string, unknown>>) : [];
    for (const tier of tiers) {
      if (area > 0 && area <= Number(tier.maxArea || 0)) return Number(tier.price || 0);
    }
    return Number((tiers[tiers.length - 1] || {}).price || 0);
  }
  if (rule?.rule_type === "conditional") return Number(cfg.price || 0);
  return 0;
}

export type PricingSelection = PricingResult & {
  packagePrice: number;
  addonLines: { code: string; name: string; price: number }[];
  keyPickupCharged: boolean;
};

export function selectPricing(state: WizardFormState, catalog: Product[]): PricingSelection {
  const pkg = catalog.find((p) => p.code === state.selectedPackageCode);
  const packagePrice = pkg ? estimatePrice(pkg, state.floors, state.area) : Number(state.packagePrice || 0);
  const addonProducts = catalog.filter((p) => state.selectedAddonCodes.includes(p.code));
  const addonLines = addonProducts.map((a) => ({ code: a.code, name: a.name, price: estimatePrice(a, state.floors, state.area) }));
  const keyPickupCharged = state.keyPickupActive && !!state.keyPickupAddress.trim();
  const pricing = calculatePricing({
    packagePrice,
    addons: addonLines.map((a) => ({ price: a.price })),
    travelZonePrice: state.travelZonePrice || 0,
    keyPickupActive: keyPickupCharged,
    discount: Number(state.discount || 0),
  });
  // Manuelle Subtotal-Override
  if (state.manualSubtotal !== null && state.manualSubtotal !== "") {
    const overriddenSub = Number(state.manualSubtotal || 0);
    const disc = Number(state.discount || 0);
    const vatBase = Math.max(0, overriddenSub - disc);
    const vat = Math.round(vatBase * 0.081 * 100) / 100;
    const total = Math.round((vatBase + vat) * 100) / 100;
    return {
      subtotal: overriddenSub,
      discount: disc,
      vat,
      total,
      packagePrice,
      addonLines,
      keyPickupCharged,
    };
  }
  return { ...pricing, packagePrice, addonLines, keyPickupCharged };
}

export function useWizardForm() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  return { state, dispatch } as const;
}

export function usePricing(state: WizardFormState, catalog: Product[]) {
  return useMemo(() => selectPricing(state, catalog), [state, catalog]);
}
