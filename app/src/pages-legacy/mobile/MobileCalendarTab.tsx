import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getCalendarEvents, type CalendarEvent } from "../../api/calendar";
import { getStatusBadgeClass, getStatusLabel } from "../../lib/status";

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

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    setLoading(true);
    getCalendarEvents(token)
      .then((data) => {
        if (cancelled) return;
        setEvents(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Fehler beim Laden");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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

  if (loading) {
    return (
      <div className="flex justify-center px-4 py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
        Fehler: {error}
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" style={{ color: "var(--text-muted)" }}>
        <CalendarDays className="h-10 w-10 opacity-60" />
        <p className="text-sm">Keine Termine in den nächsten {DAYS_AHEAD} Tagen.</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      {grouped.map(({ date, events: dayEvents }) => (
        <section key={date.toISOString()} className="mb-5">
          <h2
            className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            {formatDateHeading(date)}
          </h2>
          <ul className="space-y-2">
            {dayEvents.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (ev.orderNo) navigate(`/orders/${ev.orderNo}`);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-soft)",
                    minHeight: "3.5rem",
                  }}
                >
                  <div
                    className="flex w-14 shrink-0 flex-col items-center rounded-lg py-1.5 text-xs font-semibold"
                    style={{
                      background: ev.color || "var(--accent)",
                      color: "#fff",
                    }}
                  >
                    <span>{formatTime(ev.start)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: "var(--text-main)" }}>
                      {ev.title || "Termin"}
                    </div>
                    {(ev.address || ev.zipcity) && (
                      <div
                        className="mt-0.5 flex items-center gap-1 truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{[ev.address, ev.zipcity].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    {ev.status && (
                      <span className={`mt-1.5 inline-block rounded px-2 py-0.5 text-[10px] ${getStatusBadgeClass(ev.status)}`}>
                        {getStatusLabel(ev.status)}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
