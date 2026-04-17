import { useCallback, useMemo, useState } from "react";
import type { EditAddon, EditPricing, Order } from "../../../../api/orders";
import { useDirty } from "../../../../hooks/useDirty";

/**
 * Kapselt den gesamten Form-State der OrderDetail-Ansicht (Edit-Felder,
 * initiale/aktuelle Snapshots und das `detailsDirty`-Flag).
 *
 * Das umgebende `OrderDetail/index.tsx` orchestriert weiterhin Laden,
 * Save und Statuswechsel; dieser Hook ist ausschliesslich fuer die
 * Form-Daten zustaendig, die in den Karten (Kunde, Rechnung, Objekt,
 * Leistungen, Preisuebersicht) angezeigt/bearbeitet werden.
 *
 * Das Interface spiegelt bewusst die Setter-Signaturen des vorherigen
 * useState-Clusters, damit der Orchestrator minimal angepasst werden
 * kann (nur Destrukturierung).
 */

type BillingFields = {
  salutation: string;
  first_name: string;
  name: string;
  email: string;
  phone: string;
  phone_mobile: string;
  company: string;
  company_email: string;
  company_phone: string;
  onsiteName: string;
  onsitePhone: string;
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
};

type ObjectFields = {
  type: string;
  area: string;
  floors: string;
  rooms: string;
};

const INITIAL_BILLING: BillingFields = {
  salutation: "",
  first_name: "",
  name: "",
  email: "",
  phone: "",
  phone_mobile: "",
  company: "",
  company_email: "",
  company_phone: "",
  onsiteName: "",
  onsitePhone: "",
  street: "",
  zip: "",
  city: "",
  zipcity: "",
  order_ref: "",
  notes: "",
  alt_company: "",
  alt_company_email: "",
  alt_company_phone: "",
  alt_street: "",
  alt_zip: "",
  alt_city: "",
  alt_zipcity: "",
  alt_salutation: "",
  alt_first_name: "",
  alt_name: "",
  alt_email: "",
  alt_phone: "",
  alt_phone_mobile: "",
};

const INITIAL_OBJECT: ObjectFields = { type: "", area: "", floors: "", rooms: "" };
const INITIAL_PRICING: EditPricing = { subtotal: 0, discount: 0, vat: 0, total: 0 };

function normalizeAddons(addons: EditAddon[]): EditAddon[] {
  return addons.map((a) => ({
    id: a.id,
    label: a.label,
    price: Number(a.price) || 0,
    ...(a.qty !== undefined ? { qty: Number(a.qty) } : {}),
  }));
}

function billingFromOrder(order: Order): BillingFields {
  return {
    salutation: order.billing?.salutation || "",
    first_name: order.billing?.first_name || "",
    name: order.billing?.name || order.customerName || "",
    email: order.billing?.email || order.customerEmail || "",
    phone: order.billing?.phone || "",
    phone_mobile: order.billing?.phone_mobile || "",
    company: order.billing?.company || "",
    company_email: order.billing?.company_email || "",
    company_phone: order.billing?.company_phone || "",
    onsiteName: order.billing?.onsiteName || "",
    onsitePhone: order.billing?.onsitePhone || "",
    street: order.billing?.street || order.customerStreet || "",
    zip: order.billing?.zip || "",
    city: order.billing?.city || "",
    zipcity: order.billing?.zipcity || order.customerZipcity || "",
    order_ref: order.billing?.order_ref || "",
    notes: order.billing?.notes || order.notes || "",
    alt_company: order.billing?.alt_company || "",
    alt_company_email: order.billing?.alt_company_email || "",
    alt_company_phone: order.billing?.alt_company_phone || "",
    alt_street: order.billing?.alt_street || "",
    alt_zip: order.billing?.alt_zip || "",
    alt_city: order.billing?.alt_city || "",
    alt_zipcity: order.billing?.alt_zipcity || "",
    alt_salutation: order.billing?.alt_salutation || "",
    alt_first_name: order.billing?.alt_first_name || "",
    alt_name: order.billing?.alt_name || "",
    alt_email: order.billing?.alt_email || "",
    alt_phone: order.billing?.alt_phone || "",
    alt_phone_mobile: order.billing?.alt_phone_mobile || "",
  };
}

function objectFromOrder(order: Order): ObjectFields {
  return {
    type: String(order.object?.type || ""),
    area: String(order.object?.area || ""),
    floors: String(order.object?.floors || ""),
    rooms: String(order.object?.rooms || ""),
  };
}

function addonsFromOrder(order: Order): EditAddon[] {
  return (order.services?.addons || []).map((a) => {
    const raw = a as unknown as Record<string, unknown>;
    return {
      id: String(a.id || ""),
      label: String(a.label || ""),
      price: Number(a.price) || 0,
      ...(raw.qty !== undefined ? { qty: Number(raw.qty) } : {}),
    };
  });
}

function pricingFromOrder(order: Order): EditPricing {
  return {
    subtotal: Number(order.pricing?.subtotal) || 0,
    discount: Number(order.pricing?.discount) || 0,
    vat: Number(order.pricing?.vat) || 0,
    total: Number(order.total || order.pricing?.total) || 0,
  };
}

export function useOrderForm(data: Order | null) {
  const [editBilling, setEditBilling] = useState<BillingFields>(INITIAL_BILLING);
  const [editObjectAddress, setEditObjectAddress] = useState("");
  const [editObject, setEditObject] = useState<ObjectFields>(INITIAL_OBJECT);
  const [editPackageKey, setEditPackageKey] = useState("");
  const [editAddons, setEditAddons] = useState<EditAddon[]>([]);
  const [editPricing, setEditPricing] = useState<EditPricing>(INITIAL_PRICING);
  const [editKeyPickupActive, setEditKeyPickupActive] = useState(false);
  const [editKeyPickupAddress, setEditKeyPickupAddress] = useState("");
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomPrice, setNewCustomPrice] = useState("");

  const initialDetails = useMemo(() => {
    if (!data) return null;
    return {
      billing: billingFromOrder(data),
      objectAddress: data.address || "",
      object: objectFromOrder(data),
      packageKey: data.services?.package?.key || "",
      addons: normalizeAddons(addonsFromOrder(data)),
      pricing: pricingFromOrder(data),
      keyPickup: {
        active: !!data.keyPickup?.address,
        address: data.keyPickup?.address || "",
      },
      customDraft: { label: "", price: "" },
    };
  }, [data]);

  const currentDetails = useMemo(() => {
    if (!data) return null;
    return {
      billing: { ...editBilling },
      objectAddress: editObjectAddress || "",
      object: { ...editObject },
      packageKey: editPackageKey || "",
      addons: normalizeAddons(editAddons),
      pricing: {
        subtotal: Number(editPricing.subtotal) || 0,
        discount: Number(editPricing.discount) || 0,
        vat: Number(editPricing.vat) || 0,
        total: Number(editPricing.total) || 0,
      },
      keyPickup: {
        active: !!(editKeyPickupActive && editKeyPickupAddress),
        address: editKeyPickupAddress || "",
      },
      customDraft: { label: newCustomLabel.trim(), price: newCustomPrice.trim() },
    };
  }, [
    data,
    editAddons,
    editBilling,
    editKeyPickupActive,
    editKeyPickupAddress,
    editObject,
    editObjectAddress,
    editPackageKey,
    editPricing,
    newCustomLabel,
    newCustomPrice,
  ]);

  const detailsDirty = useDirty(currentDetails, initialDetails);

  const loadFromOrder = useCallback((order: Order) => {
    setEditBilling(billingFromOrder(order));
    setEditObjectAddress(order.address || "");
    setEditObject(objectFromOrder(order));
    setEditPackageKey(order.services?.package?.key || "");
    setEditAddons(addonsFromOrder(order));
    setEditPricing(pricingFromOrder(order));
    setEditKeyPickupActive(!!order.keyPickup?.address);
    setEditKeyPickupAddress(order.keyPickup?.address || "");
  }, []);

  return {
    editBilling,
    setEditBilling,
    editObjectAddress,
    setEditObjectAddress,
    editObject,
    setEditObject,
    editPackageKey,
    setEditPackageKey,
    editAddons,
    setEditAddons,
    editPricing,
    setEditPricing,
    editKeyPickupActive,
    setEditKeyPickupActive,
    editKeyPickupAddress,
    setEditKeyPickupAddress,
    newCustomLabel,
    setNewCustomLabel,
    newCustomPrice,
    setNewCustomPrice,
    initialDetails,
    currentDetails,
    detailsDirty,
    loadFromOrder,
  };
}

export type UseOrderFormReturn = ReturnType<typeof useOrderForm>;
