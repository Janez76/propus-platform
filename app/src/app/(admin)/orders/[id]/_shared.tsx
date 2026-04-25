import type { ReactNode } from 'react';

export const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending:     { label: 'Offen',          className: 'bg-amber-500/15 text-amber-400' },
  provisional: { label: 'Provisorisch',   className: 'bg-yellow-500/15 text-yellow-400' },
  confirmed:   { label: 'Bestätigt',      className: 'bg-emerald-500/15 text-emerald-400' },
  completed:   { label: 'Abgeschlossen',  className: 'bg-blue-500/15 text-blue-400' },
  done:        { label: 'Erledigt',       className: 'bg-blue-500/15 text-blue-400' },
  paused:      { label: 'Pausiert',       className: 'bg-zinc-500/15 text-zinc-400' },
  cancelled:   { label: 'Storniert',      className: 'bg-rose-500/15 text-rose-400' },
  archived:    { label: 'Archiviert',     className: 'bg-white/10 text-white/50' },
};

export function Section({
  title, icon, children, right,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          {icon}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function InfoItem({ label, value }: { label: string; value: string | ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-white/30">{children}</p>;
}

export function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
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
