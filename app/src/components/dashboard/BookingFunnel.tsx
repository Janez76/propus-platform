import { GripVertical } from "lucide-react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

interface FunnelRow {
  labelKey: string;
  count: number;
}

interface BookingFunnelProps {
  inquiries: number;
  offers: number;
  confirmed: number;
  completed: number;
}

export function BookingFunnel({ inquiries, offers, confirmed, completed }: BookingFunnelProps) {
  const lang = useAuthStore((s) => s.language);
  const rows: FunnelRow[] = [
    { labelKey: "dashboard.funnel.inquiries", count: inquiries },
    { labelKey: "dashboard.funnel.offers", count: offers },
    { labelKey: "dashboard.funnel.confirmed", count: confirmed },
    { labelKey: "dashboard.funnel.completed", count: completed },
  ];

  const base = Math.max(inquiries, 1);

  return (
    <div className="pds-panel" data-tile="funnel">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="pds-panel-head">
        <div>
          <h2>{t(lang, "dashboard.funnel.title")}</h2>
          <div className="sub">{t(lang, "dashboard.funnel.subtitle")}</div>
        </div>
      </div>
      <div className="pds-funnel">
        {rows.map(({ labelKey, count }) => {
          const pct = Math.round((count / base) * 100);
          return (
            <div className="row" key={labelKey}>
              <span className="lbl">{t(lang, labelKey)}</span>
              <span className="bar" style={{ width: `${Math.max(pct, 8)}%` }}>{count}</span>
              <span className="pct">{pct} %</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
