'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudRain,
  Receipt,
  Sparkles,
  UserPlus,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '../../hooks/useQuery';
import { getOrders } from '../../api/orders';
import { ordersQueryKey } from '../../lib/queryKeys';
import { useAuthStore } from '../../store/authStore';
import { useNow } from '../../hooks/useNow';
import { useDashboardMetrics } from '../dashboard-v2/useDashboardMetrics';
import { getWeatherForecast, type WeatherForecastDay } from '../../api/weather';
import { WeatherStrip } from './WeatherStrip';
import { BriefingCard } from './BriefingCard';
import '../dashboard-v2/dashboard-v2.css';
import './cockpit-panes.css';

type InsightTone = 'urgent' | 'opportunity' | 'info' | 'win';

interface SmartInsight {
  id: string;
  tone: InsightTone;
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  ctaLabel: string;
  onCta: () => void;
}

interface SmartInsightCardProps {
  insight: SmartInsight;
}

function SmartInsightCard({ insight }: SmartInsightCardProps) {
  const Icon = insight.icon;
  return (
    <article className={`propus-insight propus-insight--${insight.tone}`}>
      <div className="propus-insight-icon" aria-hidden>
        <Icon size={16} />
      </div>
      <div className="propus-insight-body">
        <h6 className="propus-insight-title">{insight.title}</h6>
        <p className="propus-insight-desc">{insight.description}</p>
        <button
          type="button"
          className="propus-insight-cta"
          onClick={insight.onCta}
        >
          <span>{insight.ctaLabel}</span>
          <ArrowRight size={12} aria-hidden />
        </button>
      </div>
    </article>
  );
}

export function InsightsPane() {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
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

  const insights: SmartInsight[] = useMemo(() => {
    if (!orders || !metrics) return [];
    const out: SmartInsight[] = [];
    if (metrics.overdueCount > 0) {
      out.push({
        id: 'overdue',
        tone: 'urgent',
        icon: AlertTriangle,
        title: `${metrics.overdueCount} überfällige Termine`,
        description: 'Termine, die in der Vergangenheit liegen aber nicht abgeschlossen sind. Mahnungs- oder Status-Aktion empfohlen.',
        ctaLabel: '⚡ Alle prüfen',
        onCta: () => navigate('/orders?status=pending&overdue=1'),
      });
    }
    if (metrics.withoutStaffCount > 0) {
      out.push({
        id: 'no-staff',
        tone: 'opportunity',
        icon: UserPlus,
        title: `${metrics.withoutStaffCount} Aufträge ohne Fotograf`,
        description: 'Offene Aufträge ohne zugewiesenen Fotografen — vor dem Termin Verfügbarkeit klären.',
        ctaLabel: '👥 Zuweisen starten',
        onCta: () => navigate('/orders?withoutStaff=1'),
      });
    }
    if (metrics.invoicesToCreate > 0) {
      out.push({
        id: 'invoices',
        tone: 'info',
        icon: Receipt,
        title: `${metrics.invoicesToCreate} Rechnungen offen`,
        description: 'Erledigte Aufträge ohne Exxas-Auftragsnummer — Rechnung im zentralen Modul anlegen.',
        ctaLabel: '📑 Rechnungen anlegen',
        onCta: () => navigate('/admin/invoices?type=exxas&status=open'),
      });
    }
    const todayWeather = weather?.find(
      (d) => new Date(d.date).toDateString() === now.toDateString(),
    );
    if (
      todayWeather &&
      /(rain|showers|thunder)/i.test(todayWeather.kind ?? '') &&
      metrics.todayOrders.length > 0
    ) {
      out.push({
        id: 'weather',
        tone: 'urgent',
        icon: CloudRain,
        title: `Regen in Zürich heute`,
        description: `${metrics.todayOrders.length} Termine heute. Aussen-Shoots ggf. mit Kunden absprechen oder verschieben.`,
        ctaLabel: '🔄 Heute prüfen',
        onCta: () => navigate('/orders?range=today'),
      });
    }
    if (metrics.currentCapacity >= 80) {
      out.push({
        id: 'capacity',
        tone: 'win',
        icon: Zap,
        title: `Kapazität bei ${metrics.currentCapacity}%`,
        description: `KW ${metrics.currentKW} ist gut ausgelastet — Wartelisten-Anfragen jetzt nachfassen lohnt sich.`,
        ctaLabel: '⭐ Pipeline öffnen',
        onCta: () => navigate('/orders?status=pending'),
      });
    }
    return out;
  }, [orders, metrics, weather, now, navigate]);

  return (
    <div className="propus-pane-stack">
      <BriefingCard metrics={orders ? metrics : null} weather={weather} />

      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">Wetter Zürich · 7 Tage</h5>
        <WeatherStrip />
      </section>

      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">
          <Sparkles size={12} aria-hidden /> Smart Insights
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
        {orders && insights.length > 0 ? (
          <div className="propus-insight-list">
            {insights.map((i) => (
              <SmartInsightCard key={i.id} insight={i} />
            ))}
          </div>
        ) : null}
        {orders && insights.length === 0 ? (
          <div className="propus-pane-empty">
            <CheckCircle2 size={20} className="propus-pane-empty-icon" aria-hidden />
            <div className="propus-pane-empty-title">Alles im Lot</div>
            <div className="propus-pane-empty-sub">Keine offenen Alerts.</div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
