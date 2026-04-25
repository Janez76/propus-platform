import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { getCustomer, getCustomerImpersonateUrl, getCustomerOrders, resetCustomerPassword, type Customer, type CustomerOrder } from "../../api/customers";
import { ImpersonateDialog } from "./ImpersonateDialog";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";
import { toDisplayString } from "../../lib/utils";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { CustomerContactsSection } from "./CustomerContactsSection";
import { DbFieldHint } from "../ui/DbFieldHint";

function parseZipcity(zipcity: string) {
  const trimmed = zipcity.trim();
  if (!trimmed) return { zip: "", city: "" };
  const match = trimmed.match(/^(\d{4,5})\s+(.+)$/);
  if (!match) return { zip: "", city: trimmed };
  return { zip: match[1], city: match[2] };
}

function buildZipcity(zip: string, city: string) {
  return [zip.trim(), city.trim()].filter(Boolean).join(" ").trim();
}

function isSyntheticCompanyEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase().endsWith("@company.local");
}

type SavePayload = {
  name: string;
  email: string;
  company: string;
  phone: string;
  onsite_name?: string;
  onsite_phone?: string;
  street: string;
  zipcity: string;
  notes: string;
  is_admin: boolean;
  salutation?: string;
  first_name?: string;
  address_addon_1?: string;
  po_box?: string;
  zip?: string;
  city?: string;
  country?: string;
  phone_2?: string;
  phone_mobile?: string;
  phone_fax?: string;
  website?: string;
  exxas_customer_id?: string;
  exxas_address_id?: string;
  nas_customer_folder_base?: string;
  nas_raw_folder_base?: string;
};

type ContactFormState = {
  name: string;
  salutation: string;
  first_name: string;
  email: string;
  company: string;
  phone: string;
  onsite_name: string;
  onsite_phone: string;
  street: string;
  zipcity: string;
  notes: string;
  is_admin: boolean;
  address_addon_1: string;
  po_box: string;
  zip: string;
  city: string;
  country: string;
  phone_2: string;
  phone_mobile: string;
  phone_fax: string;
  website: string;
  exxas_customer_id: string;
  exxas_address_id: string;
  nas_customer_folder_base: string;
  nas_raw_folder_base: string;
};

function toFormState(customer: Customer): ContactFormState {
  const parsedZipcity = parseZipcity(customer.zipcity || "");
  return {
    name: customer.name || "",
    salutation: customer.salutation || "",
    first_name: customer.first_name || "",
    email: isSyntheticCompanyEmail(customer.email) ? "" : (customer.email || ""),
    company: customer.company || "",
    phone: customer.phone || "",
    onsite_name: customer.onsite_name || "",
    onsite_phone: customer.onsite_phone || "",
    street: customer.street || "",
    zipcity: buildZipcity(customer.zip || "", customer.city || "") || customer.zipcity || "",
    notes: customer.notes || "",
    is_admin: Boolean(customer.is_admin),
    address_addon_1: customer.address_addon_1 || "",
    po_box: customer.po_box || "",
    zip: customer.zip || parsedZipcity.zip,
    city: customer.city || parsedZipcity.city,
    country: customer.country || "Schweiz",
    phone_2: customer.phone_2 || "",
    phone_mobile: customer.phone_mobile || "",
    phone_fax: customer.phone_fax || "",
    website: customer.website || "",
    exxas_customer_id: customer.exxas_customer_id || "",
    exxas_address_id: customer.exxas_address_id || "",
    nas_customer_folder_base: customer.nas_customer_folder_base || "",
    nas_raw_folder_base: customer.nas_raw_folder_base || "",
  };
}

type Props = {
  token: string;
  item: Customer;
  onSave: (payload: SavePayload) => Promise<void>;
  onToggleAdmin: (id: number, is_admin: boolean) => Promise<void>;
  onToggleBlocked: (id: number, blocked: boolean) => Promise<void>;
  onDelete: (id: number, force?: boolean) => Promise<void>;
  onClose: () => void;
};

export function ContactModal({ token, item, onSave, onToggleAdmin, onToggleBlocked, onDelete, onClose }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);
  const [form, setForm] = useState<ContactFormState>(() => toFormState(item));
  const [newPassword, setNewPassword] = useState("");
  const [showImpersonate, setShowImpersonate] = useState(false);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersCount, setOrdersCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<"none" | "confirm" | "force">("none");
  const [deleteOrderCount, setDeleteOrderCount] = useState(0);
  const [saveError, setSaveError] = useState<string>("");
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("saved");
  const baselineRef = useRef(form);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baselineRef.current), [form]);
  useUnsavedChangesGuard(`customer-modal-${item.id}`, isDirty);

  async function submit(e: FormEvent) {
    e.preventDefault();
    onClose();
  }

  async function loadOrders() {
    try {
      const rows = await getCustomerOrders(token, item.id);
      setOrders(Array.isArray(rows) ? rows : []);
      setOrdersCount(Array.isArray(rows) ? rows.length : 0);
    } catch {
      setOrdersCount(0);
      setOrders([]);
    }
  }

  async function resetPasswordNow() {
    if (!newPassword.trim()) return;
    try {
      await resetCustomerPassword(token, item.id, newPassword.trim());
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "customerModal.error.passwordFailed"));
    }
  }

  async function toggleBlockedNow() {
    try {
      await onToggleBlocked(item.id, !item.blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "customerModal.error.blockFailed"));
    }
  }

  async function deleteNow(force = false) {
    try {
      await onDelete(item.id, force);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const orderCountMatch = msg.match(/hat (\d+) Bestellung/);
      if (orderCountMatch) {
        setDeleteOrderCount(Number(orderCountMatch[1]));
        setDeleteConfirm("force");
        return;
      }
      setError(msg || t(lang, "customerModal.error.deleteFailed"));
    }
  }

  async function openCustomerPortal() {
    if (portalLoading) return;
    setPortalLoading(true);
    setError("");
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
    }
    try {
      const data = await getCustomerImpersonateUrl(token, item.id);
      const url = String(data?.url || "").trim();
      if (!url) {
        throw new Error(t(lang, "common.error"));
      }
      if (popup) {
        popup.location.href = url;
      } else {
        const fallback = window.open(url, "_blank");
        if (fallback) fallback.opener = null;
      }
    } catch (err) {
      if (popup) popup.close();
      setError(err instanceof Error ? err.message : t(lang, "common.error"));
    } finally {
      setPortalLoading(false);
    }
  }

  useEffect(() => {
    if (isDirty) {
      setSaveState("dirty");
      setSaveError("");
    } else {
      setSaveState("saved");
    }
  }, [isDirty]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const full = await getCustomer(token, item.id);
        if (!active) return;
        const next = toFormState(full);
        setForm(next);
        baselineRef.current = next;
        setSaveState("saved");
        setSaveError("");
      } catch {
        // Falls Laden fehlschlaegt, bleibt der bereits vorhandene Listenstand bestehen.
      }
    })();
    return () => {
      active = false;
    };
  }, [token, item.id]);

  async function saveNow() {
    if (!isDirty || saveState === "saving") return;
    setSaveState("saving");
    setSaveError("");
    try {
      const trimmedEmail = form.email.trim();
      const effectiveEmail = trimmedEmail || (isSyntheticCompanyEmail(item.email) ? (item.email || "") : "");
      await onSave({
        ...form,
        name: form.name,
        salutation: form.salutation,
        first_name: form.first_name,
        email: effectiveEmail,
      });
      await onToggleAdmin(item.id, form.is_admin);
      baselineRef.current = form;
      setSaveState("saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t(lang, "customerModal.error.saveFailed"));
      setSaveState("error");
    }
  }

  const saveButton = (
    <button
      type="button"
      onClick={saveNow}
      disabled={!isDirty || saveState === "saving"}
      className={
        uiMode === "modern"
          ? "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed " +
            (saveState === "error"
              ? "bg-red-600 text-white hover:bg-red-700"
              : saveState === "saved" && !isDirty
              ? "bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 cursor-default"
              : "bg-(--accent) text-white hover:bg-(--accent-hover)")
          : "rounded border px-3 py-1 text-sm disabled:opacity-50"
      }
    >
      {saveState === "saving" ? (
        <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />{t(lang, "common.saving")}</>
      ) : saveState === "error" ? (
        t(lang, "common.error")
      ) : !isDirty ? (
        <><span className="h-2 w-2 rounded-full bg-emerald-500" />{t(lang, "common.saved")}</>
      ) : (
        t(lang, "common.save")
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
      <form onSubmit={submit} className={uiMode === "modern" ? "surface-card w-full max-w-full sm:max-w-3xl p-3 sm:p-5 my-auto" : "w-full max-w-full sm:max-w-2xl rounded-xl bg-white p-3 sm:p-4 shadow-xl my-auto"}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold">{t(lang, "customerModal.title")}</h3>
            <p className="mt-0.5 text-[11px] font-medium tabular-nums text-(--text-subtle)">
              {t(lang, "customerList.table.id")}: {item.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saveButton}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-(--text-subtle) hover:bg-(--surface-raised) hover:text-(--text-main)"
              aria-label={t(lang, "profile.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <p className="mb-2 text-xs text-(--text-subtle)">{t(lang, "customerModal.hint.contactsForPersons")}</p>
        <div className="mb-1 mt-1 text-xs font-semibold uppercase tracking-wide p-text-muted">{t(lang, "customerModal.section.personalData")}</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm">{t(lang, "customer.salutation")}</label>
            <select
              className="ui-input"
              value={form.salutation}
              onChange={(e) => setForm((f) => ({ ...f, salutation: e.target.value }))}
            >
              <option value="">—</option>
              <option value="Firma">{t(lang, "customer.salutation.company")}</option>
              <option value="Herr">{t(lang, "customer.salutation.mr")}</option>
              <option value="Frau">{t(lang, "customer.salutation.ms")}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">{t(lang, "customer.firstName")}</label>
            <input className="ui-input" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm">{t(lang, "customerModal.label.lastName")}</label>
            <input className="ui-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <DbFieldHint fieldPath="customers.name" />
          </div>
        </div>

        <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide p-text-muted">{t(lang, "customerModal.section.contact")}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm">{t(lang, "customerModal.label.phonePrimary")}</label><input className="ui-input" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /><DbFieldHint fieldPath="customers.phone" /></div>
          <div><label className="mb-1 block text-sm">{t(lang, "customer.phone2")}</label><input className="ui-input" type="tel" value={form.phone_2} onChange={(e) => setForm((f) => ({ ...f, phone_2: e.target.value }))} /></div>
          <div><label className="mb-1 block text-sm">{t(lang, "customer.phoneMobile")}</label><input className="ui-input" type="tel" value={form.phone_mobile} onChange={(e) => setForm((f) => ({ ...f, phone_mobile: e.target.value }))} /></div>
          <div><label className="mb-1 block text-sm">{t(lang, "customer.phoneFax")}</label><input className="ui-input" type="tel" value={form.phone_fax} onChange={(e) => setForm((f) => ({ ...f, phone_fax: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-sm">{t(lang, "common.company")}</label><input className="ui-input" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-sm">{t(lang, "common.email")}</label><input className="ui-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /><DbFieldHint fieldPath="customers.email" /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-sm">Website</label><input className="ui-input" type="url" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://example.ch" /></div>
        </div>

        <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide p-text-muted">Adresse</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm">{t(lang, "customerView.label.street")}</label>
            <input className="ui-input" value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Adresszusatz</label>
            <input className="ui-input" value={form.address_addon_1} onChange={(e) => setForm((f) => ({ ...f, address_addon_1: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Postfach</label>
            <input className="ui-input" value={form.po_box} onChange={(e) => setForm((f) => ({ ...f, po_box: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm">PLZ</label>
            <input className="ui-input" value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value, zipcity: buildZipcity(e.target.value, form.city) }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Ort</label>
            <input className="ui-input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value, zipcity: buildZipcity(form.zip, e.target.value) }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm">{t(lang, "customerView.label.zipcity")}</label>
            <input className="ui-input" value={form.zipcity} onChange={(e) => setForm((f) => ({ ...f, zipcity: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm">Land</label>
            <input className="ui-input" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
          </div>
        </div>

        <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide p-text-muted">EXXAS</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm">EXXAS Kunden-ID</label>
            <input className="ui-input bg-(--surface-raised)" value={form.exxas_customer_id} readOnly placeholder="Keine EXXAS-ID hinterlegt" />
          </div>
          <div>
            <label className="mb-1 block text-sm">EXXAS Adress-ID</label>
            <input className="ui-input bg-(--surface-raised)" value={form.exxas_address_id} readOnly placeholder="Keine EXXAS-ID hinterlegt" />
          </div>
        </div>

        <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide p-text-muted">{t(lang, "customerModal.section.other")}</div>
        <div className="grid gap-2">
          <div><label className="mb-1 block text-sm">{t(lang, "common.notes")}</label><textarea rows={2} className="ui-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_admin} onChange={(e) => setForm((f) => ({ ...f, is_admin: e.target.checked }))} /> {t(lang, "customerModal.label.adminRights")}</label>
        </div>

        <CustomerContactsSection token={token} customerId={item.id} readonly={false} />

        <div className="mt-3 surface-card p-3 text-sm">
          <div className="mb-2 font-semibold">{t(lang, "customerModal.section.security")}</div>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              autoComplete="new-password"
              className="ui-input min-w-0 flex-1"
              placeholder={t(lang, "customerModal.placeholder.newPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button type="button" className={uiMode === "modern" ? "btn-secondary" : "rounded border px-3 py-1"} onClick={resetPasswordNow}>{t(lang, "customerModal.button.setPassword")}</button>
            <button type="button" className={uiMode === "modern" ? "btn-secondary" : "rounded border px-3 py-1"} onClick={loadOrders}>{t(lang, "customerModal.button.loadOrders")}</button>
          </div>
          {ordersCount != null ? <div className="mt-1 text-xs text-zinc-500">{t(lang, "customerModal.label.orderCount").replace("{{n}}", String(ordersCount))}</div> : null}
          {orders.length ? (
            <div className="mt-2 max-h-32 overflow-auto rounded border border-zinc-200 p-2 text-xs">
              {orders.map((o, idx) => (
                <div key={`${toDisplayString(o.orderNo, "order")}-${idx}`} className="mb-1 border-b border-zinc-100 pb-1 last:mb-0 last:border-b-0 last:pb-0">
                  #{toDisplayString(o.orderNo, "-")} | {toDisplayString(o.status, "-")} | {toDisplayString(o.address, "-")}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 rounded border border-zinc-200 p-2 text-xs text-zinc-600">
            <div className="mb-1 font-semibold text-zinc-700">{t(lang, "customerModal.section.portal")}</div>
            <p className="mb-1">{t(lang, "customerModal.label.loginEmail")} <span className="font-mono text-zinc-800">{toDisplayString(item.email)}</span></p>
            <p className="mb-1">{t(lang, "customerModal.label.status")} {item.blocked ? <span className="text-red-600">{t(lang, "customerView.status.blocked")}</span> : <span className="text-emerald-600">{t(lang, "customerView.status.active")}</span>}</p>
            <p className="mb-1">
              {t(lang, "customerModal.label.openPortal")}{" "}
              <button
                type="button"
                onClick={() => { void openCustomerPortal(); }}
                disabled={item.blocked || portalLoading}
                className="text-(--accent) hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {portalLoading ? t(lang, "common.loading") : t(lang, "customerView.button.openPortal")}
              </button>
            </p>
            <p className="mb-1">
              {t(lang, "impersonate.openPanel")}{" "}
              <button
                type="button"
                onClick={() => {
                  setShowImpersonate(true);
                }}
                disabled={item.blocked}
                className="text-(--accent) hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t(lang, "impersonate.start")}
              </button>
            </p>
            <p className="text-[11px] text-zinc-500">{t(lang, "customerModal.hint.portal")}</p>
          </div>
        </div>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        {saveError ? <p className="mt-1 text-sm text-red-600">{saveError}</p> : null}
        {showImpersonate ? (
          <ImpersonateDialog
            token={token}
            item={item}
            onClose={() => {
              setShowImpersonate(false);
            }}
          />
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={uiMode === "modern" ? "btn-secondary" : "rounded border px-3 py-1 text-sm"} onClick={toggleBlockedNow}>
            {item.blocked ? t(lang, "common.unblock") : t(lang, "common.block")}
          </button>
          {deleteConfirm === "none" && (
            <button
              type="button"
              className={uiMode === "modern" ? "btn-danger" : "rounded border border-red-300 px-3 py-1 text-sm text-red-700"}
              onClick={() => setDeleteConfirm("confirm")}
            >
              {t(lang, "common.delete")}
            </button>
          )}
          {deleteConfirm === "confirm" && (
            <div className="w-full rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
              <p className="mb-2 font-semibold text-red-400">Kunden wirklich löschen?</p>
              <p className="mb-3 text-xs p-text-muted">Alle Kontakte und Sessions werden gelöscht. Bestellungen bleiben erhalten (ohne Kunden-Verknüpfung).</p>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700" onClick={() => deleteNow(false)}>
                  Ja, löschen
                </button>
                <button type="button" className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800" onClick={() => setDeleteConfirm("none")}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          {deleteConfirm === "force" && (
            <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="mb-2 font-semibold text-amber-400">⚠ Dieser Kunde hat {deleteOrderCount} Bestellung(en)</p>
              <p className="mb-3 text-xs p-text-muted">Die Bestellungen bleiben in der Datenbank erhalten, aber die Kunden-Verknüpfung wird aufgehoben. Trotzdem löschen?</p>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700" onClick={() => deleteNow(true)}>
                  Ja, trotzdem löschen
                </button>
                <button type="button" className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800" onClick={() => setDeleteConfirm("none")}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          <button type="button" className={uiMode === "modern" ? "btn-secondary" : "rounded border px-3 py-1 text-sm"} onClick={onClose}>{t(lang, "common.cancel")}</button>
        </div>
      </form>
    </div>
  );
}

