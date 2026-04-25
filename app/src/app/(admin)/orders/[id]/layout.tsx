import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, User, Clock, Receipt,
  Lock, Printer, Copy, MoreHorizontal,
} from 'lucide-react';
import { getAdminSession, requireOrderViewAccess } from '@/lib/auth.server';
import { loadOrderContext } from './_order-context';
import { OrderTabs } from './order-tabs';
import { OrderReadOnlyBadge, OrderEditActions } from './header-actions';
import { OrderSaveToast } from './order-save-toast';
import { OrderEditShellProvider } from './order-edit-shell-context';
import { OrderEditShellContent } from './order-edit-shell-content';
import { OrderBulkDirtyHint } from './order-bulk-hint';
import './bestellung-detail.css';

type StatusMeta = {
  label: string;
  color: string;
  bg: string;
  text: string;
  border: string;
};

const STATUS_META: Record<string, StatusMeta> = {
  pending:     { label: 'Offen',          color: '#B87514', bg: '#FBEED4', text: '#8A5710', border: 'rgba(184,117,20,0.33)' },
  provisional: { label: 'Provisorisch',   color: '#7C5BC9', bg: '#EDE5FA', text: '#4A2F8E', border: 'rgba(124,91,201,0.33)' },
  confirmed:   { label: 'Bestätigt',      color: '#2A7A2A', bg: '#E6F2E3', text: '#1F5C20', border: 'rgba(42,122,42,0.33)' },
  completed:   { label: 'Abgeschlossen',  color: '#0F8A7E', bg: '#D6F1ED', text: '#0A5C53', border: 'rgba(15,138,126,0.33)' },
  done:        { label: 'Erledigt',       color: '#244865', bg: '#DFEBF5', text: '#244865', border: 'rgba(36,72,101,0.33)' },
  paused:      { label: 'Pausiert',       color: '#6B6962', bg: '#EFEDE6', text: '#3C3B38', border: 'rgba(107,105,98,0.33)' },
  cancelled:   { label: 'Storniert',      color: '#B4311B', bg: '#F8E0DB', text: '#8A2515', border: 'rgba(180,49,27,0.33)' },
  archived:    { label: 'Archiviert',     color: '#6B6962', bg: '#F0EBDF', text: '#3C3B38', border: 'rgba(107,105,98,0.33)' },
};

function formatAppointment(date: string | null, time: string | null) {
  if (!date) return '—';
  const d = new Date(`${date}T${time ?? '00:00'}:00`);
  const datePart = new Intl.DateTimeFormat('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
  const timePart = time
    ? new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }).format(d)
    : null;
  return timePart ? `${datePart}, ${timePart}` : datePart;
}

function formatCHF(amount: number | null | undefined) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount);
}

function formatCreated(ts: string) {
  return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts));
}

type Props = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function OrderLayout({ children, params }: Props) {
  const { id } = await params;

  // Kunden-Rollen dürfen nur ihre eigene Bestellung sehen.
  const session = await getAdminSession();
  if (session) {
    await requireOrderViewAccess(id, session);
  }

  const orderNo = Number(id);
  if (!Number.isInteger(orderNo) || orderNo <= 0) {
    notFound();
  }

  const order = await loadOrderContext(orderNo);
  if (!order) notFound();

  const status = STATUS_META[order.status] ?? STATUS_META.pending;

  return (
    <OrderEditShellProvider orderNo={order.order_no}>
      <div className="bestellung-shell min-h-screen">
        <div className="bd-topbar">
          <div className="bd-crumbs">
            <Link href="/orders">
              <ArrowLeft className="h-3.5 w-3.5" />
              Bestellungen
            </Link>
            <span className="sep">›</span>
            <strong>#{order.order_no}</strong>
            <Suspense fallback={null}>
              <OrderReadOnlyBadge />
            </Suspense>
          </div>

          <div className="bd-top-actions">
            <button type="button" className="bd-icon-btn" title="Drucken" aria-label="Drucken">
              <Printer />
            </button>
            <button type="button" className="bd-icon-btn" title="Duplizieren" aria-label="Duplizieren">
              <Copy />
            </button>
            <button type="button" className="bd-icon-btn" title="Mehr" aria-label="Mehr">
              <MoreHorizontal />
            </button>
            <Suspense fallback={null}>
              <OrderEditActions orderNo={order.order_no} />
            </Suspense>
          </div>
        </div>

        <header className="bd-hero">
          <div className="bd-eyebrow">— Bestellung · erstellt {formatCreated(order.created_at)}</div>
          <h1 className="bd-h1">
            Bestellung <span className="num">#{order.order_no}</span>
          </h1>
          <div className="bd-hero-sub">
            <span
              className="bd-status-chip"
              style={{ background: status.bg, color: status.text, borderColor: status.border }}
            >
              <span className="dot" style={{ background: status.color }} />
              {status.label}
            </span>
            {order.done_at && (
              <span className="bd-lock-chip">
                <Lock className="h-3 w-3" />
                Schreibgeschützt
              </span>
            )}
            <span className="bd-hero-meta">· Zuletzt aktualisiert {formatCreated(order.updated_at)}</span>
          </div>

          <div className="bd-hero-stats">
            <HeroStat
              icon={<Calendar />}
              label="Termin"
              value={formatAppointment(order.schedule_date, order.schedule_time)}
            />
            <HeroStat
              icon={<User />}
              label="Mitarbeiter"
              value={order.photographer_name ?? '—'}
            />
            <HeroStat
              icon={<Clock />}
              label="Dauer"
              value={order.duration_min ? `${order.duration_min} Min` : '—'}
            />
            <HeroStat
              icon={<Receipt />}
              label="Total inkl. MwSt"
              value={formatCHF(order.total_chf)}
              variant="total"
            />
          </div>
        </header>

        <div className="bd-tabbar">
          <div className="bd-tabbar-inner">
            <OrderTabs orderId={String(order.order_no)} />
          </div>
        </div>

        <main className="bd-content">
          <Suspense fallback={null}>
            <OrderSaveToast />
          </Suspense>
          <OrderBulkDirtyHint />
          <OrderEditShellContent orderId={String(order.order_no)}>
            {children}
          </OrderEditShellContent>
        </main>
      </div>
    </OrderEditShellProvider>
  );
}

function HeroStat({
  icon, label, value, variant,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  variant?: 'total';
}) {
  return (
    <div className={`bd-hero-stat${variant === 'total' ? ' is-total' : ''}`}>
      <div className="hs-icon">{icon}</div>
      <div className="min-w-0">
        <div className="hs-label">{label}</div>
        <div className={`hs-value${variant === 'total' ? ' gold' : ''}`}>{value}</div>
      </div>
    </div>
  );
}
