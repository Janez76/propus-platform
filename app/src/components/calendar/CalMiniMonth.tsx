import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

type Props = {
  anchor: Date;
  onChangeAnchor: (d: Date) => void;
  onPickDay: (dateIso: string) => void;
  /** YYYY-MM-DD Tage, an denen laut Backend Events liegen (gefiltert). */
  eventDayKeys: Set<string>;
};

export function CalMiniMonth({ anchor, onChangeAnchor, onPickDay, eventDayKeys }: Props) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7; // Woche beginnt Montag
  const today = new Date();

  const head = new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" }).format(anchor);

  const days: (number | null)[] = [];
  for (let i = 0; i < startPad; i += 1) days.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  while (days.length < 42) days.push(null);

  return (
    <div className="cal-mini">
      <div className="cal-mini-head">
        <strong title={head}>{head}</strong>
        <div className="cal-mini-nav">
          <button
            type="button"
            onClick={() => onChangeAnchor(new Date(y, m - 1, 1))}
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeAnchor(new Date())}
          >
            Heute
          </button>
          <button
            type="button"
            onClick={() => onChangeAnchor(new Date(y, m + 1, 1))}
            aria-label="Nächster Monat"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="cal-mini-grid">
        {DOW.map((d) => (
          <div key={d} className="cal-mini-dow">
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          if (d == null) {
            return <div key={`e-${i}`} className="cal-mini-day" />;
          }
          const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
          const key = `${y}-${pad2(m + 1)}-${pad2(d)}`;
          const hasDot = eventDayKeys.has(key);
          return (
            <button
              key={key}
              type="button"
              className={`cal-mini-day${isToday ? " today" : ""}`}
              onClick={() => onPickDay(key)}
            >
              {d}
              {hasDot ? <span className="cal-mini-dot" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
