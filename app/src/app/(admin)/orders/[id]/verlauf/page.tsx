import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadOrderVerlaufData } from "@/lib/repos/orders/verlaufData";
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

  return (
    <VerlaufSectionFrame events={events}>
      <Suspense fallback={null}>
        <VerlaufFilters />
      </Suspense>
    </VerlaufSectionFrame>
  );
}
