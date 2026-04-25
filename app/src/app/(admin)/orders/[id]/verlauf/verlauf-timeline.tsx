import type { ReactNode } from "react";
import { ArrowRight, History } from "lucide-react";
import { Empty, Badge, STATUS_LABEL, formatTS } from "../_shared";
import type { EventEntry } from "@/lib/repos/orders/verlaufData";

function EventRow({ entry }: { entry: EventEntry }) {
  const from = entry.from_status ? STATUS_LABEL[entry.from_status] : null;
  const to = entry.to_status
    ? (STATUS_LABEL[entry.to_status] ?? {
        label: entry.to_status,
        className: "bg-[var(--paper-strip)] text-[var(--ink-3)] border border-[var(--border)]",
      })
    : null;

  return (
    <div className="relative flex gap-4 pb-4">
      <div className="relative z-10 mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-[var(--gold-300)] bg-white">
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--gold-600)]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)]">{entry.description}</span>
            {entry.kind === "status" && from && to && (
              <span className="flex items-center gap-1.5">
                <Badge label={from.label} className={from.className} />
                <ArrowRight className="h-3 w-3 text-[var(--ink-4)]" />
                <Badge label={to.label} className={to.className} />
              </span>
            )}
          </div>
          <span className="shrink-0 text-xs text-[var(--ink-3)] tabular-nums font-mono">
            {formatTS(entry.created_at)}
          </span>
        </div>
        {(entry.actor || entry.actor_role) && (
          <p className="text-xs text-[var(--ink-3)]">
            {[entry.actor_role, entry.actor].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

export function VerlaufTimeline({ events }: { events: EventEntry[] }) {
  if (events.length === 0) {
    return <Empty>Kein Verlauf vorhanden</Empty>;
  }
  return (
    <div className="relative space-y-0">
      <div className="absolute left-[11px] top-2 h-full w-px bg-[var(--border)]" />
      {events.map((entry) => (
        <EventRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export function VerlaufSectionFrame({
  events,
  children,
}: {
  events: EventEntry[];
  children?: ReactNode;
}) {
  return (
    <section className="bd-sect">
      <header className="bd-sect-head">
        <History />
        <h2>Aktivitätsverlauf</h2>
        {events.length > 0 && (
          <span className="ml-auto text-xs text-[var(--ink-3)] font-mono">{events.length} Einträge</span>
        )}
      </header>
      <div className="bd-sect-body">
        {children}
        <VerlaufTimeline events={events} />
      </div>
    </section>
  );
}
