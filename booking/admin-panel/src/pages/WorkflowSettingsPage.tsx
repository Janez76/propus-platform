import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  ToggleLeft,
  ToggleRight,
  Clock,
  CalendarClock,
  Mail,
  RefreshCw,
  Star,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

type SettingsMap = Record<string, unknown>;

const WORKFLOW_FLAGS = [
  {
    key: "feature.provisionalBooking",
    labelKey: "workflow.flag.provisionalBooking",
    descKey: "workflow.flag.provisionalBookingDesc",
    icon: CalendarClock,
    color: "purple",
  },
  {
    key: "feature.calendarOnStatusChange",
    labelKey: "workflow.flag.calendarSync",
    descKey: "workflow.flag.calendarSync",
    icon: CalendarClock,
    color: "blue",
  },
  {
    key: "feature.emailTemplatesOnStatusChange",
    labelKey: "workflow.flag.emailTemplates",
    descKey: "workflow.flag.emailTemplates",
    icon: Mail,
    color: "amber",
  },
  {
    key: "feature.backgroundJobs",
    labelKey: "workflow.flag.backgroundJobs",
    descKey: "workflow.flag.backgroundJobs",
    icon: RefreshCw,
    color: "green",
  },
  {
    key: "feature.autoReviewRequest",
    labelKey: "workflow.flag.autoReview",
    descKey: "workflow.flag.autoReview",
    icon: Star,
    color: "yellow",
  },
  {
    key: "feature.dbFieldHints",
    labelKey: "workflow.flag.dbFieldHints",
    descKey: "workflow.flag.dbFieldHintsDesc",
    icon: AlertCircle,
    color: "blue",
  },
];

const COLOR_CLASSES: Record<string, { enabled: string; badge: string }> = {
  purple: { enabled: "border-purple-500 bg-purple-50 dark:bg-purple-950/30", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  blue:   { enabled: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",     badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  amber:  { enabled: "border-amber-500 bg-amber-50 dark:bg-amber-950/30",  badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  green:  { enabled: "border-green-500 bg-green-50 dark:bg-green-950/30",  badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  yellow: { enabled: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30", badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
};

export function WorkflowSettingsPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [reviewDelay, setReviewDelay] = useState<number>(120);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingDelay, setSavingDelay] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ ok: boolean; settings: SettingsMap }>("/api/admin/settings", "GET", token);
      setSettings(res.settings || {});
      setReviewDelay(Number((res.settings || {})["workflow.reviewRequestDelayHours"] ?? 120));
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (key: string) => {
    const current = !!settings[key];
    const next = !current;
    setSaving(key);
    setMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; settings: SettingsMap }>("/api/admin/settings", "PATCH", token, {
        settings: { [key]: next },
      });
      setSettings(res.settings || {});
      setMsg({ type: "ok", text: `\u201C${key}\u201D → ${next ? t(lang, "workflow.badge.on") : t(lang, "workflow.badge.off")}` });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setSaving(null);
    }
  };

  const saveDelay = async () => {
    setSavingDelay(true);
    setMsg(null);
    try {
      await apiRequest<{ ok: boolean; settings: SettingsMap }>("/api/admin/settings", "PATCH", token, {
        settings: { "workflow.reviewRequestDelayHours": reviewDelay },
      });
      setMsg({ type: "ok", text: t(lang, "workflow.success.delaySaved") });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setSavingDelay(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="h-6 w-6 text-[var(--accent)]" />
        <h1 className="text-2xl font-bold text-[var(--text-main)]">{t(lang, "workflow.title")}</h1>
      </div>
      <p className="text-[var(--text-subtle)] text-sm">
        {t(lang, "workflow.description")}
      </p>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="space-y-4">
        {WORKFLOW_FLAGS.map(({ key, labelKey, descKey, icon: Icon, color }) => {
          const enabled = !!settings[key];
          const isSaving = saving === key;
          const colors = COLOR_CLASSES[color] || COLOR_CLASSES.blue;
          return (
            <div
              key={key}
              className={`rounded-xl border-2 p-5 transition-all duration-200 ${enabled ? colors.enabled : "border-[var(--border-soft)] bg-[var(--surface)]"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${enabled ? `text-${color}-600 dark:text-${color}-400` : "text-[var(--text-subtle)]"}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[var(--text-main)]">{t(lang, labelKey)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${enabled ? colors.badge : "bg-slate-100 text-slate-500 bg-[var(--surface-raised)] text-[var(--text-subtle)]"}`}>
                        {enabled ? t(lang, "workflow.badge.on") : t(lang, "workflow.badge.off")}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-subtle)] mt-1">{t(lang, descKey)}</p>
                    <code className="text-[11px] text-[var(--text-subtle)] mt-1 block">{key}</code>
                  </div>
                </div>
                <button
                  onClick={() => { void toggle(key); }}
                  disabled={isSaving}
                  className="flex-shrink-0 disabled:opacity-50 transition-opacity"
                  aria-label={enabled ? t(lang, "common.deactivate") : t(lang, "common.activate")}
                >
                  {isSaving ? (
                    <div className="h-8 w-14 animate-pulse rounded-full bg-slate-200 bg-[var(--surface-raised)]" />
                  ) : enabled ? (
                    <ToggleRight className="h-8 w-14 text-[var(--accent)]" />
                  ) : (
                    <ToggleLeft className="h-8 w-14 text-slate-300 text-[var(--text-subtle)]" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Review-Wartezeit */}
      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-slate-400" />
          <h3 className="font-semibold text-[var(--text-main)]">{t(lang, "workflow.label.reviewDelay")}</h3>
        </div>
        <p className="text-sm text-[var(--text-subtle)]">
          {t(lang, "workflow.label.reviewDelayDesc")}
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={8760}
            value={reviewDelay}
            onChange={(e) => setReviewDelay(Number(e.target.value))}
            className="w-32 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
          />
          <span className="text-sm text-[var(--text-subtle)]">{t(lang, "workflow.label.hours")} (~{Math.round(reviewDelay / 24)} {t(lang, "workflow.label.days")})</span>
          <button
            onClick={() => { void saveDelay(); }}
            disabled={savingDelay}
            className="ml-auto px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
          >
            {savingDelay ? t(lang, "common.saving") : t(lang, "common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

