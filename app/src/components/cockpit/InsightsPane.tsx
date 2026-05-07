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
import { getOrders, type Order } from '../../api/orders';
import { ordersQueryKey } from '../../lib/queryKeys';
import { useAuthStore } from '../../store/authStore';
import { useNow } from '../../hooks/useNow';
import { useDashboardMetrics } from '../dashboard-v2/useDashboardMetrics';
import { getWeatherForecast, type WeatherForecastDay } from '../../api/weather';
import { useWeatherForMissions, type MissionLocationKey } from '../../hooks/useWeatherForMissions';
import { extractZip } from '../dashboard-v2/missionTimeline';
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

  // Per-Auftrags-Wetter: für jeden anstehenden Auftrag (heute + die nächsten
  // ~16 Tage = Open-Meteo-Horizont) fragen wir den Forecast an seiner PLZ ab.
  // Damit kann das Smart-Insight-Panel pro Auftrag individuell raten, statt
  // pauschal „Regen in Zürich" zu sagen.
  const upcomingMissionKeys = useMemo<MissionLocationKey[]>(() => {
    if (!metrics) return [];
    const HORIZON_DAYS = 16;
    const todayMs = new Date(now);
    todayMs.setHours(0, 0, 0, 0);
    const horizonMs = todayMs.getTime() + HORIZON_DAYS * 86_400_000;
    const all: Order[] = [...metrics.todayOrders, ...metrics.upcomingOrders];
    return all.flatMap((o) => {
      if (!o.appointmentDate || o.orderNo == null || o.orderNo === '') return [];
      const ts = new Date(o.appointmentDate).getTime();
      if (!Number.isFinite(ts) || ts > horizonMs) return [];
      const zip = extractZip(o.address) ?? extractZip(o.customerZipcity ?? null);
      return [{
        key: String(o.orderNo),
        zip,
        dateIso: new Date(ts).toISOString().slice(0, 10),
      }];
    });
  }, [metrics, now]);

  const perOrderWeather = useWeatherForMissions(upcomingMissionKeys);

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
    // Per-Auftrags-Wetter-Insights: max 3 Karten, chronologisch sortiert,
    // nur für Aufträge mit besorgniserregendem Wetter (Regen/Schnee/Gewitter
    // ODER Niederschlag ≥ 50 %). Greift jetzt pro Auftragsadresse, nicht mehr
    // pauschal über Zürich.
    const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const todayMs = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); })();
    const concerning = ([...metrics.todayOrders, ...metrics.upcomingOrders] as Order[])
      .filter((o) => o.appointmentDate && o.orderNo != null && o.orderNo !== '')
      .map((o) => ({ order: o, wx: perOrderWeather.get(String(o.orderNo)) }))
      .filter((x): x is { order: Order; wx: WeatherForecastDay } =>
        Boolean(x.wx) && (
          /^(rain|storm|snow)$/.test((x.wx as WeatherForecastDay).kind) ||
          (x.wx as WeatherForecastDay).precip >= 50
        )
      )
      .sort((a, b) => {
        const at = new Date(a.order.appointmentDate as string).getTime();
        const bt = new Date(b.order.appointmentDate as string).getTime();
        return at - bt;
      })
      .slice(0, 3);

    for (const { order, wx } of concerning) {
      const apptMs = new Date(order.appointmentDate as string).getTime();
      const apptD = new Date(apptMs);
      const daysOut = Math.round((apptMs - todayMs) / 86_400_000);
      const hh = String(apptD.getHours()).padStart(2, '0');
      const mm = String(apptD.getMinutes()).padStart(2, '0');
      let dateLabel: string;
      if (daysOut <= 0) dateLabel = `Heute ${hh}:${mm}`;
      else if (daysOut === 1) dateLabel = `Morgen ${hh}:${mm}`;
      else dateLabel = `${WD[apptD.getDay()]} ${apptD.getDate()}.${String(apptD.getMonth() + 1).padStart(2, '0')}. · ${hh}:${mm}`;

      const ortRaw = (order.customerZipcity ?? order.address ?? '').toString().trim();
      const ortMatch = /^\s*\d{4,5}\s+(.+)$/.exec(ortRaw);
      const ortLabel = ortMatch ? ortMatch[1] : (order.address?.split(',')[0]?.trim() ?? '');

      const kindLabel = wx.kind === 'storm' ? 'Gewitter' : wx.kind === 'snow' ? 'Schnee' : 'Regen';
      const tone: InsightTone = daysOut <= 0 ? 'urgent' : daysOut <= 2 ? 'opportunity' : 'info';

      out.push({
        id: `wx-${order.orderNo}`,
        tone,
        icon: CloudRain,
        title: `${kindLabel} für #${order.orderNo}${ortLabel ? ` · ${ortLabel}` : ''}`,
        description: `${dateLabel} · ${wx.precip}% Niederschlag · ${wx.t_max}° / ${wx.t_min}°. Outdoor-Shoot ggf. mit Kunden absprechen.`,
        ctaLabel: '🔄 Auftrag öffnen',
        onCta: () => navigate(`/orders/${order.orderNo}`),
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
  }, [orders, metrics, perOrderWeather, now, navigate]);

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
