import { AlertTriangle, UserPlus, Receipt, Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { t, type Lang } from "../../i18n";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface DashAlertsProps {
  metrics: DashboardMetrics;
  lang: Lang;
}

interface AlertChipProps {
  icon: React.ComponentType<{ size?: number }>;
  count: number | string;
  label: string;
  tone?: "danger";
  onClick?: () => void;
}

function AlertChip({ icon: Icon, count, label, tone, onClick }: AlertChipProps) {
  const cls = `dv2-dash-alert${tone ? ` dv2-dash-alert--${tone}` : ""}${onClick ? " is-clickable" : ""}`;
  const Tag = onClick ? "button" : "span";
  return (
    <Tag type={onClick ? "button" : undefined} className={cls} onClick={onClick}>
      <Icon size={14} />
      <span className="dv2-dash-alert-num">{count}</span>
      <span className="dv2-dash-alert-label">{label}</span>
    </Tag>
  );
}

export function DashAlerts({ metrics, lang }: DashAlertsProps) {
  const navigate = useNavigate();
  const items: AlertChipProps[] = [];

  if (metrics.overdueCount > 0) {
    items.push({
      icon: AlertTriangle,
      count: metrics.overdueCount,
      label: t(lang, "dashboardV2.dashAlert.overdue"),
      tone: "danger",
      onClick: () => navigate("/orders?status=pending&overdue=1"),
    });
  }

  if (metrics.withoutStaffCount > 0) {
    items.push({
      icon: UserPlus,
      count: metrics.withoutStaffCount,
      label: t(lang, "dashboardV2.dashAlert.withoutStaff"),
      onClick: () => navigate("/orders?withoutStaff=1"),
    });
  }

  if (metrics.invoicesToCreate > 0) {
    items.push({
      icon: Receipt,
      count: metrics.invoicesToCreate,
      label: t(lang, "dashboardV2.dashAlert.invoicesToCreate"),
      onClick: () => navigate("/admin/invoices?type=exxas&status=open"),
    });
  }

  items.push({
    icon: Flame,
    count: `${metrics.currentCapacity}%`,
    label: t(lang, "dashboardV2.dashAlert.capacity").replace("{{kw}}", String(metrics.currentKW)),
  });

  if (items.length === 0) return null;

  return (
    <div className="dv2-dash-alerts">
      {items.map((it, i) => (
        <AlertChip key={i} {...it} />
      ))}
    </div>
  );
}
