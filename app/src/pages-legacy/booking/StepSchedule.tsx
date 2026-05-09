import { useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import { Camera, CalendarDays, Clock, AlertTriangle, User, Info } from "lucide-react";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { fetchAvailability, findFirstDateWithAvailability } from "../../api/bookingPublic";
import { computeShootDuration } from "../../lib/bookingPricing";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";
import { photographerPortraitUrl } from "../../lib/bookingAssets";
import type { PhotographerInfo } from "../../api/bookingPublic";
import { BookingTypeToggle } from "./BookingTypeToggle";

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
        selected ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border-soft)] hover:border-[var(--border-strong)]",
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
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/10 text-sm font-bold text-[var(--accent)]">
          {p.initials || p.name.charAt(0)}
        </div>
      )}
      <span className="text-xs font-medium text-[var(--text-muted)]">{p.name}</span>
    </button>
  );
}

/** YYYY-MM-DD in der lokalen Zeitzone des Browsers — bewusst NICHT
 *  via toISOString(), das bei positiven UTC-Offsets nach Mitternacht
 *  einen Tag zu wenig liefern wuerde (z. B. CH-Sommer 00:30 lokal →
 *  ISO zeigt noch den Vortag). */
function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localISODate(d);
}

function maxDateISO(lookahead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + lookahead);
  return localISODate(d);
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
    scheduleAutoPickSignature,
    setScheduleAutoPickSignature,
    bookingKind, setBookingKind,
    deadlineAt, setDeadlineAt,
    flexibleEarliestAt, setFlexibleEarliestAt,
  } = useBookingWizardStore();

  const lookahead = config?.lookaheadDays ?? 365;
  const isFlex = bookingKind === "flexible";
  const [showEarliestField, setShowEarliestField] = useState<boolean>(Boolean(flexibleEarliestAt));

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

  const addonIdsKey = addons.map((a) => a.id).join(",");

  useEffect(() => {
    if (isFlex) return;
    const key = photographer?.key;
    if (!key) return;
    const area = Number(object.area) || 0;
    const sig = `${key}|${selectedPackage?.key ?? ""}|${area}|${addonIdsKey}|${coords?.lat ?? ""}|${coords?.lng ?? ""}`;
    if (scheduleAutoPickSignature === sig) return;
    if (date && scheduleAutoPickSignature == null) {
      setScheduleAutoPickSignature(sig);
      return;
    }

    let cancelled = false;
    (async () => {
      const duration = computeShootDuration(area, selectedPackage?.key ?? null);
      const next = await findFirstDateWithAvailability({
        photographer: key,
        minDate: tomorrowISO(),
        maxDate: maxDateISO(lookahead),
        duration,
        sqm: area,
        lat: coords?.lat,
        lon: coords?.lng,
        packageKey: selectedPackage?.key,
        addonIds: addons.map((a) => a.id),
      });
      if (cancelled) return;
      setScheduleAutoPickSignature(sig);
      if (next) {
        setDate(next);
        setTime("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isFlex,
    photographer?.key,
    lookahead,
    selectedPackage?.key,
    addonIdsKey,
    object.area,
    coords?.lat,
    coords?.lng,
    scheduleAutoPickSignature,
    date,
    setDate,
    setTime,
    setScheduleAutoPickSignature,
  ]);

  const loadSlots = useCallback(async () => {
    if (isFlex) return;
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
  }, [isFlex, date, photographer, selectedPackage, addons, object.area, coords, setSlotsLoading, setAvailableSlots, setSkillWarning]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  return (
    <div className="space-y-6">
      {/* Buchungsart-Toggle */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <CalendarDays className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step3.bookingKind.label")}
        </h3>
        <BookingTypeToggle value={bookingKind} onChange={setBookingKind} lang={lang} />
      </section>

      {isFlex ? (
        <FlexSection
          lang={lang}
          deadlineAt={deadlineAt}
          setDeadlineAt={setDeadlineAt}
          flexibleEarliestAt={flexibleEarliestAt}
          setFlexibleEarliestAt={setFlexibleEarliestAt}
          showEarliestField={showEarliestField}
          setShowEarliestField={setShowEarliestField}
          lookahead={lookahead}
        />
      ) : (
        <FixedSection
          lang={lang}
          photographers={photographers}
          photographer={photographer}
          setPhotographer={setPhotographer}
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
          slotPeriod={slotPeriod}
          setSlotPeriod={setSlotPeriod}
          availableSlots={availableSlots}
          slotsLoading={slotsLoading}
          provisional={provisional}
          setProvisional={setProvisional}
          provisionalEnabled={config?.provisionalBookingEnabled ?? false}
          skillWarning={skillWarning}
          lookahead={lookahead}
        />
      )}
    </div>
  );
}

/** Sektion mit Deadline-Datum + collapsible „Frühestens ab" + Info-Hinweis. */
function FlexSection({
  lang,
  deadlineAt,
  setDeadlineAt,
  flexibleEarliestAt,
  setFlexibleEarliestAt,
  showEarliestField,
  setShowEarliestField,
  lookahead,
}: {
  lang: Lang;
  deadlineAt: string;
  setDeadlineAt: (d: string) => void;
  flexibleEarliestAt: string;
  setFlexibleEarliestAt: (d: string) => void;
  showEarliestField: boolean;
  setShowEarliestField: (v: boolean) => void;
  lookahead: number;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <CalendarDays className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step3.flex.deadline")}
        </h3>
        <input
          type="date"
          data-testid="booking-input-deadline"
          value={deadlineAt}
          min={tomorrowISO()}
          max={maxDateISO(lookahead)}
          onChange={(e) => setDeadlineAt(e.target.value)}
          className={cn(
            "w-full rounded-lg border px-3 py-2.5 text-sm text-[var(--text-main)]",
            "border-[var(--border-soft)] bg-[var(--surface-raised)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] focus:bg-[var(--surface)]",
          )}
        />

        <div className="mt-4">
          {!showEarliestField ? (
            <button
              type="button"
              onClick={() => setShowEarliestField(true)}
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              + {t(lang, "booking.step3.flex.earliestToggle")}
            </button>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                {t(lang, "booking.step3.flex.earliest")}
              </label>
              <input
                type="date"
                data-testid="booking-input-earliest"
                value={flexibleEarliestAt}
                min={tomorrowISO()}
                max={deadlineAt || maxDateISO(lookahead)}
                onChange={(e) => setFlexibleEarliestAt(e.target.value)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-sm text-[var(--text-main)]",
                  "border-[var(--border-soft)] bg-[var(--surface-raised)]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] focus:bg-[var(--surface)]",
                )}
              />
              <button
                type="button"
                onClick={() => { setShowEarliestField(false); setFlexibleEarliestAt(""); }}
                className="mt-2 text-xs text-[var(--text-subtle)] hover:underline"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 text-sm text-[var(--text-muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <p className="leading-snug">{t(lang, "booking.step3.flex.notice")}</p>
      </div>
    </div>
  );
}

/** Bestehender Fix-Termin-Flow — Photographer-Picker + Datum + Zeit-Slots. */
function FixedSection({
  lang,
  photographers,
  photographer,
  setPhotographer,
  date,
  setDate,
  time,
  setTime,
  slotPeriod,
  setSlotPeriod,
  availableSlots,
  slotsLoading,
  provisional,
  setProvisional,
  provisionalEnabled,
  skillWarning,
  lookahead,
}: {
  lang: Lang;
  photographers: PhotographerInfo[];
  photographer: { key: string; name: string } | null;
  setPhotographer: (p: { key: string; name: string } | null) => void;
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  slotPeriod: "am" | "pm";
  setSlotPeriod: (p: "am" | "pm") => void;
  availableSlots: string[];
  slotsLoading: boolean;
  provisional: boolean;
  setProvisional: (v: boolean) => void;
  provisionalEnabled: boolean;
  skillWarning: { show: boolean; skills: string[]; recommended: { key: string; name: string } | null };
  lookahead: number;
}) {
  const amSlots = availableSlots.filter((s) => s < "12:00");
  const pmSlots = availableSlots.filter((s) => s >= "12:00");
  const displaySlots = slotPeriod === "am" ? amSlots : pmSlots;

  return (
    <div className="space-y-6">
      {/* Fotografen */}
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Camera className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step3.photographer")}
        </h3>

        {photographers.length === 0 ? (
          <p className="text-sm text-[var(--text-subtle)]">{t(lang, "booking.step3.noPhotographers")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setPhotographer({ key: "any", name: t(lang, "booking.step3.noPreference") })}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                photographer?.key === "any"
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border-soft)] hover:border-[var(--border-strong)]",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-raised)]">
                <User className="h-6 w-6 text-[var(--text-subtle)]" />
              </div>
              <span className="text-xs font-medium text-[var(--text-subtle)]">{t(lang, "booking.step3.noPreference")}</span>
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
                  className="mt-1 font-medium text-[var(--accent)] underline"
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
      <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <CalendarDays className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step3.date")}
        </h3>
        <input
          type="date"
          data-testid="booking-input-date"
          value={date}
          min={tomorrowISO()}
          max={maxDateISO(lookahead)}
          onChange={(e) => setDate(e.target.value)}
          className={cn(
            "w-full rounded-lg border px-3 py-2.5 text-sm text-[var(--text-main)]",
            "border-[var(--border-soft)] bg-[var(--surface-raised)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] focus:bg-[var(--surface)]",
          )}
        />
      </section>

      {/* Zeitfenster */}
      {date && (
        <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm dark:shadow-none">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Clock className="h-4 w-4 text-[var(--accent)]" /> {t(lang, "booking.step3.time")}
          </h3>

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setSlotPeriod("am")}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
                slotPeriod === "am" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] text-[var(--text-subtle)]",
              )}
            >
              {t(lang, "booking.step3.morning")} ({amSlots.length})
            </button>
            <button
              type="button"
              onClick={() => setSlotPeriod("pm")}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
                slotPeriod === "pm" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] text-[var(--text-subtle)]",
              )}
            >
              {t(lang, "booking.step3.afternoon")} ({pmSlots.length})
            </button>
          </div>

          {slotsLoading ? (
            <div className="py-8 text-center text-sm text-[var(--text-subtle)] animate-pulse">{t(lang, "booking.loading")}</div>
          ) : displaySlots.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-subtle)]">
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
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-md"
                      : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5",
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
        <label className="flex items-start gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 shadow-sm dark:shadow-none">
          <input
            type="checkbox"
            checked={provisional}
            onChange={(e) => setProvisional(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
          />
          <span className="text-sm leading-snug text-[var(--text-muted)]">{t(lang, "booking.step3.provisional")}</span>
        </label>
      )}
    </div>
  );
}

