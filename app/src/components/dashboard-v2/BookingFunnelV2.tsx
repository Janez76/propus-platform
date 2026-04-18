import { t, type Lang } from "../../i18n";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface BookingFunnelV2Props {
  metrics: DashboardMetrics;
  lang: Lang;
}

export function BookingFunnelV2({ metrics, lang }: BookingFunnelV2Props) {
  const { funnelInquiries, funnelOffers, funnelConfirmed, funnelCompleted } = metrics;

  const stages = [
    { labelKey: "dashboardV2.funnel.inquiries", value: funnelInquiries },
    { labelKey: "dashboardV2.funnel.offers", value: funnelOffers },
    { labelKey: "dashboardV2.funnel.confirmed", value: funnelConfirmed },
    { labelKey: "dashboardV2.funnel.completed", value: funnelCompleted },
  ];

  const top = Math.max(funnelInquiries, 1);
  const convPct = Math.round((funnelCompleted / top) * 100);

  return (
    <div className="dv2-card">
      <div className="dv2-card-title">{t(lang, "dashboardV2.funnel.title")}</div>
      <div className="dv2-card-eyebrow">
        {t(lang, "dashboardV2.funnel.subtitle").replace("{{pct}}", String(convPct))}
      </div>
      <div className="dv2-funnel">
        {stages.map((s, i) => {
          const pct = Math.round((s.value / top) * 100);
          const next = stages[i + 1];
          const drop = next ? s.value - next.value : null;
          const dropPct = next && s.value > 0 ? Math.round((drop! / s.value) * 100) : null;
          return (
            <div key={s.labelKey} className="dv2-funnel-stage">
              <div className="dv2-funnel-row">
                <span className="dv2-funnel-label">{t(lang, s.labelKey)}</span>
                <span className="dv2-funnel-count">
                  {s.value} · {pct}&thinsp;%
                </span>
              </div>
              <div className="dv2-funnel-bar-wrap">
                <div className="dv2-funnel-bar" style={{ width: `${pct}%` }} />
              </div>
              {drop !== null && drop > 0 && dropPct !== null && (
                <div className="dv2-funnel-drop">
                  {t(lang, "dashboardV2.funnel.drop")
                    .replace("{{delta}}", String(drop))
                    .replace("{{pct}}", String(dropPct))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
