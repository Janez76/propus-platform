import { useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import { Camera, CalendarDays, Clock, AlertTriangle, User } from "lucide-react";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { fetchAvailability } from "../../api/bookingPublic";
import { computeShootDuration } from "../../lib/bookingPricing";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";
import { photographerPortraitUrl } from "../../lib/bookingAssets";
import type { PhotographerInfo } from "../../api/bookingPublic";

function PhotographerPickButton({
  p,
  selected,
  onSelect,
}: {
  p: PhotographerInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
        selected ? "border-[#C5A059] bg-[#C5A059]/5" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700",
      )}
    >
      {p.image && !imgFailed ? (
        <img
          src={photographerPortraitUrl(p.image)}
          alt={p.name}
          className="h-12 w-12 rounded-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C5A059]/10 text-sm font-bold text-[#C5A059]">
          {p.initials || p.name.charAt(0)}
        </div>
      )}
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{p.name}</span>
    </button>
  );
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function maxDateISO(lookahead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + lookahead);
  return d.toISOString().slice(0, 10);
}

export function StepSchedule({ lang }: { lang: Lang }) {
  const {
    photographers, photographer, setPhotographer,
    date, setDate, time, setTime,
    availableSlots, setAvailableSlots, slotsLoading, setSlotsLoading,
    slotPeriod, setSlotPeriod,
    selectedPackage, addons, object, coords, config,
    provisional, setProvisional,
    skillWarning, setSkillWarning,
  } = useBookingWizardStore();

  const abortRef = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    const label = t(lang, "booking.step3.noPreference");
    const p = useBookingWizardStore.getState().photographer;
    if (p === null) {
      setPhotographer({ key: "any", name: label });
      return;
    }
    if (p.key === "any" && p.name !== label) {
      setPhotographer({ ...p, name: label });
    }
  }, [lang, setPhotographer]);

  const loadSlots = useCallback(async () => {
    if (!date || !photographer) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSlotsLoading(true);
    setAvailableSlots([]);
    setSkillWarning({ show: false, skills: [], recommended: null });

    try {
      const area = Number(object.area) || 0;
      const duration = computeShootDuration(area, selectedPackage?.key ?? null);
      const res = await fetchAvailability({
        photographer: photographer.key,
        date,
        duration,
        sqm: area,
        lat: coords?.lat,
        lon: coords?.lng,
        packageKey: selectedPackage?.key,
        addonIds: addons.map((a) => a.id),
        includeSkillWarning: true,
      });
      if (controller.signal.aborted) return;
      setAvailableSlots(res.free ?? []);
      if (res.wishPhotographerSkillWarning) {
        setSkillWarning({
          show: true,
          skills: res.missingSkills ?? [],
          recommended: res.recommendedPhotographer ?? null,
        });
      }
    } catch {
      if (!controller.signal.aborted) setAvailableSlots([]);
    } finally {
      if (!controller.signal.aborted) setSlotsLoading(false);
    }
  }, [date, photographer, selectedPackage, addons, object.area, coords, setSlotsLoading, setAvailableSlots, setSkillWarning]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const amSlots = availableSlots.filter((s) => s < "12:00");
  const pmSlots = availableSlots.filter((s) => s >= "12:00");
  const displaySlots = slotPeriod === "am" ? amSlots : pmSlots;

  const provisionalEnabled = config?.provisionalBookingEnabled ?? false;
  const lookahead = config?.lookaheadDays ?? 365;

  return (
    <div className="space-y-6">
      {/* Fotografen */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          <Camera className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step3.photographer")}
        </h3>

        {photographers.length === 0 ? (
          <p className="text-sm text-zinc-500">{t(lang, "booking.step3.noPhotographers")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setPhotographer({ key: "any", name: t(lang, "booking.step3.noPreference") })}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                photographer?.key === "any"
                  ? "border-[#C5A059] bg-[#C5A059]/5"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <User className="h-6 w-6 text-zinc-400" />
              </div>
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t(lang, "booking.step3.noPreference")}</span>
            </button>
            {photographers.map((p) => (
              <PhotographerPickButton
                key={p.key}
                p={p}
                selected={photographer?.key === p.key}
                onSelect={() => setPhotographer({ key: p.key, name: p.name })}
              />
            ))}
          </div>
        )}

        {skillWarning.show && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{t(lang, "booking.step3.skillWarning")}</p>
              {skillWarning.skills.length > 0 && (
                <p className="mt-1">{t(lang, "booking.step3.missingSkills")}: {skillWarning.skills.join(", ")}</p>
              )}
              {skillWarning.recommended && (
                <button
                  type="button"
                  className="mt-1 font-medium text-[#C5A059] underline"
                  onClick={() => setPhotographer({ key: skillWarning.recommended!.key, name: skillWarning.recommended!.name })}
                >
                  {t(lang, "booking.step3.useRecommended")}: {skillWarning.recommended.name}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Datum */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          <CalendarDays className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step3.date")}
        </h3>
        <input
          type="date"
          data-testid="booking-input-date"
          value={date}
          min={tomorrowISO()}
          max={maxDateISO(lookahead)}
          onChange={(e) => setDate(e.target.value)}
          className={cn(
            "w-full rounded-lg border px-3 py-2.5 text-sm",
            "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800",
            "focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 focus:border-[#C5A059]",
          )}
        />
      </section>

      {/* Zeitfenster */}
      {date && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            <Clock className="h-4 w-4 text-[#C5A059]" /> {t(lang, "booking.step3.time")}
          </h3>

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setSlotPeriod("am")}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
                slotPeriod === "am" ? "bg-[#C5A059] text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
              )}
            >
              {t(lang, "booking.step3.morning")} ({amSlots.length})
            </button>
            <button
              type="button"
              onClick={() => setSlotPeriod("pm")}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
                slotPeriod === "pm" ? "bg-[#C5A059] text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
              )}
            >
              {t(lang, "booking.step3.afternoon")} ({pmSlots.length})
            </button>
          </div>

          {slotsLoading ? (
            <div className="py-8 text-center text-sm text-zinc-400 animate-pulse">{t(lang, "booking.loading")}</div>
          ) : displaySlots.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-400">
              {availableSlots.length === 0 ? t(lang, "booking.step3.noSlots") : t(lang, "booking.step3.noSlotsInPeriod")}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {displaySlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  data-testid={`booking-slot-${slot.replace(":", "-")}`}
                  onClick={() => setTime(slot)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-center text-sm font-medium transition-all",
                    time === slot
                      ? "border-[#C5A059] bg-[#C5A059] text-white shadow-md"
                      : "border-zinc-200 text-zinc-700 hover:border-[#C5A059]/50 hover:bg-[#C5A059]/5 dark:border-zinc-700 dark:text-zinc-300",
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Provisorisch */}
      {provisionalEnabled && date && time && (
        <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="checkbox"
            checked={provisional}
            onChange={(e) => setProvisional(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#C5A059] focus:ring-[#C5A059]/30"
          />
          <span className="text-sm leading-snug text-zinc-700 dark:text-zinc-300">{t(lang, "booking.step3.provisional")}</span>
        </label>
      )}
    </div>
  );
}
