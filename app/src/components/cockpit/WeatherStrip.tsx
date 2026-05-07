'use client';

import { useEffect, useMemo, useState } from 'react';
import { CloudOff, X } from 'lucide-react';
import {
  getWeatherForecast,
  getWeatherHourly,
  weatherEmoji,
  weatherLabel,
  type WeatherForecastDay,
  type WeatherHourlyEntry,
} from '../../api/weather';
import { useAuthStore } from '../../store/authStore';
import './cockpit-panes.css';

const WEEKDAY_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WEEKDAY_FULL_DE = [
  'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag',
];
const MONTHS_SHORT_DE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

interface WeatherStripProps {
  /** Region key, default "zurich" */
  region?: string;
  /** Number of days to show, default 7 */
  days?: number;
}

export function WeatherStrip({ region = 'zurich', days = 7 }: WeatherStripProps) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<WeatherForecastDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getWeatherForecast(token, { days, region })
      .then((res) => {
        if (cancelled) return;
        setData(res.days.slice(0, days));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setData([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, days, region]);

  const today = useMemo(() => new Date(), []);

  if (error && (!data || data.length === 0)) {
    return (
      <div className="propus-weather-strip propus-weather-strip--error" role="status">
        <CloudOff size={14} aria-hidden /> <span>Wetter nicht verfügbar</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="propus-weather-strip propus-weather-strip--loading" aria-busy="true">
        {Array.from({ length: days }).map((_, i) => (
          <div key={i} className="propus-weather-day propus-weather-day--skeleton" />
        ))}
      </div>
    );
  }

  const openDayMeta = openDate ? data.find((d) => d.date === openDate) ?? null : null;

  return (
    <div className="propus-weather-strip-wrap">
      <div className="propus-weather-strip" role="list" aria-label="7-Tage-Wettervorhersage Zürich">
        {data.map((day) => {
          const d = new Date(day.date);
          const isToday = d.toDateString() === today.toDateString();
          const weekday = WEEKDAY_DE[d.getDay()];
          const dom = d.getDate();
          const open = openDate === day.date;
          return (
            <button
              key={day.date}
              type="button"
              role="listitem"
              className="propus-weather-day"
              data-today={isToday || undefined}
              data-open={open || undefined}
              onClick={() => setOpenDate(open ? null : day.date)}
              aria-expanded={open}
              title={`${weekday} ${dom}. · ${weatherLabel(day.kind)} · ${day.t_min}°–${day.t_max}°${day.precip > 0 ? ` · ${day.precip}% Regen` : ''} — Klicken für Stundenansicht`}
            >
              <span className="propus-weather-day-label">{isToday ? 'Heute' : weekday}</span>
              <span className="propus-weather-day-emoji" aria-hidden>{weatherEmoji(day.kind)}</span>
              <span className="propus-weather-day-temp">{day.t_max}°</span>
            </button>
          );
        })}
      </div>
      {openDate ? (
        <HourlyPanel
          date={openDate}
          region={region}
          dayMeta={openDayMeta}
          onClose={() => setOpenDate(null)}
        />
      ) : null}
    </div>
  );
}

export interface HourlyPanelProps {
  date: string;
  /** Region-Key (z. B. "zurich") ODER lat+lng — letzteres hat Vorrang. */
  region?: string;
  lat?: number;
  lng?: number;
  dayMeta: WeatherForecastDay | null;
  onClose: () => void;
}

export function HourlyPanel({ date, region, lat, lng, dayMeta, onClose }: HourlyPanelProps) {
  const token = useAuthStore((s) => s.token);
  const [hours, setHours] = useState<WeatherHourlyEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setHours(null);
    setError(null);
    getWeatherHourly(token, { date, region, lat, lng })
      .then((res) => {
        if (cancelled) return;
        setHours(res.hours);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, date, region, lat, lng]);

  const d = new Date(`${date}T00:00:00`);
  const wd = WEEKDAY_FULL_DE[d.getDay()];
  const dom = d.getDate();
  const month = MONTHS_SHORT_DE[d.getMonth()];

  return (
    <section className="propus-weather-hourly" aria-label={`Stunden-Vorhersage ${wd}, ${dom}. ${month}`}>
      <header className="propus-weather-hourly-head">
        <span className="propus-weather-hourly-title">
          {wd}, {dom}. {month}
          {dayMeta ? (
            <em className="propus-weather-hourly-sub">
              · {weatherLabel(dayMeta.kind)} · {dayMeta.t_min}°–{dayMeta.t_max}°
            </em>
          ) : null}
        </span>
        <button
          type="button"
          className="propus-weather-hourly-close"
          onClick={onClose}
          aria-label="Stundenansicht schliessen"
        >
          <X size={14} aria-hidden />
        </button>
      </header>
      {error ? (
        <div className="propus-weather-hourly-error" role="status">
          <CloudOff size={12} aria-hidden /> Stundenwerte nicht verfügbar
        </div>
      ) : null}
      {!hours && !error ? (
        <div className="propus-weather-hourly-loading" aria-busy="true">Laden…</div>
      ) : null}
      {hours && hours.length > 0 ? (
        <ol className="propus-weather-hourly-list" role="list">
          {hours.map((h) => {
            const hh = h.time.slice(11, 16);
            return (
              <li key={h.time} className="propus-weather-hourly-cell" role="listitem">
                <span className="propus-weather-hourly-time">{hh}</span>
                <span className="propus-weather-hourly-emoji" aria-hidden>{weatherEmoji(h.kind)}</span>
                <span className="propus-weather-hourly-temp">{h.t}°</span>
                <span className="propus-weather-hourly-precip" data-active={h.precip >= 30 || undefined}>
                  {h.precip}%
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {hours && hours.length === 0 && !error ? (
        <div className="propus-weather-hourly-empty">Keine Stundenwerte für diesen Tag.</div>
      ) : null}
    </section>
  );
}
