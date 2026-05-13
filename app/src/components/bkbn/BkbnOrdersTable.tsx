import { Camera, Clock, ExternalLink } from "lucide-react";
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(s);
  if (ev.allDay) return `${startLabel.split(",")[0] ?? startLabel} · ganztägig`;
  if (!ev.end) return startLabel;
  const e = new Date(ev.end);
  if (Number.isNaN(e.getTime())) return startLabel;
  const endLabel = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" }).format(e);
  return `${startLabel} – ${endLabel}`;
}

function bkbnFmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function BkbnOrdersTable({
  events,
  loading = false,
  matchDomains = [],
  emptyTitle = "Keine BKBN-Aufträge im Zeitraum.",
  mailboxColorFor,
  mailboxInitialsFor,
  todayStart,
}: {
  events: BkbnOrderEvent[];
  loading?: boolean;
  matchDomains?: string[];
  emptyTitle?: string;
  mailboxColorFor?: (email: string) => string;
  mailboxInitialsFor?: (email: string) => string;
  todayStart?: number;
}) {
  if (loading) {
    return (
      <div className="bk-list">
        <div className="bk-loading"><span className="bk-spinner" /></div>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="bk-list">
        <div className="bk-empty">
          <p className="bk-empty-title">{emptyTitle}</p>
          <p className="bk-empty-sub">
            Es werden Termine erkannt, deren Organizer/Teilnehmer, Betreff, Beschreibung oder Ort{" "}
            {matchDomains.length ? matchDomains.join(" bzw. ") : "backbonephoto.co"} enthält.
          </p>
        </div>
      </div>
    );
  }

  const todayCutoff = todayStart ?? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();

  return (
    <div className="bk-list">
      <div className="bk-list-head">
        <div className="bk-col">Termin</div>
        <div className="bk-col">Auftrag / Adresse</div>
        <div className="bk-col bk-col-organizer">Organizer</div>
        <div className="bk-col">Postfach</div>
        <div className="bk-col" />
      </div>
      {events.map((ev) => {
        const primaryMailbox = (ev.mailboxes && ev.mailboxes.length ? ev.mailboxes[0] : ev.mailbox) || "";
        const startMs = ev.start ? new Date(ev.start).getTime() : NaN;
        const isNext = Number.isFinite(startMs) && startMs >= todayCutoff;
        const initials = primaryMailbox && mailboxInitialsFor ? mailboxInitialsFor(primaryMailbox) : "?";
        const avatarBg = primaryMailbox && mailboxColorFor
          ? mailboxColorFor(primaryMailbox)
          : "linear-gradient(135deg, #5a9bea, #2a6dd6)";
        return (
          <div key={ev.id} className="bk-row">
            <div className="bk-cell-termin">
              <span className={`bk-termin-pill${isNext ? " is-next" : ""}`}>
                <Clock />
                <span>{bkbnFmtTimeRange(ev)}</span>
              </span>
              <span className="bk-termin-date">{bkbnFmtDate(ev.start)}</span>
            </div>
            <div className="bk-cell-auftrag">
              <div className="bk-auftrag-head">
                <span className="bk-badge"><Camera /> BKBN</span>
                <span className="bk-auftrag-title">
                  {normalizeMojibakeText(ev.address) || normalizeMojibakeText(ev.title) || "BKBN-Auftrag"}
                </span>
              </div>
              {ev.bodyPreview ? (
                <div className="bk-auftrag-snippet">{normalizeMojibakeText(ev.bodyPreview)}</div>
              ) : null}
            </div>
            <div className="bk-cell-organizer">
              <div className="bk-org-title">{ev.organizerName || ev.title || "Shootings"}</div>
              {ev.organizerEmail ? <span className="bk-org-id">{ev.organizerEmail}</span> : null}
            </div>
            <div className="bk-cell-postfach">
              <span className="bk-postfach-avatar" style={{ background: avatarBg }} aria-hidden>
                {initials}
              </span>
              <span className="bk-postfach-email">{primaryMailbox || "—"}</span>
            </div>
            <div className="bk-cell-actions">
              {ev.webLink ? (
                <a href={ev.webLink} target="_blank" rel="noopener noreferrer" className="bk-action-btn">
                  <ExternalLink /> Outlook
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
