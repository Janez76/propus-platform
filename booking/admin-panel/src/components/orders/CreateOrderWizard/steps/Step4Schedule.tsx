import { Calendar as CalendarIcon, Clock, AlertCircle, Check, UserX, CalendarX } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { useT } from "../../../../hooks/useT";
import { DbFieldHint } from "../../../ui/DbFieldHint";
import { EmptyState } from "../../../ui/empty-state";
import type { Photographer } from "../../../../api/photographers";
import type { WizardFormState, WizardAction } from "../hooks/useWizardForm";
import { STATUS_KEYS, STATUS_MAP } from "../../../../lib/status";
import { INPUT_CLASS, LABEL_CLASS, SECTION_CLASS, SECTION_TITLE_CLASS } from "../styles";

type Props = {
  state: WizardFormState;
  dispatch: React.Dispatch<WizardAction>;
  photographers: Photographer[];
  availableSlots: string[];
  slotsLoading: boolean;
  slotsError: string;
  slotPeriod: "am" | "pm";
  onChangeSlotPeriod: (period: "am" | "pm") => void;
  calculatedDuration: number | null;
  suggestedPhotographerKey: string | null;
  slotNeedsSchedule: boolean;
  errors?: Partial<Record<keyof WizardFormState, string>>;
};

export function Step4Schedule({
  state,
  dispatch,
  photographers,
  availableSlots,
  slotsLoading,
  slotsError,
  slotPeriod,
  onChangeSlotPeriod,
  calculatedDuration,
  suggestedPhotographerKey,
  slotNeedsSchedule,
  errors = {},
}: Props) {
  const t = useT();
  const activePhotographers = photographers.filter((p) => p.active !== false);

  const amSlots = availableSlots.filter((s) => parseInt(s.split(":")[0], 10) < 12);
  const pmSlots = availableSlots.filter((s) => parseInt(s.split(":")[0], 10) >= 12);
  const displaySlots = slotPeriod === "am" ? amSlots : pmSlots;

  return (
    <div className="space-y-5">
      {/* Anfangsstatus + E-Mail-Optionen */}
      <div className={SECTION_CLASS}>
        <div className={SECTION_TITLE_CLASS}>
          <Check className="h-4 w-4 text-[var(--accent)]" />
          {t("wizard.label.initialStatus")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>{t("wizard.label.initialStatus")}</label>
            <select
              value={state.initialStatus}
              onChange={(e) =>
                dispatch({
                  type: "setInitialStatus",
                  status: e.target.value as WizardFormState["initialStatus"],
                })
              }
              className={INPUT_CLASS}
            >
              {STATUS_KEYS.map((key) => (
                <option key={key} value={key}>
                  {STATUS_MAP[key].label}
                </option>
              ))}
            </select>
            {slotNeedsSchedule && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {t("wizard.hint.statusRequiresSlot")}
              </p>
            )}
          </div>
          <div>
            <label className={LABEL_CLASS}>{t("orderStatus.sendEmailsLabel")}</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={state.sendStatusEmails}
                onChange={(e) => dispatch({ type: "setSendStatusEmails", value: e.target.checked })}
                className="w-4 h-4 rounded border-[var(--border-soft)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <span className="text-[var(--text-muted)]">{t("orderStatus.sendEmailsLabel")}</span>
            </label>
            <div
              className={`grid grid-cols-2 gap-2 text-xs ${state.sendStatusEmails ? "text-[var(--text-subtle)]" : "text-[var(--text-subtle)] opacity-70"}`}
            >
              {(["customer", "office", "photographer", "cc"] as const).map((k) => (
                <label key={k} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={state.statusEmailTargets[k]}
                    disabled={!state.sendStatusEmails}
                    onChange={(e) =>
                      dispatch({ type: "setStatusEmailTarget", key: k, value: e.target.checked })
                    }
                  />
                  <span>{t(`orderStatus.target.${k}`)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Termin */}
      <div className={SECTION_CLASS}>
        <div className={SECTION_TITLE_CLASS}>
          <CalendarIcon className="h-4 w-4 text-[var(--accent)]" />
          {t("wizard.section.scheduling")}
        </div>

        {activePhotographers.length === 0 ? (
          <EmptyState
            icon={<UserX className="h-6 w-6 text-[var(--text-subtle)]" />}
            title={t("wizard.empty.noPhotographers")}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>{t("wizard.label.photographer")}</label>
                <select
                  value={state.photographerKey}
                  onChange={(e) =>
                    dispatch({ type: "setField", key: "photographerKey", value: e.target.value })
                  }
                  className={INPUT_CLASS}
                >
                  <option value="">Beliebig (automatisch)</option>
                  {activePhotographers.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </select>
                <DbFieldHint fieldPath="schedule.photographer.key" />
                {errors.photographerKey && (
                  <p className="mt-1 text-xs text-red-500">{errors.photographerKey}</p>
                )}
              </div>
              <div>
                <label className={LABEL_CLASS}>{t("wizard.label.dateRequired")}</label>
                <input
                  type="date"
                  value={state.date}
                  onChange={(e) =>
                    dispatch({ type: "setSlot", date: e.target.value, time: "" })
                  }
                  className={INPUT_CLASS}
                />
                <DbFieldHint fieldPath="schedule.date" />
                {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date}</p>}
              </div>
            </div>

            {!state.photographerKey && suggestedPhotographerKey && (
              <div className="mt-3 mb-1 flex items-center gap-2 text-xs text-[var(--accent)] font-semibold">
                <Check className="h-3.5 w-3.5 shrink-0" />
                {t("wizard.slot.suggestedPhotographer")}:{" "}
                <span className="font-bold">
                  {photographers.find((p) => p.key === suggestedPhotographerKey)?.name ||
                    suggestedPhotographerKey}
                </span>
              </div>
            )}

            <div className="mt-4">
              {!state.date ? (
                <p className="text-sm text-[var(--text-subtle)] italic">
                  {t("wizard.slot.selectFirst")}
                </p>
              ) : slotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-subtle)]">
                  <Clock className="h-4 w-4 animate-spin" />
                  {t("wizard.slot.loading")}
                </div>
              ) : slotsError ? (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  {slotsError}
                </div>
              ) : availableSlots.length === 0 ? (
                <EmptyState
                  icon={<CalendarX className="h-6 w-6 text-[var(--text-subtle)]" />}
                  title={t("wizard.empty.noSlots")}
                  description={t("wizard.slot.none")}
                />
              ) : (
                <div>
                  {calculatedDuration !== null && (
                    <p className="text-xs text-[var(--text-subtle)] mb-3">
                      {t("wizard.slot.duration")}:{" "}
                      <span className="font-semibold text-[var(--text-muted)]">
                        {calculatedDuration} Min.
                      </span>
                    </p>
                  )}
                  <div className="flex gap-2 mb-3">
                    {(["am", "pm"] as const).map((period) => {
                      const count = period === "am" ? amSlots.length : pmSlots.length;
                      return (
                        <button
                          key={period}
                          type="button"
                          onClick={() => onChangeSlotPeriod(period)}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                            slotPeriod === period
                              ? "bg-[var(--accent)] text-white"
                              : "bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-[var(--surface-raised)]",
                          )}
                        >
                          {period === "am" ? t("wizard.slot.am") : t("wizard.slot.pm")}
                          {count > 0 && <span className="ml-1.5 text-xs opacity-70">({count})</span>}
                        </button>
                      );
                    })}
                  </div>
                  {displaySlots.length === 0 ? (
                    <p className="text-sm text-[var(--text-subtle)] italic">
                      {slotPeriod === "am" ? "Keine Slots am Vormittag" : "Keine Slots am Nachmittag"}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {displaySlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => dispatch({ type: "setField", key: "time", value: slot })}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-mono font-semibold transition-all duration-150",
                            state.time === slot
                              ? "bg-[var(--accent)] text-white shadow-md scale-105"
                              : "bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-[var(--surface-raised)]",
                          )}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                  {state.time && (
                    <p className="mt-3 text-sm font-semibold text-[var(--accent)]">
                      Gewählt: {state.date} um {state.time} Uhr
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Notizen */}
      <div className={SECTION_CLASS}>
        <div className={SECTION_TITLE_CLASS}>
          <CalendarIcon className="h-4 w-4 text-[var(--accent)]" />
          {t("common.notes")}
        </div>
        <textarea
          value={state.notes}
          onChange={(e) => dispatch({ type: "setField", key: "notes", value: e.target.value })}
          className={INPUT_CLASS}
          rows={4}
          placeholder={t("wizard.placeholder.notes")}
        />
      </div>
    </div>
  );
}
