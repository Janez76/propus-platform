import type { ReactNode } from "react";
import { ArrowRight, History } from "lucide-react";
import { Empty, Badge, STATUS_LABEL, formatTS } from "../_shared";
import type { EventEntry } from "@/lib/repos/orders/verlaufData";

function EventRow({ entry }: { entry: EventEntry }) {
  const from = entry.from_status ? STATUS_LABEL[entry.from_status] : null;
  const to = entry.to_status
    ? (STATUS_LABEL[entry.to_status] ?? {
        label: entry.to_status,
        className: "bg-white/10 text-white/50",
      })
    : null;

  return (
    <div className="relative flex gap-4 pb-4">
      <div className="relative z-10 mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-white/20 bg-[#0c0d10]">
        <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{entry.description}</span>
            {entry.kind === "status" && from && to && (
              <span className="flex items-center gap-1.5">
                <Badge label={from.label} className={from.className} />
                <ArrowRight className="h-3 w-3 text-white/30" />
                <Badge label={to.label} className={to.className} />
              </span>
            )}
          </div>
          <span className="shrink-0 text-xs text-white/30 tabular-nums">
            {formatTS(entry.created_at)}
          </span>
        </div>
        {(entry.actor || entry.actor_role) && (
          <p className="text-xs text-white/40">
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
      <div className="absolute left-[11px] top-2 h-full w-px bg-white/[0.06]" />
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
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
      {children}
      <h2 className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
        <History className="h-4 w-4" />
        Aktivitätsverlauf
        {events.length > 0 && (
          <span className="ml-auto text-white/30">{events.length} Einträge</span>
        )}
      </h2>
      <VerlaufTimeline events={events} />
    </div>
  );
}
