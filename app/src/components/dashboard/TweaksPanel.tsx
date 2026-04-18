import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import type { DashState, DashTileId, Density } from "./dashboardState";
import { DEFAULT_STATE } from "./dashboardState";

interface TweaksPanelProps {
  open: boolean;
  onClose: () => void;
  state: DashState;
  onChange: (next: DashState) => void;
}

const TILE_KEYS: { id: DashTileId; labelKey: string }[] = [
  { id: "greeting", labelKey: "dashboard.tile.greeting" },
  { id: "productivity", labelKey: "dashboard.tile.productivity" },
  { id: "kpi-revenue", labelKey: "dashboard.tile.kpiRevenue" },
  { id: "kpi-bookings", labelKey: "dashboard.tile.kpiBookings" },
  { id: "kpi-open", labelKey: "dashboard.tile.kpiOpen" },
  { id: "kpi-due", labelKey: "dashboard.tile.kpiDue" },
  { id: "kpi-receivables", labelKey: "dashboard.tile.kpiReceivables" },
  { id: "timeline", labelKey: "dashboard.tile.timeline" },
  { id: "tasks", labelKey: "dashboard.tile.tasks" },
  { id: "pipeline", labelKey: "dashboard.tile.pipeline" },
  { id: "funnel", labelKey: "dashboard.tile.funnel" },
  { id: "heatmap", labelKey: "dashboard.tile.heatmap" },
  { id: "activity", labelKey: "dashboard.tile.activity" },
];

export function TweaksPanel({ open, onClose, state, onChange }: TweaksPanelProps) {
  const lang = useAuthStore((s) => s.language);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!savedFlash) return;
    const id = setTimeout(() => setSavedFlash(false), 1200);
    return () => clearTimeout(id);
  }, [savedFlash]);

  if (!open) return null;

  const toggleTile = (id: DashTileId) => {
    const hidden = state.hidden.includes(id)
      ? state.hidden.filter((x) => x !== id)
      : [...state.hidden, id];
    onChange({ ...state, hidden });
    setSavedFlash(true);
  };

  const setDensity = (density: Density) => {
    onChange({ ...state, density });
    setSavedFlash(true);
  };

  const toggleEdit = () => {
    onChange({ ...state, editMode: !state.editMode });
    setSavedFlash(true);
  };

  const toggleHideDone = () => {
    onChange({ ...state, hideDone: !state.hideDone });
    setSavedFlash(true);
  };

  const resetAll = () => {
    if (typeof window !== "undefined" && !window.confirm(t(lang, "dashboard.tweaks.resetConfirm"))) return;
    onChange({
      ...DEFAULT_STATE,
      hidden: [...DEFAULT_STATE.hidden],
      rowOrder: [...DEFAULT_STATE.rowOrder],
      tileOrder: Object.fromEntries(
        Object.entries(DEFAULT_STATE.tileOrder).map(([k, v]) => [k, [...v]]),
      ) as DashState["tileOrder"],
    });
    setSavedFlash(true);
  };

  return (
    <div className="pds-tweaks" role="dialog" aria-label={t(lang, "dashboard.tweaks.title")}>
      <h3>
        {t(lang, "dashboard.tweaks.title")}
        <button type="button" className="close" onClick={onClose} aria-label={t(lang, "common.close")}>
          <X />
        </button>
      </h3>

      <div className="sec">
        <h4>{t(lang, "dashboard.tweaks.mode")}</h4>
        <div className="row">
          <label>{t(lang, "dashboard.tweaks.editMode")}</label>
          <button
            type="button"
            className={`pds-sw${state.editMode ? " on" : ""}`}
            onClick={toggleEdit}
            aria-pressed={state.editMode}
            aria-label={t(lang, "dashboard.tweaks.editMode")}
          />
        </div>
        <div className="row">
          <label>{t(lang, "dashboard.tweaks.density")}</label>
          <select
            value={state.density}
            onChange={(e) => setDensity(e.target.value as Density)}
          >
            <option value="compact">{t(lang, "dashboard.tweaks.density.compact")}</option>
            <option value="comfy">{t(lang, "dashboard.tweaks.density.comfy")}</option>
            <option value="spacious">{t(lang, "dashboard.tweaks.density.spacious")}</option>
          </select>
        </div>
      </div>

      <div className="sec">
        <h4>{t(lang, "dashboard.tweaks.tiles")}</h4>
        {TILE_KEYS.map(({ id, labelKey }) => {
          const on = !state.hidden.includes(id);
          return (
            <div className="row" key={id}>
              <label>
                <span className="dot" />
                {t(lang, labelKey)}
              </label>
              <button
                type="button"
                className={`pds-sw${on ? " on" : ""}`}
                onClick={() => toggleTile(id)}
                aria-pressed={on}
                aria-label={t(lang, labelKey)}
              />
            </div>
          );
        })}
      </div>

      <div className="sec">
        <h4>{t(lang, "dashboard.tweaks.taskFilter")}</h4>
        <div className="row">
          <label>{t(lang, "dashboard.tweaks.hideDone")}</label>
          <button
            type="button"
            className={`pds-sw${state.hideDone ? " on" : ""}`}
            onClick={toggleHideDone}
            aria-pressed={state.hideDone}
            aria-label={t(lang, "dashboard.tweaks.hideDone")}
          />
        </div>
      </div>

      <div className="actions">
        <button type="button" className="act-btn" onClick={resetAll}>
          {t(lang, "dashboard.tweaks.reset")}
        </button>
        <button type="button" className="act-btn p">
          {savedFlash ? `${t(lang, "dashboard.tweaks.saved")} ✓` : t(lang, "dashboard.tweaks.saved")}
        </button>
      </div>
    </div>
  );
}
