"use client";

import { useCallback, useEffect, useState } from "react";
import { VerlaufFiltersEmbedded } from "./verlauf-filters";
import { VerlaufSectionFrame } from "./verlauf-timeline";
import { getOrderVerlaufForClient } from "./verlauf-actions";
import type { EventEntry } from "@/lib/repos/orders/verlaufData";
import type { VerlaufFilterInput } from "@/lib/repos/orders/verlaufData";

type Props = {
  orderId: string;
};

const emptyFilter: VerlaufFilterInput = {};

export function VerlaufSectionClient({ orderId }: Props) {
  const [filter, setFilter] = useState<VerlaufFilterInput>(emptyFilter);
  const [events, setEvents] = useState<EventEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (sp: VerlaufFilterInput) => {
      setLoading(true);
      setError(null);
      const r = await getOrderVerlaufForClient(orderId, sp);
      if (r.ok) {
        setEvents(r.events);
      } else {
        setError(r.error);
        setEvents([]);
      }
      setLoading(false);
    },
    [orderId],
  );

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  if (loading && events === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">
        Verlauf wird geladen…
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}
      <VerlaufSectionFrame events={events ?? []}>
        <VerlaufFiltersEmbedded
          orderIdForExport={orderId}
          initialEventType={filter.eventType ?? ""}
          initialFrom={filter.from ?? ""}
          initialTo={filter.to ?? ""}
          onApply={(sp) => setFilter(sp)}
        />
      </VerlaufSectionFrame>
      {loading && events !== null && (
        <p className="mt-2 text-center text-xs text-white/30">Aktualisiere…</p>
      )}
    </div>
  );
}
