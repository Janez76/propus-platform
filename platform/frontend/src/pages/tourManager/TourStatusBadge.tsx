/**
 * Status-Badge für Tour-Status und Matterport-Status.
 * Spiegelt exakt die CSS-Klassen und Labels aus tours/views/admin/tours-list.ejs.
 */
import type { TourStatus, MatterportState } from '../../types/tourManager';
import { TOUR_STATUS_LABELS, MATTERPORT_STATE_LABELS } from '../../types/tourManager';

interface TourStatusBadgeProps {
  status: TourStatus | string;
  note?: string | null;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  EXPIRING_SOON: 'bg-amber-100 text-amber-800 border-amber-200',
  AWAITING_CUSTOMER_DECISION: 'bg-sky-100 text-sky-800 border-sky-200',
  CUSTOMER_ACCEPTED_AWAITING_PAYMENT: 'bg-amber-100 text-amber-700 border-amber-200',
  CUSTOMER_DECLINED: 'bg-slate-100 text-slate-600 border-slate-200',
  EXPIRED_PENDING_ARCHIVE: 'bg-orange-100 text-orange-700 border-orange-200',
  ARCHIVED: 'bg-slate-100 text-slate-500 border-slate-200',
  SUSPENDED_NONPAYMENT: 'bg-red-100 text-red-700 border-red-200',
};

export function TourStatusBadge({ status, note, className = '' }: TourStatusBadgeProps) {
  const label =
    TOUR_STATUS_LABELS[status as TourStatus] ??
    String(status).replace(/_/g, ' ');
  const color = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div>
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${color} ${className}`}
      >
        {label}
      </span>
      {note && (
        <div className="mt-0.5 text-[0.72rem] text-[var(--text-subtle)]">{note}</div>
      )}
    </div>
  );
}

interface InvoiceStatusTagProps {
  tone?: 'none' | 'success' | 'warning' | 'danger' | string;
  label?: string | null;
}

const TONE_COLORS: Record<string, string> = {
  none: 'bg-slate-100 text-slate-500 border-slate-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
};

export function InvoiceStatusTag({ tone = 'none', label = 'Keine Rechnung' }: InvoiceStatusTagProps) {
  const color = TONE_COLORS[tone] ?? TONE_COLORS.none;
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-bold ${color}`}>
      {label}
    </span>
  );
}

interface MatterportStateBadgeProps {
  state?: MatterportState | string | null;
}

const MP_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  processing: 'bg-sky-100 text-sky-700',
  failed: 'bg-red-100 text-red-700',
  unknown: 'bg-slate-100 text-slate-400',
};

export function MatterportStateBadge({ state }: MatterportStateBadgeProps) {
  if (!state) return null;
  const label = MATTERPORT_STATE_LABELS[state as MatterportState] ?? state;
  const color = MP_COLORS[state] ?? MP_COLORS.unknown;
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.68rem] font-semibold ${color}`}>
      {label}
    </span>
  );
}
