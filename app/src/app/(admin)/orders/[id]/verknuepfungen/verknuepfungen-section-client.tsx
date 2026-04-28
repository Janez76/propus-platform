"use client";

import { useEffect, useState } from "react";
import { VerknuepfungenView } from "./verknuepfungen-view";
import type { VerknuepfungenData } from "@/lib/repos/orders/verknuepfungenTypes";

type Props = {
  orderId: string;
};

type GetVerknuepfungenResult =
  | { ok: true; data: VerknuepfungenData }
  | { ok: false; error: string };

async function loadVerknuepfungenForClient(orderId: string): Promise<GetVerknuepfungenResult> {
  try {
    const res = await fetch(`/orders/${encodeURIComponent(orderId)}/verknuepfungen/data`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => null)) as GetVerknuepfungenResult | null;
    if (!res.ok) {
      return { ok: false, error: payload?.ok === false ? payload.error : "Daten konnten nicht geladen werden." };
    }
    if (payload?.ok) {
      return payload;
    }
    return { ok: false, error: "Unerwartete Antwort beim Laden der Verknüpfungen." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Daten konnten nicht geladen werden." };
  }
}

export function VerknuepfungenSectionClient({ orderId }: Props) {
  const [data, setData] = useState<VerknuepfungenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let c = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const r = await loadVerknuepfungenForClient(orderId);
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
