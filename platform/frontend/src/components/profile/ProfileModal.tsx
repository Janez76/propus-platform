import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { changeAdminPassword, getAdminProfile, updateAdminProfile, type AdminProfile } from "../../api/profile";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import { t } from "../../i18n";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { cn } from "../../lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ProfileForm = Pick<AdminProfile, "name" | "email" | "phone" | "language">;

export function ProfileModal({ open, onClose }: Props) {
  const token = useAuthStore((s) => s.token);
  const language = useAuthStore((s) => s.language);
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [profile, setProfile] = useState<ProfileForm>({ name: "", email: "", phone: "", language });
  const [pwSaving, setPwSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [pwError, setPwError] = useState<string>("");
  const [pwSuccess, setPwSuccess] = useState<string>("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState("");
  const baselineRef = useRef(profile);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = useMemo(() => JSON.stringify(profile) !== JSON.stringify(baselineRef.current), [profile]);
  useUnsavedChangesGuard("profile-modal", saveState === "saving" || isDirty);

  useEffect(() => {
    let active = true;
    if (!open || !token) return;
    setError("");
    setSaveError("");
    setSaveState("saved");
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
        baselineRef.current = next;
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : t(language, "profile.error.loadFailed"));
      });
    return () => { active = false; };
  }, [open, token, language, setLanguage]);

  function close() {
    onClose();
    setError("");
    setPwError("");
    setPwSuccess("");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  useEffect(() => {
    if (!token) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!isDirty) {
      setSaveState("saved");
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
        baselineRef.current = next;
        setSaveState("saved");
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : t(language, "profile.error.saveFailed"));
        setSaveState("error");
      }
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [isDirty, profile, token, setLanguage, language]);

  const statusPill = useMemo(() => {
    const map = {
      saving: {
        cls: "cust-alert--warning",
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
        label: t(language, "profile.saving"),
      },
      dirty: {
        cls: "cust-alert--info",
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        label: t(language, "profile.unsaved"),
      },
      error: {
        cls: "cust-alert--error",
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        label: t(language, "profile.error"),
      },
      saved: {
        cls: "cust-alert--success",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        label: t(language, "profile.saved"),
      },
    };
    const s = map[saveState];
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border", s.cls)}>
        {s.icon}{s.label}
      </span>
    );
  }, [saveState, language]);

  function submitProfile(e: FormEvent) { e.preventDefault(); }

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

  const labelClass = "block text-xs font-bold uppercase tracking-wider mb-0.5"
    + " " + "p-text-subtle";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl my-auto overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border-soft)" }}>
          <h3 className="text-base font-semibold p-text-main">
            {t(language, "profile.title")}
          </h3>
          <div className="flex items-center gap-3">
            {statusPill}
            <button
              onClick={close}
              className="p-1.5 rounded-lg transition-colors propus-dialog-close"
              style={{ color: "var(--text-subtle)" }}
              aria-label="Schliessen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="grid gap-0 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x" style={{ borderColor: "var(--border-soft)" }}>

          {/* Profildaten */}
          <form onSubmit={submitProfile} className="p-6 space-y-4">
            <p className={labelClass}>{t(language, "profile.title")}</p>

            <div>
              <label className={labelClass}>{t(language, "profile.name")}</label>
              <input
                className={inputClass}
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>{t(language, "profile.email")}</label>
              <input
                type="email"
                className={inputClass}
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>{t(language, "profile.phone")}</label>
              <input
                className={inputClass}
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>{t(language, "profile.language")}</label>
              <select
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
            <div>
              <label className={labelClass}>{t(language, "profile.theme")}</label>
              <select
                className={inputClass}
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
              >
                <option value="light">{t(language, "profile.theme.light")}</option>
                <option value="dark">{t(language, "profile.theme.dark")}</option>
                <option value="system">{t(language, "profile.theme.system")}</option>
              </select>
            </div>

            {error && (
              <div className="cust-alert cust-alert--error rounded-xl text-sm">
                {error}
              </div>
            )}
            {saveError && (
              <div className="cust-alert cust-alert--error rounded-xl text-sm">
                {saveError}
              </div>
            )}
          </form>

          {/* Passwort */}
          <form onSubmit={submitPassword} className="p-6 space-y-4">
            <p className={labelClass}>{t(language, "profile.password")}</p>

            <div>
              <label className={labelClass}>{t(language, "profile.oldPassword")}</label>
              <input
                type="password"
                className={inputClass}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>{t(language, "profile.newPassword")}</label>
              <input
                type="password"
                className={inputClass}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>{t(language, "profile.confirmPassword")}</label>
              <input
                type="password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {pwError && (
              <div className="cust-alert cust-alert--error rounded-xl text-sm">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="cust-alert cust-alert--success rounded-xl text-sm">
                {pwSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={pwSaving}
              className="btn-primary mt-2 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold"
            >
              {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t(language, "profile.passwordSave")}
            </button>
          </form>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 flex justify-end border-t" style={{ borderColor: "var(--border-soft)" }}>
          <button
            onClick={close}
            className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold"
          >
            {t(language, "profile.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

