import { notFound } from "next/navigation";
import { CalendarClock, User, ArrowRight } from "lucide-react";
import { queryOne, query } from "@/lib/db";
import { listPhotographers } from "@/lib/repos/orders/termin";
import { DURATION_MIN_FROM_SCHEDULE } from "@/lib/repos/orders/durationFromScheduleSql";
import { Section, InfoItem, Empty, Badge, STATUS_LABEL, formatDateTime, formatTS } from "../_shared";
import { TerminForm } from "./termin-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ edit?: string; saved?: string }>;
};

export default async function TerminPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const isEditing = sp.edit === "1";

  const [order, statusHistory, photographers] = await Promise.all([
    queryOne<{
      order_no: number;
      status: string;
      schedule_date: string | null;
      schedule_time: string | null;
      duration_min: number | null;
      photographer_name: string | null;
      photographer_email: string | null;
      photographer_phone: string | null;
      photographer_key: string | null;
      done_at: string | null;
    }>(`
      SELECT
        order_no,
        status,
        schedule_date,
        schedule_time,
        ${DURATION_MIN_FROM_SCHEDULE.bare}  AS duration_min,
        photographer->>'name'            AS photographer_name,
        photographer->>'email'           AS photographer_email,
        photographer->>'phone'           AS photographer_phone,
        photographer->>'key'            AS photographer_key,
        done_at
      FROM booking.orders
      WHERE order_no = $1
    `, [id]),

    query<{
      id: number;
      from_status: string | null;
      to_status: string;
      source: string | null;
      actor_id: string | null;
      created_at: string;
    }>(`
      SELECT id, from_status, to_status, source, actor_id, created_at
      FROM booking.order_status_audit
      WHERE order_no = $1
      ORDER BY created_at DESC
    `, [id]),

    listPhotographers(),
  ]);

  if (!order) notFound();

  const currentStatus = STATUS_LABEL[order.status] ?? STATUS_LABEL.pending;

  if (isEditing) {
    return (
      <>
        <TerminForm
          order={{
            order_no: order.order_no,
            status: order.status,
            schedule_date: order.schedule_date,
            schedule_time: order.schedule_time,
            duration_min: order.duration_min,
            photographer_key: order.photographer_key,
          }}
          photographers={photographers}
        />
        <div className="mt-6 space-y-2">
          <h3 className="text-xs font-semibold uppercase text-white/50">Status-Verlauf (Lesen)</h3>
          {statusHistory.length > 0 ? (
            <StatusList rows={statusHistory} />
          ) : (
            <Empty>Kein Status-Verlauf vorhanden</Empty>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Termin" icon={<CalendarClock className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <InfoItem
            label="Datum & Uhrzeit"
            value={formatDateTime(order.schedule_date, order.schedule_time)}
          />
          {order.duration_min && (
            <InfoItem label="Dauer" value={`${order.duration_min} min`} />
          )}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">Status</p>
            <div className="mt-1">
              <Badge label={currentStatus.label} className={currentStatus.className} />
            </div>
          </div>
          {order.done_at && (
            <InfoItem label="Abgeschlossen am" value={formatTS(order.done_at)} />
          )}
        </div>
      </Section>

      <Section title="Mitarbeiter" icon={<User className="h-4 w-4" />}>
        {order.photographer_name ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InfoItem label="Name" value={order.photographer_name} />
            {order.photographer_email && (
              <InfoItem label="E-Mail" value={order.photographer_email} />
            )}
            {order.photographer_phone && (
              <InfoItem label="Telefon" value={order.photographer_phone} />
            )}
          </div>
        ) : (
          <Empty>Kein Mitarbeiter zugewiesen</Empty>
        )}
      </Section>

      <Section title="Status-Verlauf">
        {statusHistory.length > 0 ? (
          <StatusList rows={statusHistory} />
        ) : (
          <Empty>Kein Status-Verlauf vorhanden</Empty>
        )}
      </Section>
    </div>
  );
}

function StatusList({ rows }: {
  rows: { id: number; from_status: string | null; to_status: string; source: string | null; actor_id: string | null; created_at: string }[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((entry) => {
        const from = entry.from_status ? STATUS_LABEL[entry.from_status] : null;
        const to = STATUS_LABEL[entry.to_status] ?? { label: entry.to_status, className: "bg-white/10 text-white/50" };
        return (
          <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {from
                ? <Badge label={from.label} className={from.className} />
                : <span className="text-xs text-white/30">—</span>
              }
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
              <Badge label={to.label} className={to.className} />
              {entry.source && (
                <span className="ml-2 text-xs text-white/30">{entry.source}</span>
              )}
            </div>
            <span className="shrink-0 text-xs text-white/40 tabular-nums">
              {formatTS(entry.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
