import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createOrder } from "../../api/orders";
import { getProducts, type Product } from "../../api/products";
import { CustomerAutocompleteInput } from "../ui/CustomerAutocompleteInput";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = { token: string; onDone: () => void; onClose: () => void };

export function OrderCreate({ token, onDone, onClose }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const language = useAuthStore((s) => s.language);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [selectedPackageCode, setSelectedPackageCode] = useState("");
  const [selectedAddonCodes, setSelectedAddonCodes] = useState<string[]>([]);
  const [form, setForm] = useState({
    customerName: "", customerEmail: "", customerPhone: "", company: "", address: "", street: "", zipcity: "",
    objectType: "apartment", area: "", floors: "1", rooms: "", desc: "", date: "", time: "", durationMin: "60",
    subtotal: "0", discount: "0", vat: "0", total: "0", discountCode: "", notes: "", sendEmails: true,
    photographerKey: "", packageLabel: "", packagePrice: "0", addonsText: "", keyPickupAddress: "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    getProducts(token, false).then(setCatalog).catch(() => {});
  }, [token]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((f) => ({ ...f, [key]: value })); }

  function estimatePrice(product: Product) {
    const rule = product.rules?.[0];
    const cfg = (rule?.config_json || {}) as Record<string, unknown>;
    const floors = Math.max(1, Number(form.floors || 1));
    const area = Number(form.area || 0);
    if (rule?.rule_type === "fixed") return Number(cfg.price || 0);
    if (rule?.rule_type === "per_floor") return Number(cfg.unitPrice || 0) * floors;
    if (rule?.rule_type === "per_room") return Number(cfg.unitPrice || 0);
    if (rule?.rule_type === "area_tier") {
      const tiers = Array.isArray(cfg.tiers) ? cfg.tiers as Array<Record<string, unknown>> : [];
      for (const tier of tiers) {
        const maxArea = Number(tier.maxArea || 0);
        const price = Number(tier.price || 0);
        if (area > 0 && area <= maxArea) return price;
      }
      return Number((tiers[tiers.length - 1] || {}).price || 0);
    }
    if (rule?.rule_type === "conditional") return Number(cfg.price || 0);
    return 0;
  }

  function syncServiceFields(pkgCode: string, addonCodes: string[]) {
    const pkg = catalog.find((p) => p.code === pkgCode);
    const selectedAddons = catalog.filter((p) => addonCodes.includes(p.code));
    setForm((prev) => ({
      ...prev,
      packageLabel: pkg?.name || "",
      packagePrice: String(pkg ? estimatePrice(pkg) : 0),
      addonsText: selectedAddons.map((a) => `${a.name};${estimatePrice(a)}`).join("\n"),
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const selectedCatalogAddons = catalog.filter((p) => selectedAddonCodes.includes(p.code));
      const addons = selectedCatalogAddons.length
        ? selectedCatalogAddons.map((p) => ({ id: p.code, group: p.group_key, label: p.name, price: estimatePrice(p) }))
        : form.addonsText.split("\n").map((line) => line.trim()).filter(Boolean).map((line, idx) => {
          const parts = line.split(";").map((p) => p.trim());
          return { id: `manual_${idx}`, label: parts[0] || `Addon ${idx + 1}`, price: Number(parts[1] || 0) };
        });

      await createOrder(token, {
        customerName: form.customerName, customerEmail: form.customerEmail, customerPhone: form.customerPhone,
        company: form.company, address: form.address, street: form.street, zipcity: form.zipcity,
        objectType: form.objectType, area: Number(form.area || 0), floors: Number(form.floors || 1), rooms: form.rooms, desc: form.desc,
        date: form.date, time: form.time, durationMin: Number(form.durationMin || 60),
        subtotal: Number(form.subtotal || 0), discount: Number(form.discount || 0), vat: Number(form.vat || 0), total: Number(form.total || 0),
        discountCode: form.discountCode, notes: form.notes, sendEmails: form.sendEmails, photographerKey: form.photographerKey,
        package: form.packageLabel ? { key: selectedPackageCode || "manual", label: form.packageLabel, price: Number(form.packagePrice || 0) } : undefined,
        addons, keyPickup: form.keyPickupAddress ? { address: form.keyPickupAddress } : null,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(language, "common.error"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4">
      <form onSubmit={submit} className={uiMode === "modern" ? "surface-card max-h-[92vh] w-full max-w-full sm:max-w-6xl overflow-auto p-3 sm:p-5" : "max-h-[92vh] w-full max-w-full sm:max-w-4xl overflow-auto rounded-xl bg-white p-3 sm:p-4 shadow-xl"}>
        <h3 className="mb-3 text-lg font-bold">{t(language, "orderCreate.title")}</h3>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="mb-1 block text-sm">{t(language, "orderCreate.label.customer")}</label><CustomerAutocompleteInput className="ui-input" value={form.customerName} onChange={(value) => setField("customerName", value)} onSelectCustomer={(customer) => { setField("customerName", customer.name || ""); setField("customerEmail", customer.email || ""); setField("customerPhone", customer.phone || ""); setField("company", customer.company || ""); }} token={token} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "common.email")}</label><CustomerAutocompleteInput className="ui-input" type="email" value={form.customerEmail} onChange={(value) => setField("customerEmail", value)} onSelectCustomer={(customer) => { setField("customerName", customer.name || ""); setField("customerEmail", customer.email || ""); setField("customerPhone", customer.phone || ""); setField("company", customer.company || ""); }} token={token} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "common.phone")}</label><CustomerAutocompleteInput className="ui-input" value={form.customerPhone} onChange={(value) => setField("customerPhone", value)} onSelectCustomer={(customer) => { setField("customerName", customer.name || ""); setField("customerEmail", customer.email || ""); setField("customerPhone", customer.phone || ""); setField("company", customer.company || ""); }} token={token} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "common.company")}</label><input className="ui-input" value={form.company} onChange={(e) => setField("company", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "common.address")}</label><input className="ui-input" value={form.address} onChange={(e) => setField("address", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderCreate.label.zipCity")}</label><input className="ui-input" value={form.zipcity} onChange={(e) => setField("zipcity", e.target.value)} /></div>

          <div><label className="mb-1 block text-sm">{t(language, "wizard.label.objectType")}</label><select className="ui-input" value={form.objectType} onChange={(e) => setField("objectType", e.target.value)}><option value="apartment">{t(language, "wizard.objectType.apartment")}</option><option value="single_house">{t(language, "wizard.objectType.singleHouse")}</option><option value="multi_house">{t(language, "wizard.objectType.multiHouse")}</option><option value="commercial">{t(language, "wizard.objectType.commercial")}</option><option value="land">{t(language, "wizard.objectType.land")}</option></select></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderDetail.label.area")}</label><input type="number" className="ui-input" value={form.area} onChange={(e) => setField("area", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderDetail.label.floors")}</label><input type="number" className="ui-input" value={form.floors} onChange={(e) => setField("floors", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderDetail.label.rooms")}</label><input className="ui-input" value={form.rooms} onChange={(e) => setField("rooms", e.target.value)} /></div>

          <div><label className="mb-1 block text-sm">{t(language, "orderCreate.label.date")}</label><input type="date" className="ui-input" value={form.date} onChange={(e) => setField("date", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderCreate.label.time")}</label><input type="time" className="ui-input" value={form.time} onChange={(e) => setField("time", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "wizard.label.durationMin")}</label><input type="number" className="ui-input" value={form.durationMin} onChange={(e) => setField("durationMin", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "wizard.label.photographerKey")}</label><input className="ui-input" value={form.photographerKey} onChange={(e) => setField("photographerKey", e.target.value)} /></div>

          <div><label className="mb-1 block text-sm">{t(language, "orderDetail.label.package")}</label><select className="ui-input" value={selectedPackageCode} onChange={(e) => { const code = e.target.value; setSelectedPackageCode(code); syncServiceFields(code, selectedAddonCodes); }}><option value="">{t(language, "wizard.select.noPackage")}</option>{catalog.filter((p) => p.kind === "package").map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}</select></div>
          <div><label className="mb-1 block text-sm">{t(language, "wizard.label.packagePrice")}</label><input type="number" className="ui-input" value={form.packagePrice} onChange={(e) => setField("packagePrice", e.target.value)} /></div>

          <div><label className="mb-1 block text-sm">{t(language, "orderCreate.label.subtotal")}</label><input type="number" className="ui-input" value={form.subtotal} onChange={(e) => setField("subtotal", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderDetail.pricing.discount")}</label><input type="number" className="ui-input" value={form.discount} onChange={(e) => setField("discount", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderCreate.label.vat")}</label><input type="number" className="ui-input" value={form.vat} onChange={(e) => setField("vat", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderDetail.pricing.total")}</label><input type="number" className="ui-input" value={form.total} onChange={(e) => setField("total", e.target.value)} /></div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm">{t(language, "wizard.label.discountCode")}</label><input className="ui-input" value={form.discountCode} onChange={(e) => setField("discountCode", e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">{t(language, "orderDetail.label.keyPickupShort")}</label><input className="ui-input" value={form.keyPickupAddress} onChange={(e) => setField("keyPickupAddress", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-sm">{t(language, "orderCreate.label.objectDescription")}</label><textarea className="ui-input" rows={2} value={form.desc} onChange={(e) => setField("desc", e.target.value)} /></div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm">{t(language, "orderCreate.label.selectAddons")}</label>
            <div className="grid gap-1 sm:grid-cols-2 rounded border p-2 max-h-40 overflow-auto">
              {catalog.filter((p) => p.kind === "addon").map((a) => (
                <label key={a.id} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedAddonCodes.includes(a.code)} onChange={(e) => {
                    const next = e.target.checked ? [...selectedAddonCodes, a.code] : selectedAddonCodes.filter((x) => x !== a.code);
                    setSelectedAddonCodes(next);
                    syncServiceFields(selectedPackageCode, next);
                  }} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2"><label className="mb-1 block text-sm">{t(language, "orderCreate.label.addonsManual")}</label><textarea className="ui-input" rows={3} value={form.addonsText} onChange={(e) => setField("addonsText", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-sm">{t(language, "common.notes")}</label><textarea className="ui-input" rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)} /></div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sendEmails} onChange={(e) => setField("sendEmails", e.target.checked)} /> {t(language, "orderCreate.label.sendEmails")}</label>
        </div>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="submit" className={uiMode === "modern" ? "btn-primary" : "rounded bg-[#9E8649] px-3 py-1 text-sm font-semibold text-white"}>{t(language, "common.save")}</button>
          <button type="button" className={uiMode === "modern" ? "btn-secondary" : "rounded border px-3 py-1 text-sm"} onClick={onClose}>{t(language, "common.cancel")}</button>
        </div>
      </form>
    </div>
  );
}
