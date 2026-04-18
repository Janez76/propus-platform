import React, { useState, useMemo } from 'react';
import { AlertTriangle, Clock, TrendingDown, TrendingUp, Calendar, ArrowUpRight, Camera, Package, Banknote, Target, Zap, ChevronRight, Circle } from 'lucide-react';

const GOLD = '#B68E20';
const GOLD_DIM = '#8a6d18';
const GOLD_SOFT = 'rgba(182, 142, 32, 0.12)';
const BG = '#0c0d10';
const CARD = '#13141a';
const CARD_HOVER = '#181a22';
const BORDER = 'rgba(182, 142, 32, 0.15)';
const BORDER_STRONG = 'rgba(182, 142, 32, 0.35)';
const TEXT_DIM = 'rgba(255, 255, 255, 0.55)';
const TEXT_MUTED = 'rgba(255, 255, 255, 0.35)';
const DANGER = '#d9534f';
const DANGER_SOFT = 'rgba(217, 83, 79, 0.12)';

// Sparkline component
const Sparkline = ({ data, color = GOLD, height = 36, showArea = true }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const areaPath = `M 0,${height} L ${points.split(' ').join(' L ')} L ${width},${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {showArea && (
        <>
          <defs>
            <linearGradient id={`grad-${color.replace('#','')}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#grad-${color.replace('#','')})`} />
        </>
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

// Minibars component for weekly comparison
const MiniBars = ({ data, color = GOLD, height = 36 }) => {
  const max = Math.max(...data);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, width: '100%' }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(v / max) * 100}%`,
            background: i === data.length - 1 ? color : `${color}66`,
            borderRadius: '2px 2px 0 0',
            minHeight: 2,
          }}
        />
      ))}
    </div>
  );
};

// KPI Card
const KpiCard = ({ label, value, sublabel, delta, deltaDir, children, icon: Icon }) => (
  <div style={{
    background: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 128,
    position: 'relative',
    transition: 'border-color 0.2s',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: TEXT_DIM,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {Icon && <Icon size={11} style={{ color: GOLD }} />}
        {label}
      </div>
      {delta && (
        <div style={{
          fontSize: 11,
          color: deltaDir === 'up' ? '#7bc97b' : deltaDir === 'down' ? DANGER : TEXT_DIM,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {deltaDir === 'up' ? <TrendingUp size={11} /> : deltaDir === 'down' ? <TrendingDown size={11} /> : null}
          {delta}
        </div>
      )}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <div style={{
        fontFamily: '"DM Serif Display", serif',
        fontSize: 28,
        fontWeight: 400,
        color: '#fff',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 11, color: TEXT_DIM }}>{sublabel}</div>
      )}
    </div>
    <div style={{ marginTop: 'auto' }}>
      {children}
    </div>
  </div>
);

// Alert row
const AlertRow = ({ orderId, address, client, daysOverdue, onClick }) => (
  <div
    onClick={onClick}
    style={{
      display: 'grid',
      gridTemplateColumns: '72px 1fr 160px 110px 20px',
      alignItems: 'center',
      gap: 14,
      padding: '12px 16px',
      borderTop: `1px solid ${BORDER}`,
      cursor: 'pointer',
      transition: 'background 0.15s',
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = CARD_HOVER}
    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
  >
    <div style={{ fontSize: 11, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
      #{orderId}
    </div>
    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>
      {address}
    </div>
    <div style={{ fontSize: 12, color: TEXT_DIM }}>
      {client}
    </div>
    <div style={{
      fontSize: 12,
      color: DANGER,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontVariantNumeric: 'tabular-nums',
    }}>
      <Circle size={6} fill={DANGER} style={{ color: DANGER }} />
      {daysOverdue} Tage überfällig
    </div>
    <ChevronRight size={14} style={{ color: TEXT_MUTED }} />
  </div>
);

// Pipeline card
const PipelineCard = ({ orderId, address, client, status, statusColor }) => (
  <div style={{
    background: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 8,
    cursor: 'pointer',
    transition: 'all 0.15s',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.borderColor = BORDER_STRONG;
    e.currentTarget.style.transform = 'translateY(-1px)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.borderColor = BORDER;
    e.currentTarget.style.transform = 'translateY(0)';
  }}
  >
    <div style={{ fontSize: 10, color: TEXT_MUTED, fontFamily: 'monospace', marginBottom: 4 }}>
      #{orderId}
    </div>
    <div style={{ fontSize: 12, color: '#fff', fontWeight: 500, marginBottom: 2 }}>
      {address}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
      <div style={{ fontSize: 11, color: TEXT_DIM }}>{client}</div>
      <div style={{ fontSize: 10, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
        {status}
      </div>
    </div>
  </div>
);

export default function PropusDashboard() {
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // Demo data
  const revenueData = [320, 410, 380, 450, 390, 420, 380, 340, 310, 290, 340, 380, 360, 330, 280, 300, 320, 290, 310, 330, 350, 320, 290, 270, 250, 280, 300, 320, 290, 310];
  const bookingsWeekly = [8, 6, 9, 5, 7, 4, 3, 5];
  const ordersData = [10, 12, 11, 13, 14, 13, 12, 13];
  const capacityData = [60, 70, 85, 75, 80, 65, 70, 75, 82, 68];

  const overdueOrders = [
    { orderId: '100077', address: 'Max-Högger-Strasse 6, 8048 Zürich', client: 'Salena His', daysOverdue: 15 },
    { orderId: '100074', address: 'Pany, 7243 Luzein', client: 'Denise Kühne-Olsch', daysOverdue: 15 },
    { orderId: '100070', address: 'Ampeliweg 4, 5306 Tegerfelden', client: 'Numma', daysOverdue: 10 },
    { orderId: '100085', address: 'Claridenweg 26, 8604 Volketswil', client: 'Boesch', daysOverdue: 10 },
    { orderId: '100080', address: 'Sackmatt, 6212 Knutwil', client: 'Schmid', daysOverdue: 2 },
  ];

  const visibleAlerts = showAllAlerts ? overdueOrders : overdueOrders.slice(0, 3);

  const plannedOrders = [
    { orderId: '100086', address: 'Furtbachstrasse 16, 8107 Buchs', client: 'Salena His', status: 'Heute', color: GOLD },
    { orderId: '100076', address: 'Sternenweg 1, 6300 Zug', client: 'Richard A. Lödi', status: 'Mi. 22.04.', color: TEXT_DIM },
    { orderId: '100081', address: 'Sumpfgässli 8, 6417 Sattel', client: 'Richard A. Lödi', status: 'Mi. 22.04.', color: TEXT_DIM },
  ];

  const inProgressOrders = [
    { orderId: '100074', address: 'Pany, 7243 Luzein', client: 'Denise Kühne-Olsch', status: '15T überfällig', color: DANGER },
    { orderId: '100070', address: 'Ampeliweg 4, 5306 Tegerfelden', client: 'Numma', status: '15T überfällig', color: DANGER },
    { orderId: '100077', address: 'Max-Högger-Strasse 6, 8048 Zürich', client: 'Salena His', status: '10T überfällig', color: DANGER },
  ];

  const funnelData = [
    { label: 'Anfragen', value: 50, pct: 100 },
    { label: 'Angebote', value: 36, pct: 72 },
    { label: 'Bestätigt', value: 35, pct: 70 },
    { label: 'Abgeschlossen', value: 28, pct: 56 },
  ];

  const heatmap = {
    1: 0.3, 2: 0.5, 7: 0.4, 8: 0.3, 15: 0.6, 16: 0.5, 17: 0.4, 18: 0.9, 22: 0.5, 23: 0.4,
  };

  return (
    <div style={{
      background: BG,
      minHeight: '100vh',
      padding: '24px 28px',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      color: '#fff',
    }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap" />

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{
            fontSize: 10,
            letterSpacing: '0.18em',
            color: GOLD,
            textTransform: 'uppercase',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ width: 20, height: 1, background: GOLD, display: 'inline-block' }} />
            Samstag · 18. April 2026
          </div>
          <h1 style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 30,
            fontWeight: 400,
            margin: 0,
            color: '#fff',
            letterSpacing: '-0.01em',
          }}>
            Guten Abend, Janez.
          </h1>
          <div style={{ fontSize: 13, color: TEXT_DIM, marginTop: 6 }}>
            <span style={{ color: GOLD, fontWeight: 500 }}>5 Aufträge</span> überfällig ·{' '}
            <span style={{ color: '#fff' }}>3 Shootings</span> geplant diese Woche ·{' '}
            Slot-Auslastung KW 16: <span style={{ color: '#fff' }}>68 %</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{
            background: 'transparent',
            border: `1px solid ${BORDER}`,
            color: TEXT_DIM,
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Anpassen
          </button>
          <button style={{
            background: GOLD,
            border: 'none',
            color: BG,
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            + Neuer Auftrag
          </button>
        </div>
      </div>

      {/* PRIORITY ALERT BAR - überfällige Aufträge */}
      <div style={{
        background: `linear-gradient(135deg, ${DANGER_SOFT} 0%, ${CARD} 50%)`,
        border: `1px solid ${DANGER}44`,
        borderLeft: `3px solid ${DANGER}`,
        borderRadius: 12,
        marginBottom: 20,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={16} style={{ color: DANGER }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
              {overdueOrders.length} Aufträge überfällig
            </div>
            <div style={{ fontSize: 12, color: TEXT_DIM }}>
              · Handlung erforderlich
            </div>
          </div>
          <button
            onClick={() => setShowAllAlerts(!showAllAlerts)}
            style={{
              background: 'transparent',
              border: 'none',
              color: GOLD,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'inherit',
            }}
          >
            {showAllAlerts ? 'Weniger' : `Alle ${overdueOrders.length}`}
            <ArrowUpRight size={12} />
          </button>
        </div>
        {visibleAlerts.map((o) => (
          <AlertRow key={o.orderId} {...o} />
        ))}
      </div>

      {/* DENSE KPI ROW */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        marginBottom: 20,
      }}>
        <KpiCard
          label="Umsatz 30T"
          value="CHF 9'578"
          delta="−37.7 %"
          deltaDir="down"
          icon={Banknote}
        >
          <Sparkline data={revenueData} color={DANGER} />
        </KpiCard>

        <KpiCard
          label="Neue Buchungen"
          value="5"
          sublabel="diese Woche"
          delta="+3"
          deltaDir="up"
          icon={Calendar}
        >
          <MiniBars data={bookingsWeekly} color={GOLD} />
        </KpiCard>

        <KpiCard
          label="Offene Aufträge"
          value="13"
          sublabel={<span style={{ color: DANGER }}>5 überfällig</span>}
          icon={Package}
        >
          <Sparkline data={ordersData} color={GOLD} />
        </KpiCard>

        <KpiCard
          label="Kapazität KW 16"
          value="68 %"
          sublabel="Slots"
          delta="+12 %"
          deltaDir="up"
          icon={Zap}
        >
          <Sparkline data={capacityData} color={GOLD} />
        </KpiCard>

        <KpiCard
          label="Offene Forderungen"
          value="CHF 0"
          sublabel="—"
          icon={Target}
        >
          <div style={{
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: TEXT_MUTED,
          }}>
            Keine ausstehenden Rechnungen
          </div>
        </KpiCard>
      </div>

      {/* MIDDLE ROW: Pipeline + Today */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 16,
        marginBottom: 20,
      }}>
        {/* Pipeline */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{
                fontFamily: '"DM Serif Display", serif',
                fontSize: 16,
                color: '#fff',
              }}>
                Auftrags-Pipeline
              </div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                Drag & Drop zum Verschieben
              </div>
            </div>
            <button style={{
              background: 'transparent',
              border: 'none',
              color: GOLD,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'inherit',
            }}>
              Board öffnen <ArrowUpRight size={12} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { title: 'Angefragt', count: 0, items: [] },
              { title: 'Geplant', count: 7, items: plannedOrders },
              { title: 'In Bearbeitung', count: 6, items: inProgressOrders },
              { title: 'Geliefert', count: 8, items: [] },
            ].map((col) => (
              <div key={col.title}>
                <div style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: TEXT_DIM,
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: 6,
                  borderBottom: `1px solid ${BORDER}`,
                }}>
                  <span>{col.title}</span>
                  <span style={{ color: GOLD, fontWeight: 600 }}>{col.count}</span>
                </div>
                {col.items.length === 0 ? (
                  <div style={{
                    fontSize: 11,
                    color: TEXT_MUTED,
                    fontStyle: 'italic',
                    padding: '12px 4px',
                  }}>
                    Keine Einträge
                  </div>
                ) : (
                  col.items.map((item) => (
                    <PipelineCard
                      key={item.orderId}
                      {...item}
                      statusColor={item.color}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Today + Upcoming */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '16px 18px',
        }}>
          <div style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 16,
            color: '#fff',
            marginBottom: 4,
          }}>
            Heute · 18. April
          </div>
          <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 16 }}>
            Keine Termine geplant
          </div>

          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: TEXT_DIM,
            marginBottom: 10,
          }}>
            Nächste Termine
          </div>

          {[
            { date: 'Mo', day: '20', time: '09:00', address: 'Furtbachstr. 16, Buchs', type: 'Shooting' },
            { date: 'Mi', day: '22', time: '10:30', address: 'Sternenweg 1, Zug', type: 'Shooting' },
            { date: 'Mi', day: '22', time: '14:00', address: 'Sumpfgässli 8, Sattel', type: 'Shooting' },
          ].map((t, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: i < 2 ? `1px solid ${BORDER}` : 'none',
            }}>
              <div style={{
                width: 40,
                height: 40,
                background: GOLD_SOFT,
                border: `1px solid ${BORDER_STRONG}`,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 8, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t.date}
                </div>
                <div style={{
                  fontFamily: '"DM Serif Display", serif',
                  fontSize: 16,
                  color: '#fff',
                  lineHeight: 1,
                }}>
                  {t.day}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>
                  {t.address}
                </div>
                <div style={{ fontSize: 11, color: TEXT_DIM }}>
                  {t.time} · {t.type}
                </div>
              </div>
              <Camera size={14} style={{ color: GOLD, opacity: 0.5 }} />
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM ROW: Funnel, Heatmap, Performance */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 16,
      }}>
        {/* Funnel */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '16px 18px',
        }}>
          <div style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 15,
            color: '#fff',
            marginBottom: 2,
          }}>
            Buchungs-Funnel
          </div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            30 Tage · Conversion 56 %
          </div>

          {funnelData.map((f, i) => (
            <div key={f.label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#fff' }}>{f.label}</span>
                <span style={{ fontSize: 11, color: TEXT_DIM, fontVariantNumeric: 'tabular-nums' }}>
                  {f.value} · {f.pct}%
                </span>
              </div>
              <div style={{
                width: `${f.pct}%`,
                height: 6,
                background: `linear-gradient(90deg, ${GOLD_DIM}, ${GOLD})`,
                borderRadius: 3,
                transition: 'width 0.5s',
              }} />
              {i < funnelData.length - 1 && (
                <div style={{
                  fontSize: 10,
                  color: DANGER,
                  marginTop: 3,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  −{funnelData[i].value - funnelData[i+1].value} drop ({Math.round((1 - funnelData[i+1].value/funnelData[i].value)*100)}%)
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Heatmap */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '16px 18px',
        }}>
          <div style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 15,
            color: '#fff',
            marginBottom: 2,
          }}>
            Kalender-Heatmap
          </div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            April 2026 · Shootings pro Tag
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
            {['MO','DI','MI','DO','FR','SA','SO'].map((d) => (
              <div key={d} style={{ fontSize: 9, color: TEXT_MUTED, textAlign: 'center', letterSpacing: '0.08em' }}>
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: 30 }, (_, i) => {
              const day = i + 1;
              const intensity = heatmap[day] || 0;
              const isToday = day === 18;
              return (
                <div
                  key={day}
                  style={{
                    aspectRatio: '1',
                    background: intensity > 0
                      ? `rgba(182, 142, 32, ${0.15 + intensity * 0.7})`
                      : 'rgba(255,255,255,0.025)',
                    border: isToday ? `1.5px solid ${GOLD}` : `1px solid ${intensity > 0 ? BORDER : 'transparent'}`,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: intensity > 0.3 ? '#fff' : TEXT_DIM,
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, color: TEXT_MUTED }}>wenig</span>
            {[0.15, 0.35, 0.6, 0.85].map((i) => (
              <div key={i} style={{
                width: 10,
                height: 10,
                background: `rgba(182, 142, 32, ${i})`,
                borderRadius: 2,
              }} />
            ))}
            <span style={{ fontSize: 10, color: TEXT_MUTED }}>voll</span>
          </div>
        </div>

        {/* Performance / Activity */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '16px 18px',
        }}>
          <div style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 15,
            color: '#fff',
            marginBottom: 2,
          }}>
            Performance KW 16
          </div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Kennzahlen dieser Woche
          </div>

          {[
            { label: 'Aufgaben erledigt', value: '0 / 0', color: TEXT_DIM },
            { label: 'Ø Reaktionszeit', value: '2.4 h', color: '#fff' },
            { label: 'Pünktliche Lieferungen', value: '60 %', color: DANGER, warning: true },
            { label: 'Durchschn. Auftragswert', value: 'CHF 680', color: '#fff' },
            { label: 'Revisionen pro Auftrag', value: '0.8', color: '#fff' },
          ].map((row, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '9px 0',
              borderBottom: i < 4 ? `1px solid ${BORDER}` : 'none',
            }}>
              <div style={{ fontSize: 12, color: TEXT_DIM, display: 'flex', alignItems: 'center', gap: 6 }}>
                {row.warning && <Circle size={6} fill={DANGER} style={{ color: DANGER }} />}
                {row.label}
              </div>
              <div style={{
                fontSize: 13,
                color: row.color,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 500,
              }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop: 20,
        fontSize: 10,
        color: TEXT_MUTED,
        textAlign: 'center',
        letterSpacing: '0.1em',
      }}>
        PROPUS · Dashboard v2 · Demo-Daten
      </div>
    </div>
  );
}
