import { notFound } from "next/navigation";
import { CalendarClock, User, ArrowRight, Clock, History, CheckCircle2 } from "lucide-react";
import { query } from "@/lib/db";
import { listPhotographers } from "@/lib/repos/orders/termin";
import {
  Section, InfoItem, Empty, Badge, KpiGrid, Kpi,
  STATUS_LABEL, formatDateTime, formatTS,
} from "../_shared";
import { TerminForm } from "./termin-form";
import { loadOrderContext } from "../_order-context";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ edit?: string; saved?: string }>;
};

export default async function TerminPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const isEditing = sp.edit === "1";
  const orderNo = Number(id);
  if (!Number.isInteger(orderNo) || orderNo <= 0) notFound();

  const [ctx, statusHistory, photographers] = await Promise.all([
    loadOrderContext(orderNo),

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

  if (!ctx) notFound();
  const scheduleDateFallback = new Date().toISOString().slice(0, 10);
  const order = {
    order_no: ctx.order_no,
    status: ctx.status,
    schedule_date: ctx.schedule_date,
    schedule_time: ctx.schedule_time,
    duration_min: ctx.duration_min,
    photographer_name: ctx.photographer_name,
    photographer_email: ctx.photographer_email,
    photographer_phone: ctx.photographer_phone,
    photographer_key: ctx.photographer_key,
    done_at: ctx.done_at,
  };

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
          scheduleDateFallback={scheduleDateFallback}
          photographers={photographers}
        />
        <div className="mt-6 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Status-Verlauf (Lesen)</h3>
          {statusHistory.length > 0 ? (
            <StatusList rows={statusHistory} />
          ) : (
            <Empty>Kein Status-Verlauf vorhanden</Empty>
          )}
        </div>
      </>
    );
  }

  const terminLabel = order.schedule_date
    ? formatDateTime(order.schedule_date, order.schedule_time)
    : "—";

  return (
    <div className="space-y-6">
      <KpiGrid>
        <Kpi
          icon={<CalendarClock />}
          label="Termin"
          value={order.schedule_date ? terminLabel : "Offen"}
          sub={order.schedule_date ? undefined : "noch nicht geplant"}
          accent={order.schedule_date ? "gold" : undefined}
        />
        <Kpi
          icon={<Clock />}
          label="Dauer"
          value={order.duration_min ? `${order.duration_min} min` : "—"}
        />
        <Kpi
          icon={<User />}
          label="Mitarbeiter"
          value={order.photographer_name ?? "—"}
          sub={order.photographer_name ? undefined : "nicht zugewiesen"}
          accent={order.photographer_name ? "info" : undefined}
        />
        <Kpi
          icon={order.done_at ? <CheckCircle2 /> : <History />}
          label={order.done_at ? "Abgeschlossen" : "Status-Verlauf"}
          value={order.done_at ? formatTS(order.done_at) : `${statusHistory.length} Wechsel`}
          accent={order.done_at ? "success" : undefined}
        />
      </KpiGrid>

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
            <p className="bd-info-k">Status</p>
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
        const to = STATUS_LABEL[entry.to_status] ?? {
          label: entry.to_status,
          className: "bg-[var(--paper-strip)] text-[var(--ink-3)] border border-[var(--border)]",
        };
        return (
          <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {from
                ? <Badge label={from.label} className={from.className} />
                : <span className="text-xs text-[var(--ink-3)]">—</span>
              }
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />
              <Badge label={to.label} className={to.className} />
              {entry.source && (
                <span className="ml-2 text-xs text-[var(--ink-3)]">{entry.source}</span>
              )}
            </div>
            <span className="shrink-0 text-xs text-[var(--ink-3)] tabular-nums font-mono">
              {formatTS(entry.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
