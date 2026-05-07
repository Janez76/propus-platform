import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getCalendarEvents, type CalendarEvent } from "../../api/calendar";
import { getStatusBadgeClass, getStatusLabel } from "../../lib/status";
import { MobilePullToRefresh } from "./MobilePullToRefresh";
import { MobileListSkeleton, MobileSectionHeader, MobileState } from "./MobileUI";

const DAYS_AHEAD = 14;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDateHeading(d: Date): string {
  return d.toLocaleDateString("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

export function MobileCalendarTab() {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getCalendarEvents(token);
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    setLoading(true);
    fetchEvents().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, fetchEvents]);

  const grouped = useMemo(() => {
    const now = startOfDay(new Date());
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + DAYS_AHEAD);

    const filtered = events
      .filter((e) => {
        if (!e.start) return false;
        const t = new Date(e.start).getTime();
        return t >= now.getTime() && t < horizon.getTime();
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filtered) {
      const key = startOfDay(new Date(ev.start)).toISOString();
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      date: new Date(key),
      events: list,
    }));
  }, [events]);

  if (loading) return <MobileListSkeleton rows={5} />;
  if (error)
    return (
      <MobileState icon={CalendarDays} message={`Fehler: ${error}`} />
    );
  if (grouped.length === 0)
    return (
      <MobileState
        icon={CalendarDays}
        message={`Keine Termine in den nächsten ${DAYS_AHEAD} Tagen.`}
      />
    );

  return (
    <MobilePullToRefresh onRefresh={fetchEvents}>
      <div>
        {grouped.map(({ date, events: dayEvents }) => (
          <section key={date.toISOString()}>
            <MobileSectionHeader>{formatDateHeading(date)}</MobileSectionHeader>
            <ul className="mob-section-list">
              {dayEvents.map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (ev.orderNo) navigate(`/orders/${ev.orderNo}`);
                    }}
                    className="mob-list-item"
                  >
                    <span
                      className="mob-time-chip"
                      style={
                        ev.color
                          ? {
                              background: `color-mix(in srgb, ${ev.color} 18%, transparent)`,
                              borderColor: `color-mix(in srgb, ${ev.color} 40%, transparent)`,
                              color: ev.color,
                            }
                          : undefined
                      }
                    >
                      <span className="mob-time-chip-h">{formatTime(ev.start)}</span>
                      {ev.end ? (
                        <span className="mob-time-chip-sub">
                          {(() => {
                            const s = new Date(ev.start).getTime();
                            const e = new Date(ev.end).getTime();
                            const min = Math.max(0, Math.round((e - s) / 60_000));
                            return `${min}m`;
                          })()}
                        </span>
                      ) : null}
                    </span>
                    <div className="mob-list-content">
                      <div className="mob-list-title">{ev.title || "Termin"}</div>
                      {(ev.address || ev.zipcity) && (
                        <div className="mob-list-sub">
                          <MapPin size={12} aria-hidden />
                          <span>{[ev.address, ev.zipcity].filter(Boolean).join(", ")}</span>
                        </div>
                      )}
                      {ev.status && (
                        <div className="mob-list-meta">
                          <span className={`mob-pill ${getStatusBadgeClass(ev.status)}`}>
                            {getStatusLabel(ev.status)}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </MobilePullToRefresh>
  );
}
