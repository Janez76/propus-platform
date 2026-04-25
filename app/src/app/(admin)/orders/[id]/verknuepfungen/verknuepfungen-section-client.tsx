"use client";

import { useEffect, useState } from "react";
import { getVerknuepfungenForClient } from "./verknuepfungen-data-actions";
import { VerknuepfungenView } from "./verknuepfungen-view";
import type { VerknuepfungenData } from "@/lib/repos/orders/verknuepfungenTypes";

type Props = {
  orderId: string;
};

export function VerknuepfungenSectionClient({ orderId }: Props) {
  const [data, setData] = useState<VerknuepfungenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let c = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const r = await getVerknuepfungenForClient(orderId);
      if (!c) return;
      if (r.ok) {
        setData(r.data);
      } else {
        setError(r.error);
        setData(null);
      }
      setLoading(false);
    })();
    return () => {
      c = false;
    };
  }, [orderId]);

  if (loading) {
    return (
      <section className="bd-sect">
        <div className="bd-sect-body text-sm text-[var(--ink-3)]">Verknüpfungen werden geladen…</div>
      </section>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[#8A2515]">
        {error ?? "Daten konnten nicht geladen werden."}
      </div>
    );
  }
  return <VerknuepfungenView orderId={orderId} data={data} searchParams={{}} />;
}
