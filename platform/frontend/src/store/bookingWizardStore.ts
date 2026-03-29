import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BookingConfig, CatalogData, PhotographerInfo } from "../api/bookingPublic";

/** Weitere Personen vor Ort – nur Bestellung, keine Kundenkartei */
export type OnsiteContactRow = {
  name: string;
  phone: string;
  email: string;
  calendarInvite: boolean;
};

export type ObjectData = {
  type: string;
  area: string;
  floors: number;
  rooms: string;
  specials: string;
  desc: string;
  onsiteName: string;
  onsitePhone: string;
  onsiteEmail: string;
  onsiteCalendarInvite: boolean;
  additionalOnsiteContacts: OnsiteContactRow[];
};

export type SelectedPackage = {
  key: string;
  price: number;
  label: string;
  labelKey: string;
};

export type SelectedAddon = {
  id: string;
  group: string;
  label: string;
  labelKey: string;
  price: number;
  qty: number;
};

export type BillingData = {
  salutation: string;
  first_name: string;
  company: string;
  company_email: string;
  company_phone: string;
  name: string;
  email: string;
  phone: string;
  phone_mobile: string;
  street: string;
  zip: string;
  city: string;
  zipcity: string;
  order_ref: string;
  notes: string;
  alt_company: string;
  alt_company_email: string;
  alt_company_phone: string;
  alt_street: string;
  alt_zip: string;
  alt_city: string;
  alt_zipcity: string;
  alt_salutation: string;
  alt_first_name: string;
  alt_name: string;
  alt_email: string;
  alt_phone: string;
  alt_phone_mobile: string;
  alt_order_ref: string;
  alt_notes: string;
};

const EMPTY_BILLING: BillingData = {
  salutation: "", first_name: "", company: "", company_email: "", company_phone: "",
  name: "", email: "", phone: "", phone_mobile: "",
  street: "", zip: "", city: "", zipcity: "",
  order_ref: "", notes: "",
  alt_company: "", alt_company_email: "", alt_company_phone: "",
  alt_street: "", alt_zip: "", alt_city: "", alt_zipcity: "",
  alt_salutation: "", alt_first_name: "", alt_name: "",
  alt_email: "", alt_phone: "", alt_phone_mobile: "",
  alt_order_ref: "", alt_notes: "",
};

export const EMPTY_OBJECT: ObjectData = {
  type: "",
  area: "",
  floors: 1,
  rooms: "",
  specials: "",
  desc: "",
  onsiteName: "",
  onsitePhone: "",
  onsiteEmail: "",
  onsiteCalendarInvite: false,
  additionalOnsiteContacts: [],
};

export type BookingWizardState = {
  step: number;
  address: string;
  coords: { lat: number; lng: number } | null;
  parsedAddress: { street: string; houseNumber: string; zip: string; city: string } | null;
  object: ObjectData;
  selectedPackage: SelectedPackage | null;
  addons: SelectedAddon[];
  photographer: { key: string; name: string } | null;
  date: string;
  time: string;
  provisional: boolean;
  billing: BillingData;
  altBilling: boolean;
  discount: { code: string; percent: number; amount: number };
  keyPickup: { enabled: boolean; address: string; info: string };
  agbAccepted: boolean;
  slotPeriod: "am" | "pm";
  availableSlots: string[];
  slotsLoading: boolean;
  skillWarning: { show: boolean; skills: string[]; recommended: { key: string; name: string } | null };

  config: BookingConfig | null;
  catalog: CatalogData | null;
  photographers: PhotographerInfo[];
  configLoading: boolean;

  submitted: boolean;
  submitting: boolean;
  orderNo: number | null;

  setStep: (s: number) => void;
  setAddress: (addr: string) => void;
  setCoords: (c: { lat: number; lng: number } | null) => void;
  setParsedAddress: (p: { street: string; houseNumber: string; zip: string; city: string } | null) => void;
  setObject: (patch: Partial<ObjectData>) => void;
  setPackage: (pkg: SelectedPackage | null) => void;
  upsertAddon: (addon: SelectedAddon) => void;
  removeAddonGroup: (group: string) => void;
  removeAddon: (id: string) => void;
  setPhotographer: (p: { key: string; name: string } | null) => void;
  setDate: (d: string) => void;
  setTime: (t: string) => void;
  setProvisional: (p: boolean) => void;
  setBilling: (patch: Partial<BillingData>) => void;
  setAltBilling: (v: boolean) => void;
  setDiscount: (d: { code: string; percent: number; amount: number }) => void;
  setKeyPickup: (patch: Partial<{ enabled: boolean; address: string; info: string }>) => void;
  setAgbAccepted: (v: boolean) => void;
  setSlotPeriod: (p: "am" | "pm") => void;
  setAvailableSlots: (s: string[]) => void;
  setSlotsLoading: (v: boolean) => void;
  setSkillWarning: (w: BookingWizardState["skillWarning"]) => void;

  setConfig: (c: BookingConfig) => void;
  setCatalog: (c: CatalogData) => void;
  setPhotographers: (p: PhotographerInfo[]) => void;
  setConfigLoading: (v: boolean) => void;
  setSubmitting: (v: boolean) => void;
  setSubmitted: (orderNo: number | null) => void;

  reset: () => void;
};

const INITIAL: Omit<BookingWizardState,
  "setStep" | "setAddress" | "setCoords" | "setParsedAddress" | "setObject" | "setPackage" |
  "upsertAddon" | "removeAddonGroup" | "removeAddon" | "setPhotographer" | "setDate" |
  "setTime" | "setProvisional" | "setBilling" | "setAltBilling" | "setDiscount" |
  "setKeyPickup" | "setAgbAccepted" | "setSlotPeriod" | "setAvailableSlots" |
  "setSlotsLoading" | "setSkillWarning" | "setConfig" | "setCatalog" | "setPhotographers" |
  "setConfigLoading" | "setSubmitting" | "setSubmitted" | "reset"
> = {
  step: 1,
  address: "",
  coords: null,
  parsedAddress: null,
  object: { ...EMPTY_OBJECT },
  selectedPackage: null,
  addons: [],
  photographer: null,
  date: "",
  time: "",
  provisional: false,
  billing: { ...EMPTY_BILLING },
  altBilling: false,
  discount: { code: "", percent: 0, amount: 0 },
  keyPickup: { enabled: false, address: "", info: "" },
  agbAccepted: false,
  slotPeriod: "am",
  availableSlots: [],
  slotsLoading: false,
  skillWarning: { show: false, skills: [], recommended: null },
  config: null,
  catalog: null,
  photographers: [],
  configLoading: false,
  submitted: false,
  submitting: false,
  orderNo: null,
};

export const useBookingWizardStore = create<BookingWizardState>()(
  persist(
    (set) => ({
      ...INITIAL,

      setStep: (step) => set({ step }),
      setAddress: (address) => set({ address }),
      setCoords: (coords) => set({ coords }),
      setParsedAddress: (parsedAddress) => set({ parsedAddress }),
      setObject: (patch) => set((s) => ({ object: { ...s.object, ...patch } })),
      setPackage: (pkg) => set({ selectedPackage: pkg }),
      upsertAddon: (addon) => set((s) => {
        const filtered = s.addons.filter((a) => a.id !== addon.id);
        return { addons: [...filtered, addon] };
      }),
      removeAddonGroup: (group) => set((s) => ({ addons: s.addons.filter((a) => a.group !== group) })),
      removeAddon: (id) => set((s) => ({ addons: s.addons.filter((a) => a.id !== id) })),
      setPhotographer: (photographer) => set({ photographer }),
      setDate: (date) => set({ date, time: "", availableSlots: [] }),
      setTime: (time) => set({ time }),
      setProvisional: (provisional) => set({ provisional }),
      setBilling: (patch) => set((s) => ({ billing: { ...s.billing, ...patch } })),
      setAltBilling: (altBilling) => set({ altBilling }),
      setDiscount: (discount) => set({ discount }),
      setKeyPickup: (patch) => set((s) => ({ keyPickup: { ...s.keyPickup, ...patch } })),
      setAgbAccepted: (agbAccepted) => set({ agbAccepted }),
      setSlotPeriod: (slotPeriod) => set({ slotPeriod }),
      setAvailableSlots: (availableSlots) => set({ availableSlots }),
      setSlotsLoading: (slotsLoading) => set({ slotsLoading }),
      setSkillWarning: (skillWarning) => set({ skillWarning }),

      setConfig: (config) => set({ config }),
      setCatalog: (catalog) => set({ catalog }),
      setPhotographers: (photographers) => set({ photographers }),
      setConfigLoading: (configLoading) => set({ configLoading }),
      setSubmitting: (submitting) => set({ submitting }),
      setSubmitted: (orderNo) =>
        set({
          submitted: true,
          submitting: false,
          orderNo: orderNo != null && Number.isFinite(Number(orderNo)) ? Number(orderNo) : null,
        }),

      reset: () => set({ ...INITIAL }),
    }),
    {
      name: "propus-booking-wizard-draft",
      version: 5,
      merge: (persistedState, currentState) => {
        const p =
          persistedState && typeof persistedState === "object"
            ? { ...(persistedState as Record<string, unknown>) }
            : {};
        delete p.submitted;
        delete p.submitting;
        delete p.orderNo;
        return { ...currentState, ...p };
      },
      migrate: (persisted, fromVersion) => {
        let p: unknown = persisted;
        if (fromVersion < 2 && p && typeof p === "object" && "object" in p) {
          const po = p as { object?: Partial<ObjectData> } & Record<string, unknown>;
          const obj = po.object;
          if (obj) {
            p = {
              ...po,
              object: {
                ...EMPTY_OBJECT,
                ...obj,
                additionalOnsiteContacts: Array.isArray(obj.additionalOnsiteContacts) ? obj.additionalOnsiteContacts : [],
              },
            };
          }
        }
        if (fromVersion < 3 && p && typeof p === "object" && p !== null && "billing" in p) {
          const po = p as { billing?: Record<string, unknown> } & Record<string, unknown>;
          const b = po.billing && typeof po.billing === "object" ? po.billing : {};
          p = {
            ...po,
            billing: {
              ...b,
              alt_order_ref: typeof b.alt_order_ref === "string" ? b.alt_order_ref : "",
              alt_notes: typeof b.alt_notes === "string" ? b.alt_notes : "",
            },
          };
        }
        if (fromVersion < 4 && p && typeof p === "object" && p !== null) {
          const po = p as { photographer?: unknown; step?: unknown } & Record<string, unknown>;
          const step = typeof po.step === "number" ? po.step : 1;
          if (po.photographer === null && step >= 3) {
            p = { ...po, photographer: { key: "any", name: "" } };
          }
        }
        if (fromVersion < 5 && p && typeof p === "object" && p !== null) {
          const po = p as Record<string, unknown>;
          p = {
            ...po,
            keyPickup: { enabled: false, address: "", info: "" },
          };
        }
        return p;
      },
      partialize: (s) => ({
        step: s.step,
        address: s.address,
        coords: s.coords,
        parsedAddress: s.parsedAddress,
        object: s.object,
        selectedPackage: s.selectedPackage,
        addons: s.addons,
        photographer: s.photographer,
        date: s.date,
        time: s.time,
        provisional: s.provisional,
        billing: s.billing,
        altBilling: s.altBilling,
        discount: s.discount,
        slotPeriod: s.slotPeriod,
      }),
    },
  ),
);
