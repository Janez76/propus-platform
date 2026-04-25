import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowUpRight, Paperclip } from "lucide-react";
import { getMailInbox, type InboxMessage } from "../../api/toursAdmin";
import { t, type Lang } from "../../i18n";

interface MailsCardProps {
  lang: Lang;
}

function timeShort(iso: string | undefined, lang: Lang): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 60_000) return t(lang, "dashboardV2.mails.justNow");
  if (ms < 3_600_000) {
    return t(lang, "dashboardV2.mails.minsShort").replace("{{n}}", String(Math.floor(ms / 60_000)));
  }
  if (ms < 86_400_000) {
    return t(lang, "dashboardV2.mails.hoursShort").replace("{{n}}", String(Math.floor(ms / 3_600_000)));
  }
  return t(lang, "dashboardV2.mails.daysShort").replace("{{n}}", String(Math.floor(ms / 86_400_000)));
}

function avatarLetters(name: string | undefined, email: string): string {
  const src = name?.trim() || email;
  const parts = src.split(/[\s._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function MailsCard({ lang }: MailsCardProps) {
  const [messages, setMessages] = useState<InboxMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMailInbox({ top: 5, matchTours: false })
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages.slice(0, 5));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = messages?.filter((m) => m.isRead === false).length ?? 0;

  return (
    <section className="dv2-card dv2-mails-card">
      <div className="dv2-card-head">
        <div>
          <div className="dv2-card-title">
            <Mail size={14} />
            <span>{t(lang, "dashboardV2.mails.title")}</span>
            {messages !== null && unread > 0 && (
              <span className="dv2-mails-count">
                {t(lang, "dashboardV2.mails.unread").replace("{{n}}", String(unread))}
              </span>
            )}
          </div>
        </div>
        <Link to="/admin/tickets?tab=mail" className="dv2-card-link">
          {t(lang, "dashboardV2.mails.allLink")}
          <ArrowUpRight size={12} />
        </Link>
      </div>
      <div className="dv2-mails-list">
        {messages === null && (
          <p className="dv2-card-loading">{t(lang, "dashboardV2.mails.loading")}</p>
        )}
        {error && messages !== null && messages.length === 0 && (
          <p className="dv2-card-error">{error}</p>
        )}
        {messages !== null && !error && messages.length === 0 && (
          <p className="dv2-card-empty">{t(lang, "dashboardV2.mails.empty")}</p>
        )}
        {messages?.map((m) => {
          const id = m.graphMessageId ?? m.id ?? `${m.fromEmail}-${m.receivedAt ?? ""}`;
          const isUnread = m.isRead === false;
          return (
            <Link
              key={id}
              to="/admin/tickets?tab=mail"
              className={`dv2-mail-row${isUnread ? " is-unread" : ""}`}
            >
              <span className="dv2-mail-avatar">
                {avatarLetters(m.fromName, m.fromEmail)}
              </span>
              <div className="dv2-mail-main">
                <div className="dv2-mail-from">
                  {m.fromName || m.fromEmail}
                  {m.fromName && (
                    <span className="dv2-mail-from-meta"> · {m.fromEmail}</span>
                  )}
                </div>
                <div className="dv2-mail-subject">{m.subject}</div>
                {m.bodyPreview && (
                  <div className="dv2-mail-preview">{m.bodyPreview}</div>
                )}
              </div>
              <div className="dv2-mail-side">
                <span className="dv2-mail-time">{timeShort(m.receivedAt, lang)}</span>
                <span className="dv2-mail-flags">
                  {/* hasAttachment from Graph API isn't surfaced; placeholder if added later */}
                  {(m as { hasAttachments?: boolean }).hasAttachments && (
                    <Paperclip size={11} />
                  )}
                  {isUnread && <span className="dv2-mail-unread-dot" />}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
