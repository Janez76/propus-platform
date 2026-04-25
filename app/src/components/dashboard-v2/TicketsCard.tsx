import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ticket, ArrowUpRight } from "lucide-react";
import { getTicketsList, type TicketRow } from "../../api/toursAdmin";
import { t, type Lang } from "../../i18n";

interface TicketsCardProps {
  lang: Lang;
}

const PRIO_CLASS: Record<string, string> = {
  high: "high",
  normal: "med",
  low: "low",
};

const STATUS_CLASS: Record<string, string> = {
  open: "open",
  in_progress: "waiting",
  done: "done",
  rejected: "rejected",
};

function timeAgo(iso: string, lang: Lang): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(ms / 60_000));
    return t(lang, "dashboardV2.tickets.minsAgo").replace("{{n}}", String(mins));
  }
  if (hours < 24) {
    return t(lang, "dashboardV2.tickets.hoursAgo").replace("{{n}}", String(hours));
  }
  const days = Math.floor(hours / 24);
  return t(lang, "dashboardV2.tickets.daysAgo").replace("{{n}}", String(days));
}

function avatarLetters(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export function TicketsCard({ lang }: TicketsCardProps) {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTicketsList({ status: "open" })
      .then((res) => {
        if (cancelled) return;
        setTickets(res.tickets.slice(0, 5));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setTickets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = tickets?.length ?? 0;

  return (
    <section className="dv2-card dv2-tickets-card">
      <div className="dv2-card-head">
        <div>
          <div className="dv2-card-title">
            <Ticket size={14} />
            <span>{t(lang, "dashboardV2.tickets.title")}</span>
            {tickets !== null && (
              <span className="dv2-tickets-count">{total}</span>
            )}
          </div>
        </div>
        <Link to="/admin/tickets" className="dv2-card-link">
          {t(lang, "dashboardV2.tickets.allLink")}
          <ArrowUpRight size={12} />
        </Link>
      </div>
      <div className="dv2-tickets-list">
        {tickets === null && (
          <p className="dv2-card-loading">{t(lang, "dashboardV2.tickets.loading")}</p>
        )}
        {error && tickets !== null && tickets.length === 0 && (
          <p className="dv2-card-error">{error}</p>
        )}
        {tickets !== null && !error && tickets.length === 0 && (
          <p className="dv2-card-empty">{t(lang, "dashboardV2.tickets.empty")}</p>
        )}
        {tickets?.map((tk) => {
          const prioCls = PRIO_CLASS[tk.priority] ?? "med";
          const statusCls = STATUS_CLASS[tk.status] ?? "open";
          const ref = tk.reference_order_no
            ? `#${tk.reference_order_no}`
            : tk.tour_label ?? tk.tour_bezeichnung ?? null;
          return (
            <Link
              to={`/admin/tickets/${tk.id}`}
              key={tk.id}
              className="dv2-ticket-row"
            >
              <span className={`dv2-ticket-prio dv2-ticket-prio--${prioCls}`} />
              <div className="dv2-ticket-main">
                <div className="dv2-ticket-id">
                  #{tk.id}
                  {ref && ` · ${ref}`}
                </div>
                <div className="dv2-ticket-subject">{tk.subject}</div>
                <div className="dv2-ticket-meta">
                  <span>{tk.customer_name ?? tk.created_by ?? "—"}</span>
                  <span className="dv2-ticket-meta-dot" />
                  <span>{timeAgo(tk.created_at, lang)}</span>
                </div>
              </div>
              <div className="dv2-ticket-side">
                <span className={`dv2-ticket-status dv2-ticket-status--${statusCls}`}>
                  {t(lang, `dashboardV2.tickets.status.${tk.status}`)}
                </span>
                <span
                  className={`dv2-ticket-assignee${tk.assigned_to ? "" : " is-unassigned"}`}
                  title={tk.assigned_to ?? ""}
                >
                  {tk.assigned_to ? avatarLetters(tk.assigned_to) : "?"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
