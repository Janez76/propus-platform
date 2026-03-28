import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronUp, AlertCircle, Trash2, Plus } from "lucide-react";
import { cn } from "../../lib/utils";
import type { PricingRule } from "../../api/products";

// ─── Types ────────────────────────────────────────────────────────────────────

type AreaTier = {
  price: number;
  maxArea: number;
  durationMinutes?: number;
};

type RuleConditions = {
  requireAnyProductCodes: string[];
  requireAnyGroupKeys: string[];
  requireAnyPackageCodes: string[];
  requireAnyAddonCodes: string[];
};

type FixedConfig = RuleConditions & {
  price: number;
  meta?: Record<string, unknown>;
};

type PerUnitConfig = RuleConditions & {
  unitPrice: number;
  meta?: Record<string, unknown>;
};

type AreaTierConfig = RuleConditions & {
  tiers: AreaTier[];
  basePrice: number;
  incrementArea: number;
  incrementPrice: number;
  baseDuration?: number;
  incrementDuration?: number;
  meta?: Record<string, unknown>;
};

type AnyConfig = FixedConfig | PerUnitConfig | AreaTierConfig | Record<string, unknown>;

export type RuleType = PricingRule["rule_type"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
}

function parseConfig(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getGroupLabel(groupKey: string): string {
  const group = String(groupKey || "").trim().toLowerCase();
  if (group === "dronephoto") return "Drone Foto";
  if (group === "dronevideo") return "Drohnenvideo";
  if (group === "groundvideo") return "Bodenvideo";
  if (group === "camera") return "Foto";
  return String(groupKey || "").trim();
}

function readRuleConditions(raw: Record<string, unknown>): RuleConditions {
  const requireAnyProductCodes = toStringArray(raw.requireAnyProductCodes);
  const requireAnyPackageCodes = toStringArray(raw.requireAnyPackageCodes);
  const requireAnyAddonCodes = toStringArray(raw.requireAnyAddonCodes);
  return {
    requireAnyProductCodes: requireAnyProductCodes.length
      ? requireAnyProductCodes
      : [...new Set([...requireAnyPackageCodes, ...requireAnyAddonCodes])],
    requireAnyGroupKeys: toStringArray(raw.requireAnyGroupKeys),
    requireAnyPackageCodes: [],
    requireAnyAddonCodes: [],
  };
}

function toFixedConfig(raw: Record<string, unknown>): FixedConfig {
  return {
    price: safeNum(raw.price),
    ...readRuleConditions(raw),
    meta: raw.meta as Record<string, unknown> | undefined,
  };
}

function toPerUnitConfig(raw: Record<string, unknown>): PerUnitConfig {
  return {
    unitPrice: safeNum(raw.unitPrice),
    ...readRuleConditions(raw),
    meta: raw.meta as Record<string, unknown> | undefined,
  };
}

function toAreaTierConfig(raw: Record<string, unknown>): AreaTierConfig {
  const rawTiers = Array.isArray(raw.tiers) ? raw.tiers as Array<Record<string, unknown>> : [];
  const tiers: AreaTier[] = rawTiers.map((t) => ({
    price: safeNum(t.price),
    maxArea: safeNum(t.maxArea),
    durationMinutes: t.durationMinutes != null ? safeNum(t.durationMinutes) : undefined,
  }));
  if (tiers.length === 0) {
    tiers.push({ price: 199, maxArea: 99 }, { price: 299, maxArea: 199 }, { price: 399, maxArea: 299 });
  }
  return {
    tiers,
    basePrice: safeNum(raw.basePrice, 399),
    incrementArea: safeNum(raw.incrementArea, 100),
    incrementPrice: safeNum(raw.incrementPrice, 79),
    baseDuration: raw.baseDuration != null ? safeNum(raw.baseDuration) : undefined,
    incrementDuration: raw.incrementDuration != null ? safeNum(raw.incrementDuration) : undefined,
    ...readRuleConditions(raw),
    meta: raw.meta as Record<string, unknown> | undefined,
  };
}

// ─── Sub-Editors ──────────────────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-3">
      <div className="pt-2">
        <span className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-zinc-500">{hint}</span> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm transition-colors focus:border-[#C5A059] focus:outline-none focus:ring-1 focus:ring-[#C5A059]/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-[#C5A059]/60";

// Fixed -----------------------------------------------------------------------
function FixedEditor({ config, onChange }: { config: FixedConfig; onChange: (c: FixedConfig) => void }) {
  return (
    <div className="space-y-3">
      <FieldRow label="Preis (CHF)" hint="Festpreis für dieses Produkt">
        <input
          type="number" step="0.01" min="0" className={inputCls}
          value={config.price}
          onChange={(e) => onChange({ ...config, price: safeNum(e.target.value) })}
        />
      </FieldRow>
    </div>
  );
}

// Per floor / per room --------------------------------------------------------
function PerUnitEditor({
  config, onChange, label, hint,
}: {
  config: PerUnitConfig;
  onChange: (c: PerUnitConfig) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="space-y-3">
      <FieldRow label={label} hint={hint}>
        <input
          type="number" step="0.01" min="0" className={inputCls}
          value={config.unitPrice}
          onChange={(e) => onChange({ ...config, unitPrice: safeNum(e.target.value) })}
        />
      </FieldRow>
    </div>
  );
}

// Area tier -------------------------------------------------------------------
function AreaTierEditor({ config, onChange }: { config: AreaTierConfig; onChange: (c: AreaTierConfig) => void }) {
  // Dauer-Spalte aktiv wenn mindestens eine Staffel durationMinutes hat oder baseDuration gesetzt
  const hasDuration = config.tiers.some((t) => t.durationMinutes != null) || config.baseDuration != null;
  const [showDuration, setShowDuration] = useState(hasDuration);

  // Wenn von aussen neue Config geladen wird, Schalter synchronisieren
  useEffect(() => {
    const ext = config.tiers.some((t) => t.durationMinutes != null) || config.baseDuration != null;
    setShowDuration(ext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateTierField(idx: number, field: "maxArea" | "price", value: string) {
    const tiers = config.tiers.map((t, i) => i === idx ? { ...t, [field]: safeNum(value) } : t);
    onChange({ ...config, tiers });
  }

  function updateTierDuration(idx: number, value: string) {
    const tiers = config.tiers.map((t, i) => {
      if (i !== idx) return t;
      return value === "" ? { ...t, durationMinutes: undefined } : { ...t, durationMinutes: safeNum(value) };
    });
    onChange({ ...config, tiers });
  }

  function addTier() {
    const last = config.tiers[config.tiers.length - 1];
    const newMax = last ? last.maxArea + 100 : 100;
    const newPrice = last ? last.price + 100 : 199;
    const newDur = showDuration && last?.durationMinutes != null ? last.durationMinutes + 30 : undefined;
    onChange({ ...config, tiers: [...config.tiers, { maxArea: newMax, price: newPrice, durationMinutes: newDur }] });
  }

  function removeTier(idx: number) {
    onChange({ ...config, tiers: config.tiers.filter((_, i) => i !== idx) });
  }

  function moveTier(idx: number, dir: -1 | 1) {
    const tiers = [...config.tiers];
    const target = idx + dir;
    if (target < 0 || target >= tiers.length) return;
    [tiers[idx], tiers[target]] = [tiers[target], tiers[idx]];
    onChange({ ...config, tiers });
  }

  function toggleDuration(on: boolean) {
    setShowDuration(on);
    if (!on) {
      // Dauer-Felder aus allen Staffeln und Überlauf entfernen
      const tiers = config.tiers.map(({ durationMinutes: _d, ...rest }) => rest);
      onChange({ ...config, tiers, baseDuration: undefined, incrementDuration: undefined });
    }
  }

  return (
    <div className="space-y-4">
      {/* Tiers table */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">Staffeln</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
              Preis gilt bis einschliesslich maxArea m²
            </span>
          </div>
          {/* Dauer-Spalte Toggle */}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
            <input
              type="checkbox"
              checked={showDuration}
              onChange={(e) => toggleDuration(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#C5A059]"
            />
            Dauer (Min) je Staffel
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800/60">
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-zinc-400">Bis m²</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-zinc-400">Preis (CHF)</th>
                {showDuration && (
                  <th className="px-3 py-2 text-left text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Dauer (Min)
                  </th>
                )}
                <th className="w-24 px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-zinc-400">Reihe</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {config.tiers.map((tier, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30">
                  <td className="px-3 py-1.5">
                    <input
                      type="number" min="1" step="1" className={inputCls}
                      value={tier.maxArea}
                      onChange={(e) => updateTierField(idx, "maxArea", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number" min="0" step="0.01" className={inputCls}
                      value={tier.price}
                      onChange={(e) => updateTierField(idx, "price", e.target.value)}
                    />
                  </td>
                  {showDuration && (
                    <td className="px-3 py-1.5">
                      <input
                        type="number" min="0" step="1" placeholder="—"
                        className={cn(inputCls, "border-amber-200 focus:border-amber-400 focus:ring-amber-200/40 dark:border-amber-800/50")}
                        value={tier.durationMinutes ?? ""}
                        onChange={(e) => updateTierDuration(idx, e.target.value)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1">
                      <button type="button" disabled={idx === 0} onClick={() => moveTier(idx, -1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-zinc-700">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" disabled={idx === config.tiers.length - 1} onClick={() => moveTier(idx, 1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-zinc-700">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => removeTier(idx)} disabled={config.tiers.length <= 1}
                      className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-900/20">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addTier}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#C5A059]/50 px-3 py-1.5 text-xs font-medium text-[#8d7740] hover:border-[#C5A059] hover:bg-[#C5A059]/5 dark:text-[#d8bf8a]">
          <Plus className="h-3.5 w-3.5" />
          Staffel hinzufügen
        </button>
      </div>

      {/* Overflow settings */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-800/30">
        <p className="mb-3 text-xs font-semibold text-slate-600 dark:text-zinc-400">
          Überlauf (über letzte Staffel hinaus)
        </p>
        <div className={cn("grid gap-3", showDuration ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-3")}>
          <FieldRow label="Basis-Preis (CHF)" hint="Ab letzter Staffel">
            <input type="number" step="0.01" min="0" className={inputCls}
              value={config.basePrice}
              onChange={(e) => onChange({ ...config, basePrice: safeNum(e.target.value) })}
            />
          </FieldRow>
          <FieldRow label="+m² je Schritt" hint="Schritt-Grösse m²">
            <input type="number" step="1" min="1" className={inputCls}
              value={config.incrementArea}
              onChange={(e) => onChange({ ...config, incrementArea: safeNum(e.target.value) })}
            />
          </FieldRow>
          <FieldRow label="+CHF je Schritt" hint="Aufschlag pro Schritt">
            <input type="number" step="0.01" min="0" className={inputCls}
              value={config.incrementPrice}
              onChange={(e) => onChange({ ...config, incrementPrice: safeNum(e.target.value) })}
            />
          </FieldRow>
          {showDuration && (
            <>
              <FieldRow label="Basis-Dauer (Min)" hint="Startdauer ab letzter Staffel">
                <input type="number" step="1" min="0" placeholder="—"
                  className={cn(inputCls, "border-amber-200 focus:border-amber-400 focus:ring-amber-200/40 dark:border-amber-800/50")}
                  value={config.baseDuration ?? ""}
                  onChange={(e) => onChange({ ...config, baseDuration: e.target.value === "" ? undefined : safeNum(e.target.value) })}
                />
              </FieldRow>
              <FieldRow label="+Min je Schritt" hint="Zusatz-Min pro Schritt">
                <input type="number" step="1" min="0" placeholder="—"
                  className={cn(inputCls, "border-amber-200 focus:border-amber-400 focus:ring-amber-200/40 dark:border-amber-800/50")}
                  value={config.incrementDuration ?? ""}
                  onChange={(e) => onChange({ ...config, incrementDuration: e.target.value === "" ? undefined : safeNum(e.target.value) })}
                />
              </FieldRow>
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-500">
          Preis: {config.basePrice} CHF Basis, +{config.incrementPrice} CHF je {config.incrementArea} m²
          {showDuration && config.baseDuration != null
            ? ` · Dauer: ${config.baseDuration} Min Basis, +${config.incrementDuration ?? 0} Min je ${config.incrementArea} m²`
            : ""}
        </p>
      </div>
    </div>
  );
}

// Conditional -----------------------------------------------------------------
type ConditionalOption = {
  value: string;
  label: string;
  hint?: string;
};

function ConditionalChecklist({
  title,
  hint,
  options,
  selected,
  onChange,
  emptyText,
}: {
  title: string;
  hint?: string;
  options: ConditionalOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyText: string;
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-xs font-semibold text-slate-600 dark:text-zinc-400">{title}</div>
        {hint ? <div className="text-[11px] text-slate-400 dark:text-zinc-500">{hint}</div> : null}
      </div>
      <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
        {options.length === 0 ? (
          <div className="px-2 py-3 text-sm text-slate-400 dark:text-zinc-500">{emptyText}</div>
        ) : options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800/70"
          >
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
              className="mt-0.5 h-4 w-4 accent-[#C5A059]"
            />
            <span className="min-w-0">
              <span className="block text-slate-800 dark:text-zinc-200">{option.label}</span>
              {option.hint ? (
                <span className="block text-[11px] text-slate-400 dark:text-zinc-500">{option.hint}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RuleConditionsEditor({
  config,
  onChange,
  productOptions,
  groupOptions,
}: {
  config: RuleConditions;
  onChange: (next: RuleConditions) => void;
  productOptions: ConditionalOption[];
  groupOptions: ConditionalOption[];
}) {
  return (
    <>
      <ConditionalChecklist
        title="Abhängige Produkte / Dienstleistungen"
        hint="Mindestens eines dieser Produkte muss gewählt sein."
        options={productOptions}
        selected={config.requireAnyProductCodes}
        onChange={(requireAnyProductCodes) => onChange({
          ...config,
          requireAnyProductCodes,
          requireAnyPackageCodes: [],
          requireAnyAddonCodes: [],
        })}
        emptyText="Keine weiteren Produkte verfügbar."
      />

      <ConditionalChecklist
        title="Abhängige Gruppen"
        hint="Alternativ oder zusätzlich kann mindestens eine Produktgruppe verlangt werden."
        options={groupOptions}
        selected={config.requireAnyGroupKeys}
        onChange={(requireAnyGroupKeys) => onChange({ ...config, requireAnyGroupKeys })}
        emptyText="Keine Gruppen verfügbar."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
        Leer gelassene Listen bedeuten "keine Einschränkung" für diesen Bereich.
      </div>
    </>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

type Props = {
  ruleType: RuleType;
  configJson: string;
  onChange: (json: string) => void;
  showJsonFallback?: boolean;
  availableProducts?: Array<{ code: string; name: string; kind: string; group_key?: string }>;
  currentProductCode?: string;
};

export function RuleConfigEditor({
  ruleType,
  configJson,
  onChange,
  showJsonFallback,
  availableProducts = [],
  currentProductCode,
}: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [jsonError, setJsonError] = useState("");

  const raw = parseConfig(configJson);
  const fixedConfig = toFixedConfig(raw);
  const perUnitConfig = toPerUnitConfig(raw);
  const areaTierConfig = toAreaTierConfig(raw);
  const selectableProducts = availableProducts
    .filter((product) => String(product.code || "") !== String(currentProductCode || ""))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
  const productOptions: ConditionalOption[] = selectableProducts.map((product) => ({
    value: String(product.code || ""),
    label: String(product.name || product.code || ""),
    hint: [String(product.kind || ""), String(product.code || "")]
      .filter(Boolean)
      .join(" - "),
  }));
  const groupOptions: ConditionalOption[] = [...new Set(
    selectableProducts.map((product) => String(product.group_key || "").trim()).filter(Boolean),
  )]
    .sort((a, b) => a.localeCompare(b, "de"))
    .map((group) => ({ value: group, label: getGroupLabel(group), hint: `group_key: ${group}` }));

  const emit = useCallback((next: AnyConfig) => {
    const existing = parseConfig(configJson);
    const merged = { ...existing, ...next };
    if (next.meta !== undefined) merged.meta = next.meta;
    else if (existing.meta) merged.meta = existing.meta;
    setJsonError("");
    onChange(JSON.stringify(merged, null, 2));
  }, [configJson, onChange]);

  const handleRawChange = (value: string) => {
    onChange(value);
    try {
      JSON.parse(value);
      setJsonError("");
    } catch {
      setJsonError("Ungültiges JSON");
    }
  };

  return (
    <div className="space-y-3">
      {/* Visual editor */}
      {!showRaw && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 dark:border-zinc-700 dark:bg-zinc-800/20">
          {ruleType === "fixed" && (
            <div className="space-y-4">
              <FixedEditor config={fixedConfig} onChange={(c) => emit(c)} />
              <RuleConditionsEditor
                config={fixedConfig}
                onChange={(nextConditions) => emit({ ...fixedConfig, ...nextConditions })}
                productOptions={productOptions}
                groupOptions={groupOptions}
              />
            </div>
          )}
          {ruleType === "per_floor" && (
            <div className="space-y-4">
              <PerUnitEditor
                config={perUnitConfig}
                onChange={(c) => emit(c)}
                label="Preis pro Etage (CHF)"
                hint="unitPrice – wird pro Etage (Anzahl aus Formular) berechnet"
              />
              <RuleConditionsEditor
                config={perUnitConfig}
                onChange={(nextConditions) => emit({ ...perUnitConfig, ...nextConditions })}
                productOptions={productOptions}
                groupOptions={groupOptions}
              />
            </div>
          )}
          {ruleType === "per_room" && (
            <div className="space-y-4">
              <PerUnitEditor
                config={perUnitConfig}
                onChange={(c) => emit(c)}
                label="Preis pro Einheit (CHF)"
                hint="unitPrice – wird pro Zimmer / Einheit berechnet"
              />
              <RuleConditionsEditor
                config={perUnitConfig}
                onChange={(nextConditions) => emit({ ...perUnitConfig, ...nextConditions })}
                productOptions={productOptions}
                groupOptions={groupOptions}
              />
            </div>
          )}
          {ruleType === "area_tier" && (
            <div className="space-y-4">
              <AreaTierEditor config={areaTierConfig} onChange={(c) => emit(c)} />
              <RuleConditionsEditor
                config={areaTierConfig}
                onChange={(nextConditions) => emit({ ...areaTierConfig, ...nextConditions })}
                productOptions={productOptions}
                groupOptions={groupOptions}
              />
            </div>
          )}
        </div>
      )}

      {/* Raw JSON toggle */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          {showRaw ? "Visuelle Ansicht" : "JSON direkt bearbeiten"}
        </button>
        {jsonError && (
          <span className="inline-flex items-center gap-1 text-xs text-red-500">
            <AlertCircle className="h-3.5 w-3.5" />
            {jsonError}
          </span>
        )}
      </div>

      {showRaw || showJsonFallback ? (
        <textarea
          className={cn(
            "w-full rounded-lg border px-3 py-2 font-mono text-xs",
            jsonError
              ? "border-red-300 bg-red-50/30 dark:border-red-700 dark:bg-red-900/10"
              : "border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-800",
            "min-h-[160px] text-slate-900 focus:border-[#C5A059] focus:outline-none focus:ring-1 focus:ring-[#C5A059]/30 dark:text-zinc-100",
          )}
          value={configJson}
          onChange={(e) => handleRawChange(e.target.value)}
          spellCheck={false}
        />
      ) : null}
    </div>
  );
}
