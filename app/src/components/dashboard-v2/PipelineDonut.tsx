'use client';

import { useMemo } from 'react';
import type { DashboardMetrics } from './useDashboardMetrics';

interface PipelineDonutProps {
  metrics: DashboardMetrics;
}

interface Segment {
  label: string;
  value: number;
  cssVar: string;
}

const RADIUS = 72;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PipelineDonut({ metrics }: PipelineDonutProps) {
  const counts = metrics.pipelineCounts;

  const segments = useMemo<Segment[]>(() => [
    { label: 'Angefragt', value: counts.angefragt, cssVar: '--propus-cat-purple' },
    { label: 'Geplant', value: counts.geplant, cssVar: '--propus-cat-blue' },
    { label: 'In Bearbeitung', value: counts.inProgress, cssVar: '--propus-accent-warm' },
    { label: 'Geliefert', value: counts.geliefert, cssVar: '--propus-good-warm' },
  ], [counts.angefragt, counts.geplant, counts.inProgress, counts.geliefert]);

  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (total === 0) {
    return (
      <section className="dv2-card dv2-donut-card">
        <div className="dv2-card-head">
          <div className="dv2-card-title">Pipeline-Mix</div>
        </div>
        <div className="dv2-donut-empty">Noch keine Aufträge in der Pipeline.</div>
      </section>
    );
  }

  // Berechne stroke-dasharray-Offsets pro Segment (kumulativ)
  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const fraction = seg.value / total;
    const length = fraction * CIRCUMFERENCE;
    const offset = cumulative;
    cumulative += length;
    return { ...seg, length, offset, fraction };
  });

  return (
    <section className="dv2-card dv2-donut-card">
      <div className="dv2-card-head">
        <div className="dv2-card-title">Pipeline-Mix</div>
        <div className="dv2-donut-total-pill">{total} aktiv</div>
      </div>
      <div className="dv2-donut-body">
        <div className="dv2-donut-svg-wrap" role="img" aria-label={`Pipeline mit ${total} Aufträgen`}>
          <svg viewBox="0 0 200 200" className="dv2-donut-svg">
            <circle
              cx="100" cy="100" r={RADIUS}
              fill="none"
              stroke="var(--propus-bg-strip)"
              strokeWidth={STROKE}
            />
            {arcs.map((arc) => (
              arc.length > 0 ? (
                <circle
                  key={arc.label}
                  cx="100" cy="100" r={RADIUS}
                  fill="none"
                  stroke={`var(${arc.cssVar})`}
                  strokeWidth={STROKE}
                  strokeDasharray={`${arc.length.toFixed(2)} ${(CIRCUMFERENCE - arc.length).toFixed(2)}`}
                  strokeDashoffset={(-arc.offset).toFixed(2)}
                  strokeLinecap="butt"
                  transform="rotate(-90 100 100)"
                />
              ) : null
            ))}
          </svg>
          <div className="dv2-donut-center">
            <span className="dv2-donut-center-value">{total}</span>
            <span className="dv2-donut-center-label">Aufträge</span>
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
              <span className="dv2-donut-legend-val">{arc.value}</span>
              <span className="dv2-donut-legend-pct">{Math.round(arc.fraction * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
