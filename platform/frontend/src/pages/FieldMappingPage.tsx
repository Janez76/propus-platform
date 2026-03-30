import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Link2 } from "lucide-react";
import { t } from "../i18n";
import { useAuthStore } from "../store/authStore";
import { ORDER_FIELD_MAP, getOrderFieldStatus, groupOrderFieldMap, type OrderFieldSection, type OrderFieldStatus } from "../lib/orderFieldMap";

const SECTION_ORDER: OrderFieldSection[] = ["company", "internalContact", "onsiteContact", "billing", "object", "services", "schedule", "pricing"];

const STATUS_META: Record<OrderFieldStatus, { icon: ComponentType<{ className?: string }>; tone: string; badge: string; labelKey: string }> = {
  green: {
    icon: CheckCircle2,
    tone: "text-emerald-700 dark:text-emerald-300",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    labelKey: "fieldMapping.status.green",
  },
  yellow: {
    icon: CircleDashed,
    tone: "text-amber-700 dark:text-amber-300",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    labelKey: "fieldMapping.status.yellow",
  },
  red: {
    icon: AlertTriangle,
    tone: "text-rose-700 dark:text-rose-300",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    labelKey: "fieldMapping.status.red",
  },
};

function categoryBadgeClass(category: string): string {
  const key = String(category || "").toLowerCase();
  if (key.includes("paket")) return "bg-[var(--accent)]/15 text-[#8f6d2c] dark:bg-[var(--accent)]/20 dark:text-[#e5c98f]";
  if (key.includes("firma")) return "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300";
  if (key.includes("interner kontakt")) return "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
  if (key.includes("vor-ort-kontakt")) return "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300";
  if (key.includes("rechnung")) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (key.includes("hauptleistung")) return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  if (key.includes("zusatzleistung")) return "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300";
  if (key.includes("option")) return "bg-slate-200 text-slate-700 bg-[var(--surface-raised)] text-[var(--text-muted)]";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

export function FieldMappingPage() {
  const lang = useAuthStore((s) => s.language);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const categoryOptions = useMemo(() => {
    const unique = new Set(ORDER_FIELD_MAP.map((entry) => entry.businessCategory));
    return ["all", ...Array.from(unique)];
  }, []);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleEntries = useMemo(
    () =>
      ORDER_FIELD_MAP.filter((entry) => {
        const categoryMatch = activeCategory === "all" || entry.businessCategory === activeCategory;
        if (!categoryMatch) return false;
        if (!normalizedSearch) return true;
        const haystack = [
          entry.label,
          entry.businessCategory,
          entry.frontId || "",
          entry.adminFormKey || "",
          entry.apiPayloadKey,
          entry.dbWriteKey,
          entry.dbPath,
          entry.targetPath,
          entry.note || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      }),
    [activeCategory, normalizedSearch],
  );
  const grouped = groupOrderFieldMap(visibleEntries);
  const counts = ORDER_FIELD_MAP.reduce(
    (acc, entry) => {
      acc[getOrderFieldStatus(entry)] += 1;
      return acc;
    },
    { green: 0, yellow: 0, red: 0 } as Record<OrderFieldStatus, number>,
  );

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm border-[var(--border-soft)] bg-[var(--surface)]">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--accent)]/10 p-3 text-[var(--accent)]">
            <Link2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-main)]">
              {t(lang, "fieldMapping.title")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-subtle)]">
              {t(lang, "fieldMapping.subtitle")}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {(["green", "yellow", "red"] as OrderFieldStatus[]).map((status) => {
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          return (
            <div key={status} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-[var(--border-soft)] bg-[var(--surface)]">
              <div className={`flex items-center gap-2 text-sm font-medium ${meta.tone}`}>
                <Icon className="h-4 w-4" />
                {t(lang, meta.labelKey)}
              </div>
              <div className="mt-3 text-3xl font-semibold text-[var(--text-main)]">{counts[status]}</div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-[var(--border-soft)] bg-[var(--surface)]">
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
            {t(lang, "fieldMapping.search.label")}
          </label>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t(lang, "fieldMapping.search.placeholder")}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--accent)] border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-main)] placeholder:text-[var(--text-subtle)]"
          />
        </div>
        <div className="mb-3 text-sm font-medium text-[var(--text-muted)]">
          {t(lang, "fieldMapping.filter.label")}
        </div>
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((category) => {
            const isActive = activeCategory === category;
            const label = category === "all" ? t(lang, "fieldMapping.filter.all") : category;
            const badgeTone = category === "all" ? "bg-slate-200 text-slate-700 bg-[var(--surface-raised)] text-[var(--text-muted)]" : categoryBadgeClass(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${isActive ? badgeTone : "bg-slate-100 text-slate-600 hover:bg-slate-200 bg-[var(--surface)] text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {!visibleEntries.length ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-subtle)]">
          {t(lang, "fieldMapping.search.empty")}
        </section>
      ) : null}

      {SECTION_ORDER.map((section) => {
        const entries = grouped.get(section) || [];
        if (!entries.length) return null;
        return (
          <section key={section} className="rounded-2xl border border-slate-200 bg-white shadow-sm border-[var(--border-soft)] bg-[var(--surface)]">
            <div className="border-b border-slate-200 px-6 py-4 border-[var(--border-soft)]">
              <h2 className="text-lg font-semibold text-[var(--text-main)]">
                {t(lang, `fieldMapping.section.${section}`)}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-zinc-800">
                <thead className="bg-slate-50 bg-[var(--surface)]/40">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-[var(--text-muted)]">{t(lang, "fieldMapping.col.label")}</th>
                    <th className="px-6 py-3 text-left font-semibold text-[var(--text-muted)]">{t(lang, "fieldMapping.col.category")}</th>
                    <th className="px-6 py-3 text-left font-semibold text-[var(--text-muted)]">{t(lang, "fieldMapping.col.front")}</th>
                    <th className="px-6 py-3 text-left font-semibold text-[var(--text-muted)]">{t(lang, "fieldMapping.col.admin")}</th>
                    <th className="px-6 py-3 text-left font-semibold text-[var(--text-muted)]">{t(lang, "fieldMapping.col.storage")}</th>
                    <th className="px-6 py-3 text-left font-semibold text-[var(--text-muted)]">{t(lang, "fieldMapping.col.target")}</th>
                    <th className="px-6 py-3 text-left font-semibold text-[var(--text-muted)]">{t(lang, "fieldMapping.col.status")}</th>
                    <th className="px-6 py-3 text-left font-semibold text-[var(--text-muted)]">{t(lang, "fieldMapping.col.note")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {entries.map((entry) => {
                    const status = getOrderFieldStatus(entry);
                    const meta = STATUS_META[status];
                    return (
                      <tr key={`${entry.section}-${entry.dbPath}-${entry.targetPath}`}>
                        <td className="px-6 py-4 align-top text-[var(--text-main)]">{entry.label}</td>
                        <td className="px-6 py-4 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${categoryBadgeClass(entry.businessCategory)}`}>
                            {entry.businessCategory}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-top">
                          {entry.frontId ? (
                            <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 bg-[var(--surface-raised)] text-[var(--text-muted)]">{entry.frontId}</code>
                          ) : (
                            <span className="text-xs text-[var(--text-subtle)]">{t(lang, "fieldMapping.emptyFront")}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 align-top">
                          {entry.adminFormKey ? (
                            <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 bg-[var(--surface-raised)] text-[var(--text-muted)]">{entry.adminFormKey}</code>
                          ) : (
                            <span className="text-xs text-[var(--text-subtle)]">{t(lang, "fieldMapping.emptyAdmin")}</span>
                          )}
                          <div className="mt-1">
                            <code className="text-[11px] text-slate-500 text-[var(--text-subtle)]">{entry.apiPayloadKey}</code>
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 bg-[var(--surface-raised)] text-[var(--text-muted)]">{entry.dbWriteKey}</code>
                          <div className="mt-1">
                            <code className="text-[11px] text-slate-500 text-[var(--text-subtle)]">{entry.dbPath}</code>
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <code className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{entry.targetPath}</code>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${meta.badge}`}>
                            {t(lang, meta.labelKey)}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-top text-xs text-[var(--text-subtle)]">
                          {entry.note || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

