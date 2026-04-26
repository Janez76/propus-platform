import { useMemo } from "react";
import { Mail, Ticket } from "lucide-react";
import { useQuery } from "../../hooks/useQuery";
import { getMailInbox, getTicketsList } from "../../api/toursAdmin";
import { t, type Lang } from "../../i18n";

interface OpsPanelsV2Props {
  lang: Lang;
  enabled: boolean;
}

export function OpsPanelsV2({ lang, enabled }: OpsPanelsV2Props) {
  const { data: ticketData } = useQuery(
    "dashboardV2:tickets",
    () => getTicketsList({ status: "open" }),
    { enabled, staleTime: 30_000 },
  );
  const { data: inboxData } = useQuery(
    "dashboardV2:inbox",
    () => getMailInbox({ top: 5 }),
    { enabled, staleTime: 30_000 },
  );

  const tickets = useMemo(() => (ticketData?.tickets ?? []).slice(0, 5), [ticketData?.tickets]);
  const mails = useMemo(() => (inboxData?.messages ?? []).slice(0, 5), [inboxData?.messages]);

  return (
    <div className="dv2-grid-main">
      <div className="dv2-card">
        <div className="dv2-card-head">
          <div className="dv2-card-title">
            <Ticket size={14} /> {t(lang, "dashboardV2.ops.tickets")}
          </div>
        </div>
        <div className="space-y-2">
          {tickets.length === 0 ? (
            <div className="dv2-pcol-empty">{t(lang, "dashboardV2.pipeline.empty")}</div>
          ) : tickets.map((ticket) => (
            <div key={ticket.id} className="dv2-pcard">
              <div className="dv2-pcard-id">#{ticket.id}</div>
              <div className="dv2-pcard-addr">{ticket.subject || "—"}</div>
              <div className="dv2-pcard-footer">
                <span className="dv2-pcard-client">{ticket.customer_name || "—"}</span>
                <span className="dv2-pcard-status dv2-pcard-status--danger">{ticket.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dv2-card">
        <div className="dv2-card-head">
          <div className="dv2-card-title">
            <Mail size={14} /> {t(lang, "dashboardV2.ops.inbox")}
          </div>
        </div>
        <div className="space-y-2">
          {mails.length === 0 ? (
            <div className="dv2-pcol-empty">{t(lang, "dashboardV2.pipeline.empty")}</div>
          ) : mails.map((msg) => (
            <div key={msg.id || msg.graphMessageId || msg.subject} className="dv2-pcard">
              <div className="dv2-pcard-id">{msg.fromName || msg.fromEmail}</div>
              <div className="dv2-pcard-addr">{msg.subject || "—"}</div>
              <div className="dv2-pcard-footer">
                <span className="dv2-pcard-client">{msg.bodyPreview || "—"}</span>
                <span className="dv2-pcard-status dv2-pcard-status--muted">{msg.isRead ? "read" : "new"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
