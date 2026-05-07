'use client';

import { useMemo } from 'react';
import { Calendar, Clock, MapPin, Car, Banknote, CheckCircle2 } from 'lucide-react';
import type { Lang } from '../../i18n';
import { weatherEmoji, weatherLabel, type WeatherForecastDay } from '../../api/weather';
import type { DashboardMetrics } from './useDashboardMetrics';
import { buildMissionTimeline, type MissionStatus } from './missionTimeline';
import { formatCHF } from '../../lib/format';
import { useNow } from '../../hooks/useNow';

const WEEKDAY_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

interface TodayCardProps {
  metrics: DashboardMetrics;
  lang: Lang;
  onHover?: (orderNo: string | null) => void;
  /** Sprint 17: Wetter wird vom Parent (DashboardV2) durchgereicht — kein eigener Fetch mehr,
   *  damit `BriefingCard` und `TodayCard` denselben Cache teilen. */
  weather?: WeatherForecastDay[] | null;
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

const STATUS_LABEL: Record<MissionStatus, string> = {
  done: 'Erledigt',
  next: 'Nächster',
  planned: 'Geplant',
  todo: 'To-Do',
};

export function TodayCard({ metrics, onHover, weather = null }: TodayCardProps) {
  const now = useNow();
  const today = metrics.today;
  const dom = today.getDate();
  const month = MONTH_DE[today.getMonth()];
  const year = today.getFullYear();
  const weekday = WEEKDAY_DE[today.getDay()];
  const todayOrders = metrics.todayOrders;
  const todayDateStr = today.toDateString();
  const missions = useMemo(() => buildMissionTimeline(todayOrders, now), [todayOrders, now]);
  const todayWeather = useMemo(
    () => weather?.find((d) => new Date(d.date).toDateString() === todayDateStr) ?? null,
    [weather, todayDateStr],
  );

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

      {/* Mission-Control-Timeline der heutigen Termine */}
      <div className="dv2-today-timeline">
        <div className="dv2-today-timeline-head">
          <Calendar size={12} aria-hidden />
          <span>Termine heute</span>
          <span className="dv2-today-timeline-count">{todayOrders.length}</span>
        </div>
        {missions.length === 0 ? (
          <div className="dv2-today-timeline-empty">Keine Termine heute. ☕</div>
        ) : (
          <ul className="dv2-today-timeline-list">
            {missions.map((m) => {
              const o = m.order;
              const wxEmoji = todayWeather ? weatherEmoji(todayWeather.kind) : null;
              const wxTitle = todayWeather
                ? `${weatherLabel(todayWeather.kind)} · ${todayWeather.t_min}°–${todayWeather.t_max}°`
                : undefined;
              return (
                <li
                  key={String(o.orderNo)}
                  className="dv2-today-tl-item"
                  data-status={m.status}
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
                    <span className="dv2-today-tl-pills">
                      {typeof o.total === 'number' && o.total > 0 ? (
                        <span className="dv2-today-pill" title="Auftragsvolumen brutto">
                          <Banknote size={10} aria-hidden /> {formatCHF(o.total)}
                        </span>
                      ) : null}
                      {m.driveMinFromPrev !== null ? (
                        <span className="dv2-today-pill" title="Geschätzte Anfahrt vom letzten Stopp (28 km/h Stadt-Schnitt)">
                          <Car size={10} aria-hidden /> ~{m.driveMinFromPrev} min
                        </span>
                      ) : null}
                      {wxEmoji ? (
                        <span className="dv2-today-pill" title={wxTitle}>
                          <span aria-hidden>{wxEmoji}</span>{' '}
                          {todayWeather ? `${todayWeather.t_max}°` : null}
                        </span>
                      ) : null}
                      <span
                        className={`dv2-today-status dv2-today-status--${m.status}`}
                        aria-label={`Status: ${STATUS_LABEL[m.status]}`}
                      >
                        {m.status === 'done' ? <CheckCircle2 size={10} aria-hidden /> : null}
                        {STATUS_LABEL[m.status]}
                      </span>
                    </span>
                  </span>
                  <span className="dv2-today-tl-photog">
                    {o.photographer?.name ?? <em>—</em>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
