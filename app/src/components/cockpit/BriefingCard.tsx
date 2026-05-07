'use client';

import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PropiAvatar } from './PropiAvatar';
import type { DashboardMetrics } from '../dashboard-v2/useDashboardMetrics';
import type { WeatherForecastDay } from '../../api/weather';

interface BriefingSuggestion {
  text: string;
  action: 'navigate' | 'noop';
  href?: string;
}

interface Briefing {
  cached?: boolean;
  summary: string;
  highlights: string[];
  suggestions: BriefingSuggestion[];
}

interface BriefingCardProps {
  metrics: DashboardMetrics | null;
  weather?: WeatherForecastDay[] | null;
}

export function BriefingCard({ metrics, weather }: BriefingCardProps) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const navigate = useNavigate();

  // Stable dep key from primitive metrics — re-fetch when these change OR refreshTick increments.
  const depsKey = metrics
    ? [
        metrics.todayOrders.length,
        metrics.overdueCount,
        metrics.withoutStaffCount,
        metrics.invoicesToCreate,
        metrics.currentCapacity,
        metrics.currentKW,
        weather?.[0]?.kind ?? '',
        weather?.[0]?.t_max ?? '',
        weather?.[1]?.kind ?? '',
        weather?.[1]?.t_max ?? '',
      ].join('|')
    : null;

  useEffect(() => {
    if (!metrics) return;
    const controller = new AbortController();
    const force = refreshTick > 0;
    const payload = {
      today: {
        shoots: metrics.todayOrders.length,
        overdue: metrics.overdueCount,
        withoutStaff: metrics.withoutStaffCount,
        invoicesOpen: metrics.invoicesToCreate,
        capacity: metrics.currentCapacity,
        kw: metrics.currentKW,
      },
      weather: weather && weather.length > 0 ? {
        today: weather[0] ? { kind: weather[0].kind, t_max: weather[0].t_max } : null,
        tomorrow: weather[1] ? { kind: weather[1].kind, t_max: weather[1].t_max } : null,
      } : undefined,
    };

    setLoading(true);
    setError(null);

    const url = `/api/cockpit/briefing${force ? '?refresh=1' : ''}`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<Briefing>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setBriefing(data);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Briefing fehlgeschlagen.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depsKey + refreshTick steuern den Re-Fetch
  }, [depsKey, refreshTick]);

  const handleSuggestionClick = (s: BriefingSuggestion) => {
    if (s.action === 'navigate' && s.href) {
      navigate(s.href);
    }
  };

  if (!metrics && !error) {
    return (
      <div className="propus-briefing propus-briefing--loading">
        <Loader2 size={14} className="propus-briefing-spin" aria-hidden />
        <span>Briefing wird vorbereitet …</span>
      </div>
    );
  }

  return (
    <div className="propus-briefing" data-cached={briefing?.cached || undefined}>
      <header className="propus-briefing-head">
        <div className="propus-briefing-mascot" aria-hidden>
          <PropiAvatar size={32} followCursor={false} />
        </div>
        <div className="propus-briefing-head-text">
          <span className="propus-briefing-tag">
            <Sparkles size={10} aria-hidden /> Tagesbriefing
          </span>
        </div>
        <button
          type="button"
          className="propus-briefing-refresh"
          onClick={() => setRefreshTick((t) => t + 1)}
          disabled={loading}
          title="Briefing neu generieren"
          aria-label="Briefing neu generieren"
        >
          <RefreshCw size={12} aria-hidden className={loading ? 'propus-briefing-spin' : undefined} />
        </button>
      </header>

      {error && !briefing && (
        <div className="propus-briefing-error" role="alert">
          {error}
        </div>
      )}

      {!briefing && loading && (
        <div className="propus-briefing-skeleton">
          <span className="propus-briefing-skel-line" />
          <span className="propus-briefing-skel-line" />
          <span className="propus-briefing-skel-line propus-briefing-skel-line--short" />
        </div>
      )}

      {briefing && (
        <>
          <p className="propus-briefing-summary">{briefing.summary}</p>
          {briefing.highlights.length > 0 && (
            <ul className="propus-briefing-list">
              {briefing.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
          {briefing.suggestions.length > 0 && (
            <div className="propus-briefing-actions">
              {briefing.suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="propus-briefing-action"
                  onClick={() => handleSuggestionClick(s)}
                  data-action={s.action}
                  disabled={s.action === 'noop'}
                >
                  <span className="propus-briefing-action-text">{s.text}</span>
                  {s.action === 'navigate' && <ArrowRight size={12} aria-hidden />}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
