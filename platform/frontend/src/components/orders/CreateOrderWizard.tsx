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
} from "lucide-react";
import { createOrder, updateOrderStatus } from "../../api/orders";
import { getProducts, type Product } from "../../api/products";
import { getPhotographers, type Photographer } from "../../api/photographers";
import { getCustomerContacts, type Customer, type CustomerContact } from "../../api/customers";
import { CustomerAutocompleteInput } from "../ui/CustomerAutocompleteInput";
import { AddressAutocompleteInput } from "../ui/AddressAutocompleteInput";
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

type OrderFormData = {
  // Customer
  customerName: string;
  customerEmail: string;
  customerPhone: string;
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
  // Schedule
  date: string;
  time: string;
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
};

const EMPTY_FORM: OrderFormData = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
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
  date: "",
  time: "",
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

  // Customer & contact state
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>(""); // "" = none/new, "new" = manual, "N" = contact id

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successOrderNo, setSuccessOrderNo] = useState<string | null>(null);

  // Abort controller for availability calls
  const abortRef = useRef<AbortController | null>(null);

  const inputClass = cn(
    "w-full rounded-lg border px-3 py-2 text-sm transition-colors",
    "bg-white dark:bg-zinc-800",
    "border-slate-200 dark:border-zinc-700",
    "text-slate-900 dark:text-zinc-100",
    "placeholder:text-slate-400 dark:placeholder:text-zinc-500",
    "hover:border-slate-300 dark:hover:border-zinc-600",
    "focus:outline-none focus:ring-2 focus:ring-[#C5A059]/20 focus:border-[#C5A059]",
  );
  const labelClass = "block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5";
  const sectionClass = "rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5";
  const sectionTitleClass = "flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300 mb-4";

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
    setFormData((prev) => ({
      ...prev,
      customerName: initialCustomer.name || "",
      customerEmail: isSynthEmail(initialCustomer.email) ? "" : (initialCustomer.email || ""),
      customerPhone: initialCustomer.phone || "",
      company: initialCustomer.company || "",
      billingStreet: initialCustomer.street || "",
      billingZipcity: zipcity,
      billingZip: zipMatch ? zipMatch[1] : (initialCustomer.zip || ""),
      billingCity: zipMatch ? zipMatch[2] : (initialCustomer.city || zipcity),
      billingHouseNumber: "",
      onsiteName: "",
      onsitePhone: "",
    }));
    setSelectedContactId("");
    setCustomerContacts([]);
    if (initialCustomer.id && token) {
      getCustomerContacts(token, initialCustomer.id)
        .then((contacts) => setCustomerContacts(contacts))
        .catch(() => {});
    }
  }, [open, initialCustomer, token]);

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) return;
    setFormData({ ...EMPTY_FORM });
    setSelectedPackageCode("");
    setSelectedAddonCodes([]);
    setInitialStatus("pending");
    setAvailableSlots([]);
    setSlotsLoading(false);
    setSlotsError("");
    setCalculatedDuration(null);
    setSuggestedPhotographerKey(null);
    setSendStatusEmails(true);
    setStatusEmailTargets({ customer: true, office: false, photographer: false, cc: false });
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
      const subtotal = packagePrice + addonTotal + keyPickupPrice;
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

  function handleSelectCustomer(customer: { id?: number; name?: string; email?: string; phone?: string; company?: string; onsite_name?: string; onsite_phone?: string; street?: string; zipcity?: string; [key: string]: unknown }) {
    const street = customer.street || "";
    const zipcity = customer.zipcity || "";
    const zipMatch = zipcity.match(/^(\d{4,5})\s+(.+)$/);
    const isSynthEmail = (e?: string) => String(e || "").toLowerCase().endsWith("@company.local");
    setFormData((prev) => ({
      ...prev,
      customerName: customer.name || "",
      customerEmail: isSynthEmail(customer.email) ? "" : (customer.email || ""),
      customerPhone: customer.phone || "",
      company: customer.company || "",
      onsiteName: "",
      onsitePhone: "",
      billingStreet: street,
      billingZipcity: zipcity,
      billingZip: zipMatch ? zipMatch[1] : "",
      billingCity: zipMatch ? zipMatch[2] : zipcity,
      billingHouseNumber: prev.billingHouseNumber,
    }));

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
      const addons = selectedCatalogAddons.length
        ? selectedCatalogAddons.map((p) => ({ id: p.code, group: p.group_key, label: p.name, price: estimatePrice(p) }))
        : formData.addonsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, idx) => {
              const parts = line.split(";").map((p) => p.trim());
              return { id: `manual_${idx}`, label: parts[0] || `Addon ${idx + 1}`, price: Number(parts[1] || 0) };
            });

      const fmtPhone = (v: string) => formatPhoneCH(v) || (v || "").trim();
      const result = await createOrder(token, {
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: fmtPhone(formData.customerPhone),
        company: formData.company,
        billingStreet: formData.billingStreet,
        billingHouseNumber: formData.billingHouseNumber,
        billingZip: formData.billingZip,
        billingCity: formData.billingCity,
        billingZipcity: formData.billingZipcity,
        onsiteName: formData.onsiteName,
        onsitePhone: fmtPhone(formData.onsitePhone),
        attendeeEmails: formData.attendeeEmails,
        address: formData.address,
        street: formData.street,
        zipcity: formData.zipcity,
        objectType: formData.objectType,
        area: Number(formData.area || 0),
        floors: Number(formData.floors || 1),
        rooms: formData.rooms,
        desc: formData.desc,
        date: formData.date,
        time: formData.time,
        durationMin: Number(formData.durationMin || 60),
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
              <Check className="h-4 w-4 text-[#C5A059]" />
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
                    className="w-4 h-4 rounded border-slate-300 dark:border-zinc-700 text-[#C5A059] focus:ring-[#C5A059]"
                  />
                  <span className="text-slate-700 dark:text-zinc-300">{t(lang, "orderStatus.sendEmailsLabel")}</span>
                </label>
                <div className={`grid grid-cols-2 gap-2 text-xs ${sendStatusEmails ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-600 opacity-70"}`}>
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
              </div>
            </div>
          </div>

          {/* ── Kunde & Objekt ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Kunde & Kontakt */}
            <div className={sectionClass}>
              <div className={sectionTitleClass}>
                <User className="h-4 w-4 text-[#C5A059]" />
                {t(lang, "wizard.section.customerData")}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="pt-3 border-t border-slate-100 dark:border-zinc-800">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2 flex items-center gap-1.5">
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

                {/* Rechnungsadresse */}
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">
                    {t(lang, "wizard.section.billingAddress")}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>{t(lang, "wizard.label.billingStreet")} *</label>
                      <AddressAutocompleteInput
                        mode="street"
                        value={formData.billingStreet}
                        onChange={(v) => updateField("billingStreet", v)}
                        onSelectParsed={(parsed) => {
                          setFormData((prev) => ({
                            ...prev,
                            billingStreet: `${parsed.street} ${parsed.houseNumber}`.trim(),
                            billingHouseNumber: parsed.houseNumber,
                            billingZip: parsed.zip,
                            billingCity: parsed.city,
                            billingZipcity: `${parsed.zip} ${parsed.city}`.trim(),
                          }));
                        }}
                        onSelectZipcity={(zipcity) => {
                          if (!zipcity) return;
                          const m = zipcity.match(/^(\d{4,5})\s+(.+)$/);
                          setFormData((prev) => ({
                            ...prev,
                            billingZipcity: zipcity,
                            billingZip: m ? m[1] : prev.billingZip,
                            billingCity: m ? m[2] : prev.billingCity,
                          }));
                        }}
                        lang={lang}
                        className={inputClass}
                        placeholder="Musterstrasse 12"
                        minChars={3}
                      />
                    <DbFieldHint fieldPath="billing.street" />
                    </div>
                    <div>
                      <label className={labelClass}>{t(lang, "wizard.label.billingZip")} *</label>
                      <input
                        type="text"
                        value={formData.billingZip}
                        onChange={(e) => {
                          updateField("billingZip", e.target.value);
                          updateField("billingZipcity", `${e.target.value} ${formData.billingCity}`.trim());
                        }}
                        className={inputClass}
                        placeholder="8001"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t(lang, "wizard.label.billingCity")} *</label>
                      <input
                        type="text"
                        value={formData.billingCity}
                        onChange={(e) => {
                          updateField("billingCity", e.target.value);
                          updateField("billingZipcity", `${formData.billingZip} ${e.target.value}`.trim());
                        }}
                        className={inputClass}
                        placeholder="Zürich"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Objekt */}
            <div className={sectionClass}>
              <div className={sectionTitleClass}>
                <Building2 className="h-4 w-4 text-[#C5A059]" />
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
                    onSelectParsed={(parsed) => {
                      setFormData((prev) => ({
                        ...prev,
                        address: parsed.display,
                        street: parsed.street,
                        houseNumber: parsed.houseNumber,
                        zip: parsed.zip,
                        city: parsed.city,
                        zipcity: `${parsed.zip} ${parsed.city}`.trim(),
                      }));
                    }}
                    onSelectZipcity={(zipcity) => {
                      if (!zipcity) return;
                      setFormData((prev) => ({ ...prev, zipcity }));
                    }}
                    lang={lang}
                    className={inputClass}
                    placeholder="Bahnhofstrasse 12, 8001 Zürich"
                    minChars={3}
                  />
                  <DbFieldHint fieldPath="address.text" />
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    {t(lang, "wizard.hint.fullStreetWithHouseNumber")}
                  </p>
                  {formData.address && !isObjectAddressComplete() && (
                    <p className="mt-1 text-xs text-amber-500">{t(lang, "wizard.hint.addressNeedsHouseNumber")}</p>
                  )}
                </div>
                {/* Vor-Ort-Kontakt – Auswahl aus Kundenkontakten oder manuell */}
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2 flex items-center gap-1.5">
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
                    <>
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
                    </>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        {t(lang, "wizard.label.ccEmails")}
                        <span className="ml-1 font-normal text-slate-400 dark:text-zinc-500 text-xs normal-case tracking-normal">
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
              <Package className="h-4 w-4 text-[#C5A059]" />
              {t(lang, "wizard.section.servicePackage")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t(lang, "orderDetail.label.package")}</label>
                <select
                  value={selectedPackageCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSelectedPackageCode(code);
                    syncServiceFields(code, selectedAddonCodes);
                  }}
                  className={inputClass}
                >
                  <option value="">{t(lang, "wizard.select.noPackage")}</option>
                  {catalog.filter((p) => p.kind === "package").map((p) => (
                    <option key={p.id} value={p.code}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t(lang, "wizard.label.packagePrice")}</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.packagePrice}
                  onChange={(e) => updateField("packagePrice", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t(lang, "wizard.label.products")}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 max-h-40 overflow-auto rounded-lg border border-slate-200 dark:border-zinc-700 p-2">
                  {catalog.filter((p) => p.kind === "addon").map((addon) => (
                    <label key={addon.id} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAddonCodes.includes(addon.code)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedAddonCodes, addon.code]
                            : selectedAddonCodes.filter((x) => x !== addon.code);
                          setSelectedAddonCodes(next);
                          syncServiceFields(selectedPackageCode, next);
                        }}
                      />
                      <span>{addon.name}</span>
                    </label>
                  ))}
                </div>
                <label className={labelClass}>{t(lang, "wizard.label.addons")}</label>
                <textarea
                  value={formData.addonsText}
                  onChange={(e) => updateField("addonsText", e.target.value)}
                  className={inputClass}
                  rows={3}
                  placeholder={"Drohnenaufnahmen;500\nVirtuelle Tour;800"}
                />
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {t(lang, "wizard.hint.addonFormat")}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={formData.keyPickupActive}
                    onChange={(e) => {
                      const active = e.target.checked;
                      const keyPickupPrice = active && formData.keyPickupAddress.trim() ? 50 : 0;
                      const pkg = catalog.find((p) => p.code === selectedPackageCode);
                      const selectedAddons = catalog.filter((p) => selectedAddonCodes.includes(p.code));
                      const pkgPrice = pkg ? estimatePrice(pkg) : 0;
                      const addonTotal = selectedAddons.reduce((sum, a) => sum + estimatePrice(a), 0);
                      const sub = pkgPrice + addonTotal + keyPickupPrice;
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
                  {t(lang, "orderDetail.label.keyPickup")}
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
                      const sub = pkgPrice + addonTotal + keyPickupPrice;
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
                    className={cn(inputClass, "mt-2")}
                    rows={2}
                    placeholder={t(lang, "wizard.placeholder.keyPickupInfo")}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Termin mit Slot-Picker ───────────────────────────────────── */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <CalendarIcon className="h-4 w-4 text-[#C5A059]" />
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
            </div>

            {/* Suggested photographer hint for "any" mode */}
            {!formData.photographerKey && suggestedPhotographerKey && (
              <div className="mt-3 mb-1 flex items-center gap-2 text-xs text-[#C5A059] font-semibold">
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
                <p className="text-sm text-slate-400 dark:text-zinc-500 italic">
                  {t(lang, "wizard.slot.selectFirst")}
                </p>
              ) : slotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400">
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
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">
                      {t(lang, "wizard.slot.duration")}:{" "}
                      <span className="font-semibold text-slate-700 dark:text-zinc-200">
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
                              ? "bg-[#C5A059] text-white"
                              : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700",
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
                    <p className="text-sm text-slate-400 dark:text-zinc-500 italic">
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
                              ? "bg-[#C5A059] text-white shadow-md scale-105"
                              : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700",
                          )}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Ausgewählter Slot Info */}
                  {formData.time && (
                    <p className="mt-3 text-sm font-semibold text-[#C5A059]">
                      Gewählt: {formData.date} um {formData.time} Uhr
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Preis & Zusammenfassung ──────────────────────────────────── */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <CreditCard className="h-4 w-4 text-[#C5A059]" />
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
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-zinc-500 pointer-events-none">CHF</span>
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
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-zinc-500 pointer-events-none">CHF</span>
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
              <div className="rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 p-5 flex flex-col gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  {t(lang, "wizard.section.priceSummary")}
                </h4>

                {/* Paket */}
                {formData.packageLabel && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-zinc-300">{formData.packageLabel}</span>
                    <span className="font-semibold text-slate-800 dark:text-zinc-100 tabular-nums">
                      CHF {Number(formData.packagePrice || 0).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Addons aus Catalog */}
                {catalog.filter((p) => selectedAddonCodes.includes(p.code)).map((addon) => (
                  <div key={addon.code} className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-zinc-400 pl-3 flex items-center gap-1">
                      <span className="text-[#C5A059] text-xs">+</span> {addon.name}
                    </span>
                    <span className="tabular-nums text-slate-700 dark:text-zinc-200">
                      CHF {estimatePrice(addon).toFixed(2)}
                    </span>
                  </div>
                ))}

                {/* Key Pickup */}
                {formData.keyPickupActive && formData.keyPickupAddress && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-zinc-400 pl-3 flex items-center gap-1">
                      <span className="text-[#C5A059] text-xs">+</span> {t(lang, "orderDetail.label.keyPickupShort")}
                    </span>
                    <span className="tabular-nums text-slate-700 dark:text-zinc-200">CHF 50.00</span>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-slate-200 dark:border-zinc-700 pt-2 space-y-1.5">
                  <div className="flex justify-between text-sm text-slate-500 dark:text-zinc-400">
                    <span>{t(lang, "wizard.label.subtotal")}</span>
                    <span className="tabular-nums">CHF {Number(formData.subtotal || 0).toFixed(2)}</span>
                  </div>
                  {Number(formData.discount || 0) > 0 && (
                    <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                      <span>{t(lang, "wizard.label.discount")}{formData.discountCode ? ` (${formData.discountCode})` : ""}</span>
                      <span className="tabular-nums">− CHF {Number(formData.discount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-slate-500 dark:text-zinc-400">
                    <span>{t(lang, "wizard.label.vat")} (8.1%)</span>
                    <span className="tabular-nums">CHF {Number(formData.vat || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Total */}
                <div className="border-t-2 border-[#C5A059]/30 dark:border-[#C5A059]/20 pt-3 flex justify-between items-center">
                  <span className="font-bold text-base text-slate-800 dark:text-zinc-100">{t(lang, "wizard.label.total")}</span>
                  <span className="text-xl font-bold text-[#C5A059] tabular-nums">
                    CHF {Number(formData.total || 0).toFixed(2)}
                  </span>
                </div>

                {/* Manual override note */}
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
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
