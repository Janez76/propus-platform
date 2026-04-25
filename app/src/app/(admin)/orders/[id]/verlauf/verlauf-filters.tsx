"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import type { VerlaufFilterInput } from "@/lib/repos/orders/verlaufData";

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

function CsvExportLink({ orderId }: { orderId: string }) {
  return (
    <a
      className="ml-auto text-[var(--gold-700)] font-semibold hover:underline"
      href={`/orders/${orderId}/verlauf/export`}
    >
      CSV-Export
    </a>
  );
}

type FilterFieldsProps = {
  ev: string;
  from: string;
  to: string;
  onEv: (v: string) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onApply: () => void;
  orderId: string | undefined;
};

function FilterFields({ ev, from, to, onEv, onFrom, onTo, onApply, orderId }: FilterFieldsProps) {
  const inputCls = "ml-1 rounded border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1 text-sm text-[var(--ink)] focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20";
  const labelCls = "text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]";
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] p-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Typ</span>
        <select
          className={inputCls}
          value={ev}
          onChange={(e) => onEv(e.target.value)}
        >
          {EVENTS.map((e) => (
            <option key={e.value || "all"} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Von</span>
        <input
          type="date"
          className={inputCls}
          value={from}
          onChange={(e) => onFrom(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Bis</span>
        <input
          type="date"
          className={inputCls}
          value={to}
          onChange={(e) => onTo(e.target.value)}
        />
      </label>
      <button type="button" onClick={onApply} className="bd-btn-outline-gold">
        Anwenden
      </button>
      {orderId && <CsvExportLink orderId={orderId} />}
    </div>
  );
}

/** Liest/schreibt Filter in der Subroute-URL (klassischer Verlauf-Tab). */
export function VerlaufFilters() {
  const r = useRouter();
  const spQ = useSearchParams();
  const path = usePathname();
  const [ev, setEv] = useState(spQ.get("eventType") || "");
  const [from, setFrom] = useState(spQ.get("from") || "");
  const [to, setTo] = useState(spQ.get("to") || "");

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
    <FilterFields
      ev={ev}
      from={from}
      to={to}
      onEv={setEv}
      onFrom={setFrom}
      onTo={setTo}
      onApply={apply}
      orderId={orderId}
    />
  );
}

type EmbeddedProps = {
  initialEventType: string;
  initialFrom: string;
  initialTo: string;
  onApply: (sp: VerlaufFilterInput) => void;
  orderIdForExport: string;
};

/** Nur lokale Filter, steuert Datenladen per Callback (eingebettete Shell). */
export function VerlaufFiltersEmbedded({
  initialEventType,
  initialFrom,
  initialTo,
  onApply,
  orderIdForExport,
}: EmbeddedProps) {
  const [ev, setEv] = useState(initialEventType);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  useEffect(() => {
    setEv(initialEventType);
    setFrom(initialFrom);
    setTo(initialTo);
  }, [initialEventType, initialFrom, initialTo]);

  const apply = useCallback(() => {
    const next: VerlaufFilterInput = {};
    if (ev) next.eventType = ev;
    if (from) next.from = from;
    if (to) next.to = to;
    onApply(next);
  }, [ev, from, to, onApply]);

  return (
    <FilterFields
      ev={ev}
      from={from}
      to={to}
      onEv={setEv}
      onFrom={setFrom}
      onTo={setTo}
      onApply={apply}
      orderId={orderIdForExport}
    />
  );
}
