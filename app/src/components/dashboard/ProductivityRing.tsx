import { CheckCircle, Clock, GripVertical, Zap } from "lucide-react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

interface ProductivityRingProps {
  score: number;
  tasksDone: number;
  tasksTotal: number;
  avgResponse: string;
  onTimePct: number;
  slotFillPct: number;
  weekLabel: string;
}

export function ProductivityRing({
  score,
  tasksDone,
  tasksTotal,
  avgResponse,
  onTimePct,
  slotFillPct,
  weekLabel,
}: ProductivityRingProps) {
  const lang = useAuthStore((s) => s.language);
  const circumference = 2 * Math.PI * 17;
  const filled = Math.max(0, Math.min(100, slotFillPct));
  const dash = (filled / 100) * circumference;

  return (
    <div className="pds-prod" data-tile="productivity">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="pds-prod-head">
        <h3>{t(lang, "dashboard.productivity.title")}</h3>
        <span className="pds-prod-score">
          {t(lang, "dashboard.productivity.score")}: <b>{score}</b>/100
        </span>
      </div>
      <div className="pds-prod-ring">
        <svg viewBox="0 0 42 42" aria-hidden="true">
          <circle cx="21" cy="21" r="17" fill="transparent" stroke="var(--paper-strip)" strokeWidth="4" />
          <circle
            cx="21"
            cy="21"
            r="17"
            fill="transparent"
            stroke="var(--gold-600)"
            strokeWidth="4"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="lbl">
          <strong>{Math.round(filled)}%</strong>
          <span>{t(lang, "dashboard.productivity.slots").replace("{{week}}", weekLabel)}</span>
        </div>
      </div>
      <div className="pds-prod-rows">
        <div className="pds-prod-row">
          <span className="l"><CheckCircle />{t(lang, "dashboard.productivity.tasksDone")}</span>
          <b>{tasksDone} / {tasksTotal}</b>
        </div>
        <div className="pds-prod-row">
          <span className="l"><Clock />{t(lang, "dashboard.productivity.avgResponse")}</span>
          <b>{avgResponse}</b>
        </div>
        <div className="pds-prod-row">
          <span className="l"><Zap />{t(lang, "dashboard.productivity.onTime")}</span>
          <b>{onTimePct.toFixed(1)} %</b>
        </div>
      </div>
    </div>
  );
}
