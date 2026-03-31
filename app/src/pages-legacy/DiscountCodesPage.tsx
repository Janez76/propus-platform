import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CalendarClock, Pencil, RotateCcw, Save, Tag, Trash2, X } from "lucide-react";
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <Tag className="h-6 w-6" style={{ color: "var(--accent)" }} />
        <div>
          <h1 className="cust-page-header-title">{t(lang, "discountCodes.title")}</h1>
          <p className="cust-page-header-sub">{t(lang, "discountCodes.description")}</p>
        </div>
      </div>

      {/* Create / Edit Form */}
      <form onSubmit={onCreate} className="cust-form-section">
        <div className="cust-form-section-title flex items-center justify-between">
          <span>{editingId != null ? t(lang, "discountCodes.form.editTitle") : t(lang, "discountCodes.form.createTitle")}</span>
          {editingId != null && (
            <button type="button" onClick={resetForm} className="cust-action-icon min-h-0 min-w-0">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <label className="space-y-1 md:col-span-2 xl:col-span-2">
            <span className="cust-form-label">{t(lang, "discountCodes.label.code")}</span>
            <input
              className="cust-form-input uppercase"
              placeholder="z.B. PROPUS10"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="cust-form-label">{t(lang, "discountCodes.label.type")}</span>
            <select
              className="cust-form-input cust-filter-select"
              value={type}
              onChange={(e) => setType(e.target.value as "percent" | "fixed")}
            >
              <option value="percent">{t(lang, "discountCodes.type.percent")}</option>
              <option value="fixed">{t(lang, "discountCodes.type.fixed")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="cust-form-label">{t(lang, "discountCodes.label.amount")}</span>
            <input
              className="cust-form-input"
              placeholder={type === "percent" ? "z.B. 10" : "z.B. 50"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="cust-form-label">{t(lang, "discountCodes.label.validFrom")}</span>
            <input
              className="cust-form-input"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="cust-form-label">{t(lang, "discountCodes.label.validTo")}</span>
            <input
              className="cust-form-input"
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="cust-form-label">{t(lang, "discountCodes.label.maxUses")}</span>
            <input
              className="cust-form-input"
              placeholder="optional"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="cust-form-label">{t(lang, "discountCodes.label.perCustomer")}</span>
            <input
              className="cust-form-input"
              placeholder="optional"
              value={usesPerCustomer}
              onChange={(e) => setUsesPerCustomer(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="btn-primary min-h-0 min-w-0 inline-flex items-center gap-1 px-3 py-2 text-sm">
            <Save className="h-4 w-4" />
            {editingId != null ? t(lang, "discountCodes.button.save") : t(lang, "discountCodes.button.create")}
          </button>
          {editingId != null && (
            <button type="button" onClick={resetForm} className="btn-secondary min-h-0 min-w-0 inline-flex items-center gap-1 px-3 py-2 text-sm">
              <X className="h-4 w-4" />
              {t(lang, "common.cancel")}
            </button>
          )}
        </div>
      </form>

      {/* Table */}
      <div className="cust-table-wrap">
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-main)" }}>{t(lang, "discountCodes.table.title")}</h3>
          {loading && <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{t(lang, "common.loading")}</span>}
        </div>
        {error && <div className="cust-alert cust-alert--error mx-4 my-3 rounded-lg text-sm">{error}</div>}
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>{t(lang, "discountCodes.label.code")}</th>
                <th>{t(lang, "discountCodes.label.type")}</th>
                <th>{t(lang, "discountCodes.label.amount")}</th>
                <th>{t(lang, "discountCodes.table.validity")}</th>
                <th>{t(lang, "discountCodes.table.limits")}</th>
                <th>{t(lang, "discountCodes.table.usages")}</th>
                <th>{t(lang, "discountCodes.table.status")}</th>
                <th>{t(lang, "discountCodes.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="cust-empty-state">
                      <Tag className="h-10 w-10 mx-auto" />
                      <p className="cust-empty-title">{t(lang, "discountCodes.table.empty")}</p>
                    </div>
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: "var(--text-main)" }}>{row.code}</span>
                      {isExpired(row.validTo) && (
                        <span className="cust-status-badge cust-status-warning">
                          <CalendarClock className="h-3 w-3" />
                          {t(lang, "discountCodes.badge.expired")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="cust-badge cust-badge--neutral">
                      {row.type === "percent" ? t(lang, "discountCodes.type.percent") : t(lang, "discountCodes.type.fixed")}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-main)" }}>{row.amount}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>{formatDateRange(row.validFrom, row.validTo, lang)}</td>
                  <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    max: {row.maxUses ?? "∞"} · {t(lang, "discountCodes.label.perCustomer").toLowerCase()}: {row.usesPerCustomer ?? "∞"}
                  </td>
                  <td style={{ color: "var(--text-main)" }}>{row.usesCount}</td>
                  <td>
                    <span className={`cust-status-badge ${row.active ? "cust-status-aktiv" : "cust-status-inaktiv"}`}>
                      {row.active ? t(lang, "discountCodes.badge.active") : t(lang, "discountCodes.badge.inactive")}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1.5 flex-wrap">
                      <button type="button" onClick={() => onEdit(row)} className="cust-action-view min-h-0 min-w-0">
                        <Pencil className="h-3.5 w-3.5" />
                        {t(lang, "common.edit")}
                      </button>
                      <button type="button" onClick={() => toggleActive(row)} className="cust-action-icon min-h-0 min-w-0" title={row.active ? t(lang, "common.deactivate") : t(lang, "common.activate")}>
                        {row.active ? "⏸" : "▶"}
                      </button>
                      <button type="button" onClick={() => showUsages(row)} className="cust-action-icon min-h-0 min-w-0" title={t(lang, "discountCodes.button.usages")}>
                        <CalendarClock className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => onDelete(row)} className="cust-action-icon cust-action-icon--danger min-h-0 min-w-0" title={t(lang, "discountCodes.button.remove")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage history */}
      <div className="cust-form-section">
        <div className="cust-form-section-title">
          {t(lang, "discountCodes.usageHistory.title")} {selectedCode ? `– ${selectedCode.code}` : ""}
        </div>
        {usagesLoading && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t(lang, "common.loading")}</p>}
        {!usagesLoading && usages.length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t(lang, "discountCodes.usageHistory.empty")}</p>
        )}
        {usages.length > 0 && (
          <ul className="space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {usages.map((usage) => (
              <li key={usage.id}>
                {usage.customerEmail} · Order #{usage.orderId ?? "—"} · {usage.usedAt ? formatSwissDateTime(usage.usedAt) : "—"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

