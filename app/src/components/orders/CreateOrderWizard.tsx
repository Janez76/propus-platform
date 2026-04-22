import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  User,
  Building2,
  Package,
  Calendar as CalendarIcon,
  CreditCard,
  Check,
  Clock,
  AlertCircle,
  UserPlus,
  Users,
  Plus,
  Trash2,
} from "lucide-react";
import { createOrder, updateOrderStatus, resendEmail } from "../../api/orders";
import { getProducts, type Product } from "../../api/products";
import { getPhotographers, type Photographer } from "../../api/photographers";
import { getCustomerContacts, type Customer, type CustomerContact } from "../../api/customers";
import { CustomerAutocompleteInput } from "../ui/CustomerAutocompleteInput";
import { AddressAutocompleteInput, type ParsedAddress } from "../ui/AddressAutocompleteInput";
import { StructuredAddressForm } from "../address/StructuredAddressForm";
import { randomUUID } from "../../lib/selekto/randomId";
import { DbFieldHint } from "../ui/DbFieldHint";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../ui/dialog";
import { cn } from "../../lib/utils";
import { formatPhoneCH } from "../../lib/format";
import { t, type Lang } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { STATUS_KEYS, STATUS_MAP, type StatusKey } from "../../lib/status";
import { API_BASE } from "../../api/client";

interface CreateOrderWizardProps {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  initialCustomer?: Customer | null;
  onSuccess: () => void;
}

type OnsiteContactRow = {
  name: string;
  phone: string;
  email: string;
  calendarInvite: boolean;
};

type OrderFormData = {
  // Customer / Billing
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
  billingOrderRef: string;
  // Abweichende Rechnungsadresse
  altBilling: boolean;
  altCompany: string;
  altFirstName: string;
  altName: string;
  altStreet: string;
  /** Getrennt wie Buchung; vor Submit → eine `altStreet`-Zeile fürs Backend. */
  altHouseNumber: string;
  altZip: string;
  altCity: string;
  altZipcity: string;
  altEmail: string;
  altOrderRef: string;
  altNotes: string;
  // Kontakt vor Ort
  onsiteName: string;
  onsitePhone: string;
  onsiteEmail: string;
  onsiteCalendarInvite: boolean;
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
  specials: string;
  desc: string;
  // Service
  packageLabel: string;
  packagePrice: string;
  addonsText: string;
  // Schedule
  date: string;
  time: string;
  provisional: boolean;
  durationMin: string;
  photographerKey: string;
  // Pricing
  subtotal: string;
  discount: string;
  vat: string;
  total: string;
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
};

/** Trennt „Bahnhofstrasse 12a“ in Strasse + Hausnummer (gleiche Heuristik wie Buchung). */
function splitSwissStreetLine(line: string): { street: string; houseNumber: string } {
  const t = (line || "").trim();
  if (!t) return { street: "", houseNumber: "" };
  const m = t.match(/^(.*?)(?:\s+(\d+[A-Za-z]?[\w/-]*))$/);
  if (!m) return { street: t, houseNumber: "" };
  return { street: String(m[1] || "").trim(), houseNumber: String(m[2] || "").trim() };
}

const EMPTY_FORM: OrderFormData = {
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
  billingOrderRef: "",
  altBilling: false,
  altCompany: "",
  altFirstName: "",
  altName: "",
  altStreet: "",
  altHouseNumber: "",
  altZip: "",
  altCity: "",
  altZipcity: "",
  altEmail: "",
  altOrderRef: "",
  altNotes: "",
  onsiteName: "",
  onsitePhone: "",
  onsiteEmail: "",
  onsiteCalendarInvite: false,
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
  specials: "",
  desc: "",
  packageLabel: "",
  packagePrice: "0",
  addonsText: "",
  date: "",
  time: "",
  provisional: false,
  durationMin: "60",
  photographerKey: "",
  subtotal: "0",
  discount: "0",
  vat: "0",
  total: "0",
  discountCode: "",
  notes: "",
  keyPickupActive: false,
  keyPickupAddress: "",
  objectCanton: "",
  travelZone: "",
  travelZoneProduct: "",
  travelZonePrice: 0,
  travelZoneLabel: "",
};

// Availability response from /api/admin/availability
type AvailabilityResponse = {
  ok?: boolean;
  freeSlots?: string[];
  resolvedPhotographer?: string | null;
  availabilityMap?: Record<string, string[]>;
  result?: { photographer?: string; time?: string; key?: string } | null;
  debug?: { durationMin?: number; slotMinutes?: number; bufferMinutes?: number };
};

export function CreateOrderWizard({ token, open, onOpenChange, initialDate, initialCustomer, onSuccess }: CreateOrderWizardProps) {
  const lang = useAuthStore((s) => s.language) as Lang;

  // Form state
  const [formData, setFormData] = useState<OrderFormData>({ ...EMPTY_FORM });
  const [selectedPackageCode, setSelectedPackageCode] = useState("");
  const [selectedAddonCodes, setSelectedAddonCodes] = useState<string[]>([]);
  const [additionalOnsiteContacts, setAdditionalOnsiteContacts] = useState<OnsiteContactRow[]>([]);
  const [initialStatus, setInitialStatus] = useState<StatusKey>("pending");

  // Catalog & photographers
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);

  // Slot picker state
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotPeriod, setSlotPeriod] = useState<"am" | "pm">("am");
  const [calculatedDuration, setCalculatedDuration] = useState<number | null>(null);
  const [suggestedPhotographerKey, setSuggestedPhotographerKey] = useState<string | null>(null);

  // Email targets state (default: E-Mails aktiviert, Kunde als Ziel für Bestätigungsmail)
  const [sendStatusEmails, setSendStatusEmails] = useState(true);
  const [statusEmailTargets, setStatusEmailTargets] = useState({ customer: true, office: false, photographer: false, cc: false });
  const [sendConfirmationRequest, setSendConfirmationRequest] = useState(true);

  // Customer & contact state
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>(""); // "" = none/new, "new" = manual, "N" = contact id

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successOrderNo, setSuccessOrderNo] = useState<string | null>(null);

  // Abort controller for availability calls
  const abortRef = useRef<AbortController | null>(null);
  const billingAddressSessionRef = useRef(randomUUID());
  const altAddressSessionRef = useRef(randomUUID());

  const inputClass = cn(
    "w-full rounded-lg border px-3 py-2 text-sm transition-colors",
    "bg-[var(--surface)]",
    "border-[var(--border-soft)]",
    "text-[var(--text-main)]",
    "placeholder:text-slate-400 placeholder:text-[var(--text-subtle)]",
    "hover:border-slate-300 hover:border-[var(--border-soft)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]",
  );
  const labelClass = "block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1.5";
  const sectionClass = "rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5";
  const sectionTitleClass = "flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4";

  // ── Load catalog + photographers on open ──────────────────────────────────
  useEffect(() => {
    if (!open) return;
    getProducts(token, false).then(setCatalog).catch(() => {});
    getPhotographers(token).then(setPhotographers).catch(() => {});
  }, [open, token]);

  // ── Initialise date from prop ─────────────────────────────────────────────
  useEffect(() => {
    if (!open || !initialDate) return;
    setFormData((prev) => ({ ...prev, date: initialDate }));
  }, [open, initialDate]);

  // ── Initialise customer from prop (z. B. aus Kundenansicht) ───────────────
  useEffect(() => {
    if (!open || !initialCustomer) return;
    const isSynthEmail = (e?: string) => String(e || "").toLowerCase().endsWith("@company.local");
    const zipcity = initialCustomer.zipcity || [initialCustomer.zip, initialCustomer.city].filter(Boolean).join(" ");
    const zipMatch = zipcity.match(/^(\d{4,5})\s+(.+)$/);
    const { street: billStreet, houseNumber: billHn } = splitSwissStreetLine(initialCustomer.street || "");
    setFormData((prev) => ({
      ...prev,
      customerName: initialCustomer.name || "",
      customerEmail: isSynthEmail(initialCustomer.email) ? "" : (initialCustomer.email || ""),
      customerPhone: initialCustomer.phone || "",
      company: initialCustomer.company || "",
      billingStreet: billStreet,
      billingHouseNumber: billHn,
      billingZipcity: zipcity,
      billingZip: zipMatch ? zipMatch[1] : (initialCustomer.zip || ""),
      billingCity: zipMatch ? zipMatch[2] : (initialCustomer.city || zipcity),
      onsiteName: "",
      onsitePhone: "",
    }));
    billingAddressSessionRef.current = randomUUID();
    setSelectedContactId("");
    setCustomerContacts([]);
    if (initialCustomer.id && token) {
      getCustomerContacts(token, initialCustomer.id)
        .then((contacts) => setCustomerContacts(contacts))
        .catch(() => {});
    }
  }, [open, initialCustomer, token]);

  // ── Auto-Lookup Anfahrtszone wenn ZIP/Kanton sich aendert ─────────────────
  const prevZipRef = useRef("");
  useEffect(() => {
    if (!open) return;
    const zip = formData.zip || extractSwissZip(formData.address) || extractSwissZip(formData.zipcity);
    if (!zip) return;
    // Nur erneut nachschlagen wenn sich die PLZ tatsaechlich geaendert hat
    if (zip === prevZipRef.current && formData.travelZone) return;
    prevZipRef.current = zip;
    const canton = formData.objectCanton || "";
    lookupTravelZone(canton, zip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.zip, formData.objectCanton, formData.zipcity, open]);

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) return;
    setFormData({ ...EMPTY_FORM });
    setSelectedPackageCode("");
    setSelectedAddonCodes([]);
    setAdditionalOnsiteContacts([]);
    setInitialStatus("pending");
    setAvailableSlots([]);
    setSlotsLoading(false);
    setSlotsError("");
    setCalculatedDuration(null);
    setSuggestedPhotographerKey(null);
    setSendStatusEmails(true);
    setStatusEmailTargets({ customer: true, office: false, photographer: false, cc: false });
    setSendConfirmationRequest(true);
    setSuccessOrderNo(null);
    setError("");
    setCustomerContacts([]);
    setSelectedContactId("");
  }, [open]);

  // ── Fetch availability slots ──────────────────────────────────────────────
  useEffect(() => {
    const date = formData.date;
    if (!date) {
      setAvailableSlots([]);
      setSlotsError("");
      setCalculatedDuration(null);
      setSuggestedPhotographerKey(null);
      return;
    }

    // Abort previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setSlotsLoading(true);
    setSlotsError("");
    setAvailableSlots([]);
    setSuggestedPhotographerKey(null);

    const isAny = !formData.photographerKey;
    const params = new URLSearchParams({
      date,
      time: "00:00",
      photographer: formData.photographerKey || "any",
      sqm: String(Number(formData.area) || 0),
      package: selectedPackageCode,
      addons: selectedAddonCodes.join(","),
    });

    const url = `${API_BASE}/api/admin/availability?${params.toString()}`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: AvailabilityResponse) => {
        if (controller.signal.aborted) return;

        let slots: string[] = [];
        if (Array.isArray(data.freeSlots)) {
          // specific photographer: freeSlots returned directly
          slots = data.freeSlots;
        } else if (isAny && data.resolvedPhotographer && Array.isArray(data.freeSlots)) {
          slots = data.freeSlots;
        } else if (isAny && data.resolvedPhotographer) {
          // "any" mode: server now returns resolvedPhotographer + freeSlots
          slots = Array.isArray(data.freeSlots) ? data.freeSlots : [];
          setSuggestedPhotographerKey(data.resolvedPhotographer);
        } else if (isAny && data.result && typeof data.result === "object") {
          // fallback: use availabilityMap for resolved photographer
          const rKey = (data.result as { key?: string }).key;
          if (rKey && data.availabilityMap && Array.isArray(data.availabilityMap[rKey])) {
            slots = data.availabilityMap[rKey];
            setSuggestedPhotographerKey(rKey);
          } else if ((data.result as { time?: string }).time) {
            slots = [(data.result as { time: string }).time];
          }
        }

        // for "any" mode set suggestedPhotographerKey from resolvedPhotographer field
        if (isAny && data.resolvedPhotographer) {
          setSuggestedPhotographerKey(data.resolvedPhotographer);
        }

        setAvailableSlots(slots);
        if (data.debug?.durationMin) setCalculatedDuration(data.debug.durationMin);

        // Update formData.durationMin from server calculation
        if (data.debug?.durationMin) {
          setFormData((prev) => ({ ...prev, durationMin: String(data.debug!.durationMin) }));
        }

        // If selected time is no longer available, clear it
        setFormData((prev) => {
          if (prev.time && !slots.includes(prev.time)) {
            return { ...prev, time: "" };
          }
          return prev;
        });

        setSlotsLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setSlotsLoading(false);
        setSlotsError(String((err as Error)?.message || "Fehler beim Laden der Slots"));
      });

    return () => {
      controller.abort();
    };
  }, [formData.date, formData.photographerKey, formData.area, selectedPackageCode, selectedAddonCodes, token]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const updateField = <K extends keyof OrderFormData>(key: K, value: OrderFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (error) setError("");
  };

  function isObjectAddressComplete(): boolean {
    if (formData.address.trim() && formData.houseNumber.trim() && formData.zipcity.trim()) return true;
    const raw = formData.address.trim();
    if (!raw) return false;
    const hasHouseNumber = /\b\d+[a-zA-Z]?\b/.test(raw);
    const hasZipCity = /\b\d{4,5}\s+[A-Za-z\u00C0-\u00FF][^,]*$/u.test(raw) || /\b\d{4,5}\s+[A-Za-z\u00C0-\u00FF]/u.test(raw);
    return hasHouseNumber && hasZipCity;
  }

  /** Extrahiert die erste 4-stellige Schweizer PLZ aus einem Adress-String */
  function extractSwissZip(address: string): string {
    const m = address.match(/\b(\d{4})\b/);
    return m ? m[1] : "";
  }

  async function lookupTravelZone(canton: string, zip: string) {
    if (!canton && !zip) return;
    try {
      const base = API_BASE || "";
      const url = new URL(`/api/travel-zone?canton=${encodeURIComponent(canton)}&zip=${encodeURIComponent(zip)}`, base || window.location.origin);
      const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      const data = await r.json() as { ok?: boolean; zone?: string; productCode?: string; price?: number; label?: string };
      if (!data.ok) return;
      setFormData((prev) => {
        const newZonePrice = Number(data.price ?? 0);
        const oldZonePrice = prev.travelZonePrice;
        const sub = Math.max(0, Number(prev.subtotal || 0) - oldZonePrice + newZonePrice);
        const dis = Number(prev.discount || 0);
        const vatBase = Math.max(0, sub - dis);
        const vat = Math.round(vatBase * 0.081 * 100) / 100;
        const total = Math.round((vatBase + vat) * 100) / 100;
        return {
          ...prev,
          objectCanton: canton,
          travelZone: data.zone || "",
          travelZoneProduct: data.productCode || "",
          travelZonePrice: newZonePrice,
          travelZoneLabel: data.label || "",
          subtotal: String(sub),
          vat: String(vat),
          total: String(total),
        };
      });
    } catch { /* travel zone lookup failed silently */ }
  }

  function estimatePrice(product: Product): number {
    const rule = product.rules?.[0];
    const cfg = (rule?.config_json || {}) as Record<string, unknown>;
    const floors = Math.max(1, Number(formData.floors || 1));
    const area = Number(formData.area || 0);
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

  function syncServiceFields(nextPackageCode: string, nextAddonCodes: string[]) {
    const pkg = catalog.find((p) => p.code === nextPackageCode);
    const selectedAddons = catalog.filter((p) => nextAddonCodes.includes(p.code));
    const packagePrice = pkg ? estimatePrice(pkg) : 0;
    const addonTotal = selectedAddons.reduce((sum, a) => sum + estimatePrice(a), 0);
    const addonRows = selectedAddons.map((a) => `${a.name};${estimatePrice(a)}`);
    // Key-pickup adds 50 CHF if active and has text
    setFormData((prev) => {
      const keyPickupPrice = prev.keyPickupActive && prev.keyPickupAddress.trim() ? 50 : 0;
      const travelZonePrice = prev.travelZonePrice || 0;
      const subtotal = packagePrice + addonTotal + keyPickupPrice + travelZonePrice;
      const discount = Number(prev.discount || 0);
      const vatRate = 0.081; // 8.1% Swiss VAT
      const vatBase = Math.max(0, subtotal - discount);
      const vat = Math.round(vatBase * vatRate * 100) / 100;
      const total = Math.round((vatBase + vat) * 100) / 100;
      return {
        ...prev,
        packageLabel: pkg?.name || "",
        packagePrice: String(packagePrice || 0),
        addonsText: addonRows.join("\n"),
        subtotal: String(subtotal),
        vat: String(vat),
        total: String(total),
      };
    });
  }

  const slotNeedsSchedule = initialStatus === "confirmed" || initialStatus === "provisional";

  function validateAll(): string | null {
    if (!formData.customerName.trim()) return t(lang, "wizard.error.requiredFields");
    if (!formData.customerEmail.trim()) return t(lang, "wizard.error.requiredFields");
    if (!formData.billingStreet.trim()) return t(lang, "wizard.error.requiredFields");
    if (!formData.billingHouseNumber.trim()) return t(lang, "wizard.error.requiredFields");
    if (!formData.billingZip.trim()) return t(lang, "wizard.error.requiredFields");
    if (!formData.billingCity.trim()) return t(lang, "wizard.error.requiredFields");
    if (!isObjectAddressComplete()) return t(lang, "wizard.error.requiredFields");
    if (slotNeedsSchedule) {
      if (!formData.photographerKey.trim()) return t(lang, "wizard.hint.statusRequiresSlot");
      if (!formData.date) return t(lang, "wizard.hint.statusRequiresSlot");
      if (!formData.time) return t(lang, "wizard.hint.statusRequiresSlot");
    }
    return null;
  }

  function handleSelectCustomer(customer: { id?: number; name?: string; email?: string; phone?: string; phone_mobile?: string; company?: string; salutation?: string; first_name?: string; onsite_name?: string; onsite_phone?: string; street?: string; zipcity?: string; [key: string]: unknown }) {
    const rawLine = customer.street || "";
    const { street, houseNumber: hn } = splitSwissStreetLine(rawLine);
    const zipcity = customer.zipcity || "";
    const zipMatch = zipcity.match(/^(\d{4,5})\s+(.+)$/);
    const isSynthEmail = (e?: string) => String(e || "").toLowerCase().endsWith("@company.local");
    setFormData((prev) => ({
      ...prev,
      salutation: customer.salutation || prev.salutation,
      first_name: customer.first_name || prev.first_name,
      customerName: customer.name || "",
      customerEmail: isSynthEmail(customer.email) ? "" : (customer.email || ""),
      customerPhone: customer.phone || "",
      customerPhoneMobile: customer.phone_mobile || prev.customerPhoneMobile,
      company: customer.company || "",
      onsiteName: "",
      onsitePhone: "",
      billingStreet: street,
      billingHouseNumber: hn,
      billingZipcity: zipcity,
      billingZip: zipMatch ? zipMatch[1] : "",
      billingCity: zipMatch ? zipMatch[2] : zipcity,
    }));
    billingAddressSessionRef.current = randomUUID();

    const cid = customer.id ?? null;
    setSelectedContactId("");
    setCustomerContacts([]);

    if (cid && token) {
      getCustomerContacts(token, cid)
        .then((contacts) => setCustomerContacts(contacts))
        .catch(() => {});
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateAll();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const selectedCatalogAddons = catalog.filter((p) => selectedAddonCodes.includes(p.code));
      let addons = selectedCatalogAddons.length
        ? selectedCatalogAddons.map((p) => ({ id: p.code, group: p.group_key, label: p.name, price: estimatePrice(p) }))
        : formData.addonsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, idx) => {
              const parts = line.split(";").map((p) => p.trim());
              return { id: `manual_${idx}`, label: parts[0] || `Addon ${idx + 1}`, price: Number(parts[1] || 0) };
            });

      if (formData.travelZoneProduct) {
        addons = [...addons, {
          id: formData.travelZoneProduct,
          label: formData.travelZoneLabel || `Anfahrt Zone ${formData.travelZone}`,
          price: formData.travelZonePrice,
        }];
      }

      const fmtPhone = (v: string) => formatPhoneCH(v) || (v || "").trim();
      const result = await createOrder(token, {
        // Billing / Kunde
        salutation: formData.salutation,
        first_name: formData.first_name,
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: fmtPhone(formData.customerPhone),
        customerPhoneMobile: fmtPhone(formData.customerPhoneMobile),
        company: formData.company,
        billingStreet: formData.billingStreet,
        billingHouseNumber: formData.billingHouseNumber,
        billingZip: formData.billingZip,
        billingCity: formData.billingCity,
        billingZipcity: formData.billingZipcity,
        billingOrderRef: formData.billingOrderRef,
        // Abweichende Rechnungsadresse
        altBilling: formData.altBilling,
        altCompany: formData.altCompany,
        altFirstName: formData.altFirstName,
        altName: formData.altName,
        altStreet: [formData.altStreet, formData.altHouseNumber].filter(Boolean).join(" ").trim(),
        altZip: formData.altZip,
        altCity: formData.altCity,
        altZipcity: formData.altZipcity,
        altEmail: formData.altEmail,
        altOrderRef: formData.altOrderRef,
        altNotes: formData.altNotes,
        // Vor-Ort-Kontakt
        onsiteName: formData.onsiteName,
        onsitePhone: fmtPhone(formData.onsitePhone),
        onsiteEmail: formData.onsiteEmail,
        onsiteCalendarInvite: formData.onsiteCalendarInvite,
        additionalOnsiteContacts: additionalOnsiteContacts.filter((c) => c.name.trim() || c.phone.trim()),
        attendeeEmails: formData.attendeeEmails,
        // Objekt
        address: formData.address,
        street: formData.street,
        zipcity: formData.zipcity,
        objectType: formData.objectType,
        area: Number(formData.area || 0),
        floors: Number(formData.floors || 1),
        rooms: formData.rooms,
        specials: formData.specials,
        desc: formData.desc,
        // Termin
        date: formData.date,
        time: formData.time,
        provisional: formData.provisional,
        durationMin: Number(formData.durationMin || 60),
        // Preise
        subtotal: Number(formData.subtotal || 0),
        discount: Number(formData.discount || 0),
        vat: Number(formData.vat || 0),
        total: Number(formData.total || 0),
        discountCode: formData.discountCode,
        notes: formData.notes,
        sendEmails: sendStatusEmails,
        photographerKey: formData.photographerKey,
        package: formData.packageLabel
          ? { key: selectedPackageCode || "manual", label: formData.packageLabel, price: Number(formData.packagePrice || 0) }
          : undefined,
        addons,
        keyPickup: formData.keyPickupActive && formData.keyPickupAddress.trim() ? { address: formData.keyPickupAddress.trim() } : null,
      });

      // If a non-pending initial status was selected, apply it now
      if (initialStatus !== "pending" && result?.orderNo) {
        try {
          // v2.3.25: CC-Empfänger erhalten Bestätigungsmail, wenn attendeeEmails ausgefüllt
          const targets = sendStatusEmails ? {
            ...statusEmailTargets,
            cc: statusEmailTargets.cc || !!formData.attendeeEmails?.trim(),
          } : undefined;
          await updateOrderStatus(token, result.orderNo, initialStatus, {
            sendEmails: sendStatusEmails,
            sendEmailTargets: targets,
          });
        } catch (_) {
          // Status change failed but order was created – surface as soft warning
        }
      }

      // Terminbestätigungsanfrage an Kunden senden
      if (sendConfirmationRequest && result?.orderNo && formData.customerEmail.trim()) {
        try {
          await resendEmail(token, String(result.orderNo), "confirmation_request");
        } catch (_) {
          // Bestätigungsmail fehlgeschlagen – Auftrag wurde trotzdem erstellt
        }
      }

      setSuccessOrderNo(String(result?.orderNo ?? ""));
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "wizard.error.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Slot rendering helpers ────────────────────────────────────────────────
  const amSlots = availableSlots.filter((s) => {
    const h = parseInt(s.split(":")[0], 10);
    return h < 12;
  });
  const pmSlots = availableSlots.filter((s) => {
    const h = parseInt(s.split(":")[0], 10);
    return h >= 12;
  });
  const displaySlots = slotPeriod === "am" ? amSlots : pmSlots;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>{t(lang, "wizard.title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">

          {/* ── Anfangsstatus + E-Mail-Zielgruppen ───────────────────────── */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <Check className="h-4 w-4 text-[var(--accent)]" />
              {t(lang, "wizard.label.initialStatus")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t(lang, "wizard.label.initialStatus")}</label>
                <select
                  value={initialStatus}
                  onChange={(e) => setInitialStatus(e.target.value as StatusKey)}
                  className={inputClass}
                >
                  {STATUS_KEYS.map((key) => (
                    <option key={key} value={key}>{STATUS_MAP[key].label}</option>
                  ))}
                </select>
                {slotNeedsSchedule && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {t(lang, "wizard.hint.statusRequiresSlot")}
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>{t(lang, "orderStatus.sendEmailsLabel")}</label>
                <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={sendStatusEmails}
                    onChange={(e) => setSendStatusEmails(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border-soft)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <span className="text-[var(--text-muted)]">{t(lang, "orderStatus.sendEmailsLabel")}</span>
                </label>
                <div className={`grid grid-cols-2 gap-2 text-xs ${sendStatusEmails ? "text-[var(--text-subtle)]" : "text-zinc-600 text-[var(--text-subtle)] opacity-70"}`}>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={statusEmailTargets.customer} disabled={!sendStatusEmails}
                      onChange={(e) => setStatusEmailTargets((p) => ({ ...p, customer: e.target.checked }))} />
                    <span>{t(lang, "orderStatus.target.customer")}</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={statusEmailTargets.office} disabled={!sendStatusEmails}
                      onChange={(e) => setStatusEmailTargets((p) => ({ ...p, office: e.target.checked }))} />
                    <span>{t(lang, "orderStatus.target.office")}</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={statusEmailTargets.photographer} disabled={!sendStatusEmails}
                      onChange={(e) => setStatusEmailTargets((p) => ({ ...p, photographer: e.target.checked }))} />
                    <span>{t(lang, "orderStatus.target.photographer")}</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={statusEmailTargets.cc} disabled={!sendStatusEmails}
                      onChange={(e) => setStatusEmailTargets((p) => ({ ...p, cc: e.target.checked }))} />
                    <span>{t(lang, "orderStatus.target.cc")}</span>
                  </label>
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--border-soft)]">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendConfirmationRequest}
                      onChange={(e) => setSendConfirmationRequest(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--border-soft)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <span className="text-[var(--text-muted)]">{t(lang, "wizard.label.sendConfirmationRequest")}</span>
                  </label>
                  <p className="mt-1 text-xs text-[var(--text-subtle)] ml-6">{t(lang, "wizard.hint.sendConfirmationRequest")}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Kunde & Objekt ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Kunde & Kontakt */}
            <div className={sectionClass}>
              <div className={sectionTitleClass}>
                <User className="h-4 w-4 text-[var(--accent)]" />
                {t(lang, "wizard.section.customerData")}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{t(lang, "booking.step4.salutation")}</label>
                    <select
                      value={formData.salutation}
                      onChange={(e) => updateField("salutation", e.target.value)}
                      className={inputClass}
                    >
                      <option value="">--</option>
                      <option value="Herr">{t(lang, "booking.step4.mr")}</option>
                      <option value="Frau">{t(lang, "booking.step4.mrs")}</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "booking.step4.firstName")}</label>
                    <input
                      type="text"
                      value={formData.first_name}
                      onChange={(e) => updateField("first_name", e.target.value)}
                      className={inputClass}
                      placeholder={t(lang, "booking.step4.firstName")}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "wizard.label.customerRequired")}</label>
                    <CustomerAutocompleteInput
                      required
                      value={formData.customerName}
                      onChange={(v) => updateField("customerName", v)}
                      onSelectCustomer={handleSelectCustomer}
                      token={token}
                      className={inputClass}
                      placeholder={t(lang, "wizard.placeholder.name")}
                    />
                    <DbFieldHint fieldPath="billing.name" />
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "wizard.label.emailRequired")}</label>
                    <CustomerAutocompleteInput
                      required
                      type="email"
                      value={formData.customerEmail}
                      onChange={(v) => updateField("customerEmail", v)}
                      onSelectCustomer={handleSelectCustomer}
                      token={token}
                      className={inputClass}
                      placeholder={t(lang, "wizard.placeholder.email")}
                    />
                    <DbFieldHint fieldPath="billing.email" />
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "common.phone")}</label>
                    <CustomerAutocompleteInput
                      type="tel"
                      value={formData.customerPhone}
                      onChange={(v) => updateField("customerPhone", v)}
                      onSelectCustomer={handleSelectCustomer}
                      token={token}
                      className={inputClass}
                      placeholder="+41 79 123 45 67"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "booking.step4.mobile")}</label>
                    <input
                      type="tel"
                      value={formData.customerPhoneMobile}
                      onChange={(e) => updateField("customerPhoneMobile", e.target.value)}
                      className={inputClass}
                      placeholder="+41 79 123 45 67"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>{t(lang, "common.company")}</label>
                    <CustomerAutocompleteInput
                      value={formData.company}
                      onChange={(v) => updateField("company", v)}
                      onSelectCustomer={handleSelectCustomer}
                      selectValue={(c) => c.company || ""}
                      token={token}
                      className={inputClass}
                      placeholder={t(lang, "wizard.placeholder.company")}
                    />
                  </div>
                </div>

                {/* Ansprechpartner (wenn Firma-Kontakte vorhanden) */}
                {customerContacts.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 border-[var(--border-soft)]">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Ansprechpartner
                    </p>
                    <div className="mb-3">
                      <select
                        value={selectedContactId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedContactId(val);
                          if (val === "" || val === "new") {
                            setFormData((prev) => ({ ...prev, customerName: "", customerEmail: "", customerPhone: "" }));
                          } else {
                            const contact = customerContacts.find((c) => String(c.id) === val);
                            if (contact) {
                              setFormData((prev) => ({
                                ...prev,
                                customerName: contact.name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
                                customerEmail: contact.email || prev.customerEmail,
                                customerPhone: contact.phone || contact.phone_direct || contact.phone_mobile || prev.customerPhone,
                              }));
                            }
                          }
                        }}
                        className={inputClass}
                      >
                        <option value="">— Kontakt auswählen —</option>
                        {customerContacts.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim()}
                            {c.role ? ` (${c.role})` : ""}
                          </option>
                        ))}
                        <option value="new">+ Manuell eingeben</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Rechnungsadresse (gleiche 4-Feld-Kaskade wie Buchung Schritt 1) */}
                <div className="pt-3 border-t border-slate-100 border-[var(--border-soft)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2">
                    {t(lang, "wizard.section.billingAddress")}
                  </p>
                  <div className="space-y-3">
                    <StructuredAddressForm
                      lang={lang}
                      className={{ input: inputClass, label: labelClass }}
                      value={{
                        street: formData.billingStreet,
                        houseNumber: formData.billingHouseNumber,
                        zip: formData.billingZip,
                        city: formData.billingCity,
                      }}
                      sessionToken={billingAddressSessionRef.current}
                      dataTestIdPrefix="order-wizard-billing"
                      onChangeStreet={(v) => updateField("billingStreet", v)}
                      onSelectStreet={(p: ParsedAddress) => {
                        setFormData((prev) => ({
                          ...prev,
                          billingStreet: p.street,
                          billingHouseNumber: p.houseNumber ?? "",
                          billingZip: p.zip || "",
                          billingCity: p.city || "",
                          billingZipcity: [p.zip, p.city].filter(Boolean).join(" "),
                        }));
                        billingAddressSessionRef.current = randomUUID();
                      }}
                      onChangeHouseNumber={(v) => updateField("billingHouseNumber", v)}
                      onSelectHouseNumber={(payload) => {
                        setFormData((prev) => {
                          const zip = payload.zip || prev.billingZip;
                          const city = payload.city || prev.billingCity;
                          return {
                            ...prev,
                            billingHouseNumber: payload.houseNumber,
                            ...(payload.zip ? { billingZip: payload.zip } : {}),
                            ...(payload.city ? { billingCity: payload.city } : {}),
                            billingZipcity: [zip, city].filter(Boolean).join(" "),
                          };
                        });
                      }}
                      onZipDigitsChange={(raw) => {
                        setFormData((prev) => ({
                          ...prev,
                          billingZip: raw,
                          billingZipcity: [raw, prev.billingCity].filter(Boolean).join(" "),
                        }));
                      }}
                    />
                    <DbFieldHint fieldPath="billing.street" />
                    <div>
                      <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
                      <input
                        type="text"
                        value={formData.billingOrderRef}
                        onChange={(e) => updateField("billingOrderRef", e.target.value)}
                        className={inputClass}
                        placeholder="Ref-Nr."
                      />
                    </div>
                  </div>
                </div>

                {/* Abweichende Rechnungsadresse */}
                <div className="pt-3 border-t border-slate-100 border-[var(--border-soft)]">
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={formData.altBilling}
                      onChange={(e) => updateField("altBilling", e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--border-soft)] text-[var(--accent)]"
                    />
                    <span className="text-sm text-[var(--text-muted)]">{t(lang, "booking.step4.altBilling")}</span>
                  </label>
                  {formData.altBilling && (
                    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 p-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-subtle)]">
                        {t(lang, "booking.step4.altBillingTitle")}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className={labelClass}>{t(lang, "booking.step4.company")}</label>
                          <input type="text" value={formData.altCompany} onChange={(e) => updateField("altCompany", e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>{t(lang, "booking.step4.firstName")}</label>
                          <input type="text" value={formData.altFirstName} onChange={(e) => updateField("altFirstName", e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>{t(lang, "booking.step4.lastName")}</label>
                          <input type="text" value={formData.altName} onChange={(e) => updateField("altName", e.target.value)} className={inputClass} />
                        </div>
                        <div className="sm:col-span-2">
                          <StructuredAddressForm
                            lang={lang}
                            className={{ input: inputClass, label: labelClass }}
                            value={{
                              street: formData.altStreet,
                              houseNumber: formData.altHouseNumber,
                              zip: formData.altZip,
                              city: formData.altCity,
                            }}
                            sessionToken={altAddressSessionRef.current}
                            dataTestIdPrefix="order-wizard-alt"
                            onChangeStreet={(v) => updateField("altStreet", v)}
                            onSelectStreet={(p: ParsedAddress) => {
                              setFormData((prev) => ({
                                ...prev,
                                altStreet: p.street,
                                altHouseNumber: p.houseNumber ?? "",
                                altZip: p.zip || "",
                                altCity: p.city || "",
                                altZipcity: [p.zip, p.city].filter(Boolean).join(" "),
                              }));
                              altAddressSessionRef.current = randomUUID();
                            }}
                            onChangeHouseNumber={(v) => updateField("altHouseNumber", v)}
                            onSelectHouseNumber={(payload) => {
                              setFormData((prev) => {
                                const z = payload.zip || prev.altZip;
                                const c = payload.city || prev.altCity;
                                return {
                                  ...prev,
                                  altHouseNumber: payload.houseNumber,
                                  ...(payload.zip ? { altZip: payload.zip } : {}),
                                  ...(payload.city ? { altCity: payload.city } : {}),
                                  altZipcity: [z, c].filter(Boolean).join(" "),
                                };
                              });
                            }}
                            onZipDigitsChange={(raw) => {
                              setFormData((prev) => ({
                                ...prev,
                                altZip: raw,
                                altZipcity: [raw, prev.altCity].filter(Boolean).join(" "),
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>{t(lang, "booking.step4.email")}</label>
                          <input type="email" value={formData.altEmail} onChange={(e) => updateField("altEmail", e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>{t(lang, "booking.step4.orderRef")}</label>
                          <input type="text" value={formData.altOrderRef} onChange={(e) => updateField("altOrderRef", e.target.value)} className={inputClass} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>{t(lang, "booking.step4.notes")}</label>
                          <textarea value={formData.altNotes} onChange={(e) => updateField("altNotes", e.target.value)} rows={2} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Objekt */}
            <div className={sectionClass}>
              <div className={sectionTitleClass}>
                <Building2 className="h-4 w-4 text-[var(--accent)]" />
                {t(lang, "wizard.section.objectData")}
              </div>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>{t(lang, "wizard.label.addressRequired")}</label>
                  <AddressAutocompleteInput
                    required
                    mode="street"
                    value={formData.address}
                    onChange={(v) => updateField("address", v)}
                    onBlur={() => {
                      // Fallback: Zone aus manuell eingetippter Adresse ableiten (kein Autocomplete-Select)
                      if (!formData.travelZone) {
                        const zip = formData.zip || extractSwissZip(formData.address);
                        if (zip) lookupTravelZone(formData.objectCanton || "", zip);
                      }
                    }}
                    onSelectParsed={(parsed) => {
                      setFormData((prev) => ({
                        ...prev,
                        address: parsed.display,
                        street: parsed.street,
                        houseNumber: parsed.houseNumber,
                        zip: parsed.zip,
                        city: parsed.city,
                        zipcity: `${parsed.zip} ${parsed.city}`.trim(),
                        objectCanton: parsed.canton || "",
                      }));
                      if (parsed.canton || parsed.zip) {
                        lookupTravelZone(parsed.canton || "", parsed.zip || "");
                      }
                    }}
                    onSelectZipcity={(zipcity) => {
                      if (!zipcity) return;
                      setFormData((prev) => ({ ...prev, zipcity }));
                      const zipFromZipcity = zipcity.match(/^(\d{4})/)?.[1] || "";
                      if (zipFromZipcity) lookupTravelZone("", zipFromZipcity);
                    }}
                    lang={lang}
                    className={inputClass}
                    placeholder="Bahnhofstrasse 12, 8001 Zürich"
                    minChars={3}
                  />
                  <DbFieldHint fieldPath="address.text" />
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">
                    {t(lang, "wizard.hint.fullStreetWithHouseNumber")}
                  </p>
                  {formData.address && !isObjectAddressComplete() && (
                    <p className="mt-1 text-xs text-amber-500">{t(lang, "wizard.hint.addressNeedsHouseNumber")}</p>
                  )}
                  {/* Anfahrtszone (automatisch erkannt) */}
                  {formData.travelZone && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20 px-3 py-2">
                      <span className="text-xs font-bold text-[var(--accent)]">
                        {t(lang, "wizard.travelZone.label")}:
                      </span>
                      <select
                        value={formData.travelZoneProduct}
                        onChange={(e) => {
                          const code = e.target.value;
                          if (!code) return;
                          const zoneLetter = code.replace("travel:zone-", "").toUpperCase();
                          const zoneProduct = catalog.find((p) => p.code === code);
                          const zonePrice = zoneProduct ? estimatePrice(zoneProduct) : 0;
                          setFormData((prev) => {
                            const oldZP = prev.travelZonePrice;
                            const sub = Math.max(0, Number(prev.subtotal || 0) - oldZP + zonePrice);
                            const dis = Number(prev.discount || 0);
                            const vatBase = Math.max(0, sub - dis);
                            const vat = Math.round(vatBase * 0.081 * 100) / 100;
                            const total = Math.round((vatBase + vat) * 100) / 100;
                            return {
                              ...prev,
                              travelZone: zoneLetter,
                              travelZoneProduct: code,
                              travelZonePrice: zonePrice,
                              travelZoneLabel: zoneProduct?.name || `Zone ${zoneLetter}`,
                              subtotal: String(sub),
                              vat: String(vat),
                              total: String(total),
                            };
                          });
                        }}
                        className="text-xs rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 text-[var(--text-main)]"
                      >
                        {catalog.filter((p) => p.group_key === "travel_zone").map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name} {estimatePrice(p) > 0 ? `(CHF ${estimatePrice(p)})` : `(${t(lang, "wizard.travelZone.included")})`}
                          </option>
                        ))}
                      </select>
                      <span className="ml-auto text-xs text-[var(--text-subtle)]">
                        {t(lang, "wizard.travelZone.auto")}
                      </span>
                    </div>
                  )}
                </div>
                {/* Vor-Ort-Kontakt – Auswahl aus Kundenkontakten oder manuell */}
                <div className="pt-3 border-t border-slate-100 border-[var(--border-soft)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2 flex items-center gap-1.5">
                    {customerContacts.length > 0
                      ? <Users className="h-3.5 w-3.5" />
                      : <UserPlus className="h-3.5 w-3.5" />}
                    {t(lang, "wizard.section.onsiteContact")}
                  </p>

                  {/* Kontakt-Auswahl-Dropdown (nur wenn Kontakte verfügbar) */}
                  {customerContacts.length > 0 && (
                    <div className="mb-3">
                      <label className={labelClass}>Kontakt auswählen</label>
                      <select
                        value={selectedContactId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedContactId(val);
                          if (val === "") {
                            setFormData((prev) => ({ ...prev, onsiteName: "", onsitePhone: "" }));
                          } else {
                            const contact = customerContacts.find((c) => String(c.id) === val);
                            if (contact) {
                              setFormData((prev) => ({
                                ...prev,
                                onsiteName: contact.name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || prev.onsiteName,
                                onsitePhone: contact.phone || contact.phone_direct || contact.phone_mobile || prev.onsitePhone,
                              }));
                            }
                          }
                        }}
                        className={inputClass}
                      >
                        <option value="">— Kein Kontakt vorausfüllen —</option>
                        {customerContacts.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim()}
                            {c.role ? ` (${c.role})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>{t(lang, "wizard.label.onsiteName")}</label>
                      <input
                        type="text"
                        value={formData.onsiteName}
                        onChange={(e) => updateField("onsiteName", e.target.value)}
                        className={inputClass}
                        placeholder="Vor-Ort-Name (optional)"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t(lang, "wizard.label.onsitePhone")}</label>
                      <input
                        type="tel"
                        value={formData.onsitePhone}
                        onChange={(e) => updateField("onsitePhone", e.target.value)}
                        className={inputClass}
                        placeholder="+41 79 123 45 67"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>{t(lang, "booking.step1.onsiteEmail")}</label>
                      <input
                        type="email"
                        value={formData.onsiteEmail}
                        onChange={(e) => updateField("onsiteEmail", e.target.value)}
                        className={inputClass}
                        placeholder="vorort@beispiel.ch"
                      />
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={formData.onsiteCalendarInvite}
                        onChange={(e) => updateField("onsiteCalendarInvite", e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-[var(--border-soft)] text-[var(--accent)]"
                      />
                      <span className="text-sm text-[var(--text-muted)]">{t(lang, "booking.step1.onsiteCalendarInvite")}</span>
                    </label>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        {t(lang, "wizard.label.ccEmails")}
                        <span className="ml-1 font-normal text-[var(--text-subtle)] text-xs normal-case tracking-normal">
                          {t(lang, "wizard.hint.ccEmails")}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={formData.attendeeEmails}
                        onChange={(e) => updateField("attendeeEmails", e.target.value)}
                        className={inputClass}
                        placeholder="a@beispiel.ch, b@beispiel.ch"
                      />
                    </div>
                  </div>

                  {/* Zusätzliche Vor-Ort-Kontakte */}
                  {additionalOnsiteContacts.map((row, idx) => (
                    <div key={idx} className="mt-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                          {t(lang, "booking.step1.onsiteAdditionalPerson")} ({idx + 2})
                        </span>
                        <button
                          type="button"
                          onClick={() => setAdditionalOnsiteContacts((prev) => prev.filter((_, i) => i !== idx))}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-slate-100 hover:bg-[var(--surface-raised)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t(lang, "booking.step1.onsiteRemovePerson")}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>{t(lang, "booking.step1.onsiteName")}</label>
                          <input type="text" value={row.name} onChange={(e) => setAdditionalOnsiteContacts((prev) => prev.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>{t(lang, "booking.step1.onsitePhone")}</label>
                          <input type="tel" value={row.phone} onChange={(e) => setAdditionalOnsiteContacts((prev) => prev.map((r, i) => i === idx ? { ...r, phone: e.target.value } : r))} className={inputClass} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>{t(lang, "booking.step1.onsiteEmail")}</label>
                          <input type="email" value={row.email} onChange={(e) => setAdditionalOnsiteContacts((prev) => prev.map((r, i) => i === idx ? { ...r, email: e.target.value } : r))} className={inputClass} />
                        </div>
                        <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
                          <input type="checkbox" checked={row.calendarInvite} onChange={(e) => setAdditionalOnsiteContacts((prev) => prev.map((r, i) => i === idx ? { ...r, calendarInvite: e.target.checked } : r))} className="mt-0.5 w-4 h-4 rounded border-[var(--border-soft)] text-[var(--accent)]" />
                          <span className="text-sm text-[var(--text-muted)]">{t(lang, "booking.step1.onsiteCalendarInvite")}</span>
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAdditionalOnsiteContacts((prev) => [...prev, { name: "", phone: "", email: "", calendarInvite: false }])}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-soft)] py-2 text-sm font-medium text-[var(--text-subtle)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                  >
                    <Plus className="h-4 w-4" /> {t(lang, "booking.step1.onsiteAddPerson")}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{t(lang, "wizard.label.objectType")}</label>
                    <select
                      value={formData.objectType}
                      onChange={(e) => updateField("objectType", e.target.value)}
                      className={inputClass}
                    >
                      <option value="apartment">{t(lang, "wizard.objectType.apartment")}</option>
                      <option value="single_house">{t(lang, "wizard.objectType.singleHouse")}</option>
                      <option value="multi_house">{t(lang, "wizard.objectType.multiHouse")}</option>
                      <option value="commercial">{t(lang, "wizard.objectType.commercial")}</option>
                      <option value="land">{t(lang, "wizard.objectType.land")}</option>
                    </select>
                    <DbFieldHint fieldPath="object.type" />
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "orderDetail.label.area")}</label>
                    <input
                      type="number"
                      value={formData.area}
                      onChange={(e) => updateField("area", e.target.value)}
                      className={inputClass}
                      placeholder="120"
                    />
                    <DbFieldHint fieldPath="object.area" />
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "orderDetail.label.floors")}</label>
                    <input
                      type="number"
                      value={formData.floors}
                      onChange={(e) => updateField("floors", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "orderDetail.label.rooms")}</label>
                    <input
                      type="text"
                      value={formData.rooms}
                      onChange={(e) => updateField("rooms", e.target.value)}
                      className={inputClass}
                      placeholder="4.5"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "booking.step1.specials")}</label>
                    <input
                      type="text"
                      value={formData.specials}
                      onChange={(e) => updateField("specials", e.target.value)}
                      className={inputClass}
                      placeholder={t(lang, "booking.step1.specialsPlaceholder")}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t(lang, "wizard.label.description")}</label>
                  <textarea
                    value={formData.desc}
                    onChange={(e) => updateField("desc", e.target.value)}
                    className={inputClass}
                    rows={3}
                    placeholder={t(lang, "wizard.placeholder.description")}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Dienstleistungen ─────────────────────────────────────────── */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <Package className="h-4 w-4 text-[var(--accent)]" />
              {t(lang, "wizard.section.servicePackage")}
            </div>

            {/* Pakete als Karten */}
            <div className="mb-5">
              <label className={labelClass}>{t(lang, "orderDetail.label.package")}</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* «Kein Paket» */}
                <button
                  type="button"
                  onClick={() => { setSelectedPackageCode(""); syncServiceFields("", selectedAddonCodes); }}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 py-4 text-center transition-all",
                    !selectedPackageCode
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-md"
                      : "border-[var(--border-soft)] hover:border-slate-300 hover:border-[var(--border-soft)]",
                  )}
                >
                  <span className="text-xs font-semibold text-[var(--text-subtle)]">
                    {t(lang, "wizard.select.noPackage")}
                  </span>
                </button>

                {catalog.filter((p) => p.kind === "package").map((p) => {
                  const price = estimatePrice(p);
                  const isSelected = selectedPackageCode === p.code;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setSelectedPackageCode(p.code); syncServiceFields(p.code, selectedAddonCodes); }}
                      className={cn(
                        "relative flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-all",
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-md"
                          : "border-[var(--border-soft)] hover:border-slate-300 hover:border-[var(--border-soft)]",
                      )}
                    >
                      {isSelected && (
                        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)]">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}
                      <span className={cn("text-sm font-bold leading-tight", isSelected ? "text-[var(--accent)]" : "text-slate-800 text-[var(--text-main)]")}>
                        {p.name}
                      </span>
                      {price > 0 && (
                        <span className="text-xs text-[var(--text-subtle)] tabular-nums">
                          CHF {price.toFixed(2)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Paketpreis override */}
              {selectedPackageCode && (
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] whitespace-nowrap">
                    {t(lang, "wizard.label.packagePrice")}
                  </label>
                  <div className="relative w-36">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.packagePrice}
                      onChange={(e) => updateField("packagePrice", e.target.value)}
                      className={cn(inputClass, "pr-12")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">CHF</span>
                  </div>
                </div>
              )}
            </div>

            {/* Addons als Pill-Checkboxen */}
            <div className="mb-5">
              <label className={labelClass}>{t(lang, "wizard.label.products")}</label>
              <div className="flex flex-wrap gap-2">
                {catalog.filter((p) => p.kind === "addon" && p.group_key !== "travel_zone").map((addon) => {
                  const isChecked = selectedAddonCodes.includes(addon.code);
                  const price = estimatePrice(addon);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => {
                        const next = isChecked
                          ? selectedAddonCodes.filter((x) => x !== addon.code)
                          : [...selectedAddonCodes, addon.code];
                        setSelectedAddonCodes(next);
                        syncServiceFields(selectedPackageCode, next);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                        isChecked
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-slate-300 hover:border-[var(--border-soft)]",
                      )}
                    >
                      {isChecked && <Check className="h-3 w-3 shrink-0" />}
                      {addon.name}
                      {price > 0 && (
                        <span className="ml-0.5 opacity-70 tabular-nums">+CHF {price}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Manuelle Addons (Freitext) */}
            <div className="mb-5">
              <label className={labelClass}>
                {t(lang, "wizard.label.addons")}
                <span className="ml-2 font-normal normal-case tracking-normal text-xs text-[var(--text-subtle)]">
                  {t(lang, "wizard.hint.addonFormat")}
                </span>
              </label>
              <textarea
                value={formData.addonsText}
                onChange={(e) => updateField("addonsText", e.target.value)}
                className={inputClass}
                rows={2}
                placeholder={"Drohnenaufnahmen;500\nVirtuelle Tour;800"}
              />
            </div>

            {/* Schlüsselabholung */}
            <div className={cn(
              "rounded-xl border-2 p-4 transition-all",
              formData.keyPickupActive
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                : "border-[var(--border-soft)]",
            )}>
              <label className="flex cursor-pointer items-center gap-3">
                <div className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all",
                  formData.keyPickupActive
                    ? "border-[var(--accent)] bg-[var(--accent)]"
                    : "border-[var(--border-soft)]",
                )}>
                  {formData.keyPickupActive && <Check className="h-3 w-3 text-white" />}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={formData.keyPickupActive}
                  onChange={(e) => {
                    const active = e.target.checked;
                    const keyPickupPrice = active && formData.keyPickupAddress.trim() ? 50 : 0;
                    const pkg = catalog.find((p) => p.code === selectedPackageCode);
                    const selectedAddons = catalog.filter((p) => selectedAddonCodes.includes(p.code));
                    const pkgPrice = pkg ? estimatePrice(pkg) : 0;
                    const addonTotal = selectedAddons.reduce((sum, a) => sum + estimatePrice(a), 0);
                    const sub = pkgPrice + addonTotal + keyPickupPrice + (formData.travelZonePrice || 0);
                    const dis = Number(formData.discount || 0);
                    const base = Math.max(0, sub - dis);
                    const vat = Math.round(base * 0.081 * 100) / 100;
                    const total = Math.round((base + vat) * 100) / 100;
                    setFormData((prev) => ({
                      ...prev,
                      keyPickupActive: active,
                      keyPickupAddress: active ? prev.keyPickupAddress : "",
                      subtotal: String(sub),
                      vat: String(vat),
                      total: String(total),
                    }));
                  }}
                />
                <div>
                  <p className="text-sm font-semibold text-[var(--text-muted)]">
                    {t(lang, "orderDetail.label.keyPickup")}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">+CHF 50.00</p>
                </div>
              </label>
              {formData.keyPickupActive && (
                <textarea
                  value={formData.keyPickupAddress}
                  onChange={(e) => {
                    const text = e.target.value;
                    const hasPickup = !!text.trim();
                    const keyPickupPrice = hasPickup ? 50 : 0;
                    const pkg = catalog.find((p) => p.code === selectedPackageCode);
                    const selectedAddons = catalog.filter((p) => selectedAddonCodes.includes(p.code));
                    const pkgPrice = pkg ? estimatePrice(pkg) : 0;
                    const addonTotal = selectedAddons.reduce((sum, a) => sum + estimatePrice(a), 0);
                    const sub = pkgPrice + addonTotal + keyPickupPrice + (formData.travelZonePrice || 0);
                    const dis = Number(formData.discount || 0);
                    const base = Math.max(0, sub - dis);
                    const vat = Math.round(base * 0.081 * 100) / 100;
                    const total = Math.round((base + vat) * 100) / 100;
                    setFormData((prev) => ({
                      ...prev,
                      keyPickupAddress: text,
                      subtotal: String(sub),
                      vat: String(vat),
                      total: String(total),
                    }));
                  }}
                  className={cn(inputClass, "mt-3")}
                  rows={2}
                  placeholder={t(lang, "wizard.placeholder.keyPickupInfo")}
                />
              )}
            </div>
          </div>

          {/* ── Termin mit Slot-Picker ───────────────────────────────────── */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <CalendarIcon className="h-4 w-4 text-[var(--accent)]" />
              {t(lang, "wizard.section.scheduling")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Fotograf */}
              <div>
                <label className={labelClass}>{t(lang, "wizard.label.photographer")}</label>
                <select
                  value={formData.photographerKey}
                  onChange={(e) => updateField("photographerKey", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Beliebig (automatisch)</option>
                  {photographers.filter((p) => p.active !== false).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </select>
                <DbFieldHint fieldPath="schedule.photographer.key" />
              </div>

              {/* Datum */}
              <div>
                <label className={labelClass}>{t(lang, "wizard.label.dateRequired")}</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => {
                    updateField("date", e.target.value);
                    updateField("time", ""); // clear selected slot on date change
                  }}
                  className={inputClass}
                />
                <DbFieldHint fieldPath="schedule.date" />
              </div>

              {/* Provisorisch */}
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={formData.provisional}
                    onChange={(e) => updateField("provisional", e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[var(--border-soft)] text-[var(--accent)]"
                  />
                  <span className="text-sm text-[var(--text-muted)]">{t(lang, "orderDetails.status.provisional")}</span>
                </label>
              </div>
            </div>

            {/* Suggested photographer hint for "any" mode */}
            {!formData.photographerKey && suggestedPhotographerKey && (
              <div className="mt-3 mb-1 flex items-center gap-2 text-xs text-[var(--accent)] font-semibold">
                <Check className="h-3.5 w-3.5 shrink-0" />
                {t(lang, "wizard.slot.suggestedPhotographer")}:{" "}
                <span className="font-bold">
                  {photographers.find((p) => p.key === suggestedPhotographerKey)?.name || suggestedPhotographerKey}
                </span>
              </div>
            )}

            {/* Slot Picker */}
            <div className="mt-4">
              {!formData.date ? (
                <p className="text-sm text-[var(--text-subtle)] italic">
                  {t(lang, "wizard.slot.selectFirst")}
                </p>
              ) : slotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
                  <Clock className="h-4 w-4 animate-spin" />
                  {t(lang, "wizard.slot.loading")}
                </div>
              ) : slotsError ? (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  {slotsError}
                </div>
              ) : availableSlots.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {t(lang, "wizard.slot.none")}
                </p>
              ) : (
                <div>
                  {/* Berechnete Dauer */}
                  {calculatedDuration !== null && (
                    <p className="text-xs text-[var(--text-subtle)] mb-3">
                      {t(lang, "wizard.slot.duration")}:{" "}
                      <span className="font-semibold text-[var(--text-muted)]">
                        {calculatedDuration} Min.
                      </span>
                    </p>
                  )}

                  {/* AM/PM Toggle */}
                  <div className="flex gap-2 mb-3">
                    {(["am", "pm"] as const).map((period) => {
                      const count = period === "am" ? amSlots.length : pmSlots.length;
                      return (
                        <button
                          key={period}
                          type="button"
                          onClick={() => setSlotPeriod(period)}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                            slotPeriod === period
                              ? "bg-[var(--accent)] text-white"
                              : "bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-slate-200 hover:bg-[var(--surface-raised)]",
                          )}
                        >
                          {period === "am" ? t(lang, "wizard.slot.am") : t(lang, "wizard.slot.pm")}
                          {count > 0 && (
                            <span className="ml-1.5 text-xs opacity-70">({count})</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Slot Buttons */}
                  {displaySlots.length === 0 ? (
                    <p className="text-sm text-[var(--text-subtle)] italic">
                      {slotPeriod === "am" ? "Keine Slots am Vormittag" : "Keine Slots am Nachmittag"}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {displaySlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => updateField("time", slot)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-mono font-semibold transition-all duration-150",
                            formData.time === slot
                              ? "bg-[var(--accent)] text-white shadow-md scale-105"
                              : "bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-slate-200 hover:bg-[var(--surface-raised)]",
                          )}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Ausgewählter Slot Info */}
                  {formData.time && (
                    <p className="mt-3 text-sm font-semibold text-[var(--accent)]">
                      Gewählt: {formData.date} um {formData.time} Uhr
                    </p>
                  )}
                </div>
              )}

              {/* Manuelle Zeiteingabe */}
              {formData.date && (
                <div className="mt-4 pt-4 border-t border-[var(--border-soft)]">
                  <label className={labelClass}>{t(lang, "wizard.label.manualTime")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={formData.time}
                      onChange={(e) => updateField("time", e.target.value)}
                      className={cn(inputClass, "w-36")}
                    />
                    {formData.time && (
                      <button
                        type="button"
                        onClick={() => updateField("time", "")}
                        className="text-xs text-[var(--text-subtle)] hover:text-red-500 transition-colors"
                      >
                        ✕ {t(lang, "wizard.label.clearTime")}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">{t(lang, "wizard.hint.manualTime")}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Preis & Zusammenfassung ──────────────────────────────────── */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <CreditCard className="h-4 w-4 text-[var(--accent)]" />
              {t(lang, "wizard.section.priceSummary")}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Linke Seite: Editierbare Felder */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{t(lang, "wizard.label.subtotal")}</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={formData.subtotal}
                        onChange={(e) => {
                          updateField("subtotal", e.target.value);
                          // Recalculate VAT and total
                          const sub = Number(e.target.value || 0);
                          const dis = Number(formData.discount || 0);
                          const base = Math.max(0, sub - dis);
                          const vat = Math.round(base * 0.081 * 100) / 100;
                          const total = Math.round((base + vat) * 100) / 100;
                          setFormData((prev) => ({ ...prev, subtotal: e.target.value, vat: String(vat), total: String(total) }));
                        }}
                        className={cn(inputClass, "pr-12")}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-subtle)] pointer-events-none">CHF</span>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t(lang, "wizard.label.discount")}</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.discount}
                        onChange={(e) => {
                          const dis = Number(e.target.value || 0);
                          const sub = Number(formData.subtotal || 0);
                          const base = Math.max(0, sub - dis);
                          const vat = Math.round(base * 0.081 * 100) / 100;
                          const total = Math.round((base + vat) * 100) / 100;
                          setFormData((prev) => ({ ...prev, discount: e.target.value, vat: String(vat), total: String(total) }));
                        }}
                        className={cn(inputClass, "pr-12")}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-subtle)] pointer-events-none">CHF</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t(lang, "wizard.label.discountCode")}</label>
                  <input
                    type="text"
                    value={formData.discountCode}
                    onChange={(e) => updateField("discountCode", e.target.value)}
                    className={inputClass}
                    placeholder="z.B. SUMMER10"
                  />
                </div>
                <div>
                  <label className={labelClass}>{t(lang, "common.notes")}</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    className={inputClass}
                    rows={4}
                    placeholder={t(lang, "wizard.placeholder.notes")}
                  />
                </div>
              </div>

              {/* Rechte Seite: Preis-Zusammenfassung (Quittungs-Layout) */}
              <div className="rounded-xl bg-[var(--surface-raised)]/60 border border-[var(--border-soft)] p-5 flex flex-col gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">
                  {t(lang, "wizard.section.priceSummary")}
                </h4>

                {/* Paket */}
                {formData.packageLabel && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">{formData.packageLabel}</span>
                    <span className="font-semibold text-slate-800 text-[var(--text-main)] tabular-nums">
                      CHF {Number(formData.packagePrice || 0).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Addons aus Catalog */}
                {catalog.filter((p) => selectedAddonCodes.includes(p.code)).map((addon) => (
                  <div key={addon.code} className="flex justify-between text-sm">
                    <span className="text-[var(--text-subtle)] pl-3 flex items-center gap-1">
                      <span className="text-[var(--accent)] text-xs">+</span> {addon.name}
                    </span>
                    <span className="tabular-nums text-[var(--text-muted)]">
                      CHF {estimatePrice(addon).toFixed(2)}
                    </span>
                  </div>
                ))}

                {/* Key Pickup */}
                {formData.keyPickupActive && formData.keyPickupAddress && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-subtle)] pl-3 flex items-center gap-1">
                      <span className="text-[var(--accent)] text-xs">+</span> {t(lang, "orderDetail.label.keyPickupShort")}
                    </span>
                    <span className="tabular-nums text-[var(--text-muted)]">CHF 50.00</span>
                  </div>
                )}

                {/* Anfahrtszone */}
                {formData.travelZone && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-subtle)] pl-3 flex items-center gap-1">
                      <span className="text-[var(--accent)] text-xs">+</span>
                      {formData.travelZoneLabel || `${t(lang, "wizard.travelZone.label")} ${formData.travelZone}`}
                    </span>
                    <span className="tabular-nums text-[var(--text-muted)]">
                      {formData.travelZonePrice > 0 ? `CHF ${formData.travelZonePrice.toFixed(2)}` : t(lang, "wizard.travelZone.included")}
                    </span>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-[var(--border-soft)] pt-2 space-y-1.5">
                  <div className="flex justify-between text-sm text-[var(--text-subtle)]">
                    <span>{t(lang, "wizard.label.subtotal")}</span>
                    <span className="tabular-nums">CHF {Number(formData.subtotal || 0).toFixed(2)}</span>
                  </div>
                  {Number(formData.discount || 0) > 0 && (
                    <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                      <span>{t(lang, "wizard.label.discount")}{formData.discountCode ? ` (${formData.discountCode})` : ""}</span>
                      <span className="tabular-nums">− CHF {Number(formData.discount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-[var(--text-subtle)]">
                    <span>{t(lang, "wizard.label.vat")} (8.1%)</span>
                    <span className="tabular-nums">CHF {Number(formData.vat || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Total */}
                <div className="border-t-2 border-[var(--accent)]/30 dark:border-[var(--accent)]/20 pt-3 flex justify-between items-center">
                  <span className="font-bold text-base text-slate-800 text-[var(--text-main)]">{t(lang, "wizard.label.total")}</span>
                  <span className="text-xl font-bold text-[var(--accent)] tabular-nums">
                    CHF {Number(formData.total || 0).toFixed(2)}
                  </span>
                </div>

                {/* Manual override note */}
                <p className="text-[11px] text-[var(--text-subtle)] mt-1">
                  {t(lang, "wizard.hint.priceEditable")}
                </p>
              </div>
            </div>
          </div>

          {/* ── Success Banner ────────────────────────────────────────────── */}
          {successOrderNo && (
            <div className="rounded-lg p-4 flex items-center gap-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/50">
              <div className="shrink-0 w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-green-800 dark:text-green-200">
                  {t(lang, "wizard.success.created").replace("{{orderNo}}", successOrderNo)}
                </p>
                <p className="text-sm text-green-600 dark:text-green-300/90 mt-0.5">
                  {t(lang, "wizard.success.saved")}
                </p>
              </div>
            </div>
          )}

          {/* ── Error Banner ─────────────────────────────────────────────── */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* ── Submit ───────────────────────────────────────────────────── */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-8 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  {t(lang, "common.creating")}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {t(lang, "wizard.button.createOrder")}
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

