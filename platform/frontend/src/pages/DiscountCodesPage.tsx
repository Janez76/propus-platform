import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CalendarClock, Pencil, RotateCcw, Save, Trash2, X } from "lucide-react";
import { formatSwissDate, formatSwissDateTime } from "../lib/format";
import {
  createDiscountCode,
  deleteDiscountCode,
  listDiscountCodeUsages,
  listDiscountCodes,
  updateDiscountCode,
  type DiscountCode,
  type DiscountCodeUsage,
} from "../api/discountCodes";
import { useAuthStore } from "../store/authStore";
import { t, type Lang } from "../i18n";

function toInputDate(value: string | null): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function parseOptionalNumber(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatDateRange(valueFrom: string | null, valueTo: string | null, lang: Lang): string {
  const from = valueFrom ? formatSwissDate(valueFrom) : t(lang, "discountCodes.date.immediately");
  const to = valueTo ? formatSwissDate(valueTo) : t(lang, "discountCodes.date.open");
  return `${from} ${t(lang, "discountCodes.date.until")} ${to}`;
}

function isExpired(validTo: string | null): boolean {
  if (!validTo) return false;
  const dt = new Date(`${String(validTo).slice(0, 10)}T23:59:59.999Z`);
  if (Number.isNaN(dt.getTime())) return false;
  return Date.now() > dt.getTime();
}

export function DiscountCodesPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [rows, setRows] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedCodeId, setSelectedCodeId] = useState<number | null>(null);
  const [usages, setUsages] = useState<DiscountCodeUsage[]>([]);
  const [usagesLoading, setUsagesLoading] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [amount, setAmount] = useState("10");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [usesPerCustomer, setUsesPerCustomer] = useState("");

  function resetForm() {
    setEditingId(null);
    setCode("");
    setType("percent");
    setAmount("10");
    setValidFrom("");
    setValidTo("");
    setMaxUses("");
    setUsesPerCustomer("");
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await listDiscountCodes(token, true);
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "discountCodes.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, [token]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload: Partial<DiscountCode> = {
        code: code.trim().toUpperCase(),
        type,
        amount: Number(amount || 0),
        validFrom: validFrom || null,
        validTo: validTo || null,
        maxUses: parseOptionalNumber(maxUses),
        usesPerCustomer: parseOptionalNumber(usesPerCustomer),
        active: true,
      };

      if (!payload.code) throw new Error(t(lang, "discountCodes.error.codeRequired"));
      if (!Number.isFinite(payload.amount) || Number(payload.amount) <= 0) {
        throw new Error(t(lang, "discountCodes.error.amountRequired"));
      }

      if (editingId != null) {
        await updateDiscountCode(token, editingId, payload);
      } else {
        await createDiscountCode(token, payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "discountCodes.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function onEdit(row: DiscountCode) {
    setEditingId(row.id);
    setCode(row.code);
    setType(row.type);
    setAmount(String(row.amount ?? ""));
    setValidFrom(toInputDate(row.validFrom));
    setValidTo(toInputDate(row.validTo));
    setMaxUses(row.maxUses != null ? String(row.maxUses) : "");
    setUsesPerCustomer(row.usesPerCustomer != null ? String(row.usesPerCustomer) : "");
  }

  async function toggleActive(row: DiscountCode) {
    setError("");
    try {
      await updateDiscountCode(token, row.id, { active: !row.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "discountCodes.error.toggleFailed"));
    }
  }

  async function onDelete(row: DiscountCode) {
    setError("");
    try {
      await deleteDiscountCode(token, row.id);
      if (selectedCodeId === row.id) {
        setSelectedCodeId(null);
        setUsages([]);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "discountCodes.error.deleteFailed"));
    }
  }

  async function showUsages(row: DiscountCode) {
    setSelectedCodeId(row.id);
    setUsagesLoading(true);
    setError("");
    try {
      const usageRows = await listDiscountCodeUsages(token, row.id);
      setUsages(usageRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "discountCodes.error.usagesLoadFailed"));
      setUsages([]);
    } finally {
      setUsagesLoading(false);
    }
  }

  const selectedCode = useMemo(() => rows.find((r) => r.id === selectedCodeId) || null, [rows, selectedCodeId]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{t(lang, "discountCodes.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          {t(lang, "discountCodes.description")}
        </p>
      </section>

      <form onSubmit={onCreate} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
            {editingId != null ? t(lang, "discountCodes.form.editTitle") : t(lang, "discountCodes.form.createTitle")}
          </h3>
          {editingId != null ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t(lang, "discountCodes.button.reset")}
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <label className="space-y-1 md:col-span-2 xl:col-span-2">
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{t(lang, "discountCodes.label.code")}</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-800"
              placeholder="z.B. PROPUS10"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{t(lang, "discountCodes.label.type")}</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={type}
              onChange={(e) => setType(e.target.value as "percent" | "fixed")}
            >
              <option value="percent">{t(lang, "discountCodes.type.percent")}</option>
              <option value="fixed">{t(lang, "discountCodes.type.fixed")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{t(lang, "discountCodes.label.amount")}</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              placeholder={type === "percent" ? "z.B. 10" : "z.B. 50"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{t(lang, "discountCodes.label.validFrom")}</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{t(lang, "discountCodes.label.validTo")}</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{t(lang, "discountCodes.label.maxUses")}</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              placeholder="optional"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{t(lang, "discountCodes.label.perCustomer")}</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              placeholder="optional"
              value={usesPerCustomer}
              onChange={(e) => setUsesPerCustomer(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-[#C5A059] px-3 py-2 text-sm font-semibold text-white hover:bg-[#b8944f] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {editingId != null ? t(lang, "discountCodes.button.save") : t(lang, "discountCodes.button.create")}
          </button>
          {editingId != null ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
              {t(lang, "common.cancel")}
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">{t(lang, "discountCodes.table.title")}</h3>
          {loading ? <span className="text-xs text-slate-500">{t(lang, "common.loading")}</span> : null}
        </div>
        {error ? <p className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800">
                <th className="px-2 py-2">{t(lang, "discountCodes.label.code")}</th>
                <th className="px-2 py-2">{t(lang, "discountCodes.label.type")}</th>
                <th className="px-2 py-2">{t(lang, "discountCodes.label.amount")}</th>
                <th className="px-2 py-2">{t(lang, "discountCodes.table.validity")}</th>
                <th className="px-2 py-2">{t(lang, "discountCodes.table.limits")}</th>
                <th className="px-2 py-2">{t(lang, "discountCodes.table.usages")}</th>
                <th className="px-2 py-2">{t(lang, "discountCodes.table.status")}</th>
                <th className="px-2 py-2">{t(lang, "discountCodes.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-zinc-800/60">
                  <td className="px-2 py-2 font-semibold">
                    <div className="flex items-center gap-2">
                      <span>{row.code}</span>
                      {isExpired(row.validTo) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          <CalendarClock className="h-3 w-3" />
                          {t(lang, "discountCodes.badge.expired")}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {row.type === "percent" ? t(lang, "discountCodes.type.percent") : t(lang, "discountCodes.type.fixed")}
                    </span>
                  </td>
                  <td className="px-2 py-2">{row.amount}</td>
                  <td className="px-2 py-2">{formatDateRange(row.validFrom, row.validTo, lang)}</td>
                  <td className="px-2 py-2 text-xs text-slate-600 dark:text-zinc-300">
                    max: {row.maxUses ?? "∞"} · {t(lang, "discountCodes.label.perCustomer").toLowerCase()}: {row.usesPerCustomer ?? "∞"}
                  </td>
                  <td className="px-2 py-2">{row.usesCount}</td>
                  <td className="px-2 py-2">
                    <span className={row.active ? "text-emerald-600" : "text-zinc-500"}>{row.active ? t(lang, "discountCodes.badge.active") : t(lang, "discountCodes.badge.inactive")}</span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs dark:border-zinc-700">
                        <Pencil className="h-3.5 w-3.5" />
                        {t(lang, "common.edit")}
                      </button>
                      <button type="button" onClick={() => toggleActive(row)} className="rounded border px-2 py-1 text-xs dark:border-zinc-700">
                        {row.active ? t(lang, "common.deactivate") : t(lang, "common.activate")}
                      </button>
                      <button type="button" onClick={() => showUsages(row)} className="rounded border px-2 py-1 text-xs dark:border-zinc-700">
                        {t(lang, "discountCodes.button.usages")}
                      </button>
                      <button type="button" onClick={() => onDelete(row)} className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t(lang, "discountCodes.button.remove")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-zinc-100">
          {t(lang, "discountCodes.usageHistory.title")} {selectedCode ? `– ${selectedCode.code}` : ""}
        </h3>
        {usagesLoading ? <p className="text-xs text-slate-500">{t(lang, "common.loading")}</p> : null}
        {!usagesLoading && usages.length === 0 ? <p className="text-xs text-slate-500">{t(lang, "discountCodes.usageHistory.empty")}</p> : null}
        {usages.length > 0 ? (
          <ul className="space-y-1 text-xs text-slate-700 dark:text-zinc-300">
            {usages.map((usage) => (
              <li key={usage.id}>
                {usage.customerEmail} · Order #{usage.orderId ?? "—"} · {usage.usedAt ? formatSwissDateTime(usage.usedAt) : "—"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
