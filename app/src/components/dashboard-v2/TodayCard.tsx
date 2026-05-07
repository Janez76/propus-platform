'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import type { Lang } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { getWeatherForecast, weatherEmoji, weatherLabel, type WeatherForecastDay } from '../../api/weather';
import type { DashboardMetrics } from './useDashboardMetrics';
import type { Order } from '../../api/orders';

const WEEKDAY_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

interface TodayCardProps {
  metrics: DashboardMetrics;
  lang: Lang;
  onHover?: (orderNo: string | null) => void;
}

function formatTime(isoStr: string | undefined | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
}

function shortAddress(addr: string | undefined | null): string {
  if (!addr) return '—';
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0] ?? addr;
}

export function TodayCard({ metrics, onHover }: TodayCardProps) {
  const token = useAuthStore((s) => s.token);
  const [weather, setWeather] = useState<WeatherForecastDay[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getWeatherForecast(token, { days: 7, region: 'zurich' })
      .then((res) => { if (!cancelled) setWeather(res.days.slice(0, 7)); })
      .catch(() => { if (!cancelled) setWeather([]); });
    return () => { cancelled = true; };
  }, [token]);

  const today = metrics.today;
  const dom = today.getDate();
  const month = MONTH_DE[today.getMonth()];
  const year = today.getFullYear();
  const weekday = WEEKDAY_DE[today.getDay()];
  const todayOrders: Order[] = metrics.todayOrders;
  const todayDateStr = today.toDateString();

  return (
    <section className="dv2-today-card">
      <header className="dv2-today-head">
        <div className="dv2-today-eyebrow">
          <span className="dv2-today-eyebrow-line" /> Heute
        </div>
        <div className="dv2-today-date">
          <span className="dv2-today-dom">{dom}</span>
          <span className="dv2-today-monyear">
            <span className="dv2-today-month">{month}</span>
            <span className="dv2-today-year">{year} · {weekday}</span>
          </span>
        </div>
      </header>

      {/* 7-Tage Wetter-Strip */}
      <div className="dv2-today-weather" role="list" aria-label="7-Tage-Wetter Zürich">
        {weather === null && Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="dv2-today-wcell dv2-today-wcell--skeleton" aria-hidden />
        ))}
        {weather?.map((day, i) => {
          const d = new Date(day.date);
          const isToday = d.toDateString() === todayDateStr;
          return (
            <div
              key={day.date}
              role="listitem"
              className="dv2-today-wcell"
              data-today={isToday || undefined}
              title={`${WEEKDAY_DE[d.getDay()]} ${d.getDate()}. · ${weatherLabel(day.kind)} · ${day.t_min}°–${day.t_max}°`}
            >
              <span className="dv2-today-wcell-day">{isToday ? 'Heute' : WEEKDAY_DE[d.getDay()]}</span>
              <span className="dv2-today-wcell-emoji" aria-hidden>{weatherEmoji(day.kind)}</span>
              <span className="dv2-today-wcell-temp">{day.t_max}°</span>
            </div>
          );
        })}
      </div>

      {/* Timeline der heutigen Termine */}
      <div className="dv2-today-timeline">
        <div className="dv2-today-timeline-head">
          <Calendar size={12} aria-hidden />
          <span>Termine heute</span>
          <span className="dv2-today-timeline-count">{todayOrders.length}</span>
        </div>
        {todayOrders.length === 0 ? (
          <div className="dv2-today-timeline-empty">Keine Termine heute. ☕</div>
        ) : (
          <ul className="dv2-today-timeline-list">
            {todayOrders.map((o) => (
              <li
                key={String(o.orderNo)}
                className="dv2-today-tl-item"
                onMouseEnter={() => onHover?.(String(o.orderNo))}
                onMouseLeave={() => onHover?.(null)}
              >
                <span className="dv2-today-tl-time">
                  <Clock size={10} aria-hidden /> {formatTime(o.appointmentDate)}
                </span>
                <span className="dv2-today-tl-main">
                  <span className="dv2-today-tl-no">#{o.orderNo}</span>
                  <span className="dv2-today-tl-addr">
                    <MapPin size={10} aria-hidden /> {shortAddress(o.address)}
                  </span>
                </span>
                <span className="dv2-today-tl-photog">
                  {o.photographer?.name ?? <em>—</em>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
