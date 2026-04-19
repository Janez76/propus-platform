import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface KpiCardV2Props {
  label: string;
  value: string;
  sublabel?: ReactNode;
  delta?: string;
  deltaDir?: "up" | "down" | "neutral";
  icon: LucideIcon;
  children?: ReactNode;
}

export function KpiCardV2({ label, value, sublabel, delta, deltaDir, icon: Icon, children }: KpiCardV2Props) {
  return (
    <div className="dv2-kpi">
      <div className="dv2-kpi-top">
        <div className="dv2-kpi-label">
          <Icon size={11} className="dv2-kpi-label-icon" />
          {label}
        </div>
        {delta && (
          <div className={`dv2-kpi-delta dv2-kpi-delta--${deltaDir ?? "neutral"}`}>
            {deltaDir === "up" && <TrendingUp size={11} />}
            {deltaDir === "down" && <TrendingDown size={11} />}
            {delta}
          </div>
        )}
      </div>
      <div className="dv2-kpi-value-row">
        <div className="dv2-kpi-value">{value}</div>
        {sublabel && <div className="dv2-kpi-sublabel">{sublabel}</div>}
      </div>
      <div className="dv2-kpi-chart">{children}</div>
    </div>
  );
}
