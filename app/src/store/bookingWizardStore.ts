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

/** Strukturierte Adresse (Wizard V2). `formatted` hält Volltext für Backward-Compat. */
export type StructuredAddress = {
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  canton: string;
  countryCode: string;
  lat: number | null;
  lng: number | null;
  formatted: string;
};

/** Ansprechpartner/Mitarbeiter einer Firma — wird beim Submit in customer_contacts upserted. */
export type BillingContact = {
  salutation: string;
  firstName: string;
  lastName: string;
  department: string;
  email: string;
  phone: string;
  phoneMobile: string;
};

export type BillingMode = "company" | "private";

/** Firmendaten + Rechnungsadresse (Haupt-Bestellung). */
export type BillingCompanyV2 = {
  name: string;
  uid: string;
  address: StructuredAddress;
  orderRef: string;
};

/** Privatpersonen-Daten (wenn Haupt-Modus = "private"). */
export type BillingPrivateV2 = {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneMobile: string;
  address: StructuredAddress;
};

/** Kontakt-Stub für Alternative Rechnungsadresse (weniger Felder als Hauptkontakt). */
export type BillingAltContact = {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/** Alternative Rechnungsadresse — nur bei Haupt-Modus "company". */
export type BillingAltV2 = {
  enabled: boolean;
  mode: BillingMode;
  company: {
    name: string;
    uid: string;
    address: StructuredAddress;
    orderRef: string;
    contact: BillingAltContact;
  };
  private: {
    salutation: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: StructuredAddress;
    orderRef: string;
  };
  notes: string;
};

/** Strukturierter Billing-Slot (Wizard V2) — lebt parallel zu den flachen Legacy-Feldern in `BillingData`. */
export type BillingStructured = {
  mode: BillingMode;
  company: BillingCompanyV2;
  private: BillingPrivateV2;
  contacts: BillingContact[];
  altBilling: BillingAltV2;
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
  /** Strukturierte Objekt-Adresse (Wizard V2). Quelle der Wahrheit; `address`/`parsedAddress`/`coords` bleiben als Mirror. */
  address: StructuredAddress;
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
  /** Strukturierter Slot (Wizard V2). Quelle der Wahrheit beim Submit; flache Felder werden daraus abgeleitet. */
  structured: BillingStructured;
};

/** Factory: leere strukturierte Adresse (deep-clone-sicher). */
export function makeEmptyStructuredAddress(): StructuredAddress {
  return {
    street: "",
    houseNumber: "",
    zip: "",
    city: "",
    canton: "",
    countryCode: "CH",
    lat: null,
    lng: null,
    formatted: "",
  };
}

/** Factory: leerer Billing-Kontakt. */
export function makeEmptyBillingContact(): BillingContact {
  return {
    salutation: "",
    firstName: "",
    lastName: "",
    department: "",
    email: "",
    phone: "",
    phoneMobile: "",
  };
}

/** Factory: leerer strukturierter Billing-Slot (enthält 1 leeren Kontakt — min. 1 Pflicht im Firma-Modus). */
export function makeEmptyBillingStructured(): BillingStructured {
  return {
    mode: "company",
    company: {
      name: "",
      uid: "",
      address: makeEmptyStructuredAddress(),
      orderRef: "",
    },
    private: {
      salutation: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      phoneMobile: "",
      address: makeEmptyStructuredAddress(),
    },
    contacts: [makeEmptyBillingContact()],
    altBilling: {
      enabled: false,
      mode: "company",
      company: {
        name: "",
        uid: "",
        address: makeEmptyStructuredAddress(),
        orderRef: "",
        contact: { salutation: "", firstName: "", lastName: "", email: "", phone: "" },
      },
      private: {
        salutation: "",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        address: makeEmptyStructuredAddress(),
        orderRef: "",
      },
      notes: "",
    },
  };
}

/** Baut den Volltext-String aus den strukturierten Adressfeldern. */
export function formatStructuredAddress(a: StructuredAddress): string {
  const line1 = [a.street, a.houseNumber].filter((v) => v && v.trim()).join(" ").trim();
  const line2 = [a.zip, a.city].filter((v) => v && v.trim()).join(" ").trim();
  return [line1, line2].filter(Boolean).join(", ");
}

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
  structured: makeEmptyBillingStructured(),
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
  address: makeEmptyStructuredAddress(),
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

  /** Session: letzte Kontext-Signatur, für die automatisch ein Datum gesetzt wurde (nicht persistiert). */
  scheduleAutoPickSignature: string | null;

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

  setScheduleAutoPickSignature: (sig: string | null) => void;

  /** Wizard V2: strukturierte Setter */
  setObjectAddress: (patch: Partial<StructuredAddress>) => void;
  setBillingMode: (mode: BillingMode) => void;
  setBillingCompany: (patch: Partial<BillingCompanyV2>) => void;
  setBillingCompanyAddress: (patch: Partial<StructuredAddress>) => void;
  setBillingPrivate: (patch: Partial<BillingPrivateV2>) => void;
  setBillingPrivateAddress: (patch: Partial<StructuredAddress>) => void;
  setBillingContact: (index: number, patch: Partial<BillingContact>) => void;
  addBillingContact: () => void;
  removeBillingContact: (index: number) => void;
  setBillingAlt: (patch: Partial<Omit<BillingAltV2, "company" | "private">>) => void;
  setBillingAltCompany: (patch: Partial<BillingAltV2["company"]>) => void;
  setBillingAltCompanyAddress: (patch: Partial<StructuredAddress>) => void;
  setBillingAltCompanyContact: (patch: Partial<BillingAltContact>) => void;
  setBillingAltPrivate: (patch: Partial<BillingAltV2["private"]>) => void;
  setBillingAltPrivateAddress: (patch: Partial<StructuredAddress>) => void;

  reset: () => void;
};

const INITIAL: Omit<BookingWizardState,
  "setStep" | "setAddress" | "setCoords" | "setParsedAddress" | "setObject" | "setPackage" |
  "upsertAddon" | "removeAddonGroup" | "removeAddon" | "setPhotographer" | "setDate" |
  "setTime" | "setProvisional" | "setBilling" | "setAltBilling" | "setDiscount" |
  "setKeyPickup" | "setAgbAccepted" | "setSlotPeriod" | "setAvailableSlots" |
  "setSlotsLoading" | "setSkillWarning" | "setConfig" | "setCatalog" | "setPhotographers" |
  "setConfigLoading" | "setSubmitting" | "setSubmitted" | "setScheduleAutoPickSignature" |
  "setObjectAddress" | "setBillingMode" | "setBillingCompany" | "setBillingCompanyAddress" |
  "setBillingPrivate" | "setBillingPrivateAddress" | "setBillingContact" |
  "addBillingContact" | "removeBillingContact" |
  "setBillingAlt" | "setBillingAltCompany" | "setBillingAltCompanyAddress" |
  "setBillingAltCompanyContact" | "setBillingAltPrivate" | "setBillingAltPrivateAddress" |
  "reset"
> = {
  step: 1,
  address: "",
  coords: null,
  parsedAddress: null,
  object: { ...EMPTY_OBJECT, address: makeEmptyStructuredAddress() },
  selectedPackage: null,
  addons: [],
  photographer: null,
  date: "",
  time: "",
  provisional: false,
  billing: { ...EMPTY_BILLING, structured: makeEmptyBillingStructured() },
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
  scheduleAutoPickSignature: null,
};

function updateStructured(
  s: BookingWizardState,
  updater: (prev: BillingStructured) => BillingStructured,
): Pick<BookingWizardState, "billing"> {
  return { billing: { ...s.billing, structured: updater(s.billing.structured) } };
}

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

      setScheduleAutoPickSignature: (scheduleAutoPickSignature) => set({ scheduleAutoPickSignature }),

      setObjectAddress: (patch) => set((s) => {
        const next = { ...s.object.address, ...patch };
        next.formatted = formatStructuredAddress(next);
        return { object: { ...s.object, address: next } };
      }),

      setBillingMode: (mode) => set((s) => updateStructured(s, (prev) => ({ ...prev, mode }))),

      setBillingCompany: (patch) => set((s) => updateStructured(s, (prev) => ({
        ...prev,
        company: { ...prev.company, ...patch },
      }))),

      setBillingCompanyAddress: (patch) => set((s) => updateStructured(s, (prev) => {
        const nextAddr = { ...prev.company.address, ...patch };
        nextAddr.formatted = formatStructuredAddress(nextAddr);
        return { ...prev, company: { ...prev.company, address: nextAddr } };
      })),

      setBillingPrivate: (patch) => set((s) => updateStructured(s, (prev) => ({
        ...prev,
        private: { ...prev.private, ...patch },
      }))),

      setBillingPrivateAddress: (patch) => set((s) => updateStructured(s, (prev) => {
        const nextAddr = { ...prev.private.address, ...patch };
        nextAddr.formatted = formatStructuredAddress(nextAddr);
        return { ...prev, private: { ...prev.private, address: nextAddr } };
      })),

      setBillingContact: (index, patch) => set((s) => updateStructured(s, (prev) => {
        if (index < 0 || index >= prev.contacts.length) return prev;
        const nextContacts = prev.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c));
        return { ...prev, contacts: nextContacts };
      })),

      addBillingContact: () => set((s) => updateStructured(s, (prev) => ({
        ...prev,
        contacts: [...prev.contacts, makeEmptyBillingContact()],
      }))),

      removeBillingContact: (index) => set((s) => updateStructured(s, (prev) => {
        if (prev.contacts.length <= 1) return prev;
        if (index < 0 || index >= prev.contacts.length) return prev;
        return { ...prev, contacts: prev.contacts.filter((_, i) => i !== index) };
      })),

      setBillingAlt: (patch) => set((s) => updateStructured(s, (prev) => ({
        ...prev,
        altBilling: { ...prev.altBilling, ...patch },
      }))),

      setBillingAltCompany: (patch) => set((s) => updateStructured(s, (prev) => ({
        ...prev,
        altBilling: { ...prev.altBilling, company: { ...prev.altBilling.company, ...patch } },
      }))),

      setBillingAltCompanyAddress: (patch) => set((s) => updateStructured(s, (prev) => {
        const nextAddr = { ...prev.altBilling.company.address, ...patch };
        nextAddr.formatted = formatStructuredAddress(nextAddr);
        return {
          ...prev,
          altBilling: { ...prev.altBilling, company: { ...prev.altBilling.company, address: nextAddr } },
        };
      })),

      setBillingAltCompanyContact: (patch) => set((s) => updateStructured(s, (prev) => ({
        ...prev,
        altBilling: {
          ...prev.altBilling,
          company: {
            ...prev.altBilling.company,
            contact: { ...prev.altBilling.company.contact, ...patch },
          },
        },
      }))),

      setBillingAltPrivate: (patch) => set((s) => updateStructured(s, (prev) => ({
        ...prev,
        altBilling: { ...prev.altBilling, private: { ...prev.altBilling.private, ...patch } },
      }))),

      setBillingAltPrivateAddress: (patch) => set((s) => updateStructured(s, (prev) => {
        const nextAddr = { ...prev.altBilling.private.address, ...patch };
        nextAddr.formatted = formatStructuredAddress(nextAddr);
        return {
          ...prev,
          altBilling: { ...prev.altBilling, private: { ...prev.altBilling.private, address: nextAddr } },
        };
      })),

      /** Leert die Buchung (Schritt 1), behält geladenes Config/Katalog/Fotografen — vermeidet leeren Wizard ohne erneuten Fetch. */
      reset: () =>
        set((s) => ({
          ...INITIAL,
          object: { ...EMPTY_OBJECT, address: makeEmptyStructuredAddress() },
          billing: { ...EMPTY_BILLING, structured: makeEmptyBillingStructured() },
          config: s.config,
          catalog: s.catalog,
          photographers: s.photographers,
          configLoading: false,
          scheduleAutoPickSignature: null,
        })),
    }),
    {
      name: "propus-booking-wizard-draft",
      version: 6,
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
        if (fromVersion < 6 && p && typeof p === "object" && p !== null) {
          const po = p as Record<string, unknown>;
          const objRaw = po.object && typeof po.object === "object" ? (po.object as Record<string, unknown>) : {};
          const parsed = po.parsedAddress && typeof po.parsedAddress === "object" ? (po.parsedAddress as Record<string, unknown>) : null;
          const coords = po.coords && typeof po.coords === "object" ? (po.coords as Record<string, unknown>) : null;
          const addressText = typeof po.address === "string" ? po.address : "";

          const objectAddress: StructuredAddress = {
            ...makeEmptyStructuredAddress(),
            street: typeof parsed?.street === "string" ? parsed.street : "",
            houseNumber: typeof parsed?.houseNumber === "string" ? parsed.houseNumber : "",
            zip: typeof parsed?.zip === "string" ? parsed.zip : "",
            city: typeof parsed?.city === "string" ? parsed.city : "",
            lat: typeof coords?.lat === "number" ? coords.lat : null,
            lng: typeof coords?.lng === "number" ? coords.lng : null,
            formatted: addressText,
          };
          if (!objectAddress.formatted) {
            objectAddress.formatted = formatStructuredAddress(objectAddress);
          }

          const billingRaw = po.billing && typeof po.billing === "object" ? (po.billing as Record<string, unknown>) : {};

          p = {
            ...po,
            object: {
              ...EMPTY_OBJECT,
              ...objRaw,
              address: objectAddress,
            },
            billing: {
              ...EMPTY_BILLING,
              ...billingRaw,
              structured: makeEmptyBillingStructured(),
            },
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
        keyPickup: s.keyPickup,
        slotPeriod: s.slotPeriod,
        agbAccepted: s.agbAccepted,
      }),
    },
  ),
);
