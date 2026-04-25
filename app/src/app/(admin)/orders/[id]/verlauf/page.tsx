import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Activity, GitBranch, Users, Clock } from "lucide-react";
import { loadOrderVerlaufData } from "@/lib/repos/orders/verlaufData";
import { KpiGrid, Kpi, formatTS } from "../_shared";
import { VerlaufFilters } from "./verlauf-filters";
import { VerlaufSectionFrame } from "./verlauf-timeline";

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
  const events = await loadOrderVerlaufData(id, {
    eventType: sp.eventType,
    from: sp.from,
    to: sp.to,
  });
  if (events === null) notFound();

  const statusChanges = events.filter((e) => e.kind === "status").length;
  const distinctActors = new Set(
    events.map((e) => e.actor).filter((a): a is string => Boolean(a)),
  ).size;
  const lastEvent = events.length > 0 ? events[0] : null;

  const isFiltered = Boolean(sp.eventType || sp.from || sp.to);

  return (
    <div className="space-y-6">
      <KpiGrid>
        <Kpi
          icon={<Activity />}
          label={isFiltered ? "Einträge (gefiltert)" : "Einträge"}
          value={events.length}
          sub={isFiltered ? "Filter aktiv" : undefined}
          accent={isFiltered ? "info" : undefined}
        />
        <Kpi
          icon={<GitBranch />}
          label="Status-Änderungen"
          value={statusChanges}
        />
        <Kpi
          icon={<Users />}
          label="Beteiligte"
          value={distinctActors}
          sub={distinctActors === 0 ? "system" : undefined}
        />
        <Kpi
          icon={<Clock />}
          label="Letztes Ereignis"
          value={lastEvent ? formatTS(lastEvent.created_at) : "—"}
          sub={lastEvent?.actor ?? undefined}
          accent={lastEvent ? "gold" : undefined}
        />
      </KpiGrid>

      <VerlaufSectionFrame events={events}>
        <Suspense fallback={null}>
          <VerlaufFilters />
        </Suspense>
      </VerlaufSectionFrame>
    </div>
  );
}
