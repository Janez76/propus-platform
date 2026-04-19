import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Camera,
  Clock,
  FileText,
  History as HistoryIcon,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Package,
  Pencil,
  Save,
  Unlock,
  User2,
  X,
} from "lucide-react";
import {
  getOrder,
  updateOrderDetails,
  updateOrderStatus,
  rescheduleOrder,
  assignPhotographer,
  type Order,
} from "../../../api/orders";
import { getPhotographers, type Photographer } from "../../../api/photographers";
import { useAuthStore } from "../../../store/authStore";
import { useT } from "../../../hooks/useT";
import { useUnsavedChangesGuard } from "../../../hooks/useUnsavedChangesGuard";
import { STATUS_MAP, normalizeStatusKey } from "../../../lib/status";
import { cn } from "../../../lib/utils";
import { TabUebersicht } from "./TabUebersicht";
import { TabObjekt } from "./TabObjekt";
import { TabTermin } from "./TabTermin";
import { TabVerlauf } from "./TabVerlauf";
import { TabDateien } from "./TabDateien";
import { TabKommunikation } from "./TabKommunikation";
import { TabLeistungen } from "./TabLeistungen";
import { computePricing } from "../../../lib/bookingPricing";
import {
  buildInitialState,
  type DirtyMap,
  type DrawerState,
  type EmailTargets,
  type LeistungenForm,
  type ObjektForm,
  type TerminForm,
  type UebersichtForm,
} from "./types";

type TabKey = "uebersicht" | "objekt" | "leistungen" | "termin" | "kommunikation" | "dateien" | "verlauf";

const TABS: Array<{ key: TabKey; labelKey: string; icon: typeof Building2 }> = [
  { key: "uebersicht", labelKey: "ordersDrawer.tabs.uebersicht", icon: User2 },
  { key: "objekt", labelKey: "ordersDrawer.tabs.objekt", icon: Building2 },
  { key: "leistungen", labelKey: "ordersDrawer.tabs.leistungen", icon: Package },
  { key: "termin", labelKey: "ordersDrawer.tabs.termin", icon: CalendarDays },
  { key: "kommunikation", labelKey: "ordersDrawer.tabs.kommunikation", icon: MessageSquare },
  { key: "dateien", labelKey: "ordersDrawer.tabs.dateien", icon: FileText },
  { key: "verlauf", labelKey: "ordersDrawer.tabs.verlauf", icon: HistoryIcon },
];

type Props = {
  open: boolean;
  orderNo: string | null;
  onClose: () => void;
  onSaved?: (order: Order) => void;
};

function formatScheduleSummary(termin: TerminForm): string {
  if (!termin.scheduleLocal) return "—";
  const d = new Date(termin.scheduleLocal);
  if (Number.isNaN(d.getTime())) return termin.scheduleLocal;
  return d.toLocaleString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildBillingPayload(u: UebersichtForm) {
  const addr = u.mode === "company" ? u.company.address : u.privateData.address;
  const street = [addr.street, addr.houseNumber].filter(Boolean).join(" ").trim();
  const zipcity = [addr.zip, addr.city].filter(Boolean).join(" ").trim();
  const main = u.contacts[0] || {
    salutation: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    phoneMobile: "",
  };
  const altAddr = u.altBilling.company.address;
  const altStreet = [altAddr.street, altAddr.houseNumber].filter(Boolean).join(" ").trim();
  const altZipcity = [altAddr.zip, altAddr.city].filter(Boolean).join(" ").trim();

  if (u.mode === "company") {
    return {
      company: u.company.name,
      order_ref: u.company.orderRef,
      salutation: main.salutation,
      first_name: main.firstName,
      name: main.lastName,
      email: main.email,
      phone: main.phone,
      phone_mobile: main.phoneMobile,
      street,
      zip: addr.zip,
      city: addr.city,
      zipcity,
      notes: u.customerNotes,
      ...(u.altBilling.enabled
        ? {
            alt_company: u.altBilling.company.name,
            alt_street: altStreet,
            alt_zip: altAddr.zip,
            alt_city: altAddr.city,
            alt_zipcity: altZipcity,
          }
        : {
            alt_company: "",
            alt_street: "",
            alt_zip: "",
            alt_city: "",
            alt_zipcity: "",
          }),
    };
  }

  return {
    company: "",
    order_ref: "",
    salutation: u.privateData.salutation,
    first_name: u.privateData.firstName,
    name: u.privateData.lastName,
    email: u.privateData.email,
    phone: u.privateData.phone,
    phone_mobile: u.privateData.phoneMobile,
    street,
    zip: addr.zip,
    city: addr.city,
    zipcity,
    notes: u.customerNotes,
    alt_company: "",
    alt_street: "",
    alt_zip: "",
    alt_city: "",
    alt_zipcity: "",
  };
}

function buildObjectPayload(o: ObjektForm) {
  return {
    type: o.type,
    area: o.area ? Number(o.area) : undefined,
    floors: o.floors ? Number(o.floors) : undefined,
    rooms: o.rooms,
    desc: o.desc,
    onsiteName: o.onsiteName,
    onsitePhone: o.onsitePhone,
    onsiteEmail: o.onsiteEmail,
    onsiteCalendarInvite: o.onsiteCalendarInvite,
    specials: o.specials,
  };
}

function buildAddressString(o: ObjektForm): string {
  const a = o.address;
  const street = [a.street, a.houseNumber].filter(Boolean).join(" ").trim();
  const zipcity = [a.zip, a.city].filter(Boolean).join(" ").trim();
  return [street, zipcity].filter(Boolean).join(", ");
}

function buildServicesPayload(l: LeistungenForm) {
  return {
    package: l.packageKey
      ? { key: l.packageKey, label: l.packageLabel, price: l.packagePrice }
      : null,
    addons: l.addons.map((a) => ({
      id: a.id,
      label: a.label,
      price: Number(a.price) || 0,
      group: a.group,
      ...(a.qty != null ? { qty: a.qty } : {}),
    })),
  };
}

function buildPricingPayload(l: LeistungenForm) {
  const subtotal = (Number(l.packagePrice) || 0) + l.addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
  const p = computePricing(subtotal, l.discountPercent || 0);
  return { subtotal: p.subtotal, discount: p.discountAmount, vat: p.vat, total: p.total };
}

function splitDateTime(local: string): { date: string; time: string } | null {
  if (!local) return null;
  const m = local.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return null;
  return { date: m[1], time: m[2] };
}

export function EditOrderDrawer({ open, orderNo, onClose, onSaved }: Props) {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const t = useT();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("uebersicht");
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [photographersLoading, setPhotographersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailTargets, setEmailTargets] = useState<EmailTargets>({
    customer: false,
    office: false,
    photographer: false,
  });

  const [initial, setInitial] = useState<DrawerState | null>(null);
  const [draft, setDraft] = useState<DrawerState | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Load order whenever orderNo changes while open
  useEffect(() => {
    if (!open || !orderNo || !token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrder(token, orderNo)
      .then((o) => {
        if (cancelled) return;
        setOrder(o);
        const state = buildInitialState(o);
        setInitial(state);
        setDraft(state);
        setActiveTab("uebersicht");
        setEditMode(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderNo, token]);

  // Lazy-load photographers for Termin tab
  useEffect(() => {
    if (!open || !token || photographers.length || photographersLoading) return;
    setPhotographersLoading(true);
    getPhotographers(token)
      .then(setPhotographers)
      .catch(() => {})
      .finally(() => setPhotographersLoading(false));
  }, [open, token, photographers.length, photographersLoading]);

  const dirtyMap: DirtyMap = useMemo(() => {
    if (!initial || !draft) return { uebersicht: false, objekt: false, termin: false, leistungen: false };
    return {
      uebersicht: JSON.stringify(initial.uebersicht) !== JSON.stringify(draft.uebersicht),
      objekt: JSON.stringify(initial.objekt) !== JSON.stringify(draft.objekt),
      termin: JSON.stringify(initial.termin) !== JSON.stringify(draft.termin),
      leistungen: JSON.stringify(initial.leistungen) !== JSON.stringify(draft.leistungen),
    };
  }, [initial, draft]);

  const isDirty = dirtyMap.uebersicht || dirtyMap.objekt || dirtyMap.termin || dirtyMap.leistungen;

  useUnsavedChangesGuard(`edit-order-drawer:${orderNo || ""}`, isDirty);

  const requestClose = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm(t("ordersDrawer.confirmDiscard"));
      if (!ok) return;
    }
    onClose();
  }, [isDirty, onClose, t]);

  const requestDiscard = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm(t("ordersDrawer.confirmDiscard"));
      if (!ok) return;
      if (initial) setDraft(initial);
    }
    setEditMode(false);
  }, [isDirty, t, initial]);

  // ESC handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, requestClose]);

  const setUebersicht = useCallback((patch: Partial<UebersichtForm>) => {
    setDraft((prev) => (prev ? { ...prev, uebersicht: { ...prev.uebersicht, ...patch } } : prev));
  }, []);
  const setObjekt = useCallback((patch: Partial<ObjektForm>) => {
    setDraft((prev) => (prev ? { ...prev, objekt: { ...prev.objekt, ...patch } } : prev));
  }, []);
  const setTermin = useCallback((patch: Partial<TerminForm>) => {
    setDraft((prev) => (prev ? { ...prev, termin: { ...prev.termin, ...patch } } : prev));
  }, []);
  const setLeistungen = useCallback((patch: Partial<LeistungenForm>) => {
    setDraft((prev) => (prev ? { ...prev, leistungen: { ...prev.leistungen, ...patch } } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (!order || !draft || !initial || !token || !orderNo) return;
    setSaving(true);
    setError(null);
    try {
      // 1) Persist details (billing + object + onsite contacts + internalNotes + services/pricing)
      if (dirtyMap.uebersicht || dirtyMap.objekt || dirtyMap.leistungen) {
        const billing = dirtyMap.uebersicht ? buildBillingPayload(draft.uebersicht) : undefined;
        const objectPayload = dirtyMap.objekt ? buildObjectPayload(draft.objekt) : undefined;
        const addressStr = dirtyMap.objekt ? buildAddressString(draft.objekt) : undefined;
        const onsiteContacts = dirtyMap.objekt
          ? draft.objekt.additionalContacts.map((c) => ({
              name: c.name,
              phone: c.phone,
              email: c.email,
              calendarInvite: Boolean(c.calendarInvite),
            }))
          : undefined;
        const onsiteEmail = dirtyMap.objekt ? draft.objekt.onsiteEmail || null : undefined;
        const internalNotes = dirtyMap.uebersicht ? draft.uebersicht.internalNotes : undefined;

        let services: ReturnType<typeof buildServicesPayload> | undefined;
        let pricing: ReturnType<typeof buildPricingPayload> | undefined;
        let keyPickup: { address: string; notes?: string } | null | undefined;
        if (dirtyMap.leistungen) {
          services = buildServicesPayload(draft.leistungen);
          pricing = buildPricingPayload(draft.leistungen);
          keyPickup = draft.leistungen.keyPickup.enabled
            ? { address: draft.leistungen.keyPickup.address, notes: draft.leistungen.keyPickup.notes }
            : null;
        }

        await updateOrderDetails(token, orderNo, {
          ...(billing ? { billing } : {}),
          ...(objectPayload ? { object: objectPayload } : {}),
          ...(addressStr !== undefined ? { address: addressStr } : {}),
          ...(onsiteContacts !== undefined ? { onsiteContacts } : {}),
          ...(onsiteEmail !== undefined ? { onsite_email: onsiteEmail } : {}),
          ...(internalNotes !== undefined ? { internalNotes } : {}),
          ...(services ? { services } : {}),
          ...(pricing ? { pricing } : {}),
          ...(keyPickup !== undefined ? { keyPickup } : {}),
        });
      }

      // 2) Persist termin: schedule, photographer, status
      if (dirtyMap.termin) {
        const terminPrev = initial.termin;
        const terminNext = draft.termin;

        if (
          terminNext.scheduleLocal &&
          (terminNext.scheduleLocal !== terminPrev.scheduleLocal ||
            terminNext.durationMin !== terminPrev.durationMin)
        ) {
          const dt = splitDateTime(terminNext.scheduleLocal);
          if (dt) {
            const dur = Number(terminNext.durationMin);
            await rescheduleOrder(token, orderNo, dt.date, dt.time, Number.isFinite(dur) ? dur : undefined);
          }
        }

        if (terminNext.photographerKey !== terminPrev.photographerKey) {
          await assignPhotographer(token, orderNo, terminNext.photographerKey);
        }

        const nextStatus = normalizeStatusKey(terminNext.status) || terminNext.status;
        const prevStatus = normalizeStatusKey(terminPrev.status) || terminPrev.status;
        if (nextStatus !== prevStatus) {
          const anyEmail = emailTargets.customer || emailTargets.office || emailTargets.photographer;
          await updateOrderStatus(token, orderNo, nextStatus, {
            sendEmails: anyEmail,
            sendEmailTargets: emailTargets,
          });
        }
      }

      // Reload after save to pick up server-side changes (canonical state)
      const fresh = await getOrder(token, orderNo);
      setOrder(fresh);
      const state = buildInitialState(fresh);
      setInitial(state);
      setDraft(state);
      setEditMode(false);
      onSaved?.(fresh);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [order, draft, initial, token, orderNo, dirtyMap, emailTargets, onSaved]);

  // ⌘S / Ctrl+S
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isDirty && !saving) handleSave();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, isDirty, saving, handleSave]);

  if (!open) return null;

  const statusKey = order ? normalizeStatusKey(order.status) || "pending" : "pending";
  const statusEntry = STATUS_MAP[statusKey] || STATUS_MAP.pending;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={requestClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("ordersDrawer.title")}
        className="relative ml-auto flex h-full w-full max-w-5xl flex-col bg-[var(--surface)] shadow-2xl"
      >
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--surface)] px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h2 className="truncate text-xl font-bold text-[var(--text-main)]">
                  {t("ordersDrawer.title")} #{order?.orderNo || orderNo || ""}
                </h2>
                <span className={statusEntry.badgeClass}>{statusEntry.label}</span>
                {editMode ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <Unlock className="h-3 w-3" /> {t("ordersDrawer.lock.editing")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-medium text-[var(--text-subtle)]">
                    <Lock className="h-3 w-3" /> {t("ordersDrawer.lock.locked")}
                  </span>
                )}
                {isDirty && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <AlertCircle className="h-3 w-3" /> {t("ordersDrawer.unsaved")}
                  </span>
                )}
              </div>
              {/* Summary strip */}
              {draft && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--text-subtle)] sm:grid-cols-4">
                  <SummaryTile
                    icon={<CalendarDays className="h-3.5 w-3.5" />}
                    label={t("ordersDrawer.summary.appointment")}
                    value={formatScheduleSummary(draft.termin)}
                  />
                  <SummaryTile
                    icon={<Camera className="h-3.5 w-3.5" />}
                    label={t("ordersDrawer.summary.photographer")}
                    value={
                      photographers.find((p) => p.key === draft.termin.photographerKey)?.name ||
                      t("ordersDrawer.termin.photographerNone")
                    }
                  />
                  <SummaryTile
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label={t("ordersDrawer.summary.duration")}
                    value={`${draft.termin.durationMin || "—"} min`}
                  />
                  <SummaryTile
                    icon={<Package className="h-3.5 w-3.5" />}
                    label={t("ordersDrawer.summary.total")}
                    value={
                      typeof order?.total === "number"
                        ? `CHF ${order.total.toFixed(2)}`
                        : "—"
                    }
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!editMode && !loading && !error && draft && (
                <button
                  type="button"
                  data-testid="drawer-unlock"
                  onClick={() => setEditMode(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
                >
                  <Pencil className="h-4 w-4" />
                  {t("ordersDrawer.lock.unlock")}
                </button>
              )}
              <button
                type="button"
                onClick={requestClose}
                className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
                aria-label={t("ordersDrawer.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto" role="tablist">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              const showDot =
                (tab.key === "uebersicht" && dirtyMap.uebersicht) ||
                (tab.key === "objekt" && dirtyMap.objekt) ||
                (tab.key === "termin" && dirtyMap.termin) ||
                (tab.key === "leistungen" && dirtyMap.leistungen);
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-testid={`drawer-tab-${tab.key}`}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "relative inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-transparent text-[var(--text-subtle)] hover:text-[var(--text-main)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(tab.labelKey)}
                  {showDot && (
                    <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-[var(--text-subtle)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("ordersDrawer.loading")}
            </div>
          )}
          {error && !loading && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {!loading && !error && draft && (
            <>
              {(activeTab === "uebersicht" ||
                activeTab === "objekt" ||
                activeTab === "termin" ||
                activeTab === "leistungen") && (
                <fieldset
                  disabled={!editMode}
                  className="contents [&_input:disabled]:cursor-not-allowed [&_input:disabled]:opacity-60 [&_select:disabled]:cursor-not-allowed [&_select:disabled]:opacity-60 [&_textarea:disabled]:cursor-not-allowed [&_textarea:disabled]:opacity-60 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-60"
                >
                  {activeTab === "uebersicht" && (
                    <TabUebersicht lang={lang} value={draft.uebersicht} onChange={setUebersicht} />
                  )}
                  {activeTab === "objekt" && (
                    <TabObjekt lang={lang} value={draft.objekt} onChange={setObjekt} />
                  )}
                  {activeTab === "termin" && (
                    <TabTermin
                      lang={lang}
                      value={draft.termin}
                      onChange={setTermin}
                      photographers={photographers}
                      photographersLoading={photographersLoading}
                    />
                  )}
                  {activeTab === "leistungen" && (
                    <TabLeistungen value={draft.leistungen} objekt={draft.objekt} onChange={setLeistungen} />
                  )}
                </fieldset>
              )}
              {activeTab === "verlauf" && orderNo && <TabVerlauf orderNo={orderNo} />}
              {activeTab === "dateien" && orderNo && <TabDateien orderNo={orderNo} />}
              {activeTab === "kommunikation" && orderNo && (
                <TabKommunikation orderNo={orderNo} editMode={editMode} />
              )}
            </>
          )}
        </div>

        {/* Sticky save bar — only visible in edit mode */}
        {editMode && (
          <footer className="sticky bottom-0 z-10 border-t border-[var(--border-soft)] bg-[var(--surface)] px-6 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <EmailTargetsControl
                targets={emailTargets}
                onChange={setEmailTargets}
                t={t}
              />
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  data-testid="drawer-discard"
                  onClick={requestDiscard}
                  disabled={saving}
                  className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
                >
                  {isDirty ? t("ordersDrawer.discard") : t("ordersDrawer.lock.lock")}
                </button>
                <button
                  type="button"
                  data-testid="drawer-save"
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                    isDirty && !saving
                      ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                      : "bg-[var(--surface-raised)] text-[var(--text-subtle)]",
                  )}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("ordersDrawer.save")}
                  <span className="hidden text-xs opacity-70 sm:inline">⌘S</span>
                </button>
              </div>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
        {icon} {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-medium text-[var(--text-main)]">{value}</div>
    </div>
  );
}

function EmailTargetsControl({
  targets,
  onChange,
  t,
}: {
  targets: EmailTargets;
  onChange: (next: EmailTargets) => void;
  t: (key: string) => string;
}) {
  const anyOn = targets.customer || targets.office || targets.photographer;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
      {anyOn ? (
        <>
          <span className="font-semibold uppercase tracking-wider">{t("ordersDrawer.email.label")}</span>
          <Toggle
            checked={targets.customer}
            onChange={(v) => onChange({ ...targets, customer: v })}
            label={t("ordersDrawer.email.customer")}
          />
          <Toggle
            checked={targets.office}
            onChange={(v) => onChange({ ...targets, office: v })}
            label={t("ordersDrawer.email.office")}
          />
          <Toggle
            checked={targets.photographer}
            onChange={(v) => onChange({ ...targets, photographer: v })}
            label={t("ordersDrawer.email.photographer")}
          />
        </>
      ) : (
        <button
          type="button"
          onClick={() => onChange({ customer: true, office: true, photographer: false })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border-soft)] px-2 py-1 hover:bg-[var(--surface-raised)]"
        >
          <Mail className="h-3.5 w-3.5 opacity-60" /> {t("ordersDrawer.email.suppressed")}
        </button>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-[var(--accent)]"
      />
      <span>{label}</span>
    </label>
  );
}

