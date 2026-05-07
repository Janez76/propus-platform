'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Clock, MapPin, MapPinOff, Car, Banknote, CheckCircle2, Navigation, Loader2 } from 'lucide-react';
import { t, type Lang } from '../../i18n';
import { useGeolocation } from '../cockpit/useGeolocation';
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

type DriveFromLive = { durationText: string; distanceText?: string | null };

export function TodayCard({ metrics, onHover, weather = null, lang }: TodayCardProps) {
  const now = useNow();
  const today = metrics.today;
  const dom = today.getDate();
  const month = MONTH_DE[today.getMonth()];
  const year = today.getFullYear();
  const weekday = WEEKDAY_DE[today.getDay()];
  const todayOrders = metrics.todayOrders;
  const todayDateStr = today.toDateString();
  const missions = useMemo(() => buildMissionTimeline(todayOrders, now), [todayOrders, now]);
  const dashGeo = useGeolocation({ storageKey: 'propus.dashboard.geo.enabled.v1' });
  const [driveByOrder, setDriveByOrder] = useState<Record<string, DriveFromLive>>({});
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const driveAbortRef = useRef<AbortController | null>(null);

  const legsKey = useMemo(
    () => missions.map((m) => `${m.order.orderNo}:${(m.order.address || '').trim()}`).join('|'),
    [missions],
  );

  useEffect(() => {
    driveAbortRef.current?.abort();
    if (!dashGeo.enabled || !dashGeo.position || missions.length === 0) {
      setDriveByOrder({});
      setDriveError(null);
      setDriveLoading(false);
      return;
    }
    const legs = missions
      .map((m) => ({ orderNo: String(m.order.orderNo), address: (m.order.address || '').trim() }))
      .filter((l) => l.address.length > 2)
      .slice(0, 25);
    if (legs.length === 0) {
      setDriveByOrder({});
      setDriveError(null);
      setDriveLoading(false);
      return;
    }

    const ac = new AbortController();
    driveAbortRef.current = ac;
    const timer = window.setTimeout(() => {
      setDriveLoading(true);
      setDriveError(null);
      void (async () => {
        try {
          const res = await fetch('/api/dashboard/drive-times', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            signal: ac.signal,
            body: JSON.stringify({
              lat: dashGeo.position!.lat,
              lng: dashGeo.position!.lng,
              legs,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            legs?: Array<{ orderNo: string; durationText: string | null; distanceText?: string | null; status?: string }>;
          };
          if (!res.ok) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          const next: Record<string, DriveFromLive> = {};
          for (const row of data.legs || []) {
            if (row.orderNo && row.durationText) {
              next[String(row.orderNo)] = { durationText: row.durationText, distanceText: row.distanceText };
            }
          }
          setDriveByOrder(next);
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setDriveByOrder({});
          setDriveError(e instanceof Error ? e.message : 'Fehler');
        } finally {
          if (!ac.signal.aborted) setDriveLoading(false);
        }
      })();
    }, 450);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [
    dashGeo.enabled,
    dashGeo.position?.lat,
    dashGeo.position?.lng,
    dashGeo.position?.timestamp,
    legsKey,
  ]);
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
        {missions.length > 0 ? (
          <div className="dv2-today-drive-row">
            <button
              type="button"
              className="dv2-today-drive-geo"
              data-active={dashGeo.enabled && dashGeo.position ? 'true' : undefined}
              disabled={dashGeo.loading}
              onClick={() => (dashGeo.enabled ? dashGeo.clear() : void dashGeo.request())}
              title={
                dashGeo.position
                  ? t(lang, 'dashboardV2.todayDrive.titleActive').replace(
                      '{{m}}',
                      String(Math.round(dashGeo.position.accuracy)),
                    )
                  : dashGeo.error
                    ? `${t(lang, 'dashboardV2.todayDrive.titleError')}: ${dashGeo.error}`
                    : t(lang, 'dashboardV2.todayDrive.titleIdle')
              }
              aria-label={dashGeo.enabled ? t(lang, 'dashboardV2.todayDrive.ariaOff') : t(lang, 'dashboardV2.todayDrive.ariaOn')}
              aria-pressed={dashGeo.enabled && !!dashGeo.position}
            >
              {dashGeo.loading ? (
                <Loader2 size={14} className="dv2-today-drive-spin" aria-hidden />
              ) : dashGeo.enabled && dashGeo.position ? (
                <MapPin size={14} aria-hidden />
              ) : dashGeo.error ? (
                <MapPinOff size={14} aria-hidden />
              ) : (
                <MapPin size={14} aria-hidden />
              )}
            </button>
            {dashGeo.enabled && dashGeo.position ? (
              <p className="dv2-today-drive-note">
                {driveLoading ? t(lang, 'dashboardV2.todayDrive.loading') : t(lang, 'dashboardV2.todayDrive.note')}
              </p>
            ) : null}
            {driveError ? <span className="dv2-today-drive-err">{driveError}</span> : null}
          </div>
        ) : null}
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
                        <span className="dv2-today-pill" title={t(lang, 'dashboardV2.todayDrive.pillZipHint')}>
                          <Car size={10} aria-hidden /> ~{m.driveMinFromPrev} min
                        </span>
                      ) : null}
                      {driveByOrder[String(o.orderNo)] ? (
                        <span
                          className="dv2-today-pill dv2-today-pill--live-route"
                          title={t(lang, 'dashboardV2.todayDrive.pillLiveTitle')}
                        >
                          <Navigation size={10} aria-hidden /> {driveByOrder[String(o.orderNo)].durationText}
                          {driveByOrder[String(o.orderNo)].distanceText
                            ? ` · ${driveByOrder[String(o.orderNo)].distanceText}`
                            : ''}
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
