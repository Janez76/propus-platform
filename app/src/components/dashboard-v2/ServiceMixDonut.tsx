'use client';

import { useMemo } from 'react';
import type { Order } from '../../api/orders';
import { formatCHF } from '../../lib/format';
import { statusMatches } from '../../lib/status';
import { t, type Lang } from '../../i18n';

interface ServiceMixDonutProps {
  orders: Order[];
  lang: Lang;
}

interface ServiceBucket {
  label: string;
  count: number;
  amount: number;
}

interface ServiceArc extends ServiceBucket {
  cssVar: string;
  fraction: number;
  length: number;
  offset: number;
}

const RADIUS = 72;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 5 distinct categorical colors aus Cockpit-Token-Palette. */
const COLORS = [
  '--propus-gold',
  '--propus-cat-blue',
  '--propus-cat-purple',
  '--propus-cat-pink',
  '--propus-good-warm',
] as const;

/** Hilfsfunktion: extrahiert eine kurze, einheitliche Service-Bezeichnung
 *  aus einem rohen Label. Beispiele:
 *  - "Premium Innenfotos 25 Bilder" → "Innenfotos"
 *  - "360° Matterport-Tour"          → "360°-Tour"
 *  - "Drohne / Aussenaufnahmen"     → "Drohne"
 *  Wenn nichts erkannt wird → das Label gekürzt auf 24 Zeichen. */
function normalizeServiceLabel(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/innenfoto|innenraum/i.test(lower)) return 'Innenfotos';
  if (/aussenfoto|aussenaufnahme|exterieur/i.test(lower)) return 'Aussenfotos';
  if (/360|matterport|tour/i.test(lower)) return '360°-Tour';
  if (/drohne|drone|luftaufnahme/i.test(lower)) return 'Drohne';
  if (/floorplan|grundriss/i.test(lower)) return 'Grundriss';
  if (/video|reel/i.test(lower)) return 'Video';
  if (/dossier|expose|exposé/i.test(lower)) return 'Dossier';
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > 24 ? trimmed.slice(0, 24) + '…' : trimmed;
}

/** Aggregiert Service-Items aus allen nicht-stornierten Orders.
 *  Pro Order werden Package-Label + Addon-Labels gezählt. */
function aggregateServiceMix(orders: Order[]): ServiceBucket[] {
  const buckets = new Map<string, ServiceBucket>();
  for (const o of orders) {
    if (statusMatches(o.status, 'cancelled') || statusMatches(o.status, 'archived')) continue;
    const items: Array<{ label: string | null | undefined; price: number | null | undefined }> = [];
    if (o.services?.package) {
      items.push({ label: o.services.package.label, price: o.services.package.price });
    }
    for (const addon of o.services?.addons ?? []) {
      items.push({ label: addon.label, price: addon.price });
    }
    for (const it of items) {
      const norm = normalizeServiceLabel(it.label);
      if (!norm) continue;
      const existing = buckets.get(norm);
      const price = typeof it.price === 'number' ? it.price : 0;
      if (existing) {
        existing.count += 1;
        existing.amount += price;
      } else {
        buckets.set(norm, { label: norm, count: 1, amount: price });
      }
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.amount - a.amount || b.count - a.count);
}

export function ServiceMixDonut({ orders, lang }: ServiceMixDonutProps) {
  const arcs = useMemo<ServiceArc[]>(() => {
    const buckets = aggregateServiceMix(orders);
    /** Top 5 + ggf. „Andere" als 6. Bucket, damit kleine Long-Tail-Services
     *  nicht visuell verloren gehen. */
    const top = buckets.slice(0, 5);
    const rest = buckets.slice(5);
    const final: ServiceBucket[] = [...top];
    if (rest.length > 0) {
      const restAmount = rest.reduce((s, b) => s + b.amount, 0);
      const restCount = rest.reduce((s, b) => s + b.count, 0);
      if (restCount > 0) {
        final.push({ label: t(lang, 'dashboardV2.serviceMix.other'), count: restCount, amount: restAmount });
      }
    }
    const totalAmount = final.reduce((s, b) => s + b.amount, 0);
    if (totalAmount === 0) return [];
    let cumulative = 0;
    return final.map((b, i) => {
      const fraction = b.amount / totalAmount;
      const length = fraction * CIRCUMFERENCE;
      const arc: ServiceArc = {
        ...b,
        cssVar: COLORS[i % COLORS.length] ?? COLORS[0],
        fraction,
        length,
        offset: cumulative,
      };
      cumulative += length;
      return arc;
    });
  }, [orders, lang]);

  const totalAmount = arcs.reduce((s, a) => s + a.amount, 0);
  const totalCount = arcs.reduce((s, a) => s + a.count, 0);

  if (arcs.length === 0) {
    return (
      <section className="dv2-card dv2-donut-card">
        <div className="dv2-card-head">
          <div className="dv2-card-title">{t(lang, 'dashboardV2.serviceMix.title')}</div>
        </div>
        <div className="dv2-donut-empty">{t(lang, 'dashboardV2.serviceMix.empty')}</div>
      </section>
    );
  }

  return (
    <section className="dv2-card dv2-donut-card dv2-service-mix">
      <div className="dv2-card-head">
        <div className="dv2-card-title">{t(lang, 'dashboardV2.serviceMix.title')}</div>
        <div className="dv2-donut-total-pill">{totalCount} {t(lang, 'dashboardV2.serviceMix.items')}</div>
      </div>
      <div className="dv2-donut-body">
        <div
          className="dv2-donut-svg-wrap"
          role="img"
          aria-label={t(lang, 'dashboardV2.serviceMix.aria')
            .replace('{{count}}', String(totalCount))
            .replace('{{amount}}', formatCHF(totalAmount))}
        >
          <svg viewBox="0 0 200 200" className="dv2-donut-svg">
            <circle
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke="var(--propus-bg-strip)"
              strokeWidth={STROKE}
            />
            {arcs.map((arc) =>
              arc.length > 0 ? (
                <circle
                  key={arc.label}
                  cx="100"
                  cy="100"
                  r={RADIUS}
                  fill="none"
                  stroke={`var(${arc.cssVar})`}
                  strokeWidth={STROKE}
                  strokeDasharray={`${arc.length.toFixed(2)} ${(CIRCUMFERENCE - arc.length).toFixed(2)}`}
                  strokeDashoffset={(-arc.offset).toFixed(2)}
                  strokeLinecap="butt"
                  transform="rotate(-90 100 100)"
                />
              ) : null,
            )}
          </svg>
          <div className="dv2-donut-center">
            {/* Kompakte Darstellung im Donut-Hole: nur Tausender-Trennzeichen,
             *  keine Decimals — sonst wird "CHF 29'542.00" zu lang fürs Loch. */}
            <span className="dv2-donut-center-value">
              {new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 }).format(
                Math.round(totalAmount),
              )}
            </span>
            <span className="dv2-donut-center-label">
              CHF · {t(lang, 'dashboardV2.serviceMix.totalLabel')}
            </span>
          </div>
        </div>
        <ul className="dv2-donut-legend">
          {arcs.map((arc) => (
            <li key={arc.label} className="dv2-donut-legend-item">
              <span
                className="dv2-donut-legend-dot"
                style={{ background: `var(${arc.cssVar})` }}
                aria-hidden
              />
              <span className="dv2-donut-legend-label">{arc.label}</span>
              <span className="dv2-donut-legend-val">{formatCHF(arc.amount)}</span>
              <span className="dv2-donut-legend-pct">{Math.round(arc.fraction * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
