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
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">
        Verknüpfungen werden geladen…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        {error ?? "Daten konnten nicht geladen werden."}
      </div>
    );
  }
  return <VerknuepfungenView orderId={orderId} data={data} searchParams={{}} />;
}
