import { useCallback, useEffect, useState } from "react";
import { ShoppingBag, X, Plus } from "lucide-react";
import { getCustomerImpersonateUrl, getCustomerOrders, updateCustomerEmailAliases, type Customer, type CustomerOrder } from "../../api/customers";
import { t } from "../../i18n";
import { PhoneLink } from "../ui/PhoneLink";
import { toDisplayString } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { CustomerContactsSection } from "./CustomerContactsSection";

function OpenPortalButton({ token, customerId, disabled, label }: { token: string; customerId: number; disabled: boolean; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleClick = useCallback(async () => {
    if (loading || disabled) return;
    setLoading(true);
    setError(null);
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      // Keep handle for async redirect and remove opener for safety.
      popup.opener = null;
    }
    try {
      const data = await getCustomerImpersonateUrl(token, customerId);
      if (data?.url) {
        if (popup) {
          popup.location.href = data.url;
        } else {
          const fallback = window.open(data.url, "_blank");
          if (fallback) fallback.opener = null;
        }
      } else {
        setError("Kein Link erhalten");
        if (popup) popup.close();
      }
    } catch (e) {
      if (popup) popup.close();
      setError(e instanceof Error ? e.message : "Fehler beim Öffnen");
    } finally {
      setLoading(false);
    }
  }, [token, customerId, loading, disabled]);

  return (
    <span>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className="btn-primary inline-flex items-center gap-1 px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "..." : label}
      </button>
      {error && <span className="ml-2 text-red-600 text-xs">{error}</span>}
    </span>
  );
}

type Props = {
  open: boolean;
  token: string;
  customer: Customer | null;
  onClose: () => void;
  onCreateOrder?: (customer: Customer) => void;
};

export function CustomerViewModal({ open, token, customer, onClose, onCreateOrder }: Props) {
  const lang = useAuthStore((s) => s.language);
  const isSyntheticCompanyEmail = String(customer?.email || "").toLowerCase().endsWith("@company.local");
  const companyName = String(customer?.company || "").trim();
  const displayTitle = companyName || String(customer?.name || "").trim();
  const isCompanyProfile = Boolean(companyName);
  const phoneOrDash = (value?: string | null) =>
    String(value || "").trim() ? <PhoneLink value={value} className="text-[var(--accent)]" /> : "-";
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // E-Mail-Aliases
  const [aliases, setAliases] = useState<string[]>(customer?.email_aliases ?? []);
  const [newAlias, setNewAlias] = useState("");
  const [aliasesBusy, setAliasesBusy] = useState(false);
  const [aliasesError, setAliasesError] = useState("");

  useEffect(() => {
    if (customer) setAliases(customer.email_aliases ?? []);
  }, [customer]);

  const saveAliases = useCallback(async (updated: string[]) => {
    if (!customer) return;
    setAliasesBusy(true);
    setAliasesError("");
    try {
      await updateCustomerEmailAliases(token, customer.id, updated);
      setAliases(updated);
    } catch (e) {
      setAliasesError(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setAliasesBusy(false);
    }
  }, [token, customer]);

  const removeAlias = useCallback((alias: string) => {
    const updated = aliases.filter((a) => a !== alias);
    void saveAliases(updated);
  }, [aliases, saveAliases]);

  const addAlias = useCallback(() => {
    const norm = newAlias.trim().toLowerCase();
    if (!norm || !norm.includes("@")) return;
    if (aliases.includes(norm)) { setNewAlias(""); return; }
    const updated = [...aliases, norm];
    setNewAlias("");
    void saveAliases(updated);
  }, [newAlias, aliases, saveAliases]);

  useEffect(() => {
    if (!open || !customer) return;
    setOrdersLoading(true);
    getCustomerOrders(token, customer.id)
      .then((rows) => {
        setOrders(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [open, token, customer]);

  if (!open || !customer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
      <div className="surface-card w-full max-w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto p-3 sm:p-5 my-auto">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="flex flex-wrap items-center gap-2 text-xl font-bold p-text-main" style={{ fontFamily: "var(--propus-font-heading)" }}>
            <span>{t(lang, "customerView.title").replace("{{name}}", toDisplayString(displayTitle || customer.name))}</span>
            <span className="rounded px-2 py-0.5 text-xs font-semibold tabular-nums p-text-subtle" style={{ background: "var(--surface-raised)" }}>
              {t(lang, "customerList.table.id")}: {customer.id}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            {onCreateOrder && (
              <button
                type="button"
                onClick={() => onCreateOrder(customer)}
                className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                Neue Bestellung
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary rounded-lg px-3 py-1 text-sm font-medium"
            >
              {t(lang, "common.close")}
            </button>
          </div>
        </div>

        {/* Profile Section */}
        <div className="mb-6 surface-card p-4">
          <h4 className="mb-3 font-semibold">{t(lang, "customerView.section.profile")}</h4>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            {!isCompanyProfile ? (
              <div><span className="font-medium">{t(lang, "common.name") + ":"}</span> {toDisplayString(customer.name)}</div>
            ) : null}
            <div><span className="font-medium">{t(lang, "common.email") + ":"}</span> {isSyntheticCompanyEmail ? "-" : toDisplayString(customer.email)}</div>
            {/* E-Mail-Aliases */}
            <div className="sm:col-span-2">
              <span className="font-medium">E-Mail-Aliase:</span>
              <span className="ml-1 text-xs text-[var(--text-muted)]">(Touren &amp; Bestellungen unter diesen Adressen werden diesem Kunden zugeordnet)</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                {aliases.map((alias) => (
                  <span
                    key={alias}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-main)]"
                  >
                    {alias}
                    <button
                      type="button"
                      disabled={aliasesBusy}
                      onClick={() => removeAlias(alias)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--surface-raised)] disabled:opacity-50"
                      title="Alias entfernen"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="email"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }}
                    placeholder="alias@domain.ch"
                    disabled={aliasesBusy}
                    className="ui-input h-6 rounded-full px-2.5 py-0 text-xs w-40 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={addAlias}
                    disabled={aliasesBusy || !newAlias.trim().includes("@")}
                    className="inline-flex items-center gap-0.5 rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs text-white hover:opacity-90 disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" /> Hinzufügen
                  </button>
                </div>
                {aliasesError && <span className="text-xs text-red-600">{aliasesError}</span>}
              </div>
            </div>
            <div><span className="font-medium">{t(lang, "common.company") + ":"}</span> {toDisplayString(customer.company)}</div>
            <div><span className="font-medium">{t(lang, "common.phone") + ":"}</span> {phoneOrDash(customer.phone)}</div>
            <div><span className="font-medium">Telefon 2:</span> {phoneOrDash(customer.phone_2)}</div>
            <div><span className="font-medium">Mobile:</span> {phoneOrDash(customer.phone_mobile)}</div>
            <div><span className="font-medium">Fax:</span> {phoneOrDash(customer.phone_fax)}</div>
            <div><span className="font-medium">Website:</span> {toDisplayString(customer.website)}</div>
            {!isCompanyProfile ? (
              <div><span className="font-medium">Anrede:</span> {toDisplayString(customer.salutation)}</div>
            ) : null}
            {!isCompanyProfile ? (
              <div><span className="font-medium">Vorname:</span> {toDisplayString(customer.first_name)}</div>
            ) : null}
            <div><span className="font-medium">{t(lang, "customerView.label.street")}</span> {toDisplayString(customer.street)}</div>
            <div><span className="font-medium">Adresszusatz:</span> {toDisplayString(customer.address_addon_1)}</div>
            <div><span className="font-medium">Postfach:</span> {toDisplayString(customer.po_box)}</div>
            <div><span className="font-medium">{t(lang, "customerView.label.zipcity")}</span> {toDisplayString(customer.zipcity)}</div>
            <div><span className="font-medium">PLZ / Ort:</span> {toDisplayString([customer.zip, customer.city].filter(Boolean).join(" "))}</div>
            <div><span className="font-medium">Land:</span> {toDisplayString(customer.country)}</div>
            <div className="sm:col-span-2"><span className="font-medium">{t(lang, "customerView.label.notes")}</span> {toDisplayString(customer.notes)}</div>
            <div><span className="font-medium">{t(lang, "customerView.label.status")}</span> {customer.blocked ? <span className="text-red-600">{t(lang, "customerView.status.blocked")}</span> : <span className="text-emerald-600">{t(lang, "customerView.status.active")}</span>}</div>
            <div><span className="font-medium">Portalrolle:</span> {customer.is_admin ? t(lang, "customerView.role.admin") : t(lang, "customerView.role.customer")}</div>
            <div><span className="font-medium">EXXAS Kunden-ID:</span> {toDisplayString(customer.exxas_customer_id, "-")}</div>
            <div><span className="font-medium">EXXAS Adress-ID:</span> {toDisplayString(customer.exxas_address_id, "-")}</div>
          </div>
        </div>

        <CustomerContactsSection token={token} customerId={customer.id} />

        {/* Orders Section */}
        <div className="mb-6 surface-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="font-semibold">{t(lang, "customerView.section.orders")}</h4>
            {onCreateOrder && (
              <button
                type="button"
                onClick={() => onCreateOrder(customer)}
                className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold p-text-accent"
              >
                <ShoppingBag className="h-3 w-3" />
                + Neue Bestellung
              </button>
            )}
          </div>
          {ordersLoading ? (
            <div className="text-sm p-text-muted">{t(lang, "common.loading")}</div>
          ) : orders.length === 0 ? (
            <div className="text-sm p-text-muted">{t(lang, "customerView.orders.empty")}</div>
          ) : (
            <div className="space-y-2">
              {orders.map((o, idx) => (
                <div key={`${toDisplayString(o.orderNo, "order")}-${idx}`} className="rounded p-3 text-sm" style={{ border: "1px solid var(--border-soft)" }}>
                  <div className="mb-1 font-mono text-xs p-text-subtle">#{toDisplayString(o.orderNo, "-")}</div>
                  <div className="mb-1"><span className="font-medium">{t(lang, "customerView.label.status")}</span> {toDisplayString(o.status, "-")}</div>
                  <div className="mb-1"><span className="font-medium">{t(lang, "calendar.label.address")}</span> {toDisplayString(o.address, "-")}</div>
                  {o.appointmentDate ? <div className="mb-1"><span className="font-medium">{t(lang, "orderDetail.section.appointment") + ":"}</span> {new Date(o.appointmentDate).toLocaleString("de-CH")}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Portal Access Section */}
        <div className="surface-card p-4">
          <h4 className="mb-3 font-semibold">{t(lang, "customerView.section.portalAccess")}</h4>
          <div className="text-sm space-y-1">
            <p><span className="font-medium">{t(lang, "customerView.label.loginEmail")}</span> <span className="font-mono">{isSyntheticCompanyEmail ? "-" : toDisplayString(customer.email)}</span></p>
            <p><span className="font-medium">{t(lang, "customerView.label.status")}</span> {customer.blocked ? <span className="text-red-600">{t(lang, "customerView.status.blocked")}</span> : <span className="text-emerald-600">{t(lang, "customerView.status.active")}</span>}</p>
            <p className="mt-2">
              <OpenPortalButton token={token} customerId={customer.id} disabled={!!customer.blocked || isSyntheticCompanyEmail} label={t(lang, "customerView.button.openPortal")} />
            </p>
            <p className="text-xs text-zinc-500 mt-1">{t(lang, "customerView.hint.portalImpersonate")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

