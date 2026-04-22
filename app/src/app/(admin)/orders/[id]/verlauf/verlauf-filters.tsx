"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const EVENTS = [
  { value: "", label: "Alle Ereignisse" },
  { value: "status_changed", label: "Status" },
  { value: "schedule_updated", label: "Termin" },
  { value: "object_updated", label: "Objekt" },
  { value: "services_updated", label: "Leistungen" },
  { value: "pricing_updated", label: "Preis" },
  { value: "billing_updated", label: "Rechnung" },
  { value: "message_sent", label: "Nachricht" },
];

export function VerlaufFilters() {
  const r = useRouter();
  const sp = useSearchParams();
  const path = usePathname();
  const [ev, setEv] = useState(sp.get("eventType") || "");
  const [from, setFrom] = useState(sp.get("from") || "");
  const [to, setTo] = useState(sp.get("to") || "");

  const apply = useCallback(() => {
    const p = new URLSearchParams();
    if (ev) p.set("eventType", ev);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const q = p.toString();
    r.push(q ? `${path}?${q}` : path);
  }, [r, path, ev, from, to]);

  const orderId = path.match(/\/orders\/(\d+)/)?.[1];

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
      <div>
        <span className="text-[10px] text-white/50">Typ</span>
        <select
          className="ml-1 rounded border border-white/10 bg-[#0c0d10] px-2 py-1"
          value={ev}
          onChange={(e) => setEv(e.target.value)}
        >
          {EVENTS.map((e) => (
            <option key={e.value || "all"} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="text-[10px] text-white/50">Von</span>
        <input type="date" className="ml-1 rounded border border-white/10 bg-[#0c0d10] px-1" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <span className="text-[10px] text-white/50">Bis</span>
        <input type="date" className="ml-1 rounded border border-white/10 bg-[#0c0d10] px-1" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <button type="button" onClick={apply} className="rounded bg-white/10 px-3 py-1">
        Anwenden
      </button>
      {orderId && (
        <a
          className="ml-auto text-[#B68E20] hover:underline"
          href={`/orders/${orderId}/verlauf/export`}
        >
          CSV-Export
        </a>
      )}
    </div>
  );
}
