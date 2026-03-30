import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { createProduct, updateProduct, type PricingRule, type Product } from "../../api/products";
import type { ServiceCategory } from "../../api/serviceCategories";
import {
  computeTourDuration,
  computeTourPrice,
  findTierIndexForArea,
  setDurationForTierAtArea,
  setPriceForTierAtArea,
} from "../../lib/areaTier";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

type FormState = {
  code: string;
  name: string;
  kind: "package" | "addon" | "service" | "extra";
  group_key: string;
  category_key: string;
  description: string;
  sort_order: string;
  active: boolean;
  show_on_website: boolean;
  affects_travel: boolean;
  affects_duration: boolean;
  duration_minutes: string;
  skill_key: string;
  required_skills: string[];
  rule_type: PricingRule["rule_type"];
  rule_config_json: string;
  rule_priority: string;
  rule_valid_from: string;
  rule_valid_to: string;
};

type TabKey = "general" | "pricing" | "settings";
type ModalMode = "create" | "edit" | "duplicate";

const SKILL_OPTIONS = [
  { key: "foto",       label: "Foto" },
  { key: "drohne",     label: "Drohne (Drone Foto)" },
  { key: "video",      label: "Video (Boden)" },
  { key: "dronevideo", label: "Drohnenvideo", compositeOf: ["drohne", "video"] as const },
  { key: "matterport", label: "Matterport / 360° Tour" },
];

const initialForm: FormState = {
  code: "",
  name: "",
  kind: "addon",
  group_key: "",
  category_key: "",
  description: "",
  sort_order: "0",
  active: true,
  show_on_website: true,
  affects_travel: true,
  affects_duration: false,
  duration_minutes: "0",
  skill_key: "",
  required_skills: [],
  rule_type: "fixed",
  rule_config_json: "{\"price\":0}",
  rule_priority: "10",
  rule_valid_from: "",
  rule_valid_to: "",
};

function parseRuleConfig(value: string): Record<string, unknown> {
  return JSON.parse(value || "{}") as Record<string, unknown>;
}

function safeParseRuleConfig(value: string): Record<string, unknown> {
  try {
    return parseRuleConfig(value || "{}");
  } catch {
    return {};
  }
}

function getSimplePrice(ruleType: PricingRule["rule_type"], config: Record<string, unknown>) {
  if (ruleType === "per_floor" || ruleType === "per_room") {
    return Number(config.unitPrice || 0);
  }
  return Number(config.price || 0);
}

function applySimplePrice(ruleType: PricingRule["rule_type"], config: Record<string, unknown>, amount: number) {
  const next = { ...config };
  if (ruleType === "per_floor" || ruleType === "per_room") {
    next.unitPrice = amount;
    return next;
  }
  next.price = amount;
  return next;
}


type Props = {
  open: boolean;
  mode: ModalMode;
  product: Product | null;
  token: string;
  language: "de" | "en" | "fr" | "it";
  categories: ServiceCategory[];
  products?: Product[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

export function ProductEditModal({ open, mode, product, token, language, categories, products = [], onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [form, setForm] = useState<FormState>(initialForm);
  const [simplePrice, setSimplePrice] = useState("0");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [requiresProducts, setRequiresProducts] = useState<string[]>([]);
  const [requiresInput, setRequiresInput] = useState("");
  const [assignmentRefSqm, setAssignmentRefSqm] = useState("120");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fieldLabelClass = "mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]";
  const btnBaseClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors";
  const btnPrimaryClass = `${btnBaseClass} bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]`;
  const btnSecondaryClass = `${btnBaseClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]`;

  const categorySelectOptions = useMemo(
    () =>
      (categories || [])
        .filter((c) => c.active !== false)
        .sort((a, b) => (Number(a.sort_order || 0) - Number(b.sort_order || 0)) || String(a.name || "").localeCompare(String(b.name || ""), "de")),
    [categories],
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);
    setActiveTab("general");

    if (!product || mode === "create") {
      const defaultCategory = (categories || [])
        .filter((c) => c.active !== false)
        .sort((a, b) => (Number(a.sort_order || 0) - Number(b.sort_order || 0)) || String(a.name || "").localeCompare(String(b.name || ""), "de"))[0];
      setForm({ ...initialForm, category_key: String(defaultCategory?.key || "") });
      setSimplePrice("0");
      setTags([]);
      setTagInput("");
      setRequiresProducts([]);
      setRequiresInput("");
      setAssignmentRefSqm("120");
      return;
    }

    const rule = product.rules?.[0];
    const config = (rule?.config_json || {}) as Record<string, unknown>;
    const meta = config.meta && typeof config.meta === "object" ? (config.meta as Record<string, unknown>) : {};
    const baseForm: FormState = {
      code: product.code,
      name: product.name,
      kind: product.kind,
      group_key: product.group_key || "",
      category_key: String(product.category_key || product.group_key || ""),
      description: product.description || "",
      sort_order: String(product.sort_order || 0),
      active: !!product.active,
      show_on_website: product.show_on_website !== false,
      affects_travel: product.affects_travel !== false,
      affects_duration: !!product.affects_duration,
      duration_minutes: String(product.duration_minutes || 0),
      skill_key: String(product.skill_key || ""),
      required_skills: Array.isArray(product.required_skills)
        ? product.required_skills.map((x) => String(x))
        : (product.skill_key ? [String(product.skill_key)] : []),
      rule_type: (rule?.rule_type as FormState["rule_type"]) || "fixed",
      rule_config_json: JSON.stringify(config, null, 2),
      rule_priority: String(rule?.priority || 10),
      rule_valid_from: String(rule?.valid_from || ""),
      rule_valid_to: String(rule?.valid_to || ""),
    };

    if (mode === "duplicate") {
      baseForm.code = `${product.code}-copy`;
      baseForm.name = `${product.name} (${t(language, "catalog.copySuffix")})`;
      baseForm.active = false;
    }

    const refSqmRaw = meta.assignment_ref_sqm;
    const refSqmN = Number(refSqmRaw);
    const refForPrice = Number.isFinite(refSqmN) && refSqmN > 0 ? refSqmN : 120;

    setForm(baseForm);
    if (baseForm.rule_type === "area_tier") {
      const cp = computeTourPrice(refForPrice, config);
      setSimplePrice(cp != null ? String(cp) : String(getSimplePrice(baseForm.rule_type, config) || 0));
    } else {
      setSimplePrice(String(getSimplePrice(baseForm.rule_type, config) || 0));
    }
    setTags(Array.isArray(meta.tags) ? (meta.tags as unknown[]).map((x) => String(x)) : []);
    setRequiresProducts(Array.isArray(meta.requires_products) ? (meta.requires_products as unknown[]).map((x) => String(x)) : []);
    setRequiresInput("");
    setAssignmentRefSqm(Number.isFinite(refSqmN) && refSqmN > 0 ? String(refSqmN) : "120");
    setTagInput("");
  }, [open, product, mode, language, categories]);

  const parsedRuleConfig = useMemo(() => safeParseRuleConfig(form.rule_config_json), [form.rule_config_json]);
  const refAreaNum = Number(String(assignmentRefSqm).replace(",", "."));
  const refAreaOk = Number.isFinite(refAreaNum) && refAreaNum > 0;
  const areaTierTierIdx =
    form.rule_type === "area_tier" && refAreaOk
      ? findTierIndexForArea(refAreaNum, (parsedRuleConfig.tiers as Array<{ maxArea?: unknown }>) || [])
      : -1;
  const computedOverflowPrice =
    form.rule_type === "area_tier" && refAreaOk ? computeTourPrice(refAreaNum, parsedRuleConfig) : null;
  const tierRow =
    areaTierTierIdx >= 0 && Array.isArray(parsedRuleConfig.tiers)
      ? (parsedRuleConfig.tiers as Record<string, unknown>[])[areaTierTierIdx]
      : null;
  const tierPriceStr =
    tierRow && Number.isFinite(Number(tierRow.price)) ? String(tierRow.price) : "";
  const tierDurationStr =
    tierRow?.durationMinutes != null && Number.isFinite(Number(tierRow.durationMinutes))
      ? String(tierRow.durationMinutes)
      : "";
  const computedTierDuration =
    form.rule_type === "area_tier" && refAreaOk ? computeTourDuration(refAreaNum, parsedRuleConfig) : null;
  const areaTierRows = Array.isArray(parsedRuleConfig.tiers) ? (parsedRuleConfig.tiers as Array<Record<string, unknown>>) : [];

  function updateRuleConfigJson(mutator: (c: Record<string, unknown>) => Record<string, unknown>) {
    setForm((f) => {
      const cur = safeParseRuleConfig(f.rule_config_json);
      const next = mutator({ ...cur });
      return { ...f, rule_config_json: JSON.stringify(next, null, 2) };
    });
  }

  function updateAreaTierRow(idx: number, field: "maxArea" | "price" | "durationMinutes", value: string) {
    updateRuleConfigJson((config) => {
      const tiers = [...(Array.isArray(config.tiers) ? (config.tiers as Array<Record<string, unknown>>) : [])];
      const current = { ...(tiers[idx] || {}) };
      if (field === "durationMinutes") {
        if (value.trim() === "") {
          delete current.durationMinutes;
        } else {
          current.durationMinutes = Number(value);
        }
      } else {
        current[field] = Number(value);
      }
      tiers[idx] = current;
      return { ...config, tiers };
    });
    if (field === "durationMinutes" && value.trim() !== "") {
      setForm((f) => ({ ...f, affects_duration: false, duration_minutes: "0" }));
    }
  }

  function addAreaTierRow() {
    updateRuleConfigJson((config) => {
      const tiers = [...(Array.isArray(config.tiers) ? (config.tiers as Array<Record<string, unknown>>) : [])];
      const last = tiers[tiers.length - 1] || {};
      tiers.push({
        maxArea: Number(last.maxArea || 0) > 0 ? Number(last.maxArea || 0) + 100 : 100,
        price: Number(last.price || 0) > 0 ? Number(last.price || 0) + 100 : 199,
        ...(last.durationMinutes != null ? { durationMinutes: Number(last.durationMinutes || 0) + 30 } : {}),
      });
      return { ...config, tiers };
    });
  }

  function removeAreaTierRow(idx: number) {
    updateRuleConfigJson((config) => {
      const tiers = [...(Array.isArray(config.tiers) ? (config.tiers as Array<Record<string, unknown>>) : [])];
      if (tiers.length <= 1) return config;
      tiers.splice(idx, 1);
      return { ...config, tiers };
    });
  }

  function addRequires() {
    const value = requiresInput.trim();
    if (!value) return;
    setRequiresProducts((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setRequiresInput("");
  }

  function removeRequires(code: string) {
    setRequiresProducts((prev) => prev.filter((x) => x !== code));
  }

  function addTag() {
    const value = tagInput.trim();
    if (!value) return;
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setTagInput("");
  }

  function removeTag(value: string) {
    setTags((prev) => prev.filter((x) => x !== value));
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    setError("");

    try {
      if (!form.code.trim() || !form.name.trim()) {
        setError(t(language, "catalog.error.requiredCodeName"));
        return;
      }

      setSaving(true);
      const parsedConfig = parseRuleConfig(form.rule_config_json || "{}");
      const baseConfig =
        form.rule_type === "area_tier"
          ? parsedConfig
          : applySimplePrice(form.rule_type, parsedConfig, Number(simplePrice || 0));

      const prevMeta =
        baseConfig.meta && typeof baseConfig.meta === "object" ? (baseConfig.meta as Record<string, unknown>) : {};
      const refN = Number(String(assignmentRefSqm).replace(",", "."));
      const nextMeta: Record<string, unknown> = {
        ...prevMeta,
        tags,
        ...(requiresProducts.length > 0 ? { requires_products: requiresProducts } : {}),
      };
      if (requiresProducts.length === 0) delete nextMeta.requires_products;
      if (Number.isFinite(refN) && refN > 0) nextMeta.assignment_ref_sqm = refN;
      else delete nextMeta.assignment_ref_sqm;

      const ruleConfig = {
        ...baseConfig,
        meta: nextMeta,
      };

      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        kind: form.kind,
        group_key: form.group_key.trim(),
        category_key: form.category_key.trim(),
        description: form.description.trim(),
        active: form.active,
        show_on_website: form.show_on_website,
        affects_travel: form.affects_travel,
        affects_duration: form.affects_duration,
        duration_minutes: Number(form.duration_minutes || 0),
        skill_key: form.required_skills[0] || form.skill_key || "",
        required_skills: form.required_skills,
        sort_order: Number(form.sort_order || 0),
        rules: [
          {
            rule_type: form.rule_type,
            config_json: ruleConfig,
            priority: Number(form.rule_priority || 10),
            valid_from: form.rule_valid_from || null,
            valid_to: form.rule_valid_to || null,
            active: true,
          },
        ],
      };

      if (mode === "edit" && product) {
        await updateProduct(token, product.id, payload);
      } else {
        await createProduct(token, payload);
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(language, "catalog.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const title = mode === "edit"
    ? `${t(language, "catalog.editProduct")} #${product?.id || ""}`
    : mode === "duplicate"
      ? t(language, "catalog.duplicateTitle")
      : t(language, "catalog.newProduct");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl border-[var(--border-soft)] bg-[var(--surface)] my-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 border-[var(--border-soft)]">
          <h3 className="text-lg font-semibold text-[var(--text-main)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 px-4 py-2 border-[var(--border-soft)]">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "general", label: t(language, "catalog.tab.general") },
              { key: "pricing", label: t(language, "catalog.tab.pricing") },
              { key: "settings", label: t(language, "catalog.tab.settings") },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-[var(--accent)]/15 text-[#8d7740] dark:text-[#d8bf8a]"
                    : "text-slate-600 hover:bg-slate-100 text-[var(--text-muted)] hover:bg-[var(--surface-raised)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submitForm} className="space-y-4 px-4 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {activeTab === "general" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.field.code")} <span className="text-red-500">*</span></span>
                <input required className="ui-input" placeholder={t(language, "catalog.placeholder.code")} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "common.name")} <span className="text-red-500">*</span></span>
                <input required className="ui-input" placeholder={t(language, "catalog.placeholder.name")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.type")}</span>
                <select className="ui-input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "package" | "addon" | "service" | "extra" }))}>
                  <option value="package">Pakete</option>
                  <option value="addon">Zusatzprodukte</option>
                  <option value="service">Dienstleistungen</option>
                  <option value="extra">Extras</option>
                </select>
              </label>
              <div className="block">
                <label className="block">
                  <span className={fieldLabelClass}>Kategorie</span>
                  <select
                    className="ui-input"
                    value={form.category_key}
                    onChange={(e) => setForm((f) => ({ ...f, category_key: e.target.value }))}
                  >
                    <option value="">Bitte wählen</option>
                    {categorySelectOptions.map((cat) => (
                      <option key={cat.key} value={cat.key}>
                        {cat.name} ({cat.key})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.groupKey")}</span>
                <input className="ui-input" placeholder={t(language, "catalog.placeholder.groupKey")} value={form.group_key} onChange={(e) => setForm((f) => ({ ...f, group_key: e.target.value }))} />
              </label>
              <label className="col-span-2 block">
                <span className={fieldLabelClass}>{t(language, "catalog.description")}</span>
                <input className="ui-input" placeholder={t(language, "catalog.placeholder.description")} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </label>

              {form.rule_type === "area_tier" ? (
              <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 border-[var(--border-soft)] bg-[var(--surface-raised)]/40">
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  {t(language, "catalog.general.planningTitle")}
                </p>
                <p className="mb-3 text-xs text-[var(--text-subtle)]">{t(language, "catalog.general.planningHint")}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className={fieldLabelClass}>{t(language, "catalog.general.refSqm")}</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="ui-input"
                      value={assignmentRefSqm}
                      onChange={(e) => setAssignmentRefSqm(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabelClass}>{t(language, "catalog.general.priceAtRef")}</span>
                    {form.rule_type === "area_tier" ? (
                      areaTierTierIdx >= 0 ? (
                        <input
                          type="number"
                          min={0}
                          step={0.05}
                          className="ui-input"
                          value={tierPriceStr}
                          onChange={(e) => {
                            const p = Number(e.target.value);
                            if (!Number.isFinite(p)) return;
                            updateRuleConfigJson((c) => setPriceForTierAtArea(c, refAreaNum, p));
                            setSimplePrice(String(p));
                          }}
                        />
                      ) : (
                        <>
                          <input
                            type="number"
                            className="ui-input opacity-80"
                            readOnly
                            value={computedOverflowPrice != null ? String(computedOverflowPrice) : ""}
                            placeholder="—"
                          />
                          <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                            {t(language, "catalog.general.priceOverflowHint")}
                          </span>
                        </>
                      )
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step={0.05}
                        className="ui-input"
                        value={simplePrice}
                        onChange={(e) => {
                          setSimplePrice(e.target.value);
                        }}
                      />
                    )}
                  </label>
                  <div className="block">
                    <span className={fieldLabelClass}>{t(language, "catalog.general.durationAtRef")}</span>
                    {form.rule_type === "area_tier" && areaTierTierIdx >= 0 ? (
                      <input
                        type="number"
                        min={0}
                        step={5}
                        className="ui-input border-amber-200 focus:border-amber-400 dark:border-amber-900/50"
                        placeholder={t(language, "catalog.general.tierDurationPlaceholder")}
                        value={tierDurationStr}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          updateRuleConfigJson((c) =>
                            setDurationForTierAtArea(c, refAreaNum, v === "" ? null : Number(v)),
                          );
                          if (v !== "") {
                            setForm((f) => ({ ...f, affects_duration: false, duration_minutes: "0" }));
                          }
                        }}
                      />
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="number"
                          min={0}
                          step={5}
                          className="ui-input"
                          value={form.duration_minutes}
                          onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                        />
                        <label className="inline-flex items-center gap-2 text-xs text-[var(--text-subtle)]">
                          <input
                            type="checkbox"
                            checked={form.affects_duration}
                            onChange={(e) => setForm((f) => ({ ...f, affects_duration: e.target.checked }))}
                          />
                          {t(language, "catalog.includeDuration")}
                        </label>
                      </div>
                    )}
                    {form.rule_type === "area_tier" && areaTierTierIdx < 0 && refAreaOk ? (
                      <div className="mt-2 space-y-1">
                        {computedTierDuration != null ? (
                          <p className="text-xs text-[var(--text-subtle)]">
                            {t(language, "catalog.general.durationFromOverflow").replace(
                              "{{n}}",
                              String(computedTierDuration),
                            )}
                          </p>
                        ) : null}
                        <div className="space-y-2">
                          <input
                            type="number"
                            min={0}
                            step={5}
                            className="ui-input"
                            value={form.duration_minutes}
                            onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                          />
                          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-subtle)]">
                            <input
                              type="checkbox"
                              checked={form.affects_duration}
                              onChange={(e) => setForm((f) => ({ ...f, affects_duration: e.target.checked }))}
                            />
                            {t(language, "catalog.includeDuration")}
                          </label>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {form.rule_type === "area_tier" ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 border-[var(--border-soft)] bg-[var(--surface)]/40">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                          {t(language, "catalog.general.moreTiers")}
                        </p>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {t(language, "catalog.general.moreTiersHint")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={btnSecondaryClass}
                        onClick={addAreaTierRow}
                      >
                        <Plus className="h-4 w-4" />
                        {t(language, "catalog.general.addTier")}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {areaTierRows.map((row, idx) => (
                        <div key={`tier-${idx}`} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="ui-input"
                            placeholder={t(language, "catalog.general.tierMaxArea")}
                            value={Number(row.maxArea || 0) || ""}
                            onChange={(e) => updateAreaTierRow(idx, "maxArea", e.target.value)}
                          />
                          <input
                            type="number"
                            min={0}
                            step={0.05}
                            className="ui-input"
                            placeholder={t(language, "catalog.general.tierPrice")}
                            value={Number(row.price || 0) || ""}
                            onChange={(e) => updateAreaTierRow(idx, "price", e.target.value)}
                          />
                          <input
                            type="number"
                            min={0}
                            step={5}
                            className="ui-input"
                            placeholder={t(language, "catalog.general.tierDuration")}
                            value={row.durationMinutes != null ? String(row.durationMinutes) : ""}
                            onChange={(e) => updateAreaTierRow(idx, "durationMinutes", e.target.value)}
                          />
                          <button
                            type="button"
                            className={cn(btnSecondaryClass, "px-2", areaTierRows.length <= 1 ? "opacity-40" : "")}
                            onClick={() => removeAreaTierRow(idx)}
                            disabled={areaTierRows.length <= 1}
                            aria-label={t(language, "catalog.general.removeTier")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              ) : null}

              <label className="col-span-2 block">
                <span className={fieldLabelClass}>{t(language, "catalog.tags")}</span>
                <div className="rounded-lg border border-zinc-300 p-2 border-[var(--border-soft)]">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 bg-[var(--surface-raised)] text-[var(--text-main)]">
                        {tag}
                        <button type="button" className="text-zinc-500 hover:text-red-500" onClick={() => removeTag(tag)}>×</button>
                      </span>
                    ))}
                  </div>
                  <input
                    className="ui-input"
                    placeholder={t(language, "catalog.tagsPlaceholder")}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                </div>
              </label>
            </div>
          ) : null}

          {activeTab === "pricing" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.ruleType")}</span>
                <select className="ui-input" value={form.rule_type} onChange={(e) => {
                  const nextRuleType = e.target.value as FormState["rule_type"];
                  setForm((f) => ({ ...f, rule_type: nextRuleType }));
                }}>
                  <option value="fixed">{t(language, "catalog.ruleType.fixed")}</option>
                  <option value="per_floor">{t(language, "catalog.ruleType.perFloor")}</option>
                  <option value="per_room">{t(language, "catalog.ruleType.perRoom")}</option>
                  <option value="area_tier">{t(language, "catalog.ruleType.areaTier")}</option>
                  <option value="conditional">{t(language, "catalog.ruleType.conditional")}</option>
                </select>
              </label>
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.simplePrice")}</span>
                <input
                  className="ui-input"
                  type="number"
                  step="0.01"
                  disabled={form.rule_type === "area_tier"}
                  value={simplePrice}
                  onChange={(e) => setSimplePrice(e.target.value)}
                  placeholder={form.rule_type === "per_floor" || form.rule_type === "per_room" ? "unitPrice" : "price"}
                />
              </label>
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.rulePriority")}</span>
                <input className="ui-input" placeholder="10" type="number" value={form.rule_priority} onChange={(e) => setForm((f) => ({ ...f, rule_priority: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.validFrom")}</span>
                <input
                  className="ui-input"
                  type="date"
                  value={form.rule_valid_from}
                  onChange={(e) => setForm((f) => ({ ...f, rule_valid_from: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.validTo")}</span>
                <input
                  className="ui-input"
                  type="date"
                  value={form.rule_valid_to}
                  onChange={(e) => setForm((f) => ({ ...f, rule_valid_to: e.target.value }))}
                />
              </label>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.sortOrder")}</span>
                <input className="ui-input" placeholder="0" type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabelClass}>{t(language, "catalog.durationBonus")}</span>
                <input
                  className="ui-input"
                  placeholder="0"
                  type="number"
                  min={0}
                  value={form.duration_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                />
                <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t(language, "catalog.durationBonus.hint")}</span>
              </label>

              {/* Produktabhängigkeiten */}
              <div className="col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/40 dark:bg-blue-900/10">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  Voraussetzungen (Abhängigkeiten)
                </p>
                <p className="mb-3 text-xs text-blue-600/80 dark:text-blue-400/70">
                  Dieses Produkt kann nur gebucht werden, wenn alle hier angegebenen Produkte ebenfalls im Auftrag enthalten sind. Z.B. „2D Grundriss" benötigt „360 Tour".
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {requiresProducts.map((code) => {
                    const prod = products.find((p) => p.code === code);
                    return (
                      <span key={code} className="inline-flex items-center gap-1 rounded-full bg-blue-200 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-800/40 dark:text-blue-200">
                        {prod ? `${prod.name} (${code})` : code}
                        <button type="button" className="text-blue-500 hover:text-red-500" onClick={() => removeRequires(code)}>×</button>
                      </span>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <select
                    className="ui-input flex-1"
                    value={requiresInput}
                    onChange={(e) => setRequiresInput(e.target.value)}
                  >
                    <option value="">— Produkt wählen —</option>
                    {products
                      .filter((p) => p.code !== product?.code && !requiresProducts.includes(p.code))
                      .sort((a, b) => String(a.name).localeCompare(String(b.name), "de"))
                      .map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                  </select>
                  <button type="button" className={btnSecondaryClass} onClick={addRequires} disabled={!requiresInput}>
                    <Plus className="h-4 w-4" />
                    Hinzufügen
                  </button>
                </div>
              </div>

              {/* Skill-Zuordnung für Terminvergabe */}
              <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/10">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  {t(language, "catalog.skillKey.label")}
                </p>
                <p className="mb-2 text-xs text-amber-600/80 dark:text-amber-400/70">
                  {t(language, "catalog.skillKey.hint")}
                </p>
                <p className="mb-3 text-xs text-amber-600/80 dark:text-amber-400/70">
                  {t(language, "catalog.skillKey.assignmentHint")}
                </p>
                <div className="mb-2 text-xs text-amber-700/90 dark:text-amber-300/90">
                  Mehrfachauswahl möglich. Drone Foto = Drohne. Drohnenvideo = Drohne + Video. Video (Boden) = nur Video.
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SKILL_OPTIONS.map((opt) => (
                    <label
                      key={opt.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                        (("compositeOf" in opt && opt.compositeOf?.every((k) => form.required_skills.includes(k))) || form.required_skills.includes(opt.key))
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 font-semibold text-[#8d7740] dark:border-[#d8bf8a] dark:text-[#d8bf8a]"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 border-[var(--border-soft)] text-[var(--text-muted)] hover:bg-[var(--surface-raised)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        name="required_skills"
                        value={opt.key}
                        checked={("compositeOf" in opt && opt.compositeOf?.every((k) => form.required_skills.includes(k))) || form.required_skills.includes(opt.key)}
                        onChange={(e) => {
                          setForm((f) => {
                            const add = e.target.checked;
                            let next: string[];
                            if ("compositeOf" in opt && Array.isArray(opt.compositeOf)) {
                              next = add
                                ? [...new Set([...f.required_skills, ...opt.compositeOf!])]
                                : f.required_skills.filter((x) => !(opt.compositeOf as readonly string[]).includes(x));
                            } else {
                              next = add
                                ? (f.required_skills.includes(opt.key) ? f.required_skills : [...f.required_skills, opt.key])
                                : f.required_skills.filter((x) => x !== opt.key);
                            }
                            return { ...f, required_skills: next, skill_key: next[0] || "" };
                          });
                        }}
                        className="sr-only"
                      />
                      <span className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                        (("compositeOf" in opt && opt.compositeOf?.every((k) => form.required_skills.includes(k))) || form.required_skills.includes(opt.key))
                          ? "border-[var(--accent)] bg-[var(--accent)] dark:border-[#d8bf8a] dark:bg-[#d8bf8a]"
                          : "border-[var(--border-soft)]",
                      )}>
                        {(("compositeOf" in opt && opt.compositeOf?.every((k) => form.required_skills.includes(k))) || form.required_skills.includes(opt.key)) && (
                          <span className="block h-2 w-2 bg-white" />
                        )}
                      </span>
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                {t(language, "catalog.active")}
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.show_on_website}
                  onChange={(e) => setForm((f) => ({ ...f, show_on_website: e.target.checked }))}
                />
                {t(language, "catalog.showOnWebsite")}
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.affects_travel} onChange={(e) => setForm((f) => ({ ...f, affects_travel: e.target.checked }))} />
                {t(language, "catalog.includeTravel")}
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.affects_duration} onChange={(e) => setForm((f) => ({ ...f, affects_duration: e.target.checked }))} />
                {t(language, "catalog.includeDuration")}
              </label>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3 border-[var(--border-soft)]">
            <button type="button" onClick={onClose} className={btnSecondaryClass}>
              {t(language, "common.cancel")}
            </button>
            <button type="submit" disabled={saving} className={cn(btnPrimaryClass, saving ? "cursor-not-allowed opacity-70" : "")}>
              {saving ? t(language, "common.saving") : t(language, "catalog.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

