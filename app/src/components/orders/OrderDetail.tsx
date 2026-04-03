import { useCallback, useEffect, useMemo, useState } from "react";
import { assignPhotographer, getOrder, getOrderIcsUrl, resendEmail, resendStatusEmails, rescheduleOrder, type Order, type EditAddon, type EditPricing, type ResendEmailType, updateOrderDetails, updateOrderStatus } from "../../api/orders";
import { getAdminConfig, type AdminConfig } from "../../api/adminConfig";
import { apiRequest } from "../../api/client";
import { getPhotographers, type Photographer } from "../../api/photographers";
import { getCustomerContacts, type Customer, type CustomerContact } from "../../api/customers";
import { getTourByOrderNo } from "../../api/toursAdmin";
import { useMutation } from "../../hooks/useMutation";
import { formatPhoneDisplay } from "../../lib/format";
import { PhoneLink } from "../ui/PhoneLink";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import { ordersQueryKey } from "../../lib/queryKeys";
import { OrderStatusSelect } from "./OrderStatusSelect";
import { DbFieldHint } from "../ui/DbFieldHint";
import { useAuthStore } from "../../store/authStore";
import { useQueryStore } from "../../store/queryStore";
import { ConfirmDeleteDialog } from "../ui/ConfirmDeleteDialog";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { CustomerAutocompleteInput } from "../ui/CustomerAutocompleteInput";
import { OrderChat } from "./OrderChat";
import { OrderEmailLog } from "./OrderEmailLog";
import { t, type Lang } from "../../i18n";
const GROUP_LABEL_KEYS: Record<string, string> = {
  camera: "orderDetail.group.camera", dronePhoto: "orderDetail.group.dronePhoto", tour: "orderDetail.group.tour",
  floorplans: "orderDetail.group.floorplans", groundVideo: "orderDetail.group.groundVideo", droneVideo: "orderDetail.group.droneVideo",
  staging: "orderDetail.group.staging", express: "orderDetail.group.express",
};
const DEFAULT_STATUS_EMAIL_TARGETS = {
  customer: false,
  office: false,
  photographer: false,
  cc: false,
};
const RADIO_GROUPS = new Set(["camera", "dronePhoto", "groundVideo", "droneVideo"]);
const ADDON_ORDER = ["camera", "dronePhoto", "tour", "floorplans", "groundVideo", "droneVideo", "staging", "express"];
const KEY_PICKUP_PRICE = 50;

type Props = {
  token: string;
  orderNo: string;
  onClose: () => void;
  onDelete: (orderNo: string) => void;
  onRefresh?: () => Promise<void> | void;
  onOpenUpload?: (orderNo: string) => void;
};

function toDateTimeLocalValue(date?: string, time?: string, fallbackIso?: string): string {
  if (date && time) return `${date}T${time}`;
  if (!fallbackIso) return "";
  const d = new Date(fallbackIso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeCompareValue(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function isSyntheticCompanyEmail(email?: string | null): boolean {
  return /@company\.local$/i.test(String(email || "").trim());
}

function CopyButton({ value, lang }: { value: string; lang: Lang }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={t(lang, "common.copy")}
      className="ml-1 inline-flex items-center text-zinc-400 hover:text-[var(--accent)] transition-colors"
    >
      {copied ? (
        <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
}

export function OrderDetail({ token, orderNo, onClose, onDelete, onRefresh, onOpenUpload }: Props) {
  const ordersKey = ordersQueryKey(token);
  const lang = useAuthStore((s) => s.language);
  const uiMode = useAuthStore((s) => s.uiMode);
  const role = useAuthStore((s) => s.role);
  const isPhotographer = role === "photographer";
  const canManageOrder = !isPhotographer;
  const updateCachedOrders = useQueryStore((s) => s.updateData);
  const [data, setData] = useState<Order | null>(null);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [status, setStatus] = useState("pending");
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [scheduleDurationMin, setScheduleDurationMin] = useState("60");
  const [originalStatus, setOriginalStatus] = useState("pending");
  const [originalSchedule, setOriginalSchedule] = useState("");
  const [originalScheduleDurationMin, setOriginalScheduleDurationMin] = useState("60");
  const [pendingPhotographerKey, setPendingPhotographerKey] = useState("");
  const [originalPhotographerKey, setOriginalPhotographerKey] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [err, setErr] = useState("");
  const [savedOk, setSavedOk] = useState(false);
  const [busy, setBusy] = useState("");
  const [sendStatusEmails, setSendStatusEmails] = useState(false);
  const [statusEmailTargets, setStatusEmailTargets] = useState(DEFAULT_STATUS_EMAIL_TARGETS);
  const [editMode, setEditMode] = useState(false);
  const [editBilling, setEditBilling] = useState({ salutation: "", first_name: "", name: "", email: "", phone: "", phone_mobile: "", company: "", company_email: "", company_phone: "", onsiteName: "", onsitePhone: "", street: "", zip: "", city: "", zipcity: "", order_ref: "", notes: "", alt_company: "", alt_company_email: "", alt_company_phone: "", alt_street: "", alt_zip: "", alt_city: "", alt_zipcity: "", alt_salutation: "", alt_first_name: "", alt_name: "", alt_email: "", alt_phone: "", alt_phone_mobile: "" });
  const [editObjectAddress, setEditObjectAddress] = useState("");
  const [editObject, setEditObject] = useState({ type: "", area: "", floors: "", rooms: "" });
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null);
  const [editPackageKey, setEditPackageKey] = useState("");
  const [editAddons, setEditAddons] = useState<EditAddon[]>([]);
  const [editPricing, setEditPricing] = useState<EditPricing>({ subtotal: 0, discount: 0, vat: 0, total: 0 });
  const [editKeyPickupActive, setEditKeyPickupActive] = useState(false);
  const [editKeyPickupAddress, setEditKeyPickupAddress] = useState("");
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomPrice, setNewCustomPrice] = useState("");
  const [companyContacts, setCompanyContacts] = useState<Customer[]>([]);
  const [linkedTour, setLinkedTour] = useState<{ id: number; bezeichnung: string; tourUrl: string; matterportSpaceId: string; status: string } | null | undefined>(undefined);
  const [showLinkTourPopup, setShowLinkTourPopup] = useState(false);
  const emailsDirty = sendStatusEmails && (statusEmailTargets.customer || statusEmailTargets.office || statusEmailTargets.photographer || statusEmailTargets.cc);
  const statusDirty = status !== originalStatus || scheduleLocal !== originalSchedule || scheduleDurationMin !== originalScheduleDurationMin || pendingPhotographerKey !== originalPhotographerKey || emailsDirty;

  const detailsDirty = useMemo(() => {
    if (!data) return false;
    const baseBillingStreet = data.billing?.street || data.customerStreet || "";
    const baseBillingZipcity = data.billing?.zipcity || data.customerZipcity || "";
    const billingDirty =
      (editBilling.salutation || "") !== (data.billing?.salutation || "") ||
      (editBilling.first_name || "") !== (data.billing?.first_name || "") ||
      (editBilling.name || "") !== (data.billing?.name || data.customerName || "") ||
      (editBilling.email || "") !== (data.billing?.email || data.customerEmail || "") ||
      (editBilling.phone || "") !== (data.billing?.phone || "") ||
      (editBilling.phone_mobile || "") !== (data.billing?.phone_mobile || "") ||
      (editBilling.company || "") !== (data.billing?.company || "") ||
      (editBilling.company_email || "") !== (data.billing?.company_email || "") ||
      (editBilling.company_phone || "") !== (data.billing?.company_phone || "") ||
      (editBilling.onsiteName || "") !== (data.billing?.onsiteName || "") ||
      (editBilling.onsitePhone || "") !== (data.billing?.onsitePhone || "") ||
      (editBilling.street || "") !== baseBillingStreet ||
      (editBilling.zip || "") !== (data.billing?.zip || "") ||
      (editBilling.city || "") !== (data.billing?.city || "") ||
      (editBilling.zipcity || "") !== baseBillingZipcity ||
      (editBilling.order_ref || "") !== (data.billing?.order_ref || "") ||
      (editBilling.notes || "") !== (data.billing?.notes || data.notes || "") ||
      (editBilling.alt_company || "") !== (data.billing?.alt_company || "") ||
      (editBilling.alt_company_email || "") !== (data.billing?.alt_company_email || "") ||
      (editBilling.alt_company_phone || "") !== (data.billing?.alt_company_phone || "") ||
      (editBilling.alt_street || "") !== (data.billing?.alt_street || "") ||
      (editBilling.alt_zip || "") !== (data.billing?.alt_zip || "") ||
      (editBilling.alt_city || "") !== (data.billing?.alt_city || "") ||
      (editBilling.alt_zipcity || "") !== (data.billing?.alt_zipcity || "") ||
      (editBilling.alt_salutation || "") !== (data.billing?.alt_salutation || "") ||
      (editBilling.alt_first_name || "") !== (data.billing?.alt_first_name || "") ||
      (editBilling.alt_name || "") !== (data.billing?.alt_name || "") ||
      (editBilling.alt_email || "") !== (data.billing?.alt_email || "") ||
      (editBilling.alt_phone || "") !== (data.billing?.alt_phone || "") ||
      (editBilling.alt_phone_mobile || "") !== (data.billing?.alt_phone_mobile || "");

    const objectAddressDirty = (editObjectAddress || "") !== (data.address || "");
    const objectDirty =
      objectAddressDirty ||
      (editObject.type || "") !== String(data.object?.type || "") ||
      (editObject.area || "") !== String(data.object?.area || "") ||
      (editObject.floors || "") !== String(data.object?.floors || "") ||
      (editObject.rooms || "") !== String(data.object?.rooms || "");

    const pkgDirty = (editPackageKey || "") !== (data.services?.package?.key || "");

    const normalizeAddons = (addons: EditAddon[]) => addons.map((a) => ({ id: a.id, label: a.label, price: Number(a.price) || 0, ...(a.qty !== undefined ? { qty: Number(a.qty) } : {}) }));
    const addonsDirty = JSON.stringify(normalizeAddons(editAddons)) !== JSON.stringify(normalizeAddons((data.services?.addons || []) as EditAddon[]));

    const pricingDirty =
      Number(editPricing.subtotal) !== Number(data.pricing?.subtotal || 0) ||
      Number(editPricing.discount) !== Number(data.pricing?.discount || 0) ||
      Number(editPricing.vat) !== Number(data.pricing?.vat || 0) ||
      Number(editPricing.total) !== Number(data.total || data.pricing?.total || 0);

    const keyPickupDirty = !!(editKeyPickupActive && editKeyPickupAddress) !== !!data.keyPickup?.address || (editKeyPickupAddress || "") !== (data.keyPickup?.address || "");

    const customDraftDirty = Boolean(newCustomLabel.trim()) || Boolean(newCustomPrice.trim());

    return billingDirty || objectDirty || pkgDirty || addonsDirty || pricingDirty || keyPickupDirty || customDraftDirty;
  }, [data, editAddons, editBilling, editKeyPickupActive, editKeyPickupAddress, editObject, editObjectAddress, editPackageKey, editPricing, newCustomLabel, newCustomPrice]);

  const effectiveEditMode = canManageOrder && editMode;
  const isDirty = canManageOrder && (statusDirty || (effectiveEditMode && detailsDirty));

  useUnsavedChangesGuard(`order-detail-${orderNo}`, isDirty);

  const load = useCallback(async () => {
    const configPromise = canManageOrder ? getAdminConfig(token).catch(() => null) : Promise.resolve(null);
    const [order, staff, config] = await Promise.all([getOrder(token, orderNo), getPhotographers(token), configPromise]);
    setData(order);
    setPhotographers(staff);
    setAdminConfig(config);
    const s = order.status || "pending";
    const sched = toDateTimeLocalValue(order.schedule?.date, order.schedule?.time, order.appointmentDate);
    const duration = String(Math.max(1, Number(order.schedule?.durationMin || 60)));
    const pk = order.photographer?.key || "";
    setStatus(s);
    setOriginalStatus(s);
    setScheduleLocal(sched);
    setOriginalSchedule(sched);
    setScheduleDurationMin(duration);
    setOriginalScheduleDurationMin(duration);
    setPendingPhotographerKey(pk);
    setOriginalPhotographerKey(pk);
    setSendStatusEmails(false);
    setStatusEmailTargets(DEFAULT_STATUS_EMAIL_TARGETS);
    setEditBilling({
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
    });
    setEditObjectAddress(order.address || "");
    setEditObject({
      type: String(order.object?.type || ""),
      area: String(order.object?.area || ""),
      floors: String(order.object?.floors || ""),
      rooms: String(order.object?.rooms || ""),
    });
    setEditPackageKey(order.services?.package?.key || "");
    setEditAddons((order.services?.addons || []).map((a) => { const raw = a as unknown as Record<string, unknown>; return { id: String(a.id || ""), label: String(a.label || ""), price: Number(a.price) || 0, ...(raw.qty !== undefined ? { qty: Number(raw.qty) } : {}) }; }));
    setEditPricing({ subtotal: Number(order.pricing?.subtotal) || 0, discount: Number(order.pricing?.discount) || 0, vat: Number(order.pricing?.vat) || 0, total: Number(order.total || order.pricing?.total) || 0 });
    setEditKeyPickupActive(!!order.keyPickup?.address);
    setEditKeyPickupAddress(order.keyPickup?.address || "");
    // Tour-Verknüpfung laden
    const parsedNo = parseInt(String(order.orderNo || orderNo), 10);
    if (Number.isFinite(parsedNo) && parsedNo > 0) {
      getTourByOrderNo(parsedNo)
        .then((r) => setLinkedTour(r.tour))
        .catch(() => setLinkedTour(null));
    } else {
      setLinkedTour(null);
    }
  }, [canManageOrder, token, orderNo]);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : t(lang, "common.error")));
  }, [load, orderNo]);

  async function saveStatusWithOverride(orderNoToSave: string, nextStatus: string) {
    try {
      await updateOrderStatus(token, orderNoToSave, nextStatus, {
        sendEmails: sendStatusEmails,
        sendEmailTargets: statusEmailTargets,
      });
      return;
    } catch (error) {
      const conflict = error as Error & { code?: string; canOverride?: boolean };
      if (conflict?.code !== "SLOT_OCCUPIED_CAN_OVERRIDE" || !conflict?.canOverride) {
        throw error;
      }
      const shouldOverride = window.confirm("Der Slot ist durch eine andere Buchung belegt. Trotzdem speichern?");
      if (!shouldOverride) {
        const cancelled = new Error("Speichern abgebrochen.");
        (cancelled as Error & { cancelledByUser?: boolean }).cancelledByUser = true;
        throw cancelled;
      }
      await updateOrderStatus(token, orderNoToSave, nextStatus, {
        sendEmails: sendStatusEmails,
        sendEmailTargets: statusEmailTargets,
        forceSlot: true,
        overrideReason: "Admin-Override nach Warnung: Slot belegt",
      });
    }
  }

  async function runSaveChanges() {
    if (!canManageOrder) return;
    if (!data) return;
    setErr("");
    const isCancelled = status.toLowerCase() === "cancelled";
    const parsedDurationMin = Number.parseInt(scheduleDurationMin, 10);
    if (!isCancelled && scheduleLocal) {
      const [date, time] = scheduleLocal.split("T");
      if (!date || !time) { setErr(t(lang, "orderDetail.error.invalidDateTime")); return; }
      if (!Number.isFinite(parsedDurationMin) || parsedDurationMin <= 0) {
        setErr(`${t(lang, "wizard.label.durationMin")}: ungültiger Wert`);
        return;
      }
    }
    setBusy("save");
    try {
      if (status !== originalStatus) {
        await saveStatusWithOverride(data.orderNo, status);
      } else if (sendStatusEmails && (statusEmailTargets.customer || statusEmailTargets.office || statusEmailTargets.photographer || statusEmailTargets.cc)) {
        await resendStatusEmails(token, data.orderNo, statusEmailTargets);
      }
      if (!isCancelled && scheduleLocal && (scheduleLocal !== originalSchedule || scheduleDurationMin !== originalScheduleDurationMin)) {
        const [date, time] = scheduleLocal.split("T");
        if (date && time) {
          await scheduleMutation.mutate({ orderNo: data.orderNo, date, time, durationMin: parsedDurationMin });
        }
      }
      if (pendingPhotographerKey !== originalPhotographerKey) {
        await photographerMutation.mutate({
          orderNo: data.orderNo,
          photographerKey: pendingPhotographerKey,
        });
      }
      await load();
      await onRefresh?.();
      setSendStatusEmails(false);
      setStatusEmailTargets(DEFAULT_STATUS_EMAIL_TARGETS);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      if ((e as Error & { cancelledByUser?: boolean })?.cancelledByUser) {
        setBusy("");
        return;
      }
      if (status !== originalStatus) {
        setStatus(originalStatus);
      }
      setErr(e instanceof Error ? e.message : t(lang, "orderDetail.error.saveFailed"));
    } finally { setBusy(""); }
  }

  async function runResendEmail(emailType: ResendEmailType) {
    if (!canManageOrder) return;
    if (!data) return;
    setBusy("mail");
    try {
      await resendEmail(token, data.orderNo, emailType);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      await load();
    } catch (e) {
      setErr((e as Error).message || t(lang, "orderDetail.error.emailFailed"));
    } finally { setBusy(""); }
  }

  function openEditMode() {
    if (!canManageOrder) return;
    setErr("");
    setEditMode(true);
  }

  function handleClose() {
    if (isDirty) {
      const ok = window.confirm(t(lang, "orderDetail.confirm.unsavedClose"));
      if (!ok) return;
    }
    onClose();
  }

  function cancelEditMode() {
    if (!data) return;
    setEditBilling({
      salutation: data.billing?.salutation || "",
      first_name: data.billing?.first_name || "",
      name: data.billing?.name || data.customerName || "",
      email: data.billing?.email || data.customerEmail || "",
      phone: data.billing?.phone || "",
      phone_mobile: data.billing?.phone_mobile || "",
      company: data.billing?.company || "",
      company_email: data.billing?.company_email || "",
      company_phone: data.billing?.company_phone || "",
      onsiteName: data.billing?.onsiteName || "",
      onsitePhone: data.billing?.onsitePhone || "",
      street: data.billing?.street || data.customerStreet || "",
      zip: data.billing?.zip || "",
      city: data.billing?.city || "",
      zipcity: data.billing?.zipcity || data.customerZipcity || "",
      order_ref: data.billing?.order_ref || "",
      notes: data.billing?.notes || data.notes || "",
      alt_company: data.billing?.alt_company || "",
      alt_company_email: data.billing?.alt_company_email || "",
      alt_company_phone: data.billing?.alt_company_phone || "",
      alt_street: data.billing?.alt_street || "",
      alt_zip: data.billing?.alt_zip || "",
      alt_city: data.billing?.alt_city || "",
      alt_zipcity: data.billing?.alt_zipcity || "",
      alt_salutation: data.billing?.alt_salutation || "",
      alt_first_name: data.billing?.alt_first_name || "",
      alt_name: data.billing?.alt_name || "",
      alt_email: data.billing?.alt_email || "",
      alt_phone: data.billing?.alt_phone || "",
      alt_phone_mobile: data.billing?.alt_phone_mobile || "",
    });
    setEditObjectAddress(data.address || "");
    setEditObject({
      type: String(data.object?.type || ""),
      area: String(data.object?.area || ""),
      floors: String(data.object?.floors || ""),
      rooms: String(data.object?.rooms || ""),
    });
    setEditPackageKey(data.services?.package?.key || "");
    setEditAddons((data.services?.addons || []).map((a) => { const raw = a as unknown as Record<string, unknown>; return { id: String(a.id || ""), label: String(a.label || ""), price: Number(a.price) || 0, ...(raw.qty !== undefined ? { qty: Number(raw.qty) } : {}) }; }));
    setEditPricing({ subtotal: Number(data.pricing?.subtotal) || 0, discount: Number(data.pricing?.discount) || 0, vat: Number(data.pricing?.vat) || 0, total: Number(data.total || data.pricing?.total) || 0 });
    setEditKeyPickupActive(!!data.keyPickup?.address);
    setEditKeyPickupAddress(data.keyPickup?.address || "");
    setNewCustomLabel("");
    setNewCustomPrice("");
    setEditMode(false);
    setErr("");
  }

  async function runSaveDetails() {
    if (!canManageOrder) return;
    if (!data) return;
    setErr("");
    setBusy("details");
    try {
      const pkgCfg = adminConfig?.packages.find((p) => p.key === editPackageKey);
      await updateOrderDetails(token, data.orderNo, {
        billing: editBilling,
        object: editObject,
        address: editObjectAddress,
        services: {
          package: pkgCfg ? { key: pkgCfg.key, label: pkgCfg.label, price: pkgCfg.price ?? 0 } : (editPackageKey ? { key: editPackageKey, label: editPackageKey, price: 0 } : null),
          addons: editAddons,
        },
        pricing: editPricing,
        keyPickup: editKeyPickupActive && editKeyPickupAddress ? { address: editKeyPickupAddress } : null,
      });
      await load();
      setEditMode(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t(lang, "orderDetail.error.detailsSaveFailed"));
    } finally {
      setBusy("");
    }
  }

  async function runDelete() {
    if (!canManageOrder) return;
    setBusy("delete");
    try {
      await onDelete(orderNo);
    } finally {
      setBusy("");
      setShowDeleteConfirm(false);
    }
  }

  function toggleRadioAddon(group: string, id: string, label: string, price: number) {
    setEditAddons((prev) => {
      const filtered = prev.filter((a) => !a.id.startsWith(group + ":"));
      const wasActive = prev.some((a) => a.id === id);
      return wasActive ? filtered : [...filtered, { id, label, price }];
    });
  }

  function toggleCheckboxAddon(id: string, label: string, price: number, qty?: number) {
    setEditAddons((prev) => {
      if (prev.some((a) => a.id === id)) return prev.filter((a) => a.id !== id);
      return [...prev, { id, label, price, ...(qty !== undefined ? { qty } : {}) }];
    });
  }

  function setStagingQty(id: string, qty: number) {
    setEditAddons((prev) => prev.map((a) => (a.id === id ? { ...a, qty: Math.max(1, qty) } : a)));
  }

  function addCustomAddon() {
    const label = newCustomLabel.trim();
    const price = parseFloat(newCustomPrice) || 0;
    if (!label) return;
    setEditAddons((prev) => [...prev, { id: `custom_${Date.now()}`, label, price }]);
    setNewCustomLabel("");
    setNewCustomPrice("");
  }

  function removeAddon(id: string) {
    setEditAddons((prev) => prev.filter((a) => a.id !== id));
  }

  const recalcPricing = useCallback(async () => {
    setBusy("recalc");
    try {
      const knownAddons = editAddons.filter((a) => !a.id.startsWith("custom_"));
      const customSum = editAddons
        .filter((a) => a.id.startsWith("custom_"))
        .reduce((sum, addon) => sum + (Number(addon.price) || 0) * (addon.qty && addon.qty > 1 ? addon.qty : 1), 0);
      const addonIds = knownAddons.map((a) => (a.qty ? { id: a.id, qty: a.qty } : a.id));

      const result = await apiRequest<{ subtotal?: number; discount?: number; discountAmount?: number; vat?: number; total?: number }>(
        "/api/bot", "POST", token,
        { action: "pricing", package: editPackageKey || null, addons: addonIds, area: editObject.area, floors: editObject.floors },
      );
      if (result) {
        let subtotal = (result.subtotal || 0) + customSum;
        if (editKeyPickupActive) subtotal += KEY_PICKUP_PRICE;
        const discount = result.discountAmount ?? result.discount ?? 0;
        const afterDiscount = Math.max(0, subtotal - discount);
        const vat = Math.round(afterDiscount * 0.081 * 20) / 20;
        const total = Math.round((afterDiscount + vat) * 20) / 20;
        setEditPricing({ subtotal, discount, vat, total });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t(lang, "orderDetail.error.pricingFailed"));
    } finally { setBusy(""); }
  }, [editAddons, editPackageKey, editObject.area, editObject.floors, editKeyPickupActive, token]);

  useEffect(() => {
    if (!effectiveEditMode) return;
    const timer = setTimeout(recalcPricing, 500);
    return () => clearTimeout(timer);
  }, [effectiveEditMode, recalcPricing]);

  const customerLabel = data?.billing?.company || data?.customerName || "";
  const customerPhoneRaw = String(data?.billing?.company_phone || data?.customerPhone || "").trim();
  const customerEmailRaw = data?.billing?.company_email || data?.customerEmail || "";
  const customerEmailDisplay = isSyntheticCompanyEmail(customerEmailRaw) ? "" : customerEmailRaw;
  const billingName = data?.billing?.name || "";
  const billingEmail = data?.billing?.email || data?.customerEmail || "";
  const billingPhoneRaw = String(data?.billing?.phone || "").trim();
  const contactPhoneRaw = String(data?.customerContactPhone || "").trim();
  const sameCustomerAndContact = normalizeCompareValue(billingName) !== "" && normalizeCompareValue(billingName) === normalizeCompareValue(customerLabel);
  const contactName = sameCustomerAndContact
    ? (data?.customerContactName || "")
    : (billingName || data?.customerContactName || "");
  const email = isSyntheticCompanyEmail(billingEmail)
    ? (data?.customerContactEmail || "")
    : (billingEmail || data?.customerContactEmail || "");
  const phoneRaw = billingPhoneRaw || contactPhoneRaw;
  const mobileRaw = String(data?.billing?.phone_mobile || "").trim();
  const customerStreetRaw = data?.customerStreet || "";
  const customerZipcityRaw = data?.customerZipcity || "";
  const billingStreetRaw = data?.billing?.street || "";
  const billingZipcityRaw = data?.billing?.zipcity || "";
  const billingStreetDisplay = data?.billing?.street || data?.customerStreet || "";
  const billingZipcityDisplay = data?.billing?.zipcity || data?.customerZipcity || "";
  const hasExplicitBillingAddress = normalizeCompareValue(billingStreetRaw) !== "" || normalizeCompareValue(billingZipcityRaw) !== "";
  const billingAddressDiffersFromCustomer = hasExplicitBillingAddress && (
    normalizeCompareValue(billingStreetRaw) !== normalizeCompareValue(customerStreetRaw) ||
    normalizeCompareValue(billingZipcityRaw) !== normalizeCompareValue(customerZipcityRaw)
  );
  const billingSectionTitle = billingAddressDiffersFromCustomer
    ? t(lang, "orderDetail.section.billingAddressDifferent")
    : t(lang, "orderDetail.section.billingAddress");

  const scheduleMutation = useMutation<void, { orderNo: string; date: string; time: string; durationMin: number }>(
    async ({ orderNo: nextOrderNo, date, time, durationMin }) => {
      await rescheduleOrder(token, nextOrderNo, date, time, durationMin);
    },
    {
      mutationKey: `order-detail:reschedule:${token}`,
      invalidateKeys: [ordersKey],
    },
  );

  const photographerMutation = useMutation<void, { orderNo: string; photographerKey: string }, { previous?: Order[] }>(
    async ({ orderNo: nextOrderNo, photographerKey }) => {
      await assignPhotographer(token, nextOrderNo, photographerKey);
    },
    {
      mutationKey: `order-detail:assignPhotographer:${token}`,
      invalidateKeys: [ordersKey],
      onMutate: ({ orderNo: nextOrderNo, photographerKey }) => {
        const previous = useQueryStore.getState().queries[ordersKey]?.data as Order[] | undefined;
        const selectedPhotographer = photographers.find((p) => p.key === photographerKey);
        updateCachedOrders<Order[]>(ordersKey, (current = []) =>
          current.map((order) =>
            order.orderNo === nextOrderNo
              ? {
                  ...order,
                  photographer: {
                    key: photographerKey,
                    name: selectedPhotographer?.name || order.photographer?.name || "",
                    email: selectedPhotographer?.email || order.photographer?.email || "",
                  },
                }
              : order,
          ),
        );
        return { previous: previous ? [...previous] : undefined };
      },
      onError: (_error, _variables, context) => {
        if (!context?.previous) return;
        useQueryStore.getState().setData(ordersKey, context.previous);
      },
    },
  );

  return (
    <>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4">
        <div className={uiMode === "modern" ? "surface-card max-h-[92vh] w-full max-w-full sm:max-w-5xl overflow-auto p-3 sm:p-5" : "max-h-[92vh] w-full max-w-full sm:max-w-3xl overflow-auto rounded-xl bg-white p-3 sm:p-4 shadow-xl"}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">{t(lang, "orderDetail.title").replace("{{orderNo}}", orderNo)}</h3>
            <div className="flex items-center gap-2">
              {!effectiveEditMode && data && canManageOrder && (
                <button onClick={openEditMode} className={uiMode === "modern" ? "btn-secondary" : "rounded border px-2 py-1 text-sm"}>{t(lang, "common.edit")}</button>
              )}
              <button onClick={handleClose} className={uiMode === "modern" ? "btn-secondary" : "rounded border px-2 py-1 text-sm"}>{t(lang, "common.close")}</button>
            </div>
          </div>

          {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}
          {!data ? <p className="text-sm text-zinc-500">{t(lang, "common.loading")}</p> : (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                {effectiveEditMode ? (
                  <>
                    <div className="surface-card p-3">
                      <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.label.customerSection")}</h4>
                      <div className="space-y-1.5">
                        <label className="block"><span className="text-xs text-zinc-500">{t(lang, "common.company")}</span><CustomerAutocompleteInput className="ui-input mt-0.5" value={editBilling.company} onChange={value => { setEditBilling(p => ({ ...p, company: value })); if (!value.trim()) setCompanyContacts([]); }} onSelectCustomer={(customer) => { setEditBilling((p) => ({ ...p, name: customer.name || p.name, email: customer.email || p.email, phone: customer.phone || p.phone, company: customer.company || p.company, company_email: customer.email || p.company_email, company_phone: customer.phone || p.company_phone, street: customer.street || p.street, zipcity: customer.zipcity || p.zipcity })); if (customer.id) { getCustomerContacts(token, customer.id).then((cts: CustomerContact[]) => setCompanyContacts(cts.map((ct) => ({ id: ct.id, name: ct.name || "", email: ct.email || "", phone: ct.phone || "", company: customer.company || "" })))).catch(() => setCompanyContacts([])); } }} selectValue={(c) => c.company || ""} token={token} /></label>
                        <label className="block"><span className="text-xs text-zinc-500">Firma E-Mail</span><input className="ui-input mt-0.5" type="email" value={editBilling.company_email} onChange={e => setEditBilling(p => ({ ...p, company_email: e.target.value }))} /></label>
                        <label className="block"><span className="text-xs text-zinc-500">Firma Telefon</span><input className="ui-input mt-0.5" value={editBilling.company_phone} onChange={e => setEditBilling(p => ({ ...p, company_phone: e.target.value }))} /></label>
                      </div>
                    </div>
                    <div className="surface-card p-3">
                      <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.label.contactSection")}</h4>
                      <div className="space-y-1.5">
                        <label className="block"><span className="text-xs text-zinc-500">Anrede</span><input className="ui-input mt-0.5" value={editBilling.salutation} onChange={e => setEditBilling(p => ({ ...p, salutation: e.target.value }))} /></label>
                        <label className="block"><span className="text-xs text-zinc-500">Vorname</span><input className="ui-input mt-0.5" value={editBilling.first_name} onChange={e => setEditBilling(p => ({ ...p, first_name: e.target.value }))} /></label>
                        <label className="block"><span className="text-xs text-zinc-500">{t(lang, "common.name")}</span><CustomerAutocompleteInput className="ui-input mt-0.5" value={editBilling.name} onChange={value => setEditBilling(p => ({ ...p, name: value }))} onSelectCustomer={(customer) => setEditBilling((p) => ({ ...p, name: customer.name || p.name, email: customer.email || p.email, phone: customer.phone || p.phone }))} customers={companyContacts.length > 0 ? companyContacts : undefined} minChars={companyContacts.length > 0 ? 0 : 3} token={companyContacts.length > 0 ? undefined : token} /></label>
                        <label className="block"><span className="text-xs text-zinc-500">{t(lang, "common.email")}</span><CustomerAutocompleteInput className="ui-input mt-0.5" type="email" value={editBilling.email} onChange={value => setEditBilling(p => ({ ...p, email: value }))} onSelectCustomer={(customer) => setEditBilling((p) => ({ ...p, name: customer.name || p.name, email: customer.email || p.email, phone: customer.phone || p.phone }))} customers={companyContacts.length > 0 ? companyContacts : undefined} minChars={companyContacts.length > 0 ? 0 : 3} token={companyContacts.length > 0 ? undefined : token} /></label>
                        <label className="block"><span className="text-xs text-zinc-500">{t(lang, "common.phone")}</span><CustomerAutocompleteInput className="ui-input mt-0.5" value={editBilling.phone} onChange={value => setEditBilling(p => ({ ...p, phone: value }))} onSelectCustomer={(customer) => setEditBilling((p) => ({ ...p, name: customer.name || p.name, email: customer.email || p.email, phone: customer.phone || p.phone }))} customers={companyContacts.length > 0 ? companyContacts : undefined} minChars={companyContacts.length > 0 ? 0 : 3} token={companyContacts.length > 0 ? undefined : token} /></label>
                        <label className="block"><span className="text-xs text-zinc-500">Mobil</span><input className="ui-input mt-0.5" value={editBilling.phone_mobile} onChange={e => setEditBilling(p => ({ ...p, phone_mobile: e.target.value }))} /></label>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="surface-card p-3">
                      <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.label.customerSection")}</h4>
                      <div><b>{t(lang, "common.company")}:</b> {customerLabel || <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}</div>
                      {customerPhoneRaw && (
                        <div className="flex items-center gap-1">
                          <b>{t(lang, "common.phone")}:</b>&nbsp;
                          <PhoneLink value={customerPhoneRaw} className="text-[var(--accent)]" />
                          <CopyButton value={formatPhoneDisplay(customerPhoneRaw)} lang={lang} />
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <b>{t(lang, "common.email")}:</b>&nbsp;
                        {customerEmailDisplay ? (
                          <><a href={`mailto:${customerEmailDisplay}`} className="text-[var(--accent)] hover:underline">{customerEmailDisplay}</a><CopyButton value={customerEmailDisplay} lang={lang} /></>
                        ) : <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}
                      </div>
                      {(billingStreetDisplay || billingZipcityDisplay) && (
                        <div className="flex items-center gap-1">
                          <b>{t(lang, "orderDetail.label.street")}:</b>&nbsp;
                          {(billingStreetDisplay || billingZipcityDisplay) ? (
                            <><a href={`https://maps.google.com/?q=${encodeURIComponent(`${billingStreetDisplay} ${billingZipcityDisplay}`.trim())}`} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">{billingStreetDisplay}{billingZipcityDisplay && <span className="ml-1">{billingZipcityDisplay}</span>}</a><CopyButton value={`${billingStreetDisplay} ${billingZipcityDisplay}`.trim()} lang={lang} /></>
                          ) : <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}
                        </div>
                      )}
                    </div>
                    <div className="surface-card p-3">
                      <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.label.contactSection")}</h4>
                      <div><b>{t(lang, "common.name")}:</b> {contactName || <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}</div>
                      <div className="flex items-center gap-1">
                        <b>{t(lang, "common.email")}:</b>&nbsp;
                        {email ? (
                          <><a href={`mailto:${email}`} className="text-[var(--accent)] hover:underline">{email}</a><CopyButton value={email} lang={lang} /></>
                        ) : <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <b>{t(lang, "common.phone")}:</b>&nbsp;
                        {phoneRaw ? (
                          <><PhoneLink value={phoneRaw} className="text-[var(--accent)]" /><CopyButton value={formatPhoneDisplay(phoneRaw)} lang={lang} /></>
                        ) : <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}
                      </div>
                      {mobileRaw ? (
                        <div className="flex items-center gap-1">
                          <b>Mobil:</b>&nbsp;
                          <PhoneLink value={mobileRaw} className="text-[var(--accent)]" />
                          <CopyButton value={formatPhoneDisplay(mobileRaw)} lang={lang} />
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
                <div className="surface-card p-3">
                  <h4 className="mb-2 font-semibold">{billingSectionTitle}</h4>
                  {effectiveEditMode ? (
                    <div className="space-y-1.5">
                      <label className="block"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.street")}</span><input className="ui-input mt-0.5" value={editBilling.street} onChange={e => setEditBilling(p => ({ ...p, street: e.target.value }))} /><DbFieldHint fieldPath="billing.street" /></label>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        <label className="block"><span className="text-xs text-zinc-500">PLZ</span><input className="ui-input mt-0.5" value={editBilling.zip} onChange={e => setEditBilling(p => ({ ...p, zip: e.target.value, zipcity: [e.target.value, p.city].filter(Boolean).join(" ") }))} /></label>
                        <label className="block"><span className="text-xs text-zinc-500">Ort</span><input className="ui-input mt-0.5" value={editBilling.city} onChange={e => setEditBilling(p => ({ ...p, city: e.target.value, zipcity: [p.zip, e.target.value].filter(Boolean).join(" ") }))} /></label>
                      </div>
                      <label className="block"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.zipcity")}</span><input className="ui-input mt-0.5" value={editBilling.zipcity} onChange={e => setEditBilling(p => ({ ...p, zipcity: e.target.value }))} /><DbFieldHint fieldPath="billing.zipcity" /></label>
                      <label className="block"><span className="text-xs text-zinc-500">Bestellreferenz</span><input className="ui-input mt-0.5" value={editBilling.order_ref} onChange={e => setEditBilling(p => ({ ...p, order_ref: e.target.value }))} /></label>
                      <div className="rounded-lg border border-zinc-200 p-2">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Abweichende Rechnungsadresse</div>
                        <div className="space-y-1.5">
                          <input className="ui-input" placeholder="Firma" value={editBilling.alt_company} onChange={e => setEditBilling(p => ({ ...p, alt_company: e.target.value }))} />
                          <input className="ui-input" placeholder="Firma E-Mail" value={editBilling.alt_company_email} onChange={e => setEditBilling(p => ({ ...p, alt_company_email: e.target.value }))} />
                          <input className="ui-input" placeholder="Firma Telefon" value={editBilling.alt_company_phone} onChange={e => setEditBilling(p => ({ ...p, alt_company_phone: e.target.value }))} />
                          <input className="ui-input" placeholder="Strasse" value={editBilling.alt_street} onChange={e => setEditBilling(p => ({ ...p, alt_street: e.target.value }))} />
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            <input className="ui-input" placeholder="PLZ" value={editBilling.alt_zip} onChange={e => setEditBilling(p => ({ ...p, alt_zip: e.target.value, alt_zipcity: [e.target.value, p.alt_city].filter(Boolean).join(" ") }))} />
                            <input className="ui-input" placeholder="Ort" value={editBilling.alt_city} onChange={e => setEditBilling(p => ({ ...p, alt_city: e.target.value, alt_zipcity: [p.alt_zip, e.target.value].filter(Boolean).join(" ") }))} />
                          </div>
                          <input className="ui-input" placeholder="Anrede" value={editBilling.alt_salutation} onChange={e => setEditBilling(p => ({ ...p, alt_salutation: e.target.value }))} />
                          <input className="ui-input" placeholder="Vorname" value={editBilling.alt_first_name} onChange={e => setEditBilling(p => ({ ...p, alt_first_name: e.target.value }))} />
                          <input className="ui-input" placeholder="Kontakt Name" value={editBilling.alt_name} onChange={e => setEditBilling(p => ({ ...p, alt_name: e.target.value }))} />
                          <input className="ui-input" placeholder="Kontakt E-Mail" value={editBilling.alt_email} onChange={e => setEditBilling(p => ({ ...p, alt_email: e.target.value }))} />
                          <input className="ui-input" placeholder="Kontakt Telefon" value={editBilling.alt_phone} onChange={e => setEditBilling(p => ({ ...p, alt_phone: e.target.value }))} />
                          <input className="ui-input" placeholder="Kontakt Mobil" value={editBilling.alt_phone_mobile} onChange={e => setEditBilling(p => ({ ...p, alt_phone_mobile: e.target.value }))} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div><b>{t(lang, "orderDetail.label.street")}:</b> {billingStreetDisplay || <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}</div>
                      <div><b>{t(lang, "orderDetail.label.zipcityShort")}:</b> {billingZipcityDisplay || <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}</div>
                      {data.billing?.order_ref ? <div><b>Bestellreferenz:</b> {data.billing.order_ref}</div> : null}
                      {(data.billing?.alt_company || data.billing?.alt_name || data.billing?.alt_street || data.billing?.alt_zipcity) ? (
                        <div className="mt-2 rounded-lg border border-zinc-200 p-2">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Abweichende Rechnungsadresse</div>
                          {data.billing?.alt_company ? <div><b>Firma:</b> {data.billing.alt_company}</div> : null}
                          {data.billing?.alt_company_email ? <div><b>Firma E-Mail:</b> {data.billing.alt_company_email}</div> : null}
                          {data.billing?.alt_company_phone ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <b>Firma Telefon:</b> <PhoneLink value={data.billing.alt_company_phone} className="text-[var(--accent)]" />
                            </div>
                          ) : null}
                          {data.billing?.alt_street ? <div><b>Strasse:</b> {data.billing.alt_street}</div> : null}
                          {data.billing?.alt_zipcity ? <div><b>PLZ / Ort:</b> {data.billing.alt_zipcity}</div> : null}
                          {(data.billing?.alt_salutation || data.billing?.alt_first_name || data.billing?.alt_name) ? <div><b>Kontakt:</b> {[data.billing?.alt_salutation, data.billing?.alt_first_name, data.billing?.alt_name].filter(Boolean).join(" ")}</div> : null}
                          {data.billing?.alt_email ? <div><b>Kontakt E-Mail:</b> {data.billing.alt_email}</div> : null}
                          {data.billing?.alt_phone ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <b>Kontakt Telefon:</b> <PhoneLink value={data.billing.alt_phone} className="text-[var(--accent)]" />
                            </div>
                          ) : null}
                          {data.billing?.alt_phone_mobile ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <b>Kontakt Mobil:</b> <PhoneLink value={data.billing.alt_phone_mobile} className="text-[var(--accent)]" />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="sm:col-span-2 surface-card p-3">
                  <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.section.object")}</h4>
                  {effectiveEditMode ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <label className="block sm:col-span-2"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.address")}</span><input className="ui-input mt-0.5" value={editObjectAddress} onChange={e => setEditObjectAddress(e.target.value)} placeholder="Objektadresse (Shooting-Ort)" /><DbFieldHint fieldPath="address.text" /></label>
                      <label className="block"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.type")}</span><input className="ui-input mt-0.5" value={editObject.type} onChange={e => setEditObject(p => ({ ...p, type: e.target.value }))} /><DbFieldHint fieldPath="object.type" /></label>
                      <label className="block"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.area")}</span><input className="ui-input mt-0.5" value={editObject.area} onChange={e => setEditObject(p => ({ ...p, area: e.target.value }))} /><DbFieldHint fieldPath="object.area" /></label>
                      <label className="block"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.floors")}</span><input className="ui-input mt-0.5" value={editObject.floors} onChange={e => setEditObject(p => ({ ...p, floors: e.target.value }))} /></label>
                      <label className="block"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.rooms")}</span><input className="ui-input mt-0.5" value={editObject.rooms} onChange={e => setEditObject(p => ({ ...p, rooms: e.target.value }))} /></label>
                      <label className="block"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.onsiteName")}</span><input className="ui-input mt-0.5" value={editBilling.onsiteName} onChange={e => setEditBilling(p => ({ ...p, onsiteName: e.target.value }))} /></label>
                      <label className="block"><span className="text-xs text-zinc-500">{t(lang, "orderDetail.label.onsitePhone")}</span><input className="ui-input mt-0.5" value={editBilling.onsitePhone} onChange={e => setEditBilling(p => ({ ...p, onsitePhone: e.target.value }))} /></label>
                    </div>
                  ) : (
                    <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                      <div className="flex items-center gap-1 sm:col-span-2">
                        <b>{t(lang, "orderDetail.label.address")}</b>&nbsp;
                        {data.address ? (
                          <><a href={`https://maps.google.com/?q=${encodeURIComponent(data.address)}`} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">{data.address}</a><CopyButton value={data.address} lang={lang} /></>
                        ) : <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}
                      </div>
                      <div><b>{t(lang, "orderDetail.label.type")}:</b> {data.object?.type || <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}</div>
                      <div><b>{t(lang, "orderDetail.label.area")}:</b> {data.object?.area ? `${data.object.area} m²` : <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}</div>
                      <div><b>{t(lang, "orderDetail.label.floors")}:</b> {data.object?.floors || <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}</div>
                      <div><b>{t(lang, "orderDetail.label.rooms")}:</b> {data.object?.rooms || <span className="text-zinc-400">{t(lang, "common.notSet")}</span>}</div>
                      {(data.billing?.onsiteName || data.billing?.onsitePhone) && (
                        <div className="sm:col-span-2 mt-1 border-t border-zinc-100 pt-1">
                          <b>{t(lang, "orderDetail.label.onsiteContact")}:</b>{" "}
                          {data.billing.onsiteName || ""}
                          {data.billing.onsitePhone && (
                            <span className="ml-1 text-zinc-500">
                              (<PhoneLink value={data.billing.onsitePhone} className="text-zinc-500" />)
                            </span>
                          )}
                        </div>
                      )}
                      {data.keyPickup?.address && (
                        <div className="sm:col-span-2 mt-1 border-t border-zinc-100 pt-1">
                          <b>{t(lang, "orderDetail.label.keyPickupInfo")}:</b>{" "}
                          <span>{data.keyPickup.address}</span>
                          {data.keyPickup.notes && <span className="ml-1 text-zinc-500">– {data.keyPickup.notes}</span>}
                        </div>
                      )}
                      {(data.notes || data.billing?.notes) && (
                        <div className="sm:col-span-2 mt-1 border-t border-zinc-700 pt-2">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">{t(lang, "orderDetail.label.notesLabel")}</p>
                          <span className="whitespace-pre-wrap font-semibold text-white">{data.notes || data.billing?.notes}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {effectiveEditMode ? (
                <div className="surface-card space-y-3 p-3">
                  <h4 className="font-semibold">{t(lang, "orderDetail.section.editServices")}</h4>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(lang, "orderDetail.label.package")}</p>
                    <div className="flex flex-wrap gap-2">
                      {(adminConfig?.packages || []).map((pkg) => (
                        <button key={pkg.key} type="button"
                          onClick={() => setEditPackageKey((k) => (k === pkg.key ? "" : pkg.key))}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            editPackageKey === pkg.key ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                          }`}
                        >
                          {pkg.label} <span className="font-normal text-zinc-500">{pkg.price} CHF</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {ADDON_ORDER.map((group) => {
                    const groupAddons = (adminConfig?.addons || []).filter((a) => a.id.split(":")[0] === group);
                    if (!groupAddons.length) return null;
                    if (RADIO_GROUPS.has(group)) {
                      const activeId = editAddons.find((a) => a.id.startsWith(group + ":"))?.id;
                      return (
                        <div key={group}>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(lang, GROUP_LABEL_KEYS[group])}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {groupAddons.map((addon) => (
                              <button key={addon.id} type="button"
                                onClick={() => toggleRadioAddon(group, addon.id, addon.label, addon.price ?? 0)}
                                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                                  activeId === addon.id ? "border-[var(--accent)] bg-[var(--accent)]/10 font-semibold text-[var(--accent)]" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                                }`}
                              >
                                {addon.label} · {addon.price} CHF
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    if (group === "staging") {
                      return (
                        <div key={group}>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(lang, GROUP_LABEL_KEYS[group])}</p>
                          <div className="space-y-1">
                            {groupAddons.map((addon) => {
                              const active = editAddons.find((a) => a.id === addon.id);
                              const unitPrice = (addon as unknown as Record<string, unknown>).unitPrice as number ?? addon.price ?? 0;
                              return (
                                <div key={addon.id} className="flex items-center gap-2">
                                  <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                                    <input type="checkbox" className="rounded" checked={!!active}
                                      onChange={() => toggleCheckboxAddon(addon.id, addon.label, unitPrice, 1)}
                                    />
                                    {addon.label} · {unitPrice} CHF/Stk
                                  </label>
                                  {active && (
                                    <input type="number" min={1} className="ui-input w-16 py-0.5 text-xs"
                                      value={active.qty ?? 1}
                                      onChange={(e) => setStagingQty(addon.id, Number(e.target.value))}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={group}>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(lang, GROUP_LABEL_KEYS[group])}</p>
                        <div className="space-y-1">
                          {groupAddons.map((addon) => {
                            const active = editAddons.some((a) => a.id === addon.id);
                            const price = addon.price ?? 0;
                            const unitPrice = (addon as unknown as Record<string, unknown>).unitPrice as number | undefined;
                            const priceLabel = addon.pricingType === "perFloor" ? `${unitPrice ?? price} CHF/Etage` : addon.pricingType === "byArea" ? "199–399+ CHF" : `${price} CHF`;
                            return (
                              <label key={addon.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
                                <input type="checkbox" className="rounded" checked={active}
                                  onChange={() => toggleCheckboxAddon(addon.id, addon.label, price)}
                                />
                                {addon.label} · {priceLabel}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      <input type="checkbox" className="rounded" checked={editKeyPickupActive}
                        onChange={(e) => setEditKeyPickupActive(e.target.checked)}
                      />
                      {t(lang, "orderDetail.label.keyPickup")}
                    </label>
                    {editKeyPickupActive && (
                      <textarea
                        className="ui-input mt-1 w-full resize-y"
                        rows={3}
                        placeholder={t(lang, "wizard.placeholder.keyPickupInfo")}
                        value={editKeyPickupAddress}
                        onChange={(e) => setEditKeyPickupAddress(e.target.value)}
                      />
                    )}
                  </div>

                  <div className="border-t border-zinc-100 pt-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(lang, "orderDetail.label.addCustomProduct")}</p>
                    <div className="flex gap-1.5">
                      <input className="ui-input flex-1" placeholder={t(lang, "orderDetail.placeholder.productName")} value={newCustomLabel}
                        onChange={(e) => setNewCustomLabel(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addCustomAddon()}
                      />
                      <input className="ui-input w-24" type="number" placeholder="CHF" value={newCustomPrice}
                        onChange={(e) => setNewCustomPrice(e.target.value)}
                      />
                      <button type="button" className="btn-secondary px-3 text-xs" onClick={addCustomAddon}>{t(lang, "orderDetail.button.addAddon")}</button>
                    </div>
                    {editAddons
                      .filter((a) => !ADDON_ORDER.some((g) => a.id.startsWith(g + ":")) && !a.id.startsWith("keypickup:"))
                      .map((a) => (
                        <div key={a.id} className="mt-1 flex items-center justify-between rounded bg-zinc-50 px-2 py-1 text-xs">
                          <span>{a.label}{a.price ? ` · ${a.price} CHF` : ""}{a.qty && a.qty > 1 ? ` × ${a.qty}` : ""}</span>
                          <button type="button" className="ml-2 font-bold text-red-400 hover:text-red-600" onClick={() => removeAddon(a.id)}>×</button>
                        </div>
                      ))}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(lang, "common.notes")}</label>
                    <textarea className="ui-input w-full resize-y" rows={3}
                      value={editBilling.notes}
                      onChange={(e) => setEditBilling((p) => ({ ...p, notes: e.target.value }))}
                    />
                  </div>

                  <div className="rounded-lg border border-zinc-200 p-3 text-sm">
                    <div className="mb-2 font-semibold text-zinc-600">{t(lang, "orderDetail.label.selectionOverview")}</div>
                    {(() => {
                      const pkg = adminConfig?.packages.find((p) => p.key === editPackageKey);
                      return pkg ? (
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{pkg.label}</span>
                          <span className="shrink-0 tabular-nums text-zinc-500">{formatCurrency(pkg.price)}</span>
                        </div>
                      ) : null;
                    })()}
                    {editAddons.map((addon) => {
                      const qty = addon.qty && addon.qty > 1 ? addon.qty : 1;
                      return (
                        <div key={addon.id} className="flex items-baseline justify-between gap-2 text-zinc-600">
                          <span>{addon.label}{qty > 1 ? <span className="ml-1 text-xs text-zinc-400">× {qty}</span> : null}</span>
                          <span className="shrink-0 tabular-nums">{formatCurrency((Number(addon.price) || 0) * qty)}</span>
                        </div>
                      );
                    })}
                    {editKeyPickupActive && (
                      <div className="flex items-baseline justify-between gap-2 text-zinc-600">
                        <span>{t(lang, "orderDetail.label.keyPickupShort")}</span>
                        <span className="shrink-0 tabular-nums">{formatCurrency(KEY_PICKUP_PRICE)}</span>
                      </div>
                    )}
                    {!editPackageKey && editAddons.length === 0 && !editKeyPickupActive && (
                      <p className="text-xs text-zinc-400">{t(lang, "orderDetail.empty.noProducts")}</p>
                    )}
                    <div className="mt-2 border-t border-zinc-200 pt-2 text-xs text-zinc-500">
                      <div className="flex justify-between"><span>{t(lang, "orderDetail.pricing.subtotal")}</span><span className="tabular-nums">{formatCurrency(editPricing.subtotal)}</span></div>
                      <div className="flex justify-between"><span>{t(lang, "orderDetail.pricing.vat")}</span><span className="tabular-nums">{formatCurrency(editPricing.vat)}</span></div>
                      <div className="flex justify-between text-sm font-semibold text-[var(--accent)]"><span>{t(lang, "orderDetail.pricing.total")}</span><span className="tabular-nums">{formatCurrency(editPricing.total)}</span></div>
                    </div>
                  </div>

                  <div className="border-t border-zinc-100 pt-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(lang, "orderDetail.label.pricesCHF")}</p>
                      <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={busy === "recalc"} onClick={recalcPricing}>
                        {busy === "recalc" ? "…" : t(lang, "orderDetail.button.recalculate")}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="block text-xs"><span className="text-zinc-500">{t(lang, "orderDetail.pricing.subtotal")}</span><input className="ui-input mt-0.5" type="number" step="0.05" value={editPricing.subtotal} onChange={(e) => setEditPricing((p) => ({ ...p, subtotal: parseFloat(e.target.value) || 0 }))} /></label>
                      <label className="block text-xs"><span className="text-zinc-500">{t(lang, "orderDetail.pricing.discount")}</span><input className="ui-input mt-0.5" type="number" step="0.05" value={editPricing.discount} onChange={(e) => setEditPricing((p) => ({ ...p, discount: parseFloat(e.target.value) || 0 }))} /></label>
                      <label className="block text-xs"><span className="text-zinc-500">{t(lang, "orderDetail.pricing.vat")}</span><input className="ui-input mt-0.5" type="number" step="0.05" value={editPricing.vat} onChange={(e) => setEditPricing((p) => ({ ...p, vat: parseFloat(e.target.value) || 0 }))} /></label>
                      <label className="block text-xs"><span className="font-semibold text-zinc-500">{t(lang, "orderDetail.pricing.total")}</span><input className="ui-input mt-0.5 font-bold" type="number" step="0.05" value={editPricing.total} onChange={(e) => setEditPricing((p) => ({ ...p, total: parseFloat(e.target.value) || 0 }))} /></label>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={busy === "details"} onClick={runSaveDetails}>
                      {busy === "details" ? t(lang, "common.saving") : t(lang, "common.save")}
                    </button>
                    <button className="btn-secondary" disabled={busy === "details"} onClick={cancelEditMode}>{t(lang, "common.cancel")}</button>
                  </div>
                </div>
              ) : (
                <div className="surface-card p-3">
                  <h4 className="mb-3 font-semibold">{t(lang, "orderDetail.section.orderOverview")}</h4>
                  <div className="space-y-1 text-sm">
                    {data.services?.package?.label && (
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{data.services.package.label}</span>
                        <span className="shrink-0 tabular-nums text-zinc-500">{formatCurrency(data.services.package.price || 0)}</span>
                      </div>
                    )}
                    {(data.services?.addons || []).map((a, i) => {
                      const raw = a as unknown as Record<string, unknown>;
                      const qty = raw.qty as number | undefined;
                      const linePrice = (Number(a.price) || 0) * (qty && qty > 1 ? qty : 1);
                      return (
                        <div key={String(a.id || i)} className="flex items-baseline justify-between gap-2 text-zinc-700">
                          <span>{a.label}{qty && qty > 1 ? <span className="ml-1 text-xs text-zinc-400">× {qty}</span> : null}</span>
                          <span className="shrink-0 tabular-nums text-zinc-500">{formatCurrency(linePrice)}</span>
                        </div>
                      );
                    })}
                    {data.keyPickup?.address && (
                      <div className="flex items-baseline justify-between gap-2 text-zinc-700">
                        <span>{t(lang, "orderDetail.label.keyPickupShort")} <span className="text-xs text-zinc-400">({data.keyPickup.address})</span></span>
                        <span className="shrink-0 tabular-nums text-zinc-500">{formatCurrency(50)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 border-t border-zinc-200 pt-3 space-y-1 text-sm">
                    <div className="flex justify-between text-zinc-500">
                      <span>{t(lang, "orderDetail.pricing.subtotal")}</span>
                      <span className="tabular-nums">{formatCurrency(data.pricing?.subtotal || 0)}</span>
                    </div>
                    {(data.pricing?.discount || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>{t(lang, "orderDetail.pricing.discount")}</span>
                        <span className="tabular-nums">−{formatCurrency(data.pricing?.discount || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-zinc-500">
                      <span>{t(lang, "orderDetail.pricing.vatPercent")}</span>
                      <span className="tabular-nums">{formatCurrency(data.pricing?.vat || 0)}</span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-bold">
                      <span>{t(lang, "orderDetail.pricing.total")}</span>
                      <span className="tabular-nums text-[var(--accent)]">{formatCurrency(data.total || data.pricing?.total || 0)}</span>
                    </div>
                  </div>
                  {(data.notes || data.billing?.notes) && (
                    <div className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
                      <span className="font-semibold uppercase tracking-wider">{t(lang, "orderDetail.label.notesColon")}</span>
                      {data.notes || data.billing?.notes}
                    </div>
                  )}
                </div>
              )}

              {/* Tour-Verknüpfung */}
              {canManageOrder && linkedTour !== undefined && (
                <div className="surface-card p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="h-4 w-4 shrink-0 text-[var(--propus-gold)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82V15a1 1 0 01-1.447.894L15 13.8M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                    <span className="text-sm font-semibold text-[var(--text-main)]">360° Tour</span>
                    {linkedTour ? (
                      <span className="text-xs text-[var(--text-subtle)] truncate max-w-[200px]">{linkedTour.bezeichnung || `Tour #${linkedTour.id}`}</span>
                    ) : (
                      <span className="text-xs text-[var(--text-subtle)]">Keine Tour verknüpft</span>
                    )}
                  </div>
                  {linkedTour ? (
                    <div className="flex items-center gap-2 shrink-0">
                      {linkedTour.tourUrl && (
                        <a
                          href={linkedTour.tourUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs rounded border border-[var(--border-soft)] px-2.5 py-1 text-[var(--accent)] hover:underline transition-colors"
                        >
                          Tour öffnen ↗
                        </a>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLinkTourPopup(true)}
                      className="text-xs rounded border border-[var(--propus-gold)]/40 px-2.5 py-1 text-[var(--propus-gold)] hover:bg-[var(--propus-gold)]/10 transition-colors shrink-0"
                    >
                      Verknüpfen
                    </button>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="surface-card p-3">
                  <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.section.status")}</h4>
                  <OrderStatusSelect
                    orderNo={orderNo}
                    value={status}
                    token={token}
                    disabled={!canManageOrder || Boolean(busy)}
                    autoSave={false}
                    onChanged={(next) => {
                      setStatus(next);
                    }}
                    onError={(msg) => setErr(msg)}
                  />
                  {canManageOrder && (
                    <>
                      <label className="mt-3 flex items-start gap-2 text-xs text-zinc-500">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={sendStatusEmails}
                          onChange={(e) => setSendStatusEmails(e.target.checked)}
                          disabled={busy === "save"}
                        />
                        <span>
                          {t(lang, "orderStatus.sendEmailsLabel")}
                          <span className="block text-[11px] text-zinc-400">
                            {t(lang, "orderStatus.sendEmailsHint")}
                          </span>
                        </span>
                      </label>
                      <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${sendStatusEmails ? "text-zinc-500" : "text-zinc-600 opacity-70"}`}>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={statusEmailTargets.customer}
                              onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, customer: e.target.checked }))}
                              disabled={busy === "save" || !sendStatusEmails}
                            />
                            <span>{t(lang, "orderStatus.target.customer")}</span>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={statusEmailTargets.office}
                              onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, office: e.target.checked }))}
                              disabled={busy === "save" || !sendStatusEmails}
                            />
                            <span>{t(lang, "orderStatus.target.office")}</span>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={statusEmailTargets.photographer}
                              onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, photographer: e.target.checked }))}
                              disabled={busy === "save" || !sendStatusEmails}
                            />
                            <span>{t(lang, "orderStatus.target.photographer")}</span>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={statusEmailTargets.cc}
                              onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, cc: e.target.checked }))}
                              disabled={busy === "save" || !sendStatusEmails}
                            />
                            <span>{t(lang, "orderStatus.target.cc")}</span>
                          </label>
                        </div>
                    </>
                  )}
                </div>
                <div className="surface-card p-3">
                  <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.section.appointment")}</h4>
                  <div className="mb-1 text-xs text-zinc-500">
                    {t(lang, "orderDetail.label.current")}
                    {formatDateTime(data.appointmentDate)} · {Number(data.schedule?.durationMin || 60)} Min.
                  </div>
                  <input
                    type="datetime-local"
                    className="ui-input"
                    value={scheduleLocal}
                    onChange={(e) => setScheduleLocal(e.target.value)}
                    disabled={!canManageOrder || status.toLowerCase() === "cancelled" || status.toLowerCase() === "paused"}
                  />
                  {status.toLowerCase() === "paused" ? (
                    <p className="mt-1 text-[11px] text-amber-400/80">Slot ist bei Pausierung freigegeben.</p>
                  ) : null}
                  <DbFieldHint fieldPath="schedule.dateTime" />
                  <label className="mt-2 block">
                    <span className="mb-1 block text-xs text-zinc-500">{t(lang, "wizard.label.durationMin")}</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="ui-input"
                      value={scheduleDurationMin}
                      onChange={(e) => setScheduleDurationMin(e.target.value)}
                      disabled={!canManageOrder || status.toLowerCase() === "cancelled" || status.toLowerCase() === "paused"}
                    />
                  </label>
                </div>
                <div className="surface-card p-3">
                  <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.section.employee")}</h4>
                  <select
                    className="ui-input"
                    value={pendingPhotographerKey}
                    onChange={(e) => setPendingPhotographerKey(e.target.value)}
                    disabled={!canManageOrder}
                  >
                    <option value="">{t(lang, "orderDetail.select.unassigned")}</option>
                    {photographers.map((p) => (
                      <option key={p.key} value={p.key}>{p.name}</option>
                    ))}
                  </select>
                  <DbFieldHint fieldPath="schedule.photographer.key" />
                  {pendingPhotographerKey && (() => {
                    const phone = photographers.find((p) => p.key === pendingPhotographerKey)?.phone || data?.photographer?.phone;
                    return phone ? (
                      <div className="mt-2 text-sm">
                        <PhoneLink value={phone} className="text-[var(--accent)]" />
                      </div>
                    ) : null;
                  })()}
                  {canManageOrder && pendingPhotographerKey !== originalPhotographerKey && (
                    <p className="mt-2 text-xs text-amber-600">{t(lang, "orderDetail.info.calendarUpdate")}</p>
                  )}
                </div>
              </div>

              {canManageOrder && (
                <div className="flex items-center gap-3">
                  <button
                    className="btn-primary"
                    disabled={!isDirty || busy === "save"}
                    onClick={runSaveChanges}
                  >
                    {busy === "save" ? t(lang, "common.saving") : t(lang, "orderDetail.button.saveChanges")}
                  </button>
                  {isDirty && !savedOk && <span className="text-xs text-amber-500">{t(lang, "common.unsavedChanges")}</span>}
                  {savedOk && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {t(lang, "common.saved")}
                    </span>
                  )}
                </div>
              )}


            </div>
          )}

          {data && (
            <OrderChat token={token} orderNo={orderNo} order={data} actorRole={role === "photographer" ? "photographer" : "admin"} />
          )}

          {data && role !== "photographer" && (
            <div className="mt-4">
              <OrderEmailLog token={token} orderNo={orderNo} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                try {
                  window.localStorage.setItem("admin_print_token_v1", token);
                } catch {
                  // Ignore storage errors and try opening print page anyway.
                }
                window.open(`/print/orders/${orderNo}`, "_blank", "noopener,noreferrer");
              }}
            >
              {t(lang, "orderDetail.button.print")}
            </button>
            <button className="btn-secondary" onClick={() => onOpenUpload?.(orderNo)}>{t(lang, "orderDetail.button.upload")}</button>
            {canManageOrder && (
              <select
                className="btn-secondary appearance-none pr-8 cursor-pointer"
                disabled={busy === "mail"}
                value=""
                onChange={(e) => {
                  const v = e.target.value as ResendEmailType;
                  if (v) { runResendEmail(v); e.target.value = ""; }
                }}
              >
                <option value="">{t(lang, "orderDetail.button.resendEmail")}</option>
                {["pending", "provisional"].includes((data?.status || "").toLowerCase()) && (
                  <option value="confirmation_request">{t(lang, "orderDetail.resendEmail.confirmationRequest")}</option>
                )}
                {data?.schedule?.date && data?.schedule?.time && data?.lastRescheduleOldDate && data?.lastRescheduleOldTime && (
                  <option value="reschedule">{t(lang, "orderDetail.resendEmail.reschedule")}</option>
                )}
                <option value="booking_confirmed">{t(lang, "orderDetail.resendEmail.bookingConfirmed")}</option>
              </select>
            )}
            <a
              href={getOrderIcsUrl(token, orderNo)}
              download={`propus-${orderNo}.ics`}
              className="btn-secondary inline-flex items-center gap-1.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {t(lang, "orderDetail.button.calendarIcs")}
            </a>
          </div>

          {canManageOrder && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">{t(lang, "orderDetail.section.dangerZone")}</p>
              <button
                className="rounded-[10px] border border-red-500/40 bg-transparent px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
                onClick={() => setShowDeleteConfirm(true)}
              >
                {t(lang, "orderDetail.button.deleteOrder")}
              </button>
            </div>
          )}
        </div>
      </div>

      {canManageOrder && showDeleteConfirm && (
        <ConfirmDeleteDialog
          orderNo={orderNo}
          busy={busy === "delete"}
          onConfirm={runDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Matterport-Verknüpfungs-Popup */}
      {showLinkTourPopup && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-2">
          <div className="surface-card w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-soft)]">
              <span className="font-semibold text-[var(--text-main)]">Matterport verknüpfen – Bestellung #{orderNo}</span>
              <button
                type="button"
                onClick={() => {
                  setShowLinkTourPopup(false);
                  // Tour neu laden nach Popup-Schliessen
                  getTourByOrderNo(parseInt(orderNo, 10))
                    .then((r) => setLinkedTour(r.tour))
                    .catch(() => {});
                }}
                className="text-[var(--text-subtle)] hover:text-[var(--text-main)] text-xl leading-none px-1"
                aria-label="Schliessen"
              >
                ×
              </button>
            </div>
            <iframe
              src={`/admin/link-matterport?bookingOrderNo=${encodeURIComponent(orderNo)}`}
              className="flex-1 w-full border-0"
              style={{ minHeight: "70vh" }}
              title="Matterport verknüpfen"
            />
          </div>
        </div>
      )}

    </>
  );
}

