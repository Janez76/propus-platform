import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { createOrder, updateOrderStatus } from "../../../api/orders";
import { getProducts, type Product } from "../../../api/products";
import { getPhotographers, type Photographer } from "../../../api/photographers";
import { getCustomerContacts, type Customer, type CustomerContact } from "../../../api/customers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../../ui/dialog";
import { formatPhoneCH } from "../../../lib/format";
import { API_BASE } from "../../../api/client";
import { extractSwissZip } from "../../../lib/address";
import { useT } from "../../../hooks/useT";
import { useWizardForm, usePricing, estimatePrice, type WizardFormState } from "./hooks/useWizardForm";
import { WizardShell, type WizardStepDef } from "./WizardShell";
import { WizardPriceSidebar } from "./WizardPriceSidebar";
import { Step1Customer } from "./steps/Step1Customer";
import { Step2Object } from "./steps/Step2Object";
import { Step3Service } from "./steps/Step3Service";
import { Step4Schedule } from "./steps/Step4Schedule";

interface CreateOrderWizardProps {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  initialCustomer?: Customer | null;
  onSuccess: () => void;
}

type AvailabilityResponse = {
  ok?: boolean;
  freeSlots?: string[];
  resolvedPhotographer?: string | null;
  availabilityMap?: Record<string, string[]>;
  result?: { photographer?: string; time?: string; key?: string } | null;
  debug?: { durationMin?: number; slotMinutes?: number; bufferMinutes?: number };
};

type StepErrors = Partial<Record<keyof WizardFormState, string>>;

function isObjectAddressCompleteFn(state: WizardFormState): boolean {
  if (state.address.trim() && state.houseNumber.trim() && state.zipcity.trim()) return true;
  const raw = state.address.trim();
  if (!raw) return false;
  const hasHouseNumber = /\b\d+[a-zA-Z]?\b/.test(raw);
  const hasZipCity =
    /\b\d{4,5}\s+[A-Za-z\u00C0-\u00FF][^,]*$/u.test(raw) || /\b\d{4,5}\s+[A-Za-z\u00C0-\u00FF]/u.test(raw);
  return hasHouseNumber && hasZipCity;
}

function validateStep(index: number, state: WizardFormState): StepErrors {
  const errors: StepErrors = {};
  if (index === 0) {
    if (!state.customerName.trim()) errors.customerName = "Pflichtfeld";
    if (!state.customerEmail.trim()) errors.customerEmail = "Pflichtfeld";
    if (!state.billingStreet.trim()) errors.billingStreet = "Pflichtfeld";
    if (!state.billingZip.trim()) errors.billingZip = "Pflichtfeld";
    if (!state.billingCity.trim()) errors.billingCity = "Pflichtfeld";
  }
  if (index === 1) {
    if (!isObjectAddressCompleteFn(state)) errors.address = "Bitte vollständige Adresse eingeben";
  }
  if (index === 3) {
    const requires =
      state.initialStatus === "confirmed" || state.initialStatus === "provisional";
    if (requires) {
      if (!state.date) errors.date = "Datum erforderlich";
      if (!state.time) errors.photographerKey = "Zeit und Fotograf erforderlich";
    }
  }
  return errors;
}

export function CreateOrderWizard({
  token,
  open,
  onOpenChange,
  initialDate,
  initialCustomer,
  onSuccess,
}: CreateOrderWizardProps) {
  const t = useT();
  const { state, dispatch } = useWizardForm();

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([]);

  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotPeriod, setSlotPeriod] = useState<"am" | "pm">("am");
  const [calculatedDuration, setCalculatedDuration] = useState<number | null>(null);
  const [suggestedPhotographerKey, setSuggestedPhotographerKey] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successOrderNo, setSuccessOrderNo] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const prevZipRef = useRef("");

  const pricing = usePricing(state, catalog);

  // Load catalog + photographers
  useEffect(() => {
    if (!open) return;
    getProducts(token, false).then(setCatalog).catch(() => {});
    getPhotographers(token).then(setPhotographers).catch(() => {});
  }, [open, token]);

  // Init from props
  useEffect(() => {
    if (!open || !initialDate) return;
    dispatch({ type: "setField", key: "date", value: initialDate });
  }, [open, initialDate, dispatch]);

  useEffect(() => {
    if (!open || !initialCustomer) return;
    dispatch({ type: "selectCustomer", customer: initialCustomer });
    if (initialCustomer.id && token) {
      getCustomerContacts(token, initialCustomer.id).then(setCustomerContacts).catch(() => {});
    }
  }, [open, initialCustomer, token, dispatch]);

  // Reset on close
  useEffect(() => {
    if (open) return;
    dispatch({ type: "reset" });
    setAvailableSlots([]);
    setSlotsLoading(false);
    setSlotsError("");
    setCalculatedDuration(null);
    setSuggestedPhotographerKey(null);
    setSuccessOrderNo(null);
    setError("");
    setCustomerContacts([]);
    setCurrentStep(0);
  }, [open, dispatch]);

  // Travel zone lookup
  const lookupTravelZone = useCallback(
    async (canton: string, zip: string) => {
      if (!canton && !zip) return;
      try {
        const base = API_BASE || "";
        const url = new URL(
          `/api/travel-zone?canton=${encodeURIComponent(canton)}&zip=${encodeURIComponent(zip)}`,
          base || window.location.origin,
        );
        const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        if (!r.ok) return;
        const data = (await r.json()) as {
          ok?: boolean;
          zone?: string;
          productCode?: string;
          price?: number;
          label?: string;
        };
        if (!data.ok) return;
        dispatch({
          type: "setTravelZone",
          zone: data.zone || "",
          product: data.productCode || "",
          price: Number(data.price ?? 0),
          label: data.label || "",
          canton,
        });
      } catch {
        /* ignore */
      }
    },
    [dispatch],
  );

  const onChangeTravelZoneProduct = useCallback(
    (productCode: string) => {
      if (!productCode) return;
      const zoneLetter = productCode.replace("travel:zone-", "").toUpperCase();
      const zoneProduct = catalog.find((p) => p.code === productCode);
      const price = zoneProduct ? estimatePrice(zoneProduct, state.floors, state.area) : 0;
      dispatch({
        type: "setTravelZone",
        zone: zoneLetter,
        product: productCode,
        price,
        label: zoneProduct?.name || `Zone ${zoneLetter}`,
      });
    },
    [catalog, state.floors, state.area, dispatch],
  );

  // Auto-Lookup Anfahrtszone
  useEffect(() => {
    if (!open) return;
    const zip = state.zip || extractSwissZip(state.address) || extractSwissZip(state.zipcity);
    if (!zip) return;
    if (zip === prevZipRef.current && state.travelZone) return;
    prevZipRef.current = zip;
    const canton = state.objectCanton || "";
    lookupTravelZone(canton, zip);
  }, [state.zip, state.objectCanton, state.zipcity, state.address, state.travelZone, open, lookupTravelZone]);

  // Fetch availability slots (only when on step 4 and date is set)
  useEffect(() => {
    if (!open || currentStep !== 3) return;
    const date = state.date;
    if (!date) {
      setAvailableSlots([]);
      setSlotsError("");
      setCalculatedDuration(null);
      setSuggestedPhotographerKey(null);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSlotsLoading(true);
    setSlotsError("");
    setAvailableSlots([]);
    setSuggestedPhotographerKey(null);

    const isAny = !state.photographerKey;
    const params = new URLSearchParams({
      date,
      time: "00:00",
      photographer: state.photographerKey || "any",
      sqm: String(Number(state.area) || 0),
      package: state.selectedPackageCode,
      addons: state.selectedAddonCodes.join(","),
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
          slots = data.freeSlots;
        } else if (isAny && data.resolvedPhotographer) {
          slots = Array.isArray(data.freeSlots) ? data.freeSlots : [];
          setSuggestedPhotographerKey(data.resolvedPhotographer);
        } else if (isAny && data.result && typeof data.result === "object") {
          const rKey = (data.result as { key?: string }).key;
          if (rKey && data.availabilityMap && Array.isArray(data.availabilityMap[rKey])) {
            slots = data.availabilityMap[rKey];
            setSuggestedPhotographerKey(rKey);
          } else if ((data.result as { time?: string }).time) {
            slots = [(data.result as { time: string }).time];
          }
        }

        if (isAny && data.resolvedPhotographer) {
          setSuggestedPhotographerKey(data.resolvedPhotographer);
        }

        setAvailableSlots(slots);
        if (data.debug?.durationMin) {
          setCalculatedDuration(data.debug.durationMin);
          dispatch({ type: "setField", key: "durationMin", value: String(data.debug.durationMin) });
        }

        if (state.time && !slots.includes(state.time)) {
          dispatch({ type: "setField", key: "time", value: "" });
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    currentStep,
    state.date,
    state.photographerKey,
    state.area,
    state.selectedPackageCode,
    state.selectedAddonCodes,
    token,
  ]);

  // Step definitions
  const steps: WizardStepDef[] = useMemo(
    () => [
      { key: "customer", label: t("wizard.step.customer") },
      { key: "object", label: t("wizard.step.object") },
      { key: "service", label: t("wizard.step.service") },
      { key: "schedule", label: t("wizard.step.schedule") },
    ],
    [t],
  );

  const stepErrors = useMemo(() => validateStep(currentStep, state), [currentStep, state]);
  const canNext = Object.keys(stepErrors).length === 0;

  const slotNeedsSchedule =
    state.initialStatus === "confirmed" || state.initialStatus === "provisional";

  const onSelectCustomer = useCallback(
    (customer: Customer | (Record<string, unknown> & Customer)) => {
      dispatch({ type: "selectCustomer", customer: customer as Customer });
      const cid = (customer as { id?: number }).id ?? null;
      setCustomerContacts([]);
      if (cid && token) {
        getCustomerContacts(token, cid).then(setCustomerContacts).catch(() => {});
      }
    },
    [dispatch, token],
  );

  const handleSubmit = async () => {
    // Full validation across all steps
    for (let i = 0; i < steps.length; i++) {
      const errs = validateStep(i, state);
      if (Object.keys(errs).length > 0) {
        setCurrentStep(i);
        setError(t("wizard.error.requiredFields"));
        return;
      }
    }

    setIsSubmitting(true);
    setError("");

    try {
      const selectedCatalogAddons = catalog.filter((p) => state.selectedAddonCodes.includes(p.code));
      const addons: { id: string; label: string; price: number; group?: string }[] =
        selectedCatalogAddons.length
          ? selectedCatalogAddons.map((p) => ({
              id: p.code,
              group: p.group_key,
              label: p.name,
              price: estimatePrice(p, state.floors, state.area),
            }))
          : state.addonsText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, idx) => {
                const parts = line.split(";").map((p) => p.trim());
                return { id: `manual_${idx}`, label: parts[0] || `Addon ${idx + 1}`, price: Number(parts[1] || 0) };
              });

      if (state.travelZoneProduct) {
        addons.push({
          id: state.travelZoneProduct,
          label: state.travelZoneLabel || `Anfahrt Zone ${state.travelZone}`,
          price: state.travelZonePrice,
        });
      }

      const fmtPhone = (v: string) => formatPhoneCH(v) || (v || "").trim();
      const result = await createOrder(token, {
        customerName: state.customerName,
        customerEmail: state.customerEmail,
        customerPhone: fmtPhone(state.customerPhone),
        company: state.company,
        billingStreet: state.billingStreet,
        billingHouseNumber: state.billingHouseNumber,
        billingZip: state.billingZip,
        billingCity: state.billingCity,
        billingZipcity: state.billingZipcity,
        onsiteName: state.onsiteName,
        onsitePhone: fmtPhone(state.onsitePhone),
        attendeeEmails: state.attendeeEmails,
        address: state.address,
        street: state.street,
        zipcity: state.zipcity,
        canton: state.objectCanton,
        zip: state.zip,
        objectType: state.objectType,
        area: Number(state.area || 0),
        floors: Number(state.floors || 1),
        rooms: state.rooms,
        desc: state.desc,
        date: state.date,
        time: state.time,
        durationMin: Number(state.durationMin || 60),
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        vat: pricing.vat,
        total: pricing.total,
        discountCode: state.discountCode,
        notes: state.notes,
        sendEmails: state.sendStatusEmails,
        photographerKey: state.photographerKey,
        package: state.packageLabel
          ? {
              key: state.selectedPackageCode || "manual",
              label: state.packageLabel,
              price: Number(state.packagePrice || 0),
            }
          : undefined,
        addons,
        keyPickup:
          state.keyPickupActive && state.keyPickupAddress.trim()
            ? { address: state.keyPickupAddress.trim() }
            : null,
      });

      if (state.initialStatus !== "pending" && result?.orderNo) {
        try {
          const targets = state.sendStatusEmails
            ? {
                ...state.statusEmailTargets,
                cc: state.statusEmailTargets.cc || !!state.attendeeEmails?.trim(),
              }
            : undefined;
          await updateOrderStatus(token, result.orderNo, state.initialStatus, {
            sendEmails: state.sendStatusEmails,
            sendEmailTargets: targets,
          });
        } catch {
          /* soft-fail */
        }
      }

      setSuccessOrderNo(String(result?.orderNo ?? ""));
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wizard.error.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isObjectComplete = isObjectAddressCompleteFn(state);

  const showSidebar = currentStep >= 2; // from step 3 (service)

  const sidebar = showSidebar ? <WizardPriceSidebar state={state} pricing={pricing} /> : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>{t("wizard.title")}</DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          <WizardShell
            steps={steps}
            currentIndex={currentStep}
            canNext={canNext}
            isSubmitting={isSubmitting}
            onBack={() => setCurrentStep((i) => Math.max(0, i - 1))}
            onNext={() => setCurrentStep((i) => Math.min(steps.length - 1, i + 1))}
            onSubmit={handleSubmit}
            onGoto={(idx) => setCurrentStep(idx)}
            sidebar={sidebar}
          >
            {currentStep === 0 && (
              <Step1Customer
                state={state}
                dispatch={dispatch}
                token={token}
                customerContacts={customerContacts}
                onSelectCustomer={onSelectCustomer}
                onContactListRefresh={(cid) =>
                  getCustomerContacts(token, cid).then(setCustomerContacts).catch(() => {})
                }
                errors={stepErrors}
              />
            )}
            {currentStep === 1 && (
              <Step2Object
                state={state}
                dispatch={dispatch}
                catalog={catalog}
                customerContacts={customerContacts}
                onLookupTravelZone={lookupTravelZone}
                onChangeTravelZoneProduct={onChangeTravelZoneProduct}
                isObjectAddressComplete={isObjectComplete}
                errors={stepErrors}
              />
            )}
            {currentStep === 2 && (
              <Step3Service state={state} dispatch={dispatch} catalog={catalog} errors={stepErrors} />
            )}
            {currentStep === 3 && (
              <Step4Schedule
                state={state}
                dispatch={dispatch}
                photographers={photographers}
                availableSlots={availableSlots}
                slotsLoading={slotsLoading}
                slotsError={slotsError}
                slotPeriod={slotPeriod}
                onChangeSlotPeriod={setSlotPeriod}
                calculatedDuration={calculatedDuration}
                suggestedPhotographerKey={suggestedPhotographerKey}
                slotNeedsSchedule={slotNeedsSchedule}
                errors={stepErrors}
              />
            )}
          </WizardShell>
        </div>

        {successOrderNo && (
          <div className="mt-4 rounded-lg p-4 flex items-center gap-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/50">
            <div className="shrink-0 w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-green-800 dark:text-green-200">
                {t("wizard.success.created").replace("{{orderNo}}", successOrderNo)}
              </p>
              <p className="text-sm text-green-600 dark:text-green-300/90 mt-0.5">
                {t("wizard.success.saved")}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
