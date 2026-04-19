import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import {
  changeAdminPassword,
  getAdminProfile,
  updateAdminProfile,
  uploadAdminAvatar,
  type AdminProfile,
} from "../../api/profile";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore, type Theme } from "../../store/themeStore";
import { t, type Lang } from "../../i18n";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { cn } from "../../lib/utils";
import { scorePassword, strengthLabelKeys } from "../../lib/passwordStrength";
import { PasswordStrengthBars } from "./PasswordStrengthBars";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ProfileForm = Pick<AdminProfile, "name" | "email" | "phone" | "language">;

const MAX_AVATAR_DIM = 512;

async function resizeImageToWebp(file: File, maxDim = MAX_AVATAR_DIM, quality = 0.85): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onerror = () => reject(new Error("image"));
    i.onload = () => resolve(i);
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))),
      "image/webp",
      quality,
    );
  });
}

function relativeTimeAgo(from: Date | null, now: Date, lang: Lang): string {
  if (!from) return "";
  const diffMs = Math.max(0, now.getTime() - from.getTime());
  const locales: Record<Lang, string> = { de: "de-CH", en: "en-GB", fr: "fr-CH", it: "it-CH" };
  const rtf = new Intl.RelativeTimeFormat(locales[lang] || "de-CH", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

function getInitials(name: string, email: string): string {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function ProfileModal({ open, onClose }: Props) {
  const token = useAuthStore((s) => s.token);
  const language = useAuthStore((s) => s.language);
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [profile, setProfile] = useState<ProfileForm>({ name: "", email: "", phone: "", language });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, forceTick] = useState(0);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const [twoFaInfo, setTwoFaInfo] = useState("");

  const baselineRef = useRef(profile);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(baselineRef.current),
    [profile],
  );
  useUnsavedChangesGuard("profile-modal", saveState === "saving" || isDirty);

  useEffect(() => {
    let active = true;
    if (!open || !token) return;
    setError("");
    setSaveError("");
    setSaveState("saved");
    setAvatarError("");
    setPwError("");
    setPwSuccess("");
    setTwoFaInfo("");
    getAdminProfile(token)
      .then((res) => {
        if (!active) return;
        const next: ProfileForm = {
          name: res.profile.name || "",
          email: res.profile.email || "",
          phone: res.profile.phone || "",
          language: res.profile.language || language,
        };
        setProfile(next);
        setLanguage(next.language);
        setAvatarUrl(res.profile.avatarUrl || null);
        setRole(res.role || "");
        baselineRef.current = next;
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : t(language, "profile.error.loadFailed"));
      });
    return () => {
      active = false;
    };
  }, [open, token, language, setLanguage]);

  // Re-tick minute-level for "gespeichert vor X Min".
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!token) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!isDirty) {
      setSaveState((s) => (s === "saving" ? s : "saved"));
      setSaveError("");
      return;
    }
    setSaveState("dirty");
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      setSaveError("");
      try {
        const res = await updateAdminProfile(token, profile);
        const next: ProfileForm = {
          name: res.profile.name || "",
          email: res.profile.email || "",
          phone: res.profile.phone || "",
          language: res.profile.language,
        };
        setProfile(next);
        setLanguage(res.profile.language);
        setAvatarUrl(res.profile.avatarUrl || null);
        baselineRef.current = next;
        setLastSavedAt(new Date());
        setSaveState("saved");
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : t(language, "profile.error.saveFailed"));
        setSaveState("error");
      }
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [isDirty, profile, token, setLanguage, language]);

  function close() {
    onClose();
    setError("");
    setPwError("");
    setPwSuccess("");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowOld(false);
    setShowNew(false);
    setShowConfirm(false);
    setAvatarError("");
    setTwoFaInfo("");
  }

  async function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setAvatarError("");
    setAvatarUploading(true);
    try {
      const blob = await resizeImageToWebp(file);
      const url = await uploadAdminAvatar(token, blob);
      setAvatarUrl(url);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : t(language, "profile.avatar.uploadError"));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (newPassword !== confirmPassword) {
      setPwError(t(language, "profile.confirmPassword"));
      return;
    }
    setPwSaving(true);
    setPwError("");
    setPwSuccess("");
    try {
      await changeAdminPassword(token, oldPassword, newPassword);
      setPwSuccess(t(language, "profile.passwordChanged"));
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : t(language, "profile.error.passwordChangeFailed"));
    } finally {
      setPwSaving(false);
    }
  }

  if (!open) return null;

  const inputClass = "cust-form-input mt-1.5";
  const labelClass = "block text-xs font-bold uppercase tracking-wider mb-0.5 p-text-subtle";

  const pwScore = scorePassword(newPassword);
  const pwMatch = confirmPassword.length > 0 && confirmPassword === newPassword;
  const pwMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const pwSaveDisabled =
    pwSaving
    || oldPassword.length === 0
    || newPassword.length === 0
    || pwScore < 3
    || newPassword !== confirmPassword;

  const subtitleText = (() => {
    if (saveState === "saving") return t(language, "profile.saving");
    if (saveState === "dirty") return t(language, "profile.unsaved");
    if (saveState === "error") return t(language, "profile.error");
    if (!lastSavedAt) return "";
    const rel = relativeTimeAgo(lastSavedAt, new Date(), language);
    return `${t(language, "profile.savedAgo")} ${rel}`.trim();
  })();

  const subtitleIcon =
    saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
    : saveState === "error" ? <AlertCircle className="h-3.5 w-3.5" />
    : saveState === "dirty" ? <AlertCircle className="h-3.5 w-3.5" />
    : <CheckCircle2 className="h-3.5 w-3.5" />;

  const initials = getInitials(profile.name, profile.email);
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-6 backdrop-blur-sm">
      <div
        className="w-full max-w-3xl my-auto overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <div className="flex items-baseline gap-3 min-w-0">
            <h3 className="text-base font-semibold p-text-main">{t(language, "profile.title")}</h3>
            {subtitleText ? (
              <span className="inline-flex items-center gap-1.5 text-xs p-text-subtle truncate">
                {subtitleIcon}
                {subtitleText}
              </span>
            ) : null}
          </div>
          <button
            onClick={close}
            className="p-1.5 rounded-lg transition-colors propus-dialog-close"
            style={{ color: "var(--text-subtle)" }}
            aria-label={t(language, "profile.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div
          className="grid gap-0 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x"
          style={{ borderColor: "var(--border-soft)" }}
        >
          {/* ── Linke Spalte: Profil ── */}
          <div className="p-6 space-y-4">
            {/* Avatar-Block */}
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-bold"
                style={{
                  background: avatarUrl ? "transparent" : "linear-gradient(135deg, #B68E20 0%, #8a6a14 100%)",
                  color: "#0c0d10",
                }}
                aria-hidden
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold p-text-main">{profile.name || profile.email || "—"}</div>
                <div className="truncate text-xs p-text-subtle">{roleLabel || t(language, "profile.roleAdmin")}</div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{
                    borderColor: "var(--propus-gold)",
                    color: "var(--propus-gold)",
                    background: "transparent",
                  }}
                >
                  {avatarUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  {t(language, "profile.avatar.change")}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onPickAvatar}
                />
              </div>
            </div>
            {avatarError ? (
              <div className="cust-alert cust-alert--error rounded-xl text-sm">{avatarError}</div>
            ) : null}

            {/* Sektions-Header */}
            <div className="border-b pb-1" style={{ borderColor: "var(--border-soft)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wider p-text-subtle">
                {t(language, "profile.sectionProfile")}
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="pm-name">
                {t(language, "profile.name")}
              </label>
              <input
                id="pm-name"
                className={inputClass}
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="pm-email">
                {t(language, "profile.email")}
              </label>
              <input
                id="pm-email"
                type="email"
                className={inputClass}
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              />
              {/* TODO: separater PR — E-Mail-Change-Confirmation-Flow (Bestätigung via Mail an alt+neu). */}
              <p className="mt-1 text-[10px] p-text-subtle">{t(language, "profile.emailChangeHint")}</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="pm-phone">
                {t(language, "profile.phone")}
              </label>
              <input
                id="pm-phone"
                className={inputClass}
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+41 …"
                autoComplete="tel"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="pm-language">
                {t(language, "profile.language")}
              </label>
              <select
                id="pm-language"
                className={inputClass}
                value={profile.language}
                onChange={(e) => {
                  const l = e.target.value as AdminProfile["language"];
                  setProfile((p) => ({ ...p, language: l }));
                  setLanguage(l);
                }}
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="it">Italiano</option>
              </select>
            </div>

            {/* Theme-Segmented-Control */}
            <div>
              <span className={labelClass}>{t(language, "profile.theme")}</span>
              <div
                role="radiogroup"
                aria-label={t(language, "profile.theme")}
                className="mt-1.5 inline-flex h-[37px] w-full overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--border-soft)", background: "var(--surface-raised)" }}
              >
                {(
                  [
                    { v: "light" as Theme, icon: <Sun className="h-4 w-4" />, label: t(language, "profile.theme.light") },
                    { v: "dark" as Theme, icon: <Moon className="h-4 w-4" />, label: t(language, "profile.theme.dark") },
                    { v: "system" as Theme, icon: <Monitor className="h-4 w-4" />, label: t(language, "profile.theme.system") },
                  ]
                ).map(({ v, icon, label }) => {
                  const active = theme === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTheme(v)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 text-xs font-semibold transition-colors",
                        active ? "" : "p-text-subtle hover:p-text-main",
                      )}
                      style={active ? {
                        background: "rgba(182, 142, 32, 0.16)",
                        color: "var(--propus-gold)",
                      } : undefined}
                    >
                      {icon}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? <div className="cust-alert cust-alert--error rounded-xl text-sm">{error}</div> : null}
            {saveError ? <div className="cust-alert cust-alert--error rounded-xl text-sm">{saveError}</div> : null}
          </div>

          {/* ── Rechte Spalte: Sicherheit ── */}
          <form onSubmit={submitPassword} className="p-6 space-y-4">
            <div className="border-b pb-1" style={{ borderColor: "var(--border-soft)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wider p-text-subtle">
                {t(language, "profile.sectionSecurity")}
              </p>
            </div>

            {/* Altes Passwort */}
            <div>
              <label className={labelClass} htmlFor="pm-pw-old">
                {t(language, "profile.oldPassword")}
              </label>
              <div className="relative">
                <input
                  id="pm-pw-old"
                  type={showOld ? "text" : "password"}
                  className={cn(inputClass, "pr-10")}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowOld((v) => !v)}
                  aria-label={t(language, showOld ? "profile.passwordHide" : "profile.passwordShow")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1"
                  style={{ color: "var(--text-subtle)" }}
                >
                  {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Neues Passwort */}
            <div>
              <label className={labelClass} htmlFor="pm-pw-new">
                {t(language, "profile.newPassword")}
              </label>
              <div className="relative">
                <input
                  id="pm-pw-new"
                  type={showNew ? "text" : "password"}
                  className={cn(inputClass, "pr-10")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={t(language, showNew ? "profile.passwordHide" : "profile.passwordShow")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1"
                  style={{ color: "var(--text-subtle)" }}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthBars
                score={pwScore}
                label={pwScore > 0 ? t(language, strengthLabelKeys[pwScore - 1]) : ""}
              />
            </div>

            {/* Bestätigung */}
            <div>
              <label className={labelClass} htmlFor="pm-pw-confirm">
                {t(language, "profile.confirmPassword")}
              </label>
              <div className="relative">
                <input
                  id="pm-pw-confirm"
                  type={showConfirm ? "text" : "password"}
                  className={cn(inputClass, "pr-16")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {pwMatch ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : null}
                  {pwMismatch ? <X className="h-4 w-4 text-red-500" /> : null}
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={t(language, showConfirm ? "profile.passwordHide" : "profile.passwordShow")}
                    className="rounded p-1"
                    style={{ color: "var(--text-subtle)" }}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {pwError ? <div className="cust-alert cust-alert--error rounded-xl text-sm">{pwError}</div> : null}
            {pwSuccess ? <div className="cust-alert cust-alert--success rounded-xl text-sm">{pwSuccess}</div> : null}

            <button
              type="submit"
              disabled={pwSaveDisabled}
              className="btn-primary mt-2 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
              {t(language, "profile.passwordSave")}
            </button>

            {/* 2FA-Stub */}
            <div
              className="mt-6 flex items-center justify-between gap-3 rounded-xl border p-3"
              style={{ borderColor: "var(--border-soft)", background: "var(--surface-raised)" }}
            >
              <div className="min-w-0 flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: "var(--propus-gold)" }} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold p-text-main">{t(language, "profile.twoFactor.title")}</div>
                  <div className="text-xs p-text-subtle">{t(language, "profile.twoFactor.subtitle")}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTwoFaInfo(t(language, "profile.twoFactor.comingSoon"))}
                className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--propus-gold)", color: "var(--propus-gold)" }}
              >
                {t(language, "profile.twoFactor.enable")}
              </button>
            </div>
            {twoFaInfo ? (
              <div className="cust-alert cust-alert--info rounded-xl text-sm">{twoFaInfo}</div>
            ) : null}

            {/* Aktive Sitzungen */}
            {/* TODO: echter Session-Count, sobald admin_sessions-Aggregation implementiert ist. */}
            <div className="flex items-center justify-between text-xs">
              <span className="p-text-subtle">{t(language, "profile.sessions.count")}</span>
              <span
                className="cursor-not-allowed opacity-60"
                style={{ color: "var(--propus-gold)" }}
                aria-disabled
                title={t(language, "profile.twoFactor.comingSoon")}
              >
                {t(language, "profile.sessions.manage")} →
              </span>
            </div>
          </form>
        </div>

        {/* ── Footer ── */}
        <div
          className="px-6 py-3 flex items-center justify-between border-t"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <span className="text-xs p-text-subtle">{t(language, "profile.autoSaveHint")}</span>
          <button onClick={close} className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold">
            {t(language, "profile.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
