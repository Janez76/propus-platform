import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { WeatherForecastDay, WeatherKind } from "../../api/weather";
import { weatherEmoji, weatherLabel } from "../../api/weather";

const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ISO-8601 Kalenderwoche (Montag-basiert). */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThuDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstThuDay + 3);
  return 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

/** Sehr dezenter Hintergrund-Tint je Wetterart — Tageszahl & Termin-Count sollen lesbar bleiben. */
const BG_BY_KIND: Record<WeatherKind, string> = {
  sun: "#FCF3DC",
  psun: "#F8EDCC",
  cloud: "#EFEBDD",
  rain: "#E6ECF2",
  storm: "#DDD6E6",
  fog: "#EFEDE5",
  snow: "#F6F4EE",
};

type Props = {
  anchor: Date;
  onChangeAnchor: (d: Date) => void;
  onPickDay: (dateIso: string) => void;
  /** YYYY-MM-DD → Anzahl Termine an dem Tag. */
  eventCounts: ReadonlyMap<string, number>;
  /** Optional: YYYY-MM-DD → Wettervorhersage. */
  forecastByDate?: ReadonlyMap<string, WeatherForecastDay> | null;
  /** Aktuell selektierter Tag (YYYY-MM-DD). */
  selectedDateIso?: string | null;
};

/**
 * Wetter-Grid (Handoff): KW-Zeilen × Mo–So-Spalten.
 * Jede Zelle: Wetter-Emoji + (optional) Termin-Count, Hintergrund je Wetterart getintet.
 * Heute = goldener Rahmen.
 */
export function CalMiniMonth({
  anchor,
  onChangeAnchor,
  onPickDay,
  eventCounts,
  forecastByDate,
  selectedDateIso,
}: Props) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const today = new Date();
  const todayIso = isoDate(today);

  const head = new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" }).format(anchor);

  type Cell = { date: Date; iso: string; inMonth: boolean } | null;
  const cells: Cell[] = [];
  for (let i = 0; i < startPad; i += 1) {
    const d = new Date(y, m, 1 - (startPad - i));
    cells.push({ date: d, iso: isoDate(d), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(y, m, day);
    cells.push({ date: d, iso: isoDate(d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const base = last ? last.date : new Date(y, m + 1, 0);
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
    cells.push({ date: d, iso: isoDate(d), inMonth: false });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    const base = last ? last.date : new Date(y, m + 1, 0);
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
    cells.push({ date: d, iso: isoDate(d), inMonth: false });
  }
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

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
          <button type="button" onClick={() => onChangeAnchor(new Date())}>
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

      <div className="cal-mini-wx-grid">
        <div className="cal-mini-wx-corner" />
        {DOW.map((d) => (
          <div key={d} className="cal-mini-wx-dow">
            {d}
          </div>
        ))}
        {weeks.map((week, wi) => {
          const weekRef = week.find((c) => c)?.date ?? new Date(y, m, 1);
          const kw = isoWeek(weekRef);
          return (
            <div key={`row-${wi}`} className="contents">
              <div className="cal-mini-wx-kw">
                <span>KW{pad2(kw)}</span>
              </div>
              {week.map((cell, di) => {
                if (!cell) return <div key={`x-${wi}-${di}`} className="cal-mini-wx-cell is-empty" />;
                const fc = forecastByDate?.get(cell.iso);
                const count = eventCounts.get(cell.iso) ?? 0;
                const isToday = cell.iso === todayIso;
                const isSelected = selectedDateIso === cell.iso;
                const dim = !cell.inMonth;
                const bg = fc ? BG_BY_KIND[fc.kind] : undefined;
                const style: CSSProperties = bg
                  ? { backgroundColor: bg, opacity: dim ? 0.45 : 1 }
                  : { opacity: dim ? 0.45 : 1 };
                const tip = fc
                  ? `${cell.iso} · ${weatherLabel(fc.kind)} · ${fc.t_max}°/${fc.t_min}° · ${fc.precip}% · ${count} Termin${count === 1 ? "" : "e"}`
                  : `${cell.iso} · ${count} Termin${count === 1 ? "" : "e"}`;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    className={
                      "cal-mini-wx-cell" +
                      (isToday ? " is-today" : "") +
                      (isSelected ? " is-selected" : "") +
                      (count > 0 ? " has-events" : "")
                    }
                    style={style}
                    title={tip}
                    aria-label={tip}
                    onClick={() => onPickDay(cell.iso)}
                  >
                    <span className="cal-mini-wx-day">{cell.date.getDate()}</span>
                    {fc ? (
                      <span className="cal-mini-wx-emoji" aria-hidden>
                        {weatherEmoji(fc.kind)}
                      </span>
                    ) : null}
                    {count > 0 ? <span className="cal-mini-wx-count">{count}</span> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
