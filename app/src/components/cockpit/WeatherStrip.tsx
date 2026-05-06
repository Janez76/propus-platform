'use client';

import { useEffect, useMemo, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { getWeatherForecast, weatherEmoji, weatherLabel, type WeatherForecastDay } from '../../api/weather';
import { useAuthStore } from '../../store/authStore';

const WEEKDAY_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

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

  return (
    <div className="propus-weather-strip" role="list" aria-label="7-Tage-Wettervorhersage Zürich">
      {data.map((day, i) => {
        const d = new Date(day.date);
        const isToday = d.toDateString() === today.toDateString();
        const weekday = WEEKDAY_DE[d.getDay()];
        const dom = d.getDate();
        return (
          <div
            key={day.date}
            role="listitem"
            className="propus-weather-day"
            data-today={isToday || undefined}
            title={`${weekday} ${dom}. · ${weatherLabel(day.kind)} · ${day.t_min}°–${day.t_max}°${day.precip > 0 ? ` · ${day.precip}% Regen` : ''}`}
          >
            <span className="propus-weather-day-label">{i === 0 ? 'Heute' : weekday}</span>
            <span className="propus-weather-day-emoji" aria-hidden>{weatherEmoji(day.kind)}</span>
            <span className="propus-weather-day-temp">{day.t_max}°</span>
          </div>
        );
      })}
    </div>
  );
}
