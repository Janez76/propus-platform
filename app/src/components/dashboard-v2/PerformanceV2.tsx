import { Circle } from "lucide-react";
import { t, type Lang } from "../../i18n";
import { formatCHF } from "../../lib/format";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface PerformanceV2Props {
  metrics: DashboardMetrics;
  lang: Lang;
}

export function PerformanceV2({ metrics, lang }: PerformanceV2Props) {
  const { onTimePct, avgOrderValue, weekDone, weekTotal, currentKW } = metrics;

  const rows: { label: string; value: string; warn?: boolean }[] = [
    {
      label: t(lang, "dashboardV2.perf.tasksDone"),
      value: `${weekDone} / ${weekTotal}`,
    },
    {
      label: t(lang, "dashboardV2.perf.responseTime"),
      value: "—",
    },
    {
      label: t(lang, "dashboardV2.perf.onTimeDelivery"),
      value: onTimePct !== null ? `${onTimePct} %` : "—",
      warn: onTimePct !== null && onTimePct < 80,
    },
    {
      label: t(lang, "dashboardV2.perf.avgOrderValue"),
      value: avgOrderValue !== null ? formatCHF(avgOrderValue) : "—",
    },
    {
      label: t(lang, "dashboardV2.perf.revisions"),
      value: "—",
    },
  ];

  return (
    <div className="dv2-card">
      <div className="dv2-card-title">
        {t(lang, "dashboardV2.perf.title").replace("{{kw}}", String(currentKW))}
      </div>
      <div className="dv2-card-eyebrow">{t(lang, "dashboardV2.perf.subtitle")}</div>
      <div className="dv2-perf-rows">
        {rows.map((r, i) => (
          <div key={i} className={`dv2-perf-row${i < rows.length - 1 ? " dv2-perf-row--border" : ""}`}>
            <div className="dv2-perf-label">
              {r.warn && <Circle size={6} className="dv2-perf-warn" />}
              {r.label}
            </div>
            <div className={`dv2-perf-value${r.warn ? " dv2-perf-value--warn" : ""}`}>{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
