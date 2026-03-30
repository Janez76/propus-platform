import { useEffect, useRef, useState, useCallback } from "react";
import type { FormEvent } from "react";
import {
  getEmployeeLog,
  getPhotographerSettings,
  getPhotographers,
  sendPhotographerCredentials,
  setPhotographerPassword,
  updatePhotographerSettings,
  deactivatePhotographer,
  reactivatePhotographer,
  listPhotographerPortraitLibrary,
  uploadPhotographerPortrait,
  type EmployeeLog,
  type PhotographerSettings,
  type PortraitLibraryItem,
  type WeekdayKey,
  type WorkHoursByDay,
} from "../../api/photographers";
import { getSystemSettings } from "../../api/settings";
import {
  MapPin,
  Clock,
  Star,
  CalendarOff,
  Settings,
  KeyRound,
  ScrollText,
  ChevronDown,
  Save,
  UserRound,
  X,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Check,
  Upload,
  Images,
} from "lucide-react";
import { AbsenceCalendar } from "./AbsenceCalendar";
import { PortraitCropDialog } from "./PortraitCropDialog";
import { AddressAutocompleteInput } from "../ui/AddressAutocompleteInput";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { buildWhatsAppMeLink, formatPhoneCH, looksLikeSwissMobile } from "../../lib/format";

type Props = { token: string; employeeKey: string; onClose: () => void; onSaved: () => void; isActive?: boolean };

type Section =
  | "startpunkt"
  | "abfahrtszeiten"
  | "skills"
  | "abwesenheiten"
  | "einstellungen"
  | "passwort"
  | "protokoll"
  | null;

const WEEKDAY_OPTIONS: Array<{ key: WeekdayKey; shortLabel: string; longLabel: string }> = [
  { key: "mon", shortLabel: "Mo", longLabel: "Montag" },
  { key: "tue", shortLabel: "Di", longLabel: "Dienstag" },
  { key: "wed", shortLabel: "Mi", longLabel: "Mittwoch" },
  { key: "thu", shortLabel: "Do", longLabel: "Donnerstag" },
  { key: "fri", shortLabel: "Fr", longLabel: "Freitag" },
  { key: "sat", shortLabel: "Sa", longLabel: "Samstag" },
  { key: "sun", shortLabel: "So", longLabel: "Sonntag" },
];

function isValidTimeValue(value: string) {
  return /^\d{2}:\d{2}$/.test(String(value || "").trim());
}

function buildDefaultWorkHoursByDay(workdays: string[], workStart: string, workEnd: string): WorkHoursByDay {
  const start = isValidTimeValue(workStart) ? workStart : "08:00";
  const end = isValidTimeValue(workEnd) ? workEnd : "18:00";
  const enabledSet = new Set((Array.isArray(workdays) ? workdays : []).map((day) => String(day).trim().toLowerCase()));
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

function normalizeWorkHoursByDay(settings: PhotographerSettings): WorkHoursByDay {
  const fallback = buildDefaultWorkHoursByDay(
    Array.isArray(settings.workdays) ? settings.workdays : ["mon", "tue", "wed", "thu", "fri"],
    settings.work_start || "08:00",
    settings.work_end || "18:00",
  );
  const source = settings.work_hours_by_day || {};
  const next = { ...fallback };
  for (const { key } of WEEKDAY_OPTIONS) {
    const row = source[key];
    const start = isValidTimeValue(String(row?.start || "")) ? String(row?.start) : fallback[key].start;
    const end = isValidTimeValue(String(row?.end || "")) ? String(row?.end) : fallback[key].end;
    next[key] = {
      enabled: typeof row?.enabled === "boolean" ? row.enabled : fallback[key].enabled,
      start,
      end,
    };
  }
  return next;
}

function portraitPreviewSrc(photoUrl: string): string | null {
  const u = String(photoUrl || "").trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return u.startsWith("/") ? u : `/${u}`;
}

function absoluteImageUrlForCrop(photoUrl: string): string {
  const u = String(photoUrl || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const path = u.startsWith("/") ? u : `/${u.replace(/^\//, "")}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function initialWhatsappFromStammdaten(phone: string, phoneMobile: string, storedWhatsapp: string): string {
  const w = String(storedWhatsapp || "").trim();
  if (w) return w;
  const m = formatPhoneCH(phoneMobile) || String(phoneMobile || "").trim();
  if (m) return buildWhatsAppMeLink(m);
  const p = formatPhoneCH(phone) || String(phone || "").trim();
  if (looksLikeSwissMobile(p)) return buildWhatsAppMeLink(p);
  return "";
}

function normalizeDepartTimes(input: unknown): Record<WeekdayKey, string> {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return WEEKDAY_OPTIONS.reduce((acc, { key }) => {
    const value = String(source[key] || "").trim();
    acc[key] = isValidTimeValue(value) ? value : "";
    return acc;
  }, {} as Record<WeekdayKey, string>);
}

function extractActiveWorkdays(workHoursByDay: WorkHoursByDay): WeekdayKey[] {
  return WEEKDAY_OPTIONS.filter((day) => workHoursByDay[day.key].enabled).map((day) => day.key);
}

type SkillBandKey = "no" | "low" | "mid" | "high";
type SkillSliderVariant = "default" | "matterport";

type SkillBand = {
  key: SkillBandKey;
  label: string;
  range: string;
  match: (num: number) => boolean;
  activeClass: string;
};

const DEFAULT_SKILL_BANDS: SkillBand[] = [
  { key: "no", label: "Nein", range: "0", match: (num) => num <= 0, activeClass: "border-red-500/50 bg-red-500/15 text-red-300" },
  { key: "low", label: "eher nein", range: "1-3", match: (num) => num >= 1 && num <= 3, activeClass: "border-zinc-400/60 bg-zinc-500/15 text-zinc-200" },
  { key: "mid", label: "eher ja", range: "4-7", match: (num) => num >= 4 && num <= 7, activeClass: "border-amber-500/60 bg-amber-500/15 text-amber-300" },
  { key: "high", label: "bevorzugen", range: "8-10", match: (num) => num >= 8, activeClass: "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" },
];

const MATTERPORT_SKILL_BANDS: SkillBand[] = [
  { key: "no", label: "Nein", range: "0", match: (num) => num <= 0, activeClass: "border-red-500/50 bg-red-500/15 text-red-300" },
  { key: "low", label: "bis 299 m²", range: "1-3", match: (num) => num >= 1 && num <= 3, activeClass: "border-sky-500/60 bg-sky-500/15 text-sky-300" },
  { key: "mid", label: "ab 300 m²", range: "4-7", match: (num) => num >= 4 && num <= 7, activeClass: "border-violet-500/60 bg-violet-500/15 text-violet-300" },
  { key: "high", label: "bevorzugen", range: "8-10", match: (num) => num >= 8, activeClass: "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" },
];

function getSkillBands(variant: SkillSliderVariant) {
  return variant === "matterport" ? MATTERPORT_SKILL_BANDS : DEFAULT_SKILL_BANDS;
}

function getSkillInfluenceLabel(value: string, variant: SkillSliderVariant) {
  const num = Number(value || 0);
  const activeBand = getSkillBands(variant).find((band) => band.match(num));
  return activeBand?.label || "Nein";
}

function getSkillInfluenceTone(value: string, variant: SkillSliderVariant) {
  const num = Number(value || 0);
  return getSkillBands(variant).find((band) => band.match(num))?.activeClass || "border-red-500/50 bg-red-500/15 text-red-300";
}

function isActiveSkillBand(value: string, band: SkillBand, variant: SkillSliderVariant) {
  const num = Number(value || 0);
  return getSkillBands(variant).some((item) => item.key === band.key && item.match(num));
}

function getSliderTrackStyle(variant: SkillSliderVariant) {
  if (variant === "matterport") {
    return {
      background: "linear-gradient(90deg, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0.95) 9%, rgba(14,165,233,0.95) 10%, rgba(14,165,233,0.95) 39%, rgba(168,85,247,0.95) 40%, rgba(168,85,247,0.95) 79%, rgba(16,185,129,0.95) 80%, rgba(16,185,129,0.95) 100%)",
    };
  }
  return {
    background: "linear-gradient(90deg, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0.95) 9%, rgba(113,113,122,0.95) 10%, rgba(113,113,122,0.95) 39%, rgba(245,158,11,0.95) 40%, rgba(245,158,11,0.95) 79%, rgba(16,185,129,0.95) 80%, rgba(16,185,129,0.95) 100%)",
  };
}

function SkillSlider({
  label,
  value,
  onChange,
  hint,
  badge,
  variant = "default",
  requiredLevel,
  minimumLevel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  badge?: string;
  variant?: SkillSliderVariant;
  requiredLevel?: number;
  minimumLevel?: number;
}) {
  const influence = getSkillInfluenceLabel(value, variant);
  const bands = getSkillBands(variant);
  const numVal = Number(value || 0);

  let thresholdStatus: "above_required" | "above_minimum" | "below_minimum" | null = null;
  if (requiredLevel != null && minimumLevel != null && numVal > 0) {
    if (numVal >= requiredLevel) thresholdStatus = "above_required";
    else if (numVal >= minimumLevel) thresholdStatus = "above_minimum";
    else thresholdStatus = "below_minimum";
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">{label}</span>
          {badge ? (
            <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getSkillInfluenceTone(value, variant)}`}>
            {influence}
          </span>
          <span className="font-bold text-[var(--accent)]">{value}/10</span>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={getSliderTrackStyle(variant)}
        className="propus-slider w-full"
      />
      <div className="grid grid-cols-4 gap-2">
        {bands.map((band) => {
          const active = isActiveSkillBand(value, band, variant);
          return (
            <div
              key={band.key}
              className={`rounded-lg border px-2 py-1 text-center text-[11px] transition-colors ${
                active
                  ? band.activeClass
                  : "border-[var(--border-soft)] text-[var(--text-subtle)]"
              }`}
            >
              <div className="font-medium">{band.label}</div>
              <div className="text-[10px] opacity-80">{band.range}</div>
            </div>
          );
        })}
      </div>

      {requiredLevel != null && minimumLevel != null && (
        <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
          thresholdStatus === "above_required"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : thresholdStatus === "above_minimum"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
              : numVal === 0
                ? "border-[var(--border-soft)] text-[var(--text-subtle)]"
                : "border-red-500/30 bg-red-500/10 text-red-400"
        }`}>
          <span>
            {thresholdStatus === "above_required" && "✓ Über Mindest-Level"}
            {thresholdStatus === "above_minimum" && "⚠ Unter Mindest, über Untergrenze"}
            {thresholdStatus === "below_minimum" && "✗ Unter Untergrenze — wird nicht zugeteilt"}
            {numVal === 0 && "— Skill nicht aktiv"}
          </span>
          <span className="ml-auto text-[10px] opacity-70">
            Mindest: {requiredLevel} · Untergrenze: {minimumLevel}
          </span>
        </div>
      )}

      {hint ? (
        <div className="text-[11px] text-[var(--text-subtle)]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function AccordionSection({
  id,
  open,
  onToggle,
  icon,
  label,
  children,
}: {
  id: Section;
  open: boolean;
  onToggle: (id: Section) => void;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--border-soft)] last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[var(--accent-subtle)]"
      >
        <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-[var(--accent)]">
          {icon}
          {label}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-[var(--text-subtle)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

export function EmployeeModal({ token, employeeKey, onClose, onSaved, isActive = true }: Props) {
  const lang = useAuthStore((s) => s.language);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneMobile, setPhoneMobile] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [initials, setInitials] = useState("");
  const [isBookableWizard, setIsBookableWizard] = useState(true);
  const [photoUrl, setPhotoUrl] = useState("");
  const portraitFileRef = useRef<HTMLInputElement>(null);
  const [portraitCropSrc, setPortraitCropSrc] = useState<string | null>(null);
  const [portraitLibraryOpen, setPortraitLibraryOpen] = useState(false);
  const [portraitLibraryLoading, setPortraitLibraryLoading] = useState(false);
  const [portraitLibraryItems, setPortraitLibraryItems] = useState<PortraitLibraryItem[]>([]);
  const [homeAddress, setHomeAddress] = useState("");
  const [radiusKm, setRadiusKm] = useState("30");
  const [departTimes, setDepartTimes] = useState<Record<WeekdayKey, string>>(() => normalizeDepartTimes({}));
  const [skillFoto, setSkillFoto] = useState("10");
  const [skillMatterport, setSkillMatterport] = useState("0");
  const [skillDrohneFoto, setSkillDrohneFoto] = useState("0");
  const [skillDrohneVideo, setSkillDrohneVideo] = useState("0");
  const [skillVideo, setSkillVideo] = useState("0");
  const [languages, setLanguages] = useState("de");
  const [nativeLanguage, setNativeLanguage] = useState("de");
  const [eventColor, setEventColor] = useState("#3b82f6");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEmployeeActive, setIsEmployeeActive] = useState(true);
  const [workHoursByDay, setWorkHoursByDay] = useState<WorkHoursByDay>(() =>
    buildDefaultWorkHoursByDay(["mon", "tue", "wed", "thu", "fri"], "08:00", "18:00")
  );
  const [bufferMinutes, setBufferMinutes] = useState("");
  const [slotMinutes, setSlotMinutes] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [logs, setLogs] = useState<EmployeeLog[]>([]);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [openSection, setOpenSection] = useState<Section>(null);
  const [globalRequired, setGlobalRequired] = useState<Record<string, number>>({});
  const [globalMinimum, setGlobalMinimum] = useState<Record<string, number>>({});

  useEffect(() => {
    getPhotographers(token)
      .then((list) => {
        const emp = list.find((p) => p.key === employeeKey);
        if (emp) {
          setName(emp.name || "");
          setEmail(emp.email || "");
          setPhone(emp.phone || "");
          setPhoneMobile(formatPhoneCH(emp.phone_mobile || "") || String(emp.phone_mobile || ""));
          setWhatsapp(initialWhatsappFromStammdaten(emp.phone || "", emp.phone_mobile || "", String(emp.whatsapp || "")));
          setInitials(emp.initials || "");
          setIsBookableWizard(emp.bookable !== false);
          setPhotoUrl(emp.photo_url || "");
        }
      })
      .catch(() => {});

    getSystemSettings(token)
      .then((s) => {
        const req = s["assignment.requiredSkillLevels"];
        const min = s["assignment.absoluteSkillMinimums"];
        if (req && typeof req === "object") setGlobalRequired(req as Record<string, number>);
        if (min && typeof min === "object") setGlobalMinimum(min as Record<string, number>);
      })
      .catch(() => {});

    getPhotographerSettings(token, employeeKey)
      .then((s) => {
        setHomeAddress(s.home_address || "");
        setRadiusKm(String(s.radius_km ?? s.max_radius_km ?? 30));
        setDepartTimes(normalizeDepartTimes(s.depart_times));
        if (s.name) setName(s.name);
        if (s.email) setEmail(s.email);
        if (s.phone != null && s.phone !== "") setPhone(s.phone);
        const mob = s.phone_mobile ?? "";
        setPhoneMobile(formatPhoneCH(mob) || String(mob));
        setWhatsapp(initialWhatsappFromStammdaten(s.phone || "", mob, String(s.whatsapp || "")));
        if (s.initials) setInitials(s.initials);
        if (s.bookable !== undefined) setIsBookableWizard(s.bookable !== false);
        if (s.photo_url !== undefined) setPhotoUrl(String(s.photo_url || ""));
        setNativeLanguage(s.native_language || "de");
        setEventColor(String(s.event_color || "#3b82f6"));
        setLanguages((s.languages || ["de"]).join(","));
        setIsAdmin(Boolean(s.is_admin));
        setIsEmployeeActive(s.active !== false);
        setWorkHoursByDay(normalizeWorkHoursByDay(s));
        setBufferMinutes(s.buffer_minutes != null ? String(s.buffer_minutes) : "");
        setSlotMinutes(s.slot_minutes != null ? String(s.slot_minutes) : "");
        setSkillFoto(String(s.skills?.foto ?? 10));
        setSkillMatterport(String(s.skills?.matterport ?? 0));
        setSkillDrohneFoto(String(s.skills?.drohne_foto ?? s.skills?.drohne ?? 0));
        setSkillDrohneVideo(String(s.skills?.drohne_video ?? 0));
        setSkillVideo(String(s.skills?.video ?? 0));
      })
      .catch(() => {});
  }, [token, employeeKey]);

  useEffect(() => {
    getEmployeeLog(token, employeeKey, 80)
      .then(setLogs)
      .catch(() => {});
  }, [token, employeeKey]);

  function toggleSection(id: Section) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  const closePortraitCrop = useCallback(() => {
    setPortraitCropSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  function handlePortraitFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setPortraitCropSrc(URL.createObjectURL(file));
  }

  async function openPortraitLibrary() {
    setPortraitLibraryOpen(true);
    setPortraitLibraryLoading(true);
    setError("");
    try {
      const items = await listPhotographerPortraitLibrary(token);
      setPortraitLibraryItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bibliothek konnte nicht geladen werden");
      setPortraitLibraryItems([]);
    } finally {
      setPortraitLibraryLoading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const activeWorkdays = extractActiveWorkdays(workHoursByDay);
      if (!activeWorkdays.length) {
        throw new Error("Mindestens ein Arbeitstag muss aktiv sein.");
      }
      for (const day of activeWorkdays) {
        const row = workHoursByDay[day];
        if (!isValidTimeValue(row.start) || !isValidTimeValue(row.end) || row.end <= row.start) {
          throw new Error(`Ungueltige Arbeitszeit fuer ${day}.`);
        }
      }

      const derivedWorkStart = activeWorkdays.reduce<string | null>((min, day) => {
        const value = workHoursByDay[day].start;
        if (!isValidTimeValue(value)) return min;
        return min == null || value < min ? value : min;
      }, null);

      const derivedWorkEnd = activeWorkdays.reduce<string | null>((max, day) => {
        const value = workHoursByDay[day].end;
        if (!isValidTimeValue(value)) return max;
        return max == null || value > max ? value : max;
      }, null);

      const cleanDepartTimes = Object.fromEntries(
        WEEKDAY_OPTIONS
          .map(({ key }) => [key, departTimes[key].trim()] as const)
          .filter(([, value]) => isValidTimeValue(value))
      );

      const phoneNorm = formatPhoneCH(phone) || phone.trim();
      let mobileNorm = formatPhoneCH(phoneMobile) || phoneMobile.trim();
      if (!mobileNorm && looksLikeSwissMobile(phoneNorm)) mobileNorm = phoneNorm;
      let whatsappOut = whatsapp.trim();
      if (!whatsappOut && mobileNorm) whatsappOut = buildWhatsAppMeLink(mobileNorm);

      await updatePhotographerSettings(token, employeeKey, {
        name,
        email,
        phone: phoneNorm,
        phone_mobile: mobileNorm,
        whatsapp: whatsappOut,
        initials,
        bookable: isBookableWizard,
        photo_url: photoUrl.trim(),
        home_address: homeAddress,
        radius_km: Number(radiusKm),
        native_language: nativeLanguage,
        event_color: eventColor,
        languages: languages.split(",").map((x) => x.trim()).filter(Boolean),
        is_admin: isAdmin,
        active: isEmployeeActive,
        work_start: derivedWorkStart,
        work_end: derivedWorkEnd,
        workdays: activeWorkdays,
        work_hours_by_day: workHoursByDay,
        buffer_minutes: bufferMinutes ? Number(bufferMinutes) : null,
        slot_minutes: slotMinutes ? Number(slotMinutes) : null,
        depart_times: cleanDepartTimes,
        skills: {
          foto: Number(skillFoto),
          matterport: Number(skillMatterport),
          drohne_foto: Number(skillDrohneFoto),
          drohne_video: Number(skillDrohneVideo),
          video: Number(skillVideo),
        },
      });

      setSaveSuccess(true);
      onSaved();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "common.error"));
    }
  }

  async function savePassword() {
    if (!newPassword.trim()) return;
    try {
      await setPhotographerPassword(token, employeeKey, newPassword.trim());
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "employeeModal.error.passwordFailed"));
    }
  }

  async function sendCredentials() {
    try {
      await sendPhotographerCredentials(token, employeeKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "employeeModal.error.credentialsFailed"));
    }
  }

  async function handleDeactivate() {
    setDeleteLoading(true);
    try {
      await deactivatePhotographer(token, employeeKey);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "common.error"));
      setDeleteLoading(false);
      setConfirmDelete(false);
    }
  }

  async function handleReactivate() {
    setDeleteLoading(true);
    try {
      await reactivatePhotographer(token, employeeKey);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "common.error"));
      setDeleteLoading(false);
    }
  }

  async function refreshLogs() {
    try {
      const rows = await getEmployeeLog(token, employeeKey, 80);
      setLogs(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "employeeModal.error.logFailed"));
    }
  }

  const filteredLogs = logs.filter((l) => {
    if (logFilter === "all") return true;
    if (logFilter === "absence") return l.action.includes("absence");
    if (logFilter === "password") return l.action.includes("password") || l.action.includes("credentials");
    return true;
  });

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-xl max-h-[92vh] overflow-auto rounded-[24px] bg-[var(--surface)] shadow-2xl my-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-subtle)]">
              <UserRound className="h-6 w-6 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-main)]">{t(lang, "employeeModal.title")}</h2>
              <p className="text-sm text-[var(--accent)]">{t(lang, "employeeModal.subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-soft)] text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stammdaten */}
        <div className="px-5 pb-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--accent)]">
            <UserRound className="h-3.5 w-3.5" />
            {t(lang, "employeeModal.section.coreData")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">
                {t(lang, "common.name")} <span className="text-red-500">*</span>
              </label>
              <input
                className="ui-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vorname Nachname"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">
                {t(lang, "common.email")} ({t(lang, "nav.calendar")}) <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className="ui-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@propus.ch"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "common.phone")}</label>
              <input
                className="ui-input"
                value={phone}
                onChange={(e) => {
                  const raw = e.target.value;
                  setPhone(raw);
                  const formatted = formatPhoneCH(raw) || raw.trim();
                  if (!phoneMobile.trim() && looksLikeSwissMobile(formatted || raw)) {
                    setWhatsapp(buildWhatsAppMeLink(formatted || raw));
                  }
                }}
                placeholder="+41 ..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.phoneMobile")}</label>
              <input
                className="ui-input"
                value={phoneMobile}
                onChange={(e) => {
                  const raw = e.target.value;
                  const formatted = formatPhoneCH(raw) || raw.trim();
                  setPhoneMobile(formatted || raw);
                  if (formatted || raw.trim()) {
                    setWhatsapp(buildWhatsAppMeLink(formatted || raw));
                  } else {
                    const p = formatPhoneCH(phone) || phone.trim();
                    setWhatsapp(looksLikeSwissMobile(p) ? buildWhatsAppMeLink(p) : "");
                  }
                }}
                placeholder="+41 ..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.whatsapp")}</label>
              <input
                className="ui-input"
                type="url"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="https://wa.me/41..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employees.label.initials")}</label>
              <input
                className="ui-input"
                value={initials}
                onChange={(e) => setInitials(e.target.value)}
                placeholder="IM"
                maxLength={4}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.photoUrl")}</label>
              <div className="flex flex-wrap items-start gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--border-soft)] bg-[var(--accent-subtle)]">
                  {portraitPreviewSrc(photoUrl) ? (
                    <img
                      src={portraitPreviewSrc(photoUrl)!}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                      <UserRound className="h-8 w-8 opacity-60" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    className="ui-input"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="assets/photographers/Name.png"
                  />
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={portraitFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handlePortraitFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => portraitFileRef.current?.click()}
                      disabled={Boolean(portraitCropSrc)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--accent-subtle)] disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4 shrink-0" />
                      {t(lang, "employeeModal.photo.upload")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void openPortraitLibrary()}
                      disabled={Boolean(portraitCropSrc)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--accent-subtle)] disabled:opacity-50"
                    >
                      <Images className="h-4 w-4 shrink-0" />
                      {t(lang, "employeeModal.photo.library")}
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t(lang, "employeeModal.hint.photoUrl")}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
                {t(lang, "employeeModal.label.key")}{" "}
                <span className="text-xs text-[var(--text-subtle)]">{t(lang, "employeeModal.hint.keyReadonly")}</span>
              </label>
              <input
                className="ui-input opacity-60 cursor-not-allowed"
                value={employeeKey}
                disabled
              />
            </div>
          </div>

          {/* Buchungs-Wizard */}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--accent-subtle)] border border-[var(--border-soft)] px-4 py-3">
            <div>
              <div className="font-semibold text-[var(--text-main)]">{t(lang, "employeeModal.label.bookableWizard")}</div>
              <div className="text-xs text-[var(--text-muted)]">{t(lang, "employeeModal.hint.bookableWizard")}</div>
            </div>
            <button
              type="button"
              onClick={() => setIsBookableWizard((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isBookableWizard ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isBookableWizard ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          {/* Mitarbeiter-Zugang aktiv */}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--accent-subtle)] border border-[var(--border-soft)] px-4 py-3">
            <div>
              <div className="font-semibold text-[var(--text-main)]">{t(lang, "employeeModal.label.employeeActive")}</div>
              <div className="text-xs text-[var(--text-muted)]">{t(lang, "employeeModal.hint.employeeActive")}</div>
            </div>
            <button
              type="button"
              onClick={() => setIsEmployeeActive((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isEmployeeActive ? "bg-emerald-500" : "bg-[var(--border-strong)]"}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isEmployeeActive ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          {/* Admin Toggle */}
          <div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--accent-subtle)] border border-[var(--border-soft)] px-4 py-3">
            <div>
              <div className="font-semibold text-[var(--text-main)]">{t(lang, "employeeModal.label.adminAccess")}</div>
              <div className="text-xs text-[var(--text-muted)]">{t(lang, "employeeModal.hint.adminAccess")}</div>
            </div>
            <button
              type="button"
              onClick={() => setIsAdmin((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isAdmin ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isAdmin ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>

        {/* Accordion sections */}
        <div className="border-t border-[var(--border-soft)]">
          <AccordionSection
            id="startpunkt"
            open={openSection === "startpunkt"}
            onToggle={toggleSection}
            icon={<MapPin className="h-3.5 w-3.5" />}
            label={t(lang, "employeeModal.section.startRadius")}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.homeAddress")}</label>
                <AddressAutocompleteInput mode="combined" value={homeAddress} onChange={setHomeAddress} lang={lang} className="ui-input" placeholder="Musterstrasse 1, 6000 Luzern" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.radiusKm")}</label>
                <input type="number" className="ui-input" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} />
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            id="abfahrtszeiten"
            open={openSection === "abfahrtszeiten"}
            onToggle={toggleSection}
            icon={<Clock className="h-3.5 w-3.5" />}
            label={t(lang, "employeeModal.section.departureTimes")}
          >
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">{t(lang, "employeeModal.info.departureTimes")}</p>
              <p className="text-xs text-[var(--text-subtle)]">
                Diese Zeiten bestimmen den fruehestmoeglichen ersten Slot des Tages ueber Abfahrtszeit + Wegberechnung.
              </p>
              <div className="grid gap-2">
                {WEEKDAY_OPTIONS.map((day) => (
                  <div
                    key={day.key}
                    className="grid grid-cols-[70px_1fr] items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2"
                  >
                    <label className="text-sm font-medium text-[var(--text-main)]" htmlFor={`depart-${day.key}`}>
                      {day.shortLabel}
                    </label>
                    <input
                      id={`depart-${day.key}`}
                      type="time"
                      className="ui-input"
                      value={departTimes[day.key]}
                      onChange={(e) => setDepartTimes((prev) => ({ ...prev, [day.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            id="skills"
            open={openSection === "skills"}
            onToggle={toggleSection}
            icon={<Star className="h-3.5 w-3.5" />}
            label={t(lang, "employeeModal.section.skills")}
          >
            <div className="space-y-4">
              <SkillSlider
                label="Foto"
                value={skillFoto}
                onChange={setSkillFoto}
                requiredLevel={Number(globalRequired.foto ?? globalRequired.foto ?? 5)}
                minimumLevel={Number(globalMinimum.foto ?? 4)}
              />
              <SkillSlider
                label="Matterport"
                value={skillMatterport}
                onChange={setSkillMatterport}
                variant="matterport"
                badge="ab 300 m²"
                hint="0 = kein Matterport. Fuer Matterport bei kleinen Objekten gilt 1-3, ab 300 m² ist besonders der Bereich 4-7 relevant."
                requiredLevel={Number(globalRequired.matterport ?? 5)}
                minimumLevel={Number(globalMinimum.matterport ?? 4)}
              />
              <SkillSlider
                label="Drohne Foto"
                value={skillDrohneFoto}
                onChange={setSkillDrohneFoto}
                requiredLevel={Number(globalRequired.drohne_foto ?? globalRequired.drohne ?? 5)}
                minimumLevel={Number(globalMinimum.drohne_foto ?? globalMinimum.drohne ?? 4)}
              />
              <SkillSlider
                label="Drohne Video"
                value={skillDrohneVideo}
                onChange={setSkillDrohneVideo}
                requiredLevel={Number(globalRequired.drohne_video ?? 5)}
                minimumLevel={Number(globalMinimum.drohne_video ?? 4)}
              />
              <SkillSlider
                label="Video"
                value={skillVideo}
                onChange={setSkillVideo}
                requiredLevel={Number(globalRequired.video ?? 5)}
                minimumLevel={Number(globalMinimum.video ?? 4)}
              />
            </div>
          </AccordionSection>

          <AccordionSection
            id="abwesenheiten"
            open={openSection === "abwesenheiten"}
            onToggle={toggleSection}
            icon={<CalendarOff className="h-3.5 w-3.5" />}
            label={t(lang, "employeeModal.section.absences")}
          >
            <AbsenceCalendar token={token} employeeKey={employeeKey} />
          </AccordionSection>

          <AccordionSection
            id="einstellungen"
            open={openSection === "einstellungen"}
            onToggle={toggleSection}
            icon={<Settings className="h-3.5 w-3.5" />}
            label={t(lang, "employeeModal.section.settings")}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.nativeLanguage")}</label>
                <select
                  className="ui-input"
                  value={nativeLanguage}
                  onChange={(e) => setNativeLanguage(e.target.value)}
                >
                  <option value="de">{t(lang, "employeeModal.language.de")}</option>
                  <option value="en">{t(lang, "employeeModal.language.en")}</option>
                  <option value="fr">{t(lang, "employeeModal.language.fr")}</option>
                  <option value="it">{t(lang, "employeeModal.language.it")}</option>
                  <option value="sr">{t(lang, "employeeModal.language.sr")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.languages")}</label>
                <div className="flex flex-wrap gap-3 pt-1">
                  {(["de","en","fr","it","sr"] as const).map((lc) => {
                    const checked = languages.split(",").map((x) => x.trim()).includes(lc);
                    return (
                      <label key={lc} className="flex items-center gap-1.5 cursor-pointer text-sm text-[var(--text-main)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = languages.split(",").map((x) => x.trim()).filter(Boolean);
                            const updated = e.target.checked
                              ? [...new Set([...current, lc])]
                              : current.filter((x) => x !== lc);
                            setLanguages(updated.join(","));
                          }}
                          className="accent-[var(--accent)]"
                        />
                        {lc.toUpperCase()}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="sm:col-span-2 border-t border-[var(--border-soft)] pt-3">
                <label className="mb-2 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.eventColor")}</label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="color"
                    className="h-10 w-14 cursor-pointer rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1"
                    value={eventColor}
                    onChange={(e) => setEventColor(e.target.value)}
                    aria-label={t(lang, "employeeModal.aria.selectColor")}
                  />
                  <div className="flex items-center gap-2">
                    {["#3b82f6", "#a855f7", "#14b8a6", "#f59e0b", "#ef4444", "#22c55e"].map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`h-6 w-6 rounded-full border-2 transition-transform ${eventColor.toLowerCase() === color ? "border-[var(--text-main)] scale-110 ring-2 ring-[var(--accent-subtle)]" : "border-[var(--border-soft)]"}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEventColor(color)}
                        aria-label={`Farbe ${color}`}
                        title={color}
                      />
                    ))}
                  </div>
                  <span className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-soft)] px-2 py-1 font-mono text-xs text-[var(--text-muted)]">{eventColor}</span>
                </div>
              </div>
              <div className="sm:col-span-2 border-t border-[var(--border-soft)] pt-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">{t(lang, "employeeModal.label.schedulingOverrides")}</div>
                <p className="mb-3 text-xs text-[var(--text-subtle)]">
                  Mitarbeiter-Einstellungen ueberschreiben globale Scheduling-Werte. Das Ende definiert den letzten zulaessigen Startslot.
                </p>
                <div className="grid gap-2">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <div
                      key={day.key}
                      className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-3 sm:grid-cols-[80px_1fr_1fr]"
                    >
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-main)]">
                        <input
                          type="checkbox"
                          checked={workHoursByDay[day.key].enabled}
                          onChange={() =>
                            setWorkHoursByDay((prev) => ({
                              ...prev,
                              [day.key]: { ...prev[day.key], enabled: !prev[day.key].enabled },
                            }))
                          }
                          className="accent-[var(--accent)]"
                        />
                        {day.shortLabel}
                      </label>
                      <label className="text-xs text-[var(--text-muted)]">
                        <span className="mb-1 block">Beginn</span>
                        <input
                          type="time"
                          className="ui-input"
                          value={workHoursByDay[day.key].start}
                          onChange={(e) =>
                            setWorkHoursByDay((prev) => ({
                              ...prev,
                              [day.key]: { ...prev[day.key], start: e.target.value || prev[day.key].start },
                            }))
                          }
                        />
                      </label>
                      <label className="text-xs text-[var(--text-muted)]">
                        <span className="mb-1 block">Ende</span>
                        <input
                          type="time"
                          className="ui-input"
                          value={workHoursByDay[day.key].end}
                          onChange={(e) =>
                            setWorkHoursByDay((prev) => ({
                              ...prev,
                              [day.key]: { ...prev[day.key], end: e.target.value || prev[day.key].end },
                            }))
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.bufferMinutes")}</label>
                    <input type="number" className="ui-input" value={bufferMinutes} onChange={(e) => setBufferMinutes(e.target.value)} placeholder="30" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.slotMinutes")}</label>
                    <input type="number" className="ui-input" value={slotMinutes} onChange={(e) => setSlotMinutes(e.target.value)} placeholder="15" />
                  </div>
                </div>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            id="passwort"
            open={openSection === "passwort"}
            onToggle={toggleSection}
            icon={<KeyRound className="h-3.5 w-3.5" />}
            label={t(lang, "employeeModal.section.password")}
          >
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-main)]">{t(lang, "employeeModal.label.newPassword")}</label>
                <input
                  type="password"
                  className="ui-input"
                  placeholder={t(lang, "employeeModal.label.newPassword")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary flex-1 justify-center" onClick={savePassword}>
                  {t(lang, "employeeModal.button.setPassword")}
                </button>
                <button type="button" className="btn-secondary flex-1 justify-center" onClick={sendCredentials}>
                  {t(lang, "employeeModal.button.sendCredentials")}
                </button>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            id="protokoll"
            open={openSection === "protokoll"}
            onToggle={toggleSection}
            icon={<ScrollText className="h-3.5 w-3.5" />}
            label={t(lang, "employeeModal.section.log")}
          >
            <div className="space-y-3">
              <div className="flex gap-2">
                <select className="ui-input flex-1" value={logFilter} onChange={(e) => setLogFilter(e.target.value)}>
                  <option value="all">{t(lang, "employeeModal.logFilter.all")}</option>
                  <option value="absence">{t(lang, "employeeModal.logFilter.absence")}</option>
                  <option value="password">{t(lang, "employeeModal.logFilter.password")}</option>
                </select>
                <button type="button" className="btn-secondary shrink-0" onClick={refreshLogs}>
                  {t(lang, "common.refresh")}
                </button>
              </div>
              <div className="max-h-48 overflow-auto rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-3 text-xs">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="mb-2 border-b border-[var(--border-soft)] pb-2 last:mb-0 last:border-b-0 last:pb-0">
                    <div className="font-semibold text-[var(--text-main)]">{log.action}</div>
                    <div className="text-[var(--text-subtle)]">
                      {new Date(log.created_at).toLocaleString("de-CH")} | {log.actor || "-"}
                    </div>
                  </div>
                ))}
                {!filteredLogs.length && <div className="text-[var(--text-subtle)]">{t(lang, "employeeModal.log.empty")}</div>}
              </div>
            </div>
          </AccordionSection>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4">
          {saveSuccess && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/40 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                  {t(lang, "employeeModal.success.saved")}
                </p>
              </div>
            </div>
          )}
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {/* Bestätigungs-Banner für Deaktivierung */}
          {confirmDelete && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                  {t(lang, "employeeModal.confirm.deactivate")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={handleDeactivate}
                  className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleteLoading ? "..." : t(lang, "employeeModal.button.confirmDeactivate")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
                >
                  {t(lang, "common.cancel")}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {/* Links: Deaktivieren oder Reaktivieren */}
            {isActive ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {t(lang, "employeeModal.button.deactivate")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={deleteLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {t(lang, "employeeModal.button.reactivate")}
              </button>
            )}

            {/* Rechts: Abbrechen + Speichern */}
            <div className="flex gap-3">
              <button type="button" className="btn-secondary" onClick={onClose}>
                {t(lang, "common.cancel")}
              </button>
              <button type="submit" className="btn-primary gap-2">
                <Save className="h-4 w-4" />
                {t(lang, "common.save")}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
    {portraitCropSrc ? (
      <PortraitCropDialog
        open
        lang={lang}
        imageSrc={portraitCropSrc}
        onClose={closePortraitCrop}
        onConfirm={async (blob) => {
          const file = new File([blob], "portrait.jpg", { type: "image/jpeg" });
          const path = await uploadPhotographerPortrait(token, file);
          setPhotoUrl(path);
        }}
      />
    ) : null}
    {portraitLibraryOpen && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portrait-library-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setPortraitLibraryOpen(false);
        }}
      >
        <div
          className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-2xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
            <h3 id="portrait-library-title" className="font-semibold text-[var(--text-main)]">
              {t(lang, "employeeModal.photo.libraryTitle")}
            </h3>
            <button
              type="button"
              onClick={() => setPortraitLibraryOpen(false)}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-main)]"
              aria-label={t(lang, "common.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[min(60vh,520px)] overflow-y-auto p-4">
            {portraitLibraryLoading ? (
              <p className="text-sm text-[var(--text-muted)]">{t(lang, "employeeModal.photo.libraryLoading")}</p>
            ) : portraitLibraryItems.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t(lang, "employeeModal.photo.libraryEmpty")}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {portraitLibraryItems.map((item) => {
                  const thumb = item.path.startsWith("/") ? item.path : `/${item.path}`;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => {
                        setPortraitCropSrc(absoluteImageUrlForCrop(thumb));
                        setPortraitLibraryOpen(false);
                      }}
                      className="group aspect-square overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--accent-subtle)] transition hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    >
                      <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
