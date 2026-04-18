import { GripVertical } from "lucide-react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import type { Order } from "../../api/orders";

interface CalendarHeatmapProps {
  orders: Order[];
}

const DOW_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

export function CalendarHeatmap({ orders }: CalendarHeatmapProps) {
  const lang = useAuthStore((s) => s.language);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-start: Sunday (0) becomes 6, others shift by -1
  const firstDow = (firstOfMonth.getDay() + 6) % 7;

  const counts: Record<number, number> = {};
  for (const order of orders) {
    if (!order.appointmentDate) continue;
    const d = new Date(order.appointmentDate);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    counts[day] = (counts[day] || 0) + 1;
  }

  const cells: { key: string; content: string; classes: string }[] = [];
  for (let i = 0; i < firstDow; i++) {
    const prevDay = new Date(year, month, 0 - (firstDow - 1 - i)).getDate();
    cells.push({ key: `out-${i}`, content: String(prevDay), classes: "d out" });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const lvl = levelFor(counts[day] || 0);
    const isToday = day === now.getDate();
    cells.push({
      key: `d-${day}`,
      content: String(day),
      classes: `d l${lvl}${isToday ? " today" : ""}`,
    });
  }

  const monthLabel = now.toLocaleDateString(lang === "de" ? "de-CH" : lang, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pds-panel" data-tile="heatmap">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="pds-panel-head">
        <div>
          <h2>{t(lang, "dashboard.heatmap.title")}</h2>
          <div className="sub">{monthLabel} · {t(lang, "dashboard.heatmap.utilization")}</div>
        </div>
      </div>
      <div className="pds-cal">
        {DOW_KEYS.map((k) => (
          <div key={k} className="dow">{t(lang, `dashboard.heatmap.dow.${k}`)}</div>
        ))}
        {cells.map((c) => (
          <div key={c.key} className={`pds-cal-cell ${c.classes}`}>{c.content}</div>
        ))}
      </div>
      <div className="pds-cal-legend">
        {t(lang, "dashboard.heatmap.few")}
        <span style={{ background: "var(--paper-strip)" }} />
        <span style={{ background: "#EFE4CF" }} />
        <span style={{ background: "#DCC49A" }} />
        <span style={{ background: "#C5A073" }} />
        <span style={{ background: "#141413" }} />
        {t(lang, "dashboard.heatmap.full")}
      </div>
    </div>
  );
}
