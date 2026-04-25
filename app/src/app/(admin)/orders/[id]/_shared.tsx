import type { ReactNode } from 'react';

/**
 * Statuswerte, bei denen die Bestellung als „schreibgeschützt" gilt.
 * Wird im Hero-Lock-Chip angezeigt und vom „Bearbeiten"-Button respektiert.
 * Status `done` zählt zusätzlich, weil Aufträge nach Abschluss nicht mehr
 * geändert werden sollten (siehe `OrderChat.tsx` CHAT_BLOCKED_STATUSES).
 */
export const READ_ONLY_STATUSES: ReadonlySet<string> = new Set([
  'cancelled',
  'archived',
  'done',
]);

export function isOrderReadOnly(status: string | null | undefined): boolean {
  if (!status) return false;
  return READ_ONLY_STATUSES.has(status);
}

export const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending:     { label: 'Offen',          className: 'bg-[#FBEED4] text-[#8A5710] border border-[#B87514]/30' },
  provisional: { label: 'Provisorisch',   className: 'bg-[#EDE5FA] text-[#4A2F8E] border border-[#7C5BC9]/30' },
  confirmed:   { label: 'Bestätigt',      className: 'bg-[#E6F2E3] text-[#1F5C20] border border-[#2A7A2A]/30' },
  completed:   { label: 'Abgeschlossen',  className: 'bg-[#D6F1ED] text-[#0A5C53] border border-[#0F8A7E]/30' },
  done:        { label: 'Erledigt',       className: 'bg-[#DFEBF5] text-[#244865] border border-[#244865]/30' },
  paused:      { label: 'Pausiert',       className: 'bg-[#EFEDE6] text-[#3C3B38] border border-[#6B6962]/30' },
  cancelled:   { label: 'Storniert',      className: 'bg-[#F8E0DB] text-[#8A2515] border border-[#B4311B]/30' },
  archived:    { label: 'Archiviert',     className: 'bg-[#F0EBDF] text-[#3C3B38] border border-[#6B6962]/30' },
};

export function Section({
  title, icon, children, right, accent,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={`bd-sect${accent ? ' is-accent' : ''}`}>
      <header className="bd-sect-head">
        {icon}
        <h2>{title}</h2>
        {right && <div className="bd-sect-actions">{right}</div>}
      </header>
      <div className="bd-sect-body">{children}</div>
    </section>
  );
}

export function InfoItem({ label, value }: { label: string; value: string | ReactNode }) {
  return (
    <div>
      <p className="bd-info-k">{label}</p>
      <p className="bd-info-v">{value}</p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[#9A968C] italic">{children}</p>;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="bd-kpi-grid">{children}</div>;
}

export function Kpi({
  icon, label, value, sub, accent,
}: {
  icon?: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'gold' | 'success' | 'warn' | 'danger' | 'info';
}) {
  const cls = accent ? ` is-${accent}` : '';
  return (
    <div className={`bd-kpi${cls}`}>
      {icon && <div className="bd-kpi-icon">{icon}</div>}
      <div className="min-w-0">
        <div className="bd-kpi-label">{label}</div>
        <div className="bd-kpi-value">{value}</div>
        {sub && <div className="bd-kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}


export function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

export function formatCHF(amount: number | string | null | undefined) {
  if (amount == null || amount === '') return '—';
  const n = typeof amount === 'number'
    ? amount
    : Number(String(amount).replace(/[^\d.,-]/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(n);
}

export function formatDateTime(dateStr: string | null, timeStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T${timeStr ?? '00:00'}:00`);
  const datePart = new Intl.DateTimeFormat('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
  if (timeStr) {
    const timePart = new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }).format(d);
    return `${datePart}, ${timePart}`;
  }
  return datePart;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatTS(ts: string | Date | null | undefined): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('de-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts as string));
}
