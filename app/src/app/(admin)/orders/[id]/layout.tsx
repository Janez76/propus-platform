import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, User, Clock, Receipt } from 'lucide-react';
import { queryOne } from '@/lib/db';
import { getAdminSession, requireOrderViewAccess } from '@/lib/auth.server';
import { OrderTabs } from './order-tabs';
import { OrderReadOnlyBadge, OrderEditActions } from './header-actions';
import { OrderSaveToast } from './order-save-toast';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending:    { label: 'Offen',          className: 'bg-amber-500/15 text-amber-400' },
  provisional:{ label: 'Provisorisch',   className: 'bg-yellow-500/15 text-yellow-400' },
  confirmed:  { label: 'Bestätigt',      className: 'bg-emerald-500/15 text-emerald-400' },
  completed:  { label: 'Abgeschlossen',  className: 'bg-blue-500/15 text-blue-400' },
  done:       { label: 'Erledigt',       className: 'bg-blue-500/15 text-blue-400' },
  paused:     { label: 'Pausiert',       className: 'bg-zinc-500/15 text-zinc-400' },
  cancelled:  { label: 'Storniert',      className: 'bg-rose-500/15 text-rose-400' },
  archived:   { label: 'Archiviert',     className: 'bg-white/10 text-white/50' },
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

  const order = await queryOne<{
    id: number;
    order_no: number;
    status: string;
    schedule_date: string | null;
    schedule_time: string | null;
    duration_min: number | null;
    total_chf: number | null;
    photographer_name: string | null;
  }>(`
    SELECT
      o.id,
      o.order_no,
      o.status,
      o.schedule_date,
      o.schedule_time,
      (o.schedule->>'durationMin')::int    AS duration_min,
      (o.pricing->>'total')::numeric       AS total_chf,
      p.name                               AS photographer_name
    FROM booking.orders o
    LEFT JOIN booking.photographers p ON p.key = o.photographer_key
    WHERE o.order_no = $1
  `, [id]);

  if (!order) notFound();

  const status = STATUS_LABEL[order.status] ?? STATUS_LABEL.pending;

  return (
    <div className="min-h-screen bg-[#0c0d10] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0c0d10]/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <Link
                href="/orders"
                className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Bestellungen
              </Link>
              <span className="text-white/20">/</span>
              <h1 className="text-xl font-semibold tracking-tight">
                Bestellung #{order.order_no}
              </h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
              <Suspense fallback={null}>
                <OrderReadOnlyBadge />
              </Suspense>
            </div>

            <Suspense fallback={null}>
              <OrderEditActions orderNo={order.order_no} />
            </Suspense>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-4 md:grid-cols-4">
            <MetaCard
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Termin"
              value={formatAppointment(order.schedule_date, order.schedule_time)}
            />
            <MetaCard
              icon={<User className="h-3.5 w-3.5" />}
              label="Mitarbeiter"
              value={order.photographer_name ?? '—'}
            />
            <MetaCard
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Dauer"
              value={order.duration_min ? `${order.duration_min} min` : '—'}
            />
            <MetaCard
              icon={<Receipt className="h-3.5 w-3.5" />}
              label="Total"
              value={formatCHF(order.total_chf)}
            />
          </div>

          <OrderTabs orderId={String(order.order_no)} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Suspense fallback={null}>
          <OrderSaveToast />
        </Suspense>
        {children}
      </main>
    </div>
  );
}

function MetaCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
      <div className="rounded-lg border border-white/10 bg-white/2 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
