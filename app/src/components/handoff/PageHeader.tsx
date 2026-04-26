import type { ReactNode } from "react";

type KpiTone = "default" | "warn" | "gold";

export interface HandoffKpi {
  id: string;
  label: string;
  value: string;
  trend?: string;
  tone?: KpiTone;
  trendTone?: "default" | "warn";
}

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  sub?: string;
  actions?: ReactNode;
  kpis?: HandoffKpi[];
}

export function PageHeader({ eyebrow, title, sub, actions, kpis = [] }: PageHeaderProps) {
  return (
    <section className="page-header">
      <div className="ph-top">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h1 className="ph-title">{title}</h1>
          {sub ? <p className="ph-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="ph-actions">{actions}</div> : null}
      </div>
      {kpis.length > 0 ? (
        <div className="ph-kpis">
          {kpis.map((kpi) => (
            <article key={kpi.id} className="ph-kpi">
              <div className="ph-k-label">{kpi.label}</div>
              <div className={`ph-k-value${kpi.tone === "gold" ? " gold" : ""}`}>{kpi.value}</div>
              {kpi.trend ? (
                <div className={`ph-k-trend${kpi.trendTone === "warn" ? " warn" : ""}`}>{kpi.trend}</div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
