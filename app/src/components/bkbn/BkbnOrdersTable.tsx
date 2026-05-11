import { ExternalLink } from "lucide-react";
import type { BkbnOrderEvent } from "../../api/bkbnOrders";
import { normalizeMojibakeText } from "../calendar/CalendarView";

export function bkbnFmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function bkbnFmtTimeRange(ev: BkbnOrderEvent): string {
  if (!ev.start) return "—";
  const s = new Date(ev.start);
  if (Number.isNaN(s.getTime())) return ev.start;
  const startLabel = new Intl.DateTimeFormat("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(s);
  if (ev.allDay) return `${startLabel.split(",")[0] ?? startLabel} · ganztägig`;
  if (!ev.end) return startLabel;
  const e = new Date(ev.end);
  if (Number.isNaN(e.getTime())) return startLabel;
  const endLabel = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" }).format(e);
  return `${startLabel}–${endLabel}`;
}

export function BkbnOrdersTable({
  events,
  loading = false,
  matchDomains = [],
  emptyTitle = "Keine BKBN-Aufträge im Zeitraum.",
}: {
  events: BkbnOrderEvent[];
  loading?: boolean;
  matchDomains?: string[];
  emptyTitle?: string;
}) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]/80 p-10 text-center">
        <p className="text-sm font-medium text-[var(--text-main)]">{emptyTitle}</p>
        <p className="mt-1 text-xs text-[var(--fg-3)]">
          Es werden Termine erkannt, deren Organizer/Teilnehmer, Betreff, Beschreibung oder Ort{" "}
          {matchDomains.length ? matchDomains.join(" bzw. ") : "backbonephoto.co"} enthält.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-soft)] text-left text-xs uppercase tracking-wide text-[var(--fg-3)]">
            <th className="px-3 py-2 font-semibold">Termin</th>
            <th className="px-3 py-2 font-semibold">Auftrag / Adresse</th>
            <th className="px-3 py-2 font-semibold">Organizer</th>
            <th className="px-3 py-2 font-semibold">Postfach</th>
            <th className="px-3 py-2 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id} className="border-b border-[var(--border-soft)]/60 last:border-0 hover:bg-[var(--surface-raised)]/40">
              <td className="whitespace-nowrap px-3 py-2 align-top">
                <div className="font-mono text-[13px] text-[var(--text-main)]">{bkbnFmtTimeRange(ev)}</div>
                {ev.allDay ? null : <div className="text-[11px] text-[var(--fg-3)]">{bkbnFmtDateTime(ev.start)}</div>}
              </td>
              <td className="px-3 py-2 align-top">
                <div className="flex items-center gap-1.5">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: ev.color || "#ea580c" }}>BKBN</span>
                  <span className="font-medium text-[var(--text-main)]">{normalizeMojibakeText(ev.title) || "BKBN-Auftrag"}</span>
                </div>
                {ev.address ? <div className="mt-0.5 text-[12px] text-[var(--fg-2)]">{normalizeMojibakeText(ev.address)}</div> : null}
                {ev.bodyPreview ? (
                  <div className="mt-1 line-clamp-2 max-w-[420px] text-[11px] text-[var(--fg-3)]">{normalizeMojibakeText(ev.bodyPreview)}</div>
                ) : null}
              </td>
              <td className="px-3 py-2 align-top text-[12px] text-[var(--fg-2)]">
                {ev.organizerName ? <div>{ev.organizerName}</div> : null}
                {ev.organizerEmail ? <div className="font-mono text-[11px] text-[var(--fg-3)]">{ev.organizerEmail}</div> : null}
                {!ev.organizerName && !ev.organizerEmail ? "—" : null}
              </td>
              <td className="px-3 py-2 align-top text-[11px] text-[var(--fg-3)]">
                {(ev.mailboxes && ev.mailboxes.length ? ev.mailboxes : [ev.mailbox]).filter(Boolean).map((m) => (
                  <div key={m} className="font-mono">{m}</div>
                ))}
              </td>
              <td className="px-3 py-2 align-top text-right">
                {ev.webLink ? (
                  <a
                    href={ev.webLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--accent)] hover:bg-[var(--surface-raised)]/60"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Outlook
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
