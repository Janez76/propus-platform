import { notFound } from 'next/navigation';
import { History, ArrowRight } from 'lucide-react';
import { queryOne, query } from '@/lib/db';
import { Empty, Badge, STATUS_LABEL, formatTS } from '../_shared';
import { VerlaufFilters } from './verlauf-filters';

type EventEntry = {
  id: string;
  kind: 'event' | 'status';
  event_type: string;
  actor: string | null;
  actor_role: string | null;
  description: string;
  from_status?: string | null;
  to_status?: string | null;
  created_at: string;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  status_changed:      'Status geändert',
  billing_updated:     'Rechnungsdaten aktualisiert',
  schedule_updated:    'Termin aktualisiert',
  services_updated:    'Leistungen aktualisiert',
  photographer_assigned: 'Mitarbeiter zugewiesen',
  order_created:       'Bestellung erstellt',
  confirmation_sent:   'Bestätigung gesendet',
  review_requested:    'Bewertung angefordert',
  object_updated:      'Objekt aktualisiert',
  pricing_updated:     'Preis aktualisiert',
  note_added:          'Notiz hinzugefügt',
  file_uploaded:       'Datei hochgeladen',
  folder_created:      'Ordner erstellt',
  calendar_synced:     'Kalender synchronisiert',
  message_sent:        'Nachricht gesendet',
  message_deleted:     'Nachricht gelöscht',
  folder_updated:      'Ordner verknüpft',
};

type SP = { eventType?: string; from?: string; to?: string };

export default async function VerlaufPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SP>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : ({} as SP);
  const evF = sp.eventType?.trim() || "";
  const fromD = sp.from || "";
  const toD = sp.to || "";
  const filterStatusOnly = evF === "status_changed";

  const orderCheck = await queryOne<{ order_no: number }>(`
    SELECT order_no FROM booking.orders WHERE order_no = $1
  `, [id]);
  if (!orderCheck) notFound();

  const evConds: string[] = ["order_no = $1"];
  const evParams: (string | number)[] = [id];
  let p = 2;
  if (evF && !filterStatusOnly) {
    evConds.push(`event_type = $${p}`);
    evParams.push(evF);
    p += 1;
  }
  if (fromD) {
    evConds.push(`created_at::date >= $${p}::date`);
    evParams.push(fromD);
    p += 1;
  }
  if (toD) {
    evConds.push(`created_at::date <= $${p}::date`);
    evParams.push(toD);
    p += 1;
  }

  const stConds = ["order_no = $1"];
  const stParams: (string | number)[] = [id];
  let s = 2;
  if (fromD) {
    stConds.push(`created_at::date >= $${s}::date`);
    stParams.push(fromD);
    s += 1;
  }
  if (toD) {
    stConds.push(`created_at::date <= $${s}::date`);
    stParams.push(toD);
    s += 1;
  }

  const [eventLog, statusAudit] = await Promise.all([
    !filterStatusOnly
      ? query<{
        id: number;
        event_type: string;
        actor_user: string | null;
        actor_role: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      }>(`
        SELECT id, event_type, actor_user, actor_role, metadata, created_at
        FROM booking.order_event_log
        WHERE ${evConds.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 200
      `, evParams)
      : Promise.resolve([]),

    !evF || filterStatusOnly
      ? query<{
        id: number;
        from_status: string | null;
        to_status: string;
        source: string | null;
        actor_id: string | null;
        created_at: string;
      }>(`
        SELECT id, from_status, to_status, source, actor_id, created_at
        FROM booking.order_status_audit
        WHERE ${stConds.join(" AND ")}
        ORDER BY created_at DESC
      `, stParams)
      : Promise.resolve([]),
  ]);

  const events: EventEntry[] = [
    ...eventLog.map((e) => ({
      id: `event-${e.id}`,
      kind: 'event' as const,
      event_type: e.event_type,
      actor: e.actor_user,
      actor_role: e.actor_role,
      description: EVENT_TYPE_LABEL[e.event_type] ?? e.event_type,
      created_at: e.created_at,
    })),
    ...statusAudit.map((s) => ({
      id: `status-${s.id}`,
      kind: 'status' as const,
      event_type: 'status_changed',
      actor: s.actor_id,
      actor_role: s.source,
      description: 'Status geändert',
      from_status: s.from_status,
      to_status: s.to_status,
      created_at: s.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <VerlaufFilters />
      <h2 className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
        <History className="h-4 w-4" />
        Aktivitätsverlauf
        {events.length > 0 && (
          <span className="ml-auto text-white/30">{events.length} Einträge</span>
        )}
      </h2>

      {events.length > 0 ? (
        <div className="relative space-y-0">
          <div className="absolute left-[11px] top-2 h-full w-px bg-white/[0.06]" />
          {events.map((entry) => (
            <EventRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <Empty>Kein Verlauf vorhanden</Empty>
      )}
    </div>
  );
}

function EventRow({ entry }: { entry: EventEntry }) {
  const from = entry.from_status ? STATUS_LABEL[entry.from_status] : null;
  const to = entry.to_status ? (STATUS_LABEL[entry.to_status] ?? { label: entry.to_status, className: 'bg-white/10 text-white/50' }) : null;

  return (
    <div className="relative flex gap-4 pb-4">
      <div className="relative z-10 mt-1 h-[22px] w-[22px] shrink-0 rounded-full border border-white/20 bg-[#0c0d10] flex items-center justify-center">
        <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{entry.description}</span>
            {entry.kind === 'status' && from && to && (
              <span className="flex items-center gap-1.5">
                <Badge label={from.label} className={from.className} />
                <ArrowRight className="h-3 w-3 text-white/30" />
                <Badge label={to.label} className={to.className} />
              </span>
            )}
          </div>
          <span className="shrink-0 text-xs text-white/30 tabular-nums">{formatTS(entry.created_at)}</span>
        </div>
        {(entry.actor || entry.actor_role) && (
          <p className="text-xs text-white/40">
            {[entry.actor_role, entry.actor].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
