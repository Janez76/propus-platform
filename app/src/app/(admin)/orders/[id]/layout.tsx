import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, User, Clock, Receipt,
  Lock,
} from 'lucide-react';
import { getAdminSession, requireOrderViewAccess } from '@/lib/auth.server';
import { loadOrderContext } from './_order-context';
import { OrderTabs } from './order-tabs';
import { OrderEditActions } from './header-actions';
import { OrderSaveToast } from './order-save-toast';
import { OrderEditShellProvider } from './order-edit-shell-context';
import { OrderEditShellContent } from './order-edit-shell-content';
import { OrderBulkDirtyHint } from './order-bulk-hint';
import { OrderTopActions } from './topbar-actions';
import { isOrderReadOnly, formatDateTime as sharedFormatDateTime } from './_shared';
import { getStatusLabel } from '@/lib/status';
import { AppSidebar } from '@/components/layout/AppSidebar';
import type { Role } from '@/types';
import './bestellung-detail.css';

type StatusChipColors = {
  color: string;
  bg: string;
  text: string;
  border: string;
};

/**
 * Hex-Farben pro DB-Status für das Hero-Chip. Label kommt aus dem
 * zentralen STATUS_MAP (lib/status.ts), damit Detail-Page, Kanban und
 * Liste denselben Begriff verwenden. Sub-Stati (provisional,
 * disposition_offen, archived) bekommen eigene Farben, damit Office
 * den Sub-Zustand erkennt, aber das Label folgt dem Bucket
 * (Ausstehend bzw. Abgeschlossen).
 */
const STATUS_CHIP_COLORS: Record<string, StatusChipColors> = {
  pending:           { color: '#B87514', bg: '#FBEED4', text: '#8A5710', border: 'rgba(184,117,20,0.33)' },
  provisional:       { color: '#7C5BC9', bg: '#EDE5FA', text: '#4A2F8E', border: 'rgba(124,91,201,0.33)' },
  disposition_offen: { color: '#D97706', bg: '#FCE7C2', text: '#8A4A10', border: 'rgba(217,119,6,0.33)' },
  confirmed:         { color: '#2A7A2A', bg: '#E6F2E3', text: '#1F5C20', border: 'rgba(42,122,42,0.33)' },
  paused:            { color: '#7C5BC9', bg: '#EDE5FA', text: '#4A2F8E', border: 'rgba(124,91,201,0.33)' },
  completed:         { color: '#0F8A7E', bg: '#D6F1ED', text: '#0A5C53', border: 'rgba(15,138,126,0.33)' },
  done:              { color: '#10B981', bg: '#DCFCE7', text: '#065F46', border: 'rgba(16,185,129,0.33)' },
  cancelled:         { color: '#B4311B', bg: '#F8E0DB', text: '#8A2515', border: 'rgba(180,49,27,0.33)' },
  archived:          { color: '#6B6962', bg: '#F0EBDF', text: '#3C3B38', border: 'rgba(107,105,98,0.33)' },
};

function formatAppointment(date: string | null, time: string | null) {
  // Vereinheitlicht via shared formatDateTime (UTC-parse) — vorher gab es
  // einen lokalen Parser ohne Z-Suffix der ein anderes Datum produzierte
  // als _shared.formatDateTime, sodass Hero und Tab-Inhalte divergierten.
  return sharedFormatDateTime(date, time);
}

function formatTerminValue(date: string | null, time: string | null) {
  // Em-dash war fuer User unklar — explizite Hinweise sind verstaendlicher.
  if (!date) return 'Noch nicht terminiert';
  return formatAppointment(date, time);
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

  const statusColors = STATUS_CHIP_COLORS[order.status] ?? STATUS_CHIP_COLORS.pending;
  const statusLabel = getStatusLabel(order.status);
  const sessionRole = (session?.role ?? 'admin') as Role;

  return (
    <OrderEditShellProvider orderNo={order.order_no}>
      <div className="bestellung-page">
        <AppSidebar initialRole={sessionRole} />
        <div className="bestellung-shell">
        <div className="bd-topbar">
          <div className="bd-crumbs">
            <Link href="/orders">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="bd-crumb-label">Bestellungen</span>
            </Link>
            <span className="sep">›</span>
            <strong>#{order.order_no}</strong>
            {/* OrderReadOnlyBadge wurde hier entfernt — der Schreibgeschuetzt-
                Hinweis erscheint nur noch im Hero-Bereich darunter. */}
          </div>

          <div className="bd-top-actions">
            <OrderTopActions orderNo={order.order_no} status={order.status} />
            <Suspense fallback={null}>
              <OrderEditActions orderNo={order.order_no} status={order.status} />
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
              style={{ background: statusColors.bg, color: statusColors.text, borderColor: statusColors.border }}
            >
              <span className="dot" style={{ background: statusColors.color }} />
              {statusLabel}
            </span>
            {/* Schreibgeschuetzt-Chip nur im Hero, NICHT auch in der Topbar
                (Doppelung vermieden — OrderReadOnlyBadge in der Topbar
                bleibt deaktiviert, siehe header-actions.tsx). */}
            {isOrderReadOnly(order.status) && (
              <span
                className="bd-lock-chip"
                title={`Status: ${statusLabel} — Bearbeitung deaktiviert`}
              >
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
              value={formatTerminValue(order.schedule_date, order.schedule_time)}
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
