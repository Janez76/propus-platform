import { t, type Lang } from "../../i18n";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface HeatmapV2Props {
  metrics: DashboardMetrics;
  lang: Lang;
}

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function intensity(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  const ratio = count / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

export function HeatmapV2({ metrics, lang }: HeatmapV2Props) {
  const { heatmapData, maxDayCount, daysInMonth, firstDayOfWeek, currMonth, currYear, today } = metrics;
  const todayDay = today.getMonth() === currMonth && today.getFullYear() === currYear ? today.getDate() : -1;

  const cells: Array<{ day: number | null; lvl: 0 | 1 | 2 | 3 | 4 }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null, lvl: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, lvl: intensity(heatmapData[d] ?? 0, maxDayCount) });
  }

  return (
    <div className="dv2-card">
      <div className="dv2-card-title">{t(lang, "dashboardV2.heatmap.title")}</div>
      <div className="dv2-card-eyebrow">
        {MONTHS[currMonth]} {currYear} · {t(lang, "dashboardV2.heatmap.subtitle")}
      </div>
      <div className="dv2-heatmap-dow">
        {DOW.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="dv2-heatmap-grid">
        {cells.map((c, i) =>
          c.day === null ? (
            <div key={`pad-${i}`} className="dv2-heatmap-cell dv2-heatmap-cell--empty" />
          ) : (
            <div
              key={c.day}
              className={[
                "dv2-heatmap-cell",
                `dv2-heatmap-cell--l${c.lvl}`,
                c.day === todayDay ? "dv2-heatmap-cell--today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {c.day}
            </div>
          ),
        )}
      </div>
      <div className="dv2-heatmap-legend">
        <span>{t(lang, "dashboardV2.heatmap.low")}</span>
        {([0.15, 0.35, 0.6, 0.85] as const).map((o) => (
          <span key={o} className="dv2-heatmap-legend-dot" style={{ opacity: o }} />
        ))}
        <span>{t(lang, "dashboardV2.heatmap.high")}</span>
      </div>
    </div>
  );
}
