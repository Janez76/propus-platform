import { Calendar, Camera, Clock } from "lucide-react";
import type { Photographer } from "../../../api/photographers";
import { STATUS_KEYS, STATUS_MAP, normalizeStatusKey } from "../../../lib/status";
import { t, type Lang } from "../../../i18n";
import { cn } from "../../../lib/utils";
import type { TerminForm } from "./types";

const inputClass = cn(
  "w-full rounded-lg border px-3 py-2.5 text-sm transition-colors",
  "bg-[var(--surface-raised)]",
  "border-[var(--border-soft)]",
  "text-[var(--text-main)]",
  "placeholder:text-[var(--text-subtle)]",
  "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] focus:bg-[var(--surface)]",
);

const labelClass = "block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1.5";

type Props = {
  lang: Lang;
  value: TerminForm;
  onChange: (patch: Partial<TerminForm>) => void;
  photographers: Photographer[];
  photographersLoading?: boolean;
};

export function TabTermin({ lang, value, onChange, photographers, photographersLoading }: Props) {
  const normalizedStatus = normalizeStatusKey(value.status) || "pending";

  return (
    <div className="space-y-6">
      {/* Status */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t(lang, "ordersDrawer.termin.statusTitle")}
        </h3>
        <label className={labelClass}>{t(lang, "ordersDrawer.termin.status")}</label>
        <select
          data-testid="edit-input-status"
          value={normalizedStatus}
          onChange={(e) => onChange({ status: e.target.value })}
          className={inputClass}
        >
          {STATUS_KEYS.map((key) => (
            <option key={key} value={key}>
              {STATUS_MAP[key].label}
            </option>
          ))}
        </select>
      </section>

      {/* Photographer */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Camera className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "ordersDrawer.termin.photographer")}
        </h3>
        <label className={labelClass}>{t(lang, "ordersDrawer.termin.photographerLabel")}</label>
        <select
          data-testid="edit-input-photographer"
          value={value.photographerKey}
          onChange={(e) => onChange({ photographerKey: e.target.value })}
          className={inputClass}
          disabled={photographersLoading}
        >
          <option value="">{t(lang, "ordersDrawer.termin.photographerNone")}</option>
          {photographers.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
              {p.email ? ` — ${p.email}` : ""}
            </option>
          ))}
        </select>
      </section>

      {/* Schedule */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Calendar className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "ordersDrawer.termin.schedule")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t(lang, "ordersDrawer.termin.dateTime")}</label>
            <input
              data-testid="edit-input-schedule"
              type="datetime-local"
              value={value.scheduleLocal}
              onChange={(e) => onChange({ scheduleLocal: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              <Clock className="mr-1 inline h-3 w-3" /> {t(lang, "ordersDrawer.termin.duration")}
            </label>
            <div className="relative">
              <input
                data-testid="edit-input-duration"
                type="number"
                min={1}
                step={5}
                value={value.durationMin}
                onChange={(e) => onChange({ durationMin: e.target.value })}
                className={inputClass}
                placeholder="60"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-subtle)]">
                {t(lang, "ordersDrawer.termin.minutes")}
              </span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--text-subtle)]">{t(lang, "ordersDrawer.termin.emailHint")}</p>
      </section>
    </div>
  );
}
