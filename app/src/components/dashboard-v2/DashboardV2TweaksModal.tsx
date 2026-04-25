import { useEffect } from "react";
import { X } from "lucide-react";
import { t, type Lang } from "../../i18n";
import type { DashV2Density, DashV2Preferences, DashV2SectionId } from "./dashboardV2Preferences";
import { DEFAULT_DASH_V2 } from "./dashboardV2Preferences";

const SECTIONS: { id: DashV2SectionId; labelKey: string }[] = [
  { id: "alerts", labelKey: "dashboardV2.tweaks.section.alerts" },
  { id: "kpi", labelKey: "dashboardV2.tweaks.section.kpi" },
  { id: "pipeline", labelKey: "dashboardV2.tweaks.section.pipeline" },
  { id: "upcoming", labelKey: "dashboardV2.tweaks.section.upcoming" },
  { id: "tickets", labelKey: "dashboardV2.tweaks.section.tickets" },
  { id: "mails", labelKey: "dashboardV2.tweaks.section.mails" },
  { id: "funnel", labelKey: "dashboardV2.tweaks.section.funnel" },
  { id: "heatmap", labelKey: "dashboardV2.tweaks.section.heatmap" },
  { id: "perf", labelKey: "dashboardV2.tweaks.section.perf" },
];

const DENSITIES: DashV2Density[] = ["compact", "comfy", "spacious"];

interface DashboardV2TweaksModalProps {
  open: boolean;
  lang: Lang;
  prefs: DashV2Preferences;
  onClose: () => void;
  onChange: (next: DashV2Preferences) => void;
}

export function DashboardV2TweaksModal({ open, lang, prefs, onClose, onChange }: DashboardV2TweaksModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const visible = (id: DashV2SectionId) => !prefs.hidden.includes(id);
  const toggle = (id: DashV2SectionId) => {
    const h = new Set(prefs.hidden);
    if (h.has(id)) h.delete(id);
    else h.add(id);
    onChange({ ...prefs, hidden: [...h] });
  };

  const setDensity = (density: DashV2Density) => onChange({ ...prefs, density });

  const reset = () => {
    if (typeof window !== "undefined" && !window.confirm(t(lang, "dashboardV2.tweaks.resetConfirm"))) return;
    onChange({ ...DEFAULT_DASH_V2 });
  };

  return (
    <div className="dv2-tweaks-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dv2-tweaks-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dv2-tweaks-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dv2-tweaks-head">
          <h2 id="dv2-tweaks-title" className="dv2-tweaks-title">
            {t(lang, "dashboardV2.tweaks.title")}
          </h2>
          <button type="button" className="dv2-tweaks-close" onClick={onClose} aria-label={t(lang, "common.close")}>
            <X size={18} />
          </button>
        </div>
        <p className="dv2-tweaks-hint">{t(lang, "dashboardV2.tweaks.hint")}</p>

        <section className="dv2-tweaks-sec">
          <h3 className="dv2-tweaks-sec-title">{t(lang, "dashboard.tweaks.density")}</h3>
          <div className="dv2-tweaks-dens">
            {DENSITIES.map((d) => (
              <label key={d} className={`dv2-tweaks-den ${prefs.density === d ? "is-on" : ""}`}>
                <input
                  type="radio"
                  name="dv2-density"
                  value={d}
                  checked={prefs.density === d}
                  onChange={() => setDensity(d)}
                />
                {d === "compact" && t(lang, "dashboard.tweaks.density.compact")}
                {d === "comfy" && t(lang, "dashboard.tweaks.density.comfy")}
                {d === "spacious" && t(lang, "dashboard.tweaks.density.spacious")}
              </label>
            ))}
          </div>
        </section>

        <section className="dv2-tweaks-sec">
          <h3 className="dv2-tweaks-sec-title">{t(lang, "dashboardV2.tweaks.sections")}</h3>
          <ul className="dv2-tweaks-list">
            {SECTIONS.map(({ id, labelKey }) => (
              <li key={id} className="dv2-tweaks-row">
                <span className="dv2-tweaks-lbl">{t(lang, labelKey)}</span>
                <button
                  type="button"
                  className={`dv2-tweaks-switch${visible(id) ? " is-on" : ""}`}
                  onClick={() => toggle(id)}
                  aria-pressed={visible(id)}
                  aria-label={t(lang, labelKey)}
                />
              </li>
            ))}
          </ul>
        </section>

        <div className="dv2-tweaks-foot">
          <button type="button" className="dv2-tweaks-btn" onClick={reset}>
            {t(lang, "dashboardV2.tweaks.reset")}
          </button>
        </div>
      </div>
    </div>
  );
}
