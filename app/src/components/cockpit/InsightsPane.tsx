'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useQuery } from '../../hooks/useQuery';
import { getOrders } from '../../api/orders';
import { ordersQueryKey } from '../../lib/queryKeys';
import { useAuthStore } from '../../store/authStore';
import { useNow } from '../../hooks/useNow';
import { useDashboardMetrics } from '../dashboard-v2/useDashboardMetrics';
import { DashAlerts } from '../dashboard-v2/DashAlerts';
import { getWeatherForecast, type WeatherForecastDay } from '../../api/weather';
import { WeatherStrip } from './WeatherStrip';
import { BriefingCard } from './BriefingCard';
import '../dashboard-v2/dashboard-v2.css';
import './cockpit-panes.css';

export function InsightsPane() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const now = useNow();
  const { data: orders, loading, error } = useQuery(
    ordersQueryKey(token),
    () => getOrders(token),
    { staleTime: 30_000 },
  );
  const metrics = useDashboardMetrics(orders ?? [], now);

  const [weather, setWeather] = useState<WeatherForecastDay[] | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getWeatherForecast(token, { days: 7, region: 'zurich' })
      .then((res) => { if (!cancelled) setWeather(res.days.slice(0, 7)); })
      .catch(() => { if (!cancelled) setWeather([]); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="propus-pane-stack">
      <BriefingCard metrics={orders ? metrics : null} weather={weather} />

      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">Wetter Zürich · 7 Tage</h5>
        <WeatherStrip />
      </section>

      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">
          <Sparkles size={12} aria-hidden /> Operative Hinweise
        </h5>
        {loading && !orders && (
          <div className="propus-pane-empty">
            <div className="propus-pane-empty-sub">Lade Insights …</div>
          </div>
        )}
        {error && !orders && (
          <div className="propus-pane-error" role="alert">
            <strong>Fehler:</strong> {String(error)}
          </div>
        )}
        {orders && metrics && (
          <DashAlerts metrics={metrics} lang={lang} />
        )}
        {orders && metrics &&
          metrics.overdueCount === 0 &&
          metrics.withoutStaffCount === 0 &&
          metrics.invoicesToCreate === 0 && (
          <div className="propus-pane-empty">
            <div className="propus-pane-empty-title">Alles im Lot</div>
            <div className="propus-pane-empty-sub">Keine offenen Alerts.</div>
          </div>
        )}
      </section>
    </div>
  );
}
