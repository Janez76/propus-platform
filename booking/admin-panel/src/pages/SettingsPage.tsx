import { useEffect, useMemo, useState } from "react";
import { getSystemSettings, patchSystemSettings, type SystemSettingsMap } from "../api/settings";
import { getPhotographers, type Photographer } from "../api/photographers";
import { DiscountCodesPage } from "./DiscountCodesPage";
import { t } from "../i18n";
import { useAuthStore } from "../store/authStore";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";

type TabKey = "pricing" | "scheduling" | "assignment" | "discounts" | "reviews";
type AssignmentPolicy = "strict_then_admin" | "radius_expand_then_no_auto_assign" | "allow_skill_relax";
type SkillKey = "foto" | "matterport" | "drohne_foto" | "drohne_video" | "video";
type SkillGroup = "assignment.requiredSkillLevels" | "assignment.absoluteSkillMinimums";
type PresetKey = "standard" | "strict" | "availability";
type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type WorkHoursRow = { enabled: boolean; start: string; end: string };
type WorkHoursByDay = Record<WeekdayKey, WorkHoursRow>;

const WEEKDAY_OPTIONS = [
  { value: "mon", labelKey: "settings.days.mon" },
  { value: "tue", labelKey: "settings.days.tue" },
  { value: "wed", labelKey: "settings.days.wed" },
  { value: "thu", labelKey: "settings.days.thu" },
  { value: "fri", labelKey: "settings.days.fri" },
  { value: "sat", labelKey: "settings.days.sat" },
  { value: "sun", labelKey: "settings.days.sun" },
] as const;

const SKILL_OPTIONS: Array<{ key: SkillKey; labelKey: string }> = [
  { key: "foto", labelKey: "settings.assignment.skill.photo" },
  { key: "matterport", labelKey: "settings.assignment.skill.matterport" },
  { key: "drohne_foto", labelKey: "settings.assignment.skill.dronePhoto" },
  { key: "drohne_video", labelKey: "settings.assignment.skill.droneVideo" },
  { key: "video", labelKey: "settings.assignment.skill.video" },
];

const ROUNDING_STEP_OPTIONS = [0.05, 0.1, 1] as const;

const ASSIGNMENT_POLICY_OPTIONS: Array<{ value: AssignmentPolicy; labelKey: string }> = [
  { value: "strict_then_admin", labelKey: "settings.assignment.policy.strict" },
  { value: "allow_skill_relax", labelKey: "settings.assignment.policy.relaxSkills" },
];

const PRESET_OPTIONS: Array<{ key: PresetKey; labelKey: string; hintKey: string }> = [
  { key: "standard", labelKey: "settings.presets.standard", hintKey: "settings.presets.standardHint" },
  { key: "strict", labelKey: "settings.presets.strict", hintKey: "settings.presets.strictHint" },
  { key: "availability", labelKey: "settings.presets.availability", hintKey: "settings.presets.availabilityHint" },
];

const WEEKDAY_KEYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function value<T>(map: SystemSettingsMap, key: string, fallback: T): T {
  const current = map[key];
  return (current === undefined ? fallback : (current as T));
}

function toNumber(input: unknown, fallback: number): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(valueToClamp: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valueToClamp));
}

function toTimeMinutes(raw: string): number | null {
  const text = String(raw || "");
  const parts = text.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function getPhotographerSkillValue(p: Photographer, key: SkillKey): number {
  const skills = p.skills ?? {};
  if (key === "drohne_foto") return Number(skills.drohne_foto ?? skills.drohne ?? 0);
  if (key === "drohne_video") return Number(skills.drohne_video ?? 0);
  return Number(skills[key] ?? 0);
}

function getSliderFill(val: number, color: string): string {
  const pct = Math.round(((val - 1) / 9) * 100);
  return `linear-gradient(90deg, ${color} 0%, ${color} ${pct}%, rgba(120,120,120,0.18) ${pct}%, rgba(120,120,120,0.18) 100%)`;
}

function SkillThresholdRow({
  label,
  requiredValue,
  minimumValue,
  onRequiredChange,
  onMinimumChange,
  meetsRequired,
  meetsMinimum,
  total,
}: {
  label: string;
  requiredValue: number;
  minimumValue: number;
  onRequiredChange: (v: number) => void;
  onMinimumChange: (v: number) => void;
  meetsRequired: number;
  meetsMinimum: number;
  total: number;
}) {
  const pctRequired = total > 0 ? (meetsRequired / total) * 100 : 0;
  const badgeColor =
    pctRequired >= 70 ? "#22c55e" : pctRequired >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="rounded-xl border border-[var(--border-soft)] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--text-main)]">{label}</span>
        {total > 0 && (
          <span
            className="text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0"
            style={{ backgroundColor: `${badgeColor}22`, color: badgeColor }}
          >
            {meetsRequired}/{total}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--text-subtle)]">Mindest-Level</span>
          <span className="font-bold text-[var(--accent)]">{requiredValue}/10</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={requiredValue}
          onChange={(e) => onRequiredChange(Number(e.target.value))}
          className="propus-slider w-full"
          style={{ background: getSliderFill(requiredValue, "var(--accent)") }}
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--text-subtle)]">Untergrenze (niemals drunter)</span>
          <span className="font-bold text-indigo-500 dark:text-indigo-400">{minimumValue}/10</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={minimumValue}
          onChange={(e) => onMinimumChange(Number(e.target.value))}
          className="propus-slider w-full"
          style={{ background: getSliderFill(minimumValue, "#6366f1") }}
        />
        {total > 0 && (
          <div className="text-[10px] text-[var(--text-subtle)]">
            {meetsMinimum}/{total} über Untergrenze
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 bg-[var(--surface-raised)]">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pctRequired}%`, backgroundColor: badgeColor }}
          />
        </div>
      )}
    </div>
  );
}

function normalizeHolidays(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const raw of arr) {
    const date = String(raw || "").trim();
    if (!isIsoDate(date)) continue;
    if (!out.includes(date)) out.push(date);
  }
  return out;
}

function buildDefaultWorkHoursByDay(workdays: string[], defaultStart: string, defaultEnd: string): WorkHoursByDay {
  const start = toTimeMinutes(defaultStart) != null ? defaultStart : "08:00";
  const end = toTimeMinutes(defaultEnd) != null && (toTimeMinutes(defaultEnd) ?? 0) > (toTimeMinutes(start) ?? 0) ? defaultEnd : "18:00";
  const enabledSet = new Set((Array.isArray(workdays) ? workdays : []).map((d) => String(d).toLowerCase()));
  return {
    mon: { enabled: enabledSet.has("mon"), start, end },
    tue: { enabled: enabledSet.has("tue"), start, end },
    wed: { enabled: enabledSet.has("wed"), start, end },
    thu: { enabled: enabledSet.has("thu"), start, end },
    fri: { enabled: enabledSet.has("fri"), start, end },
    sat: { enabled: enabledSet.has("sat"), start, end },
    sun: { enabled: enabledSet.has("sun"), start, end },
  };
}

export function SettingsPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [activeTab, setActiveTab] = useState<TabKey>("pricing");
  const [settings, setSettings] = useState<SystemSettingsMap>({});
  const [draft, setDraft] = useState<SystemSettingsMap>({});
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string>("");
  const [holidayInput, setHolidayInput] = useState("");

  const isDirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(draft), [settings, draft]);
  useUnsavedChangesGuard("settings-page", isDirty);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [rows, photographerList] = await Promise.all([
        getSystemSettings(token),
        getPhotographers(token).catch(() => [] as Photographer[]),
      ]);
      setSettings(rows);
      setDraft(rows);
      setPhotographers(photographerList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, [token]);

  function update(key: string, next: unknown) {
    setDraft((prev) => ({ ...prev, [key]: next }));
  }

  function getWorkHoursByDayFromMap(map: SystemSettingsMap): WorkHoursByDay {
    const defaultStart = String(value(map, "scheduling.workStart", "08:00"));
    const defaultEnd = String(value(map, "scheduling.workEnd", "18:00"));
    const fallbackDays = value<string[]>(map, "scheduling.workdays", ["mon", "tue", "wed", "thu", "fri"]);
    const fallback = buildDefaultWorkHoursByDay(fallbackDays, defaultStart, defaultEnd);
    const source = value<Record<string, unknown>>(map, "scheduling.workHoursByDay", fallback);
    const out = { ...fallback };
    for (const day of WEEKDAY_KEYS) {
      const row = source?.[day] as Partial<WorkHoursRow> | undefined;
      const start = String(row?.start || fallback[day].start);
      const end = String(row?.end || fallback[day].end);
      const startMin = toTimeMinutes(start);
      const endMin = toTimeMinutes(end);
      const validRange = startMin != null && endMin != null && endMin > startMin;
      out[day] = {
        enabled: typeof row?.enabled === "boolean" ? row.enabled : fallback[day].enabled,
        start: validRange ? start : fallback[day].start,
        end: validRange ? end : fallback[day].end,
      };
    }
    return out;
  }

  function syncWorkdaysFromWorkHours(nextHours: WorkHoursByDay) {
    const nextWorkdays = WEEKDAY_KEYS.filter((day) => nextHours[day].enabled);
    update("scheduling.workHoursByDay", nextHours);
    update("scheduling.workdays", nextWorkdays);
  }

  /** Legacy `drohne` aus aelteren DB-Eintraegen auf drohne_foto/video abbilden. */
  function currentSkillMap(group: SkillGroup, fallback: Record<SkillKey, number>): Record<SkillKey, number> {
    const next = value<Record<string, unknown>>(draft, group, fallback);
    const legacyDrone = toNumber(next.drohne, NaN);
    const droneFb = Number.isFinite(legacyDrone) ? legacyDrone : fallback.drohne_foto;
    return {
      foto: clamp(toNumber(next.foto, fallback.foto), 1, 10),
      matterport: clamp(toNumber(next.matterport, fallback.matterport), 1, 10),
      drohne_foto: clamp(toNumber(next.drohne_foto, droneFb), 1, 10),
      drohne_video: clamp(toNumber(next.drohne_video, droneFb), 1, 10),
      video: clamp(toNumber(next.video, fallback.video), 1, 10),
    };
  }

  function updateSkill(group: SkillGroup, key: SkillKey, raw: string) {
    const fallback =
      group === "assignment.requiredSkillLevels"
        ? { foto: 5, matterport: 5, drohne_foto: 5, drohne_video: 5, video: 5 }
        : { foto: 4, matterport: 4, drohne_foto: 4, drohne_video: 4, video: 4 };
    const base = currentSkillMap(group, fallback);
    const parsed = clamp(toNumber(raw, base[key]), 1, 10);
    update(group, { ...base, [key]: parsed });
  }

  function toggleWorkday(day: WeekdayKey) {
    const current = getWorkHoursByDayFromMap(draft);
    const next = {
      ...current,
      [day]: { ...current[day], enabled: !current[day].enabled },
    };
    syncWorkdaysFromWorkHours(next);
  }

  function updateWorkdayTime(day: WeekdayKey, key: "start" | "end", nextValue: string) {
    const current = getWorkHoursByDayFromMap(draft);
    const next = {
      ...current,
      [day]: { ...current[day], [key]: nextValue || current[day][key] },
    };
    syncWorkdaysFromWorkHours(next);
  }

  function addHoliday() {
    const date = String(holidayInput || "").trim();
    if (!isIsoDate(date)) {
      setError(t(lang, "settings.errors.holidayFormat"));
      return;
    }
    const current = normalizeHolidays(value(draft, "scheduling.holidays", []));
    if (current.includes(date)) {
      setHolidayInput("");
      return;
    }
    update("scheduling.holidays", [...current, date].sort());
    setHolidayInput("");
    setError("");
  }

  function removeHoliday(date: string) {
    const current = normalizeHolidays(value(draft, "scheduling.holidays", []));
    update("scheduling.holidays", current.filter((d) => d !== date));
  }

  function validate(): string | null {
    const vatPercent = toNumber(value(draft, "pricing.vatRate", 0.081), 0.081) * 100;
    if (vatPercent <= 0 || vatPercent > 100) return t(lang, "settings.errors.vatRange");

    const rawHolidays = value<string[]>(draft, "scheduling.holidays", []);
    const holidays = normalizeHolidays(rawHolidays);
    if (holidays.length !== (Array.isArray(rawHolidays) ? rawHolidays.length : 0)) {
      return t(lang, "settings.errors.holidayFormat");
    }

    const workHoursByDay = getWorkHoursByDayFromMap(draft);
    const activeDays = WEEKDAY_KEYS.filter((day) => workHoursByDay[day].enabled);
    if (activeDays.length === 0) return t(lang, "settings.errors.workdaysRequired");
    for (const day of activeDays) {
      const row = workHoursByDay[day];
      const startMin = toTimeMinutes(row.start);
      const endMin = toTimeMinutes(row.end);
      if (startMin == null || endMin == null || endMin <= startMin) return t(lang, "settings.errors.dayTimeRange");
    }

    const workStart = String(value(draft, "scheduling.workStart", "08:00"));
    const workEnd = String(value(draft, "scheduling.workEnd", "18:00"));
    const startMin = toTimeMinutes(workStart);
    const endMin = toTimeMinutes(workEnd);
    if (startMin == null || endMin == null) return t(lang, "settings.errors.timeFormat");
    if (endMin <= startMin) return t(lang, "settings.errors.timeOrder");

    const slotMinutes = toNumber(value(draft, "scheduling.slotMinutes", 15), 15);
    if (slotMinutes < 5 || slotMinutes > 180) return t(lang, "settings.errors.slotRange");

    const bufferMinutes = toNumber(value(draft, "scheduling.bufferMinutes", 30), 30);
    if (bufferMinutes < 0 || bufferMinutes > 180) return t(lang, "settings.errors.bufferRange");

    const lookaheadDays = toNumber(value(draft, "scheduling.lookaheadDays", 365), 365);
    if (lookaheadDays < 1 || lookaheadDays > 365) return t(lang, "settings.errors.lookaheadRange");

    const minAdvance = toNumber(value(draft, "scheduling.minAdvanceHours", 24), 24);
    if (minAdvance < 0 || minAdvance > 720) return t(lang, "settings.errors.minAdvanceRange");

    return null;
  }

  function applyPreset(preset: PresetKey) {
    const presetSettings: Record<string, unknown> =
      preset === "strict"
        ? {
            "pricing.vatRate": 0.081,
            "pricing.chfRoundingStep": 0.05,
            "pricing.roundingMode": "each_step",
            "scheduling.slotMinutes": 30,
            "scheduling.bufferMinutes": 45,
            "scheduling.lookaheadDays": 10,
            "scheduling.minAdvanceHours": 48,
            "scheduling.workStart": "08:00",
            "scheduling.workEnd": "17:00",
            "scheduling.workdays": ["mon", "tue", "wed", "thu", "fri"],
            "scheduling.holidays": [],
            "scheduling.workHoursByDay": buildDefaultWorkHoursByDay(["mon", "tue", "wed", "thu", "fri"], "08:00", "17:00"),
            "assignment.fallbackPolicy": "strict_then_admin",
            "assignment.allowSkillRelaxation": false,
            "assignment.requiredSkillLevels": { foto: 6, matterport: 7, drohne: 7, video: 6 },
            "assignment.absoluteSkillMinimums": { foto: 5, matterport: 5, drohne: 5, video: 5 },
          }
        : preset === "availability"
          ? {
              "pricing.vatRate": 0.081,
              "pricing.chfRoundingStep": 0.05,
              "pricing.roundingMode": "final_only",
              "scheduling.slotMinutes": 15,
              "scheduling.bufferMinutes": 15,
              "scheduling.lookaheadDays": 30,
              "scheduling.minAdvanceHours": 6,
              "scheduling.workStart": "07:00",
              "scheduling.workEnd": "20:00",
              "scheduling.workdays": ["mon", "tue", "wed", "thu", "fri", "sat"],
              "scheduling.holidays": [],
              "scheduling.workHoursByDay": buildDefaultWorkHoursByDay(["mon", "tue", "wed", "thu", "fri", "sat"], "07:00", "20:00"),
              "assignment.fallbackPolicy": "allow_skill_relax",
              "assignment.allowSkillRelaxation": true,
              "assignment.requiredSkillLevels": { foto: 4, matterport: 4, drohne: 4, video: 4 },
              "assignment.absoluteSkillMinimums": { foto: 3, matterport: 3, drohne: 3, video: 3 },
            }
          : {
              "pricing.vatRate": 0.081,
              "pricing.chfRoundingStep": 0.05,
              "pricing.roundingMode": "each_step",
              "scheduling.slotMinutes": 15,
              "scheduling.bufferMinutes": 30,
              "scheduling.lookaheadDays": 365,
              "scheduling.minAdvanceHours": 24,
              "scheduling.workStart": "08:00",
              "scheduling.workEnd": "18:00",
              "scheduling.workdays": ["mon", "tue", "wed", "thu", "fri"],
              "scheduling.holidays": [],
              "scheduling.workHoursByDay": buildDefaultWorkHoursByDay(["mon", "tue", "wed", "thu", "fri"], "08:00", "18:00"),
              "assignment.fallbackPolicy": "radius_expand_then_no_auto_assign",
              "assignment.allowSkillRelaxation": false,
              "assignment.requiredSkillLevels": { foto: 5, matterport: 5, drohne_foto: 5, drohne_video: 5, video: 5 },
              "assignment.absoluteSkillMinimums": { foto: 4, matterport: 4, drohne_foto: 4, drohne_video: 4, video: 4 },
            };

    setDraft((prev) => ({ ...prev, ...presetSettings }));
    setError("");
  }

  async function save() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const workHoursByDay = getWorkHoursByDayFromMap(draft);
      const normalizedWorkdays = WEEKDAY_KEYS.filter((day) => workHoursByDay[day].enabled);
      const payload: SystemSettingsMap = {
        ...draft,
        "scheduling.holidays": normalizeHolidays(value(draft, "scheduling.holidays", [])),
        "scheduling.workHoursByDay": workHoursByDay,
        "scheduling.workdays": normalizedWorkdays,
      };
      const next = await patchSystemSettings(token, payload);
      setSettings(next);
      setDraft(next);
      setSavedAt(new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings konnten nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }

  const pricingVatPercent = useMemo(
    () => Number((toNumber(value(draft, "pricing.vatRate", 0.081), 0.081) * 100).toFixed(3)),
    [draft]
  );
  const roundingStep = value<number>(draft, "pricing.chfRoundingStep", 0.05);
  const roundingMode = String(value(draft, "pricing.roundingMode", "each_step"));

  const schedulingWorkHoursByDay = getWorkHoursByDayFromMap(draft);
  const schedulingHolidays = normalizeHolidays(value(draft, "scheduling.holidays", []));

  const requiredSkills = currentSkillMap("assignment.requiredSkillLevels", {
    foto: 5,
    matterport: 5,
    drohne_foto: 5,
    drohne_video: 5,
    video: 5,
  });
  const minimumSkills = currentSkillMap("assignment.absoluteSkillMinimums", {
    foto: 4,
    matterport: 4,
    drohne_foto: 4,
    drohne_video: 4,
    video: 4,
  });

  const allowSkillRelaxation = Boolean(value(draft, "assignment.allowSkillRelaxation", false));
  const fallbackPolicyRaw = String(
    value<AssignmentPolicy>(draft, "assignment.fallbackPolicy", "strict_then_admin")
  );
  const fallbackPolicy: AssignmentPolicy = fallbackPolicyRaw === "allow_skill_relax"
    ? "allow_skill_relax"
    : "strict_then_admin";

  const matterportThreshold = toNumber(value(draft, "assignment.matterportLargeSqmThreshold", 300), 300);
  const matterportMinLevel = clamp(toNumber(value(draft, "assignment.matterportLargeSqmMinLevel", 7), 7), 1, 10);
  const matterportFallbackOnBusy = (value(draft, "assignment.matterportLargeSqmFallbackOnBusy", true) as unknown) !== false;

  const activePhotographers = useMemo(
    () => photographers.filter((p) => p.active !== false),
    [photographers]
  );

  const poolStats = useMemo(() => {
    const result = {} as Record<SkillKey, { meetsRequired: number; meetsMinimum: number }>;
    for (const { key } of SKILL_OPTIONS) {
      let meetsRequired = 0;
      let meetsMinimum = 0;
      for (const p of activePhotographers) {
        const skillVal = getPhotographerSkillValue(p, key);
        if (skillVal >= requiredSkills[key]) meetsRequired++;
        if (skillVal >= minimumSkills[key]) meetsMinimum++;
      }
      result[key] = { meetsRequired, meetsMinimum };
    }
    return result;
  }, [activePhotographers, requiredSkills, minimumSkills]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
        <h2 className="text-lg font-bold text-[var(--text-main)]">{t(lang, "settings.title")}</h2>
        <p className="mt-1 text-sm text-[var(--text-subtle)]">{t(lang, "settings.subtitle")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("pricing")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "pricing" ? "bg-[var(--accent)] text-white" : "border border-[var(--border-soft)]"
            }`}
          >
            {t(lang, "settings.tabs.pricing")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scheduling")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "scheduling" ? "bg-[var(--accent)] text-white" : "border border-[var(--border-soft)]"
            }`}
          >
            {t(lang, "settings.tabs.scheduling")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("assignment")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "assignment" ? "bg-[var(--accent)] text-white" : "border border-[var(--border-soft)]"
            }`}
          >
            {t(lang, "settings.tabs.assignment")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("discounts")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "discounts" ? "bg-[var(--accent)] text-white" : "border border-[var(--border-soft)]"
            }`}
          >
            {t(lang, "settings.tabs.discounts")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reviews")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "reviews" ? "bg-[var(--accent)] text-white" : "border border-[var(--border-soft)]"
            }`}
          >
            Reviews
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">{t(lang, "settings.presets.title")}</h3>
        <p className="mt-1 text-xs text-[var(--text-subtle)]">{t(lang, "settings.presets.help")}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset.key)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 border-[var(--border-soft)] hover:bg-[var(--surface-raised)]"
            >
              <div className="text-sm font-medium text-[var(--text-main)]">{t(lang, preset.labelKey)}</div>
              <div className="mt-0.5 text-xs text-[var(--text-subtle)]">{t(lang, preset.hintKey)}</div>
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">{t(lang, "settings.loading")}</p> : null}

      {activeTab === "pricing" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
          <p className="text-sm text-[var(--text-subtle)]">{t(lang, "settings.pricing.help")}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              {t(lang, "settings.pricing.vatLabel")}
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={pricingVatPercent}
                onChange={(e) => update("pricing.vatRate", toNumber(e.target.value, 0) / 100)}
              />
              <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t(lang, "settings.pricing.vatHint")}</span>
            </label>
            <label className="text-sm">
              {t(lang, "settings.pricing.roundingStepLabel")}
              <select
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                value={String(roundingStep)}
                onChange={(e) => update("pricing.chfRoundingStep", toNumber(e.target.value, 0.05))}
              >
                {ROUNDING_STEP_OPTIONS.map((step) => (
                  <option key={step} value={step}>
                    {step.toFixed(2)} CHF
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t(lang, "settings.pricing.roundingStepHint")}</span>
            </label>
            <label className="text-sm">
              {t(lang, "settings.pricing.roundingModeLabel")}
              <select
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                value={roundingMode}
                onChange={(e) => update("pricing.roundingMode", e.target.value)}
              >
                <option value="each_step">{t(lang, "settings.pricing.roundingMode.eachStep")}</option>
                <option value="final_only">{t(lang, "settings.pricing.roundingMode.finalOnly")}</option>
              </select>
              <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t(lang, "settings.pricing.roundingModeHint")}</span>
            </label>
          </div>
        </div>
      ) : null}

      {activeTab === "scheduling" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
          <p className="text-sm text-[var(--text-subtle)]">{t(lang, "settings.scheduling.help")}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              {t(lang, "settings.scheduling.slotMinutes")}
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                type="number"
                min={5}
                max={180}
                step={5}
                value={String(value(draft, "scheduling.slotMinutes", 15))}
                onChange={(e) => update("scheduling.slotMinutes", toNumber(e.target.value, 15))}
              />
            </label>
            <label className="text-sm">
              {t(lang, "settings.scheduling.bufferMinutes")}
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                type="number"
                min={0}
                max={180}
                step={5}
                value={String(value(draft, "scheduling.bufferMinutes", 30))}
                onChange={(e) => update("scheduling.bufferMinutes", toNumber(e.target.value, 30))}
              />
            </label>
            <label className="text-sm">
              {t(lang, "settings.scheduling.lookaheadDays")}
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                type="number"
                min={1}
                max={365}
                step={1}
                value={String(value(draft, "scheduling.lookaheadDays", 365))}
                onChange={(e) => update("scheduling.lookaheadDays", toNumber(e.target.value, 365))}
              />
            </label>
            <label className="text-sm">
              {t(lang, "settings.scheduling.minAdvanceHours")}
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                type="number"
                min={0}
                max={720}
                step={1}
                value={String(value(draft, "scheduling.minAdvanceHours", 24))}
                onChange={(e) => update("scheduling.minAdvanceHours", toNumber(e.target.value, 24))}
              />
            </label>
            <label className="text-sm">
              {t(lang, "settings.scheduling.workStart")}
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                type="time"
                value={String(value(draft, "scheduling.workStart", "08:00"))}
                onChange={(e) => update("scheduling.workStart", e.target.value)}
              />
            </label>
            <label className="text-sm">
              {t(lang, "settings.scheduling.workEnd")}
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                type="time"
                value={String(value(draft, "scheduling.workEnd", "18:00"))}
                onChange={(e) => update("scheduling.workEnd", e.target.value)}
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 border-[var(--border-soft)]">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              {t(lang, "settings.scheduling.workHoursByDayTitle")}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              {t(lang, "settings.scheduling.workHoursByDayHint")}
            </p>
            <div className="mt-3 space-y-2">
              {WEEKDAY_OPTIONS.map((day) => (
                <div key={day.value} className="grid grid-cols-12 items-center gap-2 rounded border px-2 py-2 border-[var(--border-soft)]">
                  <label className="col-span-4 inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={schedulingWorkHoursByDay[day.value].enabled} onChange={() => toggleWorkday(day.value)} />
                    <span>{t(lang, day.labelKey)}</span>
                  </label>
                  <label className="col-span-4 text-xs">
                    <span className="block text-[var(--text-subtle)]">{t(lang, "settings.scheduling.dayStart")}</span>
                    <input
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                      type="time"
                      value={schedulingWorkHoursByDay[day.value].start}
                      onChange={(e) => updateWorkdayTime(day.value, "start", e.target.value)}
                    />
                  </label>
                  <label className="col-span-4 text-xs">
                    <span className="block text-[var(--text-subtle)]">{t(lang, "settings.scheduling.dayEnd")}</span>
                    <input
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                      type="time"
                      value={schedulingWorkHoursByDay[day.value].end}
                      onChange={(e) => updateWorkdayTime(day.value, "end", e.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 border-[var(--border-soft)]">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              {t(lang, "settings.scheduling.holidaysTitle")}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              {t(lang, "settings.scheduling.holidaysHint")}
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 border-[var(--border-soft)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(value(draft, "scheduling.nationalHolidaysEnabled", true))}
                onChange={(e) => update("scheduling.nationalHolidaysEnabled", e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-[var(--text-main)]">
                  {t(lang, "settings.scheduling.nationalHolidaysLabel")}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
                  {t(lang, "settings.scheduling.nationalHolidaysHint")}
                </span>
              </span>
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                type="date"
                value={holidayInput}
                onChange={(e) => setHolidayInput(e.target.value)}
              />
              <button
                type="button"
                onClick={addHoliday}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 border-[var(--border-soft)] hover:bg-[var(--surface-raised)]"
              >
                {t(lang, "settings.scheduling.addHoliday")}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {schedulingHolidays.length === 0 ? (
                <span className="text-xs text-[var(--text-subtle)]">{t(lang, "settings.scheduling.noHolidays")}</span>
              ) : (
                schedulingHolidays.map((date) => (
                  <span
                    key={date}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1 text-xs border-[var(--border-soft)]"
                  >
                    {date}
                    <button type="button" onClick={() => removeHoliday(date)} className="text-red-600 hover:text-red-700">
                      {t(lang, "settings.scheduling.removeHoliday")}
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "assignment" ? (
        <div className="space-y-4">
          {/* Policy & Relaxation */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
            <p className="mb-3 text-sm text-[var(--text-subtle)]">{t(lang, "settings.assignment.help")}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                {t(lang, "settings.assignment.policyLabel")}
                <select
                  className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                  value={fallbackPolicy}
                  onChange={(e) => update("assignment.fallbackPolicy", e.target.value)}
                >
                  {ASSIGNMENT_POLICY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {t(lang, item.labelKey)}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t(lang, "settings.assignment.policyHint")}</span>
              </label>
              <label className="text-sm">
                {t(lang, "settings.assignment.relaxLabel")}
                <select
                  className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                  value={allowSkillRelaxation ? "true" : "false"}
                  onChange={(e) => update("assignment.allowSkillRelaxation", e.target.value === "true")}
                >
                  <option value="false">{t(lang, "settings.common.no")}</option>
                  <option value="true">{t(lang, "settings.common.yes")}</option>
                </select>
                <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t(lang, "settings.assignment.relaxHint")}</span>
              </label>
            </div>
          </div>

          {/* Skill-Anforderungen mit Slider + Pool-Stats */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-main)]">{t(lang, "settings.assignment.skillSectionTitle")}</h3>
                <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{t(lang, "settings.assignment.skillSectionHint")}</p>
              </div>
              {activePhotographers.length > 0 && (
                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-muted)]">
                  {activePhotographers.length} aktive Fotografen
                </span>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SKILL_OPTIONS.map((skill) => (
                <SkillThresholdRow
                  key={skill.key}
                  label={t(lang, skill.labelKey)}
                  requiredValue={requiredSkills[skill.key]}
                  minimumValue={minimumSkills[skill.key]}
                  onRequiredChange={(v) => updateSkill("assignment.requiredSkillLevels", skill.key, String(v))}
                  onMinimumChange={(v) => updateSkill("assignment.absoluteSkillMinimums", skill.key, String(v))}
                  meetsRequired={poolStats[skill.key]?.meetsRequired ?? 0}
                  meetsMinimum={poolStats[skill.key]?.meetsMinimum ?? 0}
                  total={activePhotographers.length}
                />
              ))}
            </div>
          </div>

          {/* Matterport Große Flächen */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
            <h3 className="mb-1 text-sm font-semibold text-[var(--text-main)]">{t(lang, "settings.assignment.matterportSection")}</h3>
            <p className="mb-3 text-xs text-[var(--text-subtle)]">
              Radius kommt aus den Mitarbeiter-Einstellungen. Ab dem Schwellwert wird Matterport priorisiert, darunter abgestuft. Skill 0 bleibt immer ausgeschlossen.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                {t(lang, "settings.assignment.matterportThreshold")}
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step={10}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
                  value={matterportThreshold}
                  onChange={(e) => update("assignment.matterportLargeSqmThreshold", Math.max(1, Number(e.target.value || 300)))}
                />
                <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t(lang, "settings.assignment.matterportThresholdHint")}</span>
              </label>
              <div className="text-sm">
                {t(lang, "settings.assignment.matterportMinLevel")}
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-subtle)]">Level</span>
                    <span className="font-bold text-[var(--accent)]">{matterportMinLevel}/10</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={matterportMinLevel}
                    onChange={(e) => update("assignment.matterportLargeSqmMinLevel", Number(e.target.value))}
                    className="propus-slider w-full"
                    style={{ background: getSliderFill(matterportMinLevel, "var(--accent)") }}
                  />
                  <div className="text-xs text-[var(--text-subtle)]">
                    {t(lang, "settings.assignment.matterportMinLevelHint")}
                  </div>
                </div>
              </div>
            </div>

            {/* Fallback-Toggle */}
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-950/20">
              <button
                type="button"
                role="switch"
                aria-checked={matterportFallbackOnBusy}
                onClick={() => update("assignment.matterportLargeSqmFallbackOnBusy", !matterportFallbackOnBusy)}
                className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  matterportFallbackOnBusy ? "bg-amber-500" : "bg-[var(--surface-raised)]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                    matterportFallbackOnBusy ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {t(lang, "settings.assignment.matterportFallbackOnBusy")}
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {matterportFallbackOnBusy
                    ? t(lang, "settings.assignment.matterportFallbackOnBusyHintEnabled")
                    : t(lang, "settings.assignment.matterportFallbackOnBusyHintDisabled")}
                </p>
              </div>
            </div>
          </div>

          {/* Fotografen-Qualifikationsmatrix */}
          {activePhotographers.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
              <h3 className="mb-1 text-sm font-semibold text-[var(--text-main)]">{t(lang, "settings.assignment.poolSection")}</h3>
              <p className="mb-3 text-xs text-[var(--text-subtle)]">{t(lang, "settings.assignment.poolSectionHint")}</p>
              <div className="overflow-auto rounded-xl border border-[var(--border-soft)]">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 border-[var(--border-soft)] bg-[var(--surface-raised)]/60">
                      <th className="px-3 py-2 text-left font-semibold text-[var(--text-subtle)]">Fotograf</th>
                      {SKILL_OPTIONS.map((skill) => (
                        <th key={skill.key} className="px-3 py-2 text-center font-semibold text-[var(--text-subtle)]">
                          {t(lang, skill.labelKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {activePhotographers.map((p) => (
                      <tr key={p.key} className="hover:bg-slate-50/50 hover:bg-[var(--surface-raised)]/30">
                        <td className="px-3 py-2 font-medium text-[var(--text-muted)]">{p.name || p.key}</td>
                        {SKILL_OPTIONS.map((skill) => {
                          const skillVal = getPhotographerSkillValue(p, skill.key);
                          const req = requiredSkills[skill.key];
                          const min = minimumSkills[skill.key];
                          const bgColor =
                            skillVal >= req
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                              : skillVal >= min
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                                : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300";
                          return (
                            <td key={skill.key} className="px-3 py-2 text-center">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${bgColor}`}>
                                {skillVal}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 border-[var(--border-soft)] bg-[var(--surface-raised)]/40">
                      <td className="px-3 py-2 text-xs font-semibold text-[var(--text-subtle)]">Erfüllen Mindest</td>
                      {SKILL_OPTIONS.map((skill) => {
                        const { meetsRequired } = poolStats[skill.key] ?? { meetsRequired: 0 };
                        const pct = activePhotographers.length > 0 ? (meetsRequired / activePhotographers.length) * 100 : 0;
                        const color = pct >= 70 ? "text-emerald-600 dark:text-emerald-400" : pct >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                        return (
                          <td key={skill.key} className={`px-3 py-2 text-center text-xs font-bold ${color}`}>
                            {meetsRequired}/{activePhotographers.length}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "discounts" ? <DiscountCodesPage /> : null}

      {activeTab === "reviews" ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-main)]">Google-Bewertungs-Link</h3>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              Dieser Link wird in Review-E-Mails an Kunden sowie auf der Reviews-Seite angezeigt. Über Google Business Profile abrufbar.
            </p>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-[var(--text-muted)]">Google Review URL</span>
            <input
              type="url"
              className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
              placeholder="https://g.page/r/..."
              value={String(value(draft, "google.reviewLink", "https://g.page/r/CSQ5RnWmJOumEAE/review"))}
              onChange={(e) => update("google.reviewLink", e.target.value)}
            />
            <span className="mt-1 block text-xs text-[var(--text-subtle)]">
              Wird in Review-Anfrage-E-Mails als "Auf Google bewerten"-Link eingesetzt.
            </span>
          </label>
          {String(value(draft, "google.reviewLink", "")) ? (
            <a
              href={String(value(draft, "google.reviewLink", ""))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-[var(--accent)] hover:underline"
            >
              Link testen ↗
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !isDirty} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? t(lang, "settings.saving") : t(lang, "settings.save")}
        </button>
        {isDirty ? <span className="text-xs text-amber-600">{t(lang, "settings.unsaved")}</span> : null}
        {!isDirty && savedAt ? (
          <span className="text-xs text-emerald-600">
            {t(lang, "settings.savedAtPrefix")} {savedAt}
          </span>
        ) : null}
      </div>
    </div>
  );
}


