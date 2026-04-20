import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, MessageSquare, RefreshCcw, Send } from "lucide-react";
import {
  getOrderEmailLog,
  getOrderMessages,
  postOrderMessage,
  resendEmail,
  type OrderEmailLogEntry,
  type OrderMessage,
  type ResendEmailType,
} from "../../../api/orders";
import { useAuthStore } from "../../../store/authStore";
import { useT } from "../../../hooks/useT";

type Props = {
  orderNo: string;
  editMode: boolean;
};

const RESENDABLE: Set<string> = new Set([
  "confirmation_request",
  "reschedule",
  "booking_confirmed",
]);

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmailColumn({ orderNo, t }: { orderNo: string; t: (k: string) => string }) {
  const token = useAuthStore((s) => s.token);
  const [entries, setEntries] = useState<OrderEmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    getOrderEmailLog(token, orderNo)
      .then((res) => setEntries(res.entries || []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [token, orderNo]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleResend = async (templateKey: string) => {
    if (!token) return;
    setResending(templateKey);
    try {
      await resendEmail(token, orderNo, templateKey as ResendEmailType);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResending(null);
    }
  };

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-[var(--border-soft)]">
      <header className="flex items-center justify-between border-b border-[var(--border-soft)] px-3 py-2">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-main)]">
          <Mail className="h-4 w-4 text-[var(--accent)]" /> {t("ordersDrawer.komm.emailHistory")}
        </div>
        <button
          type="button"
          onClick={reload}
          className="text-[var(--text-subtle)] hover:text-[var(--text-main)]"
          aria-label="Reload"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center justify-center py-8 text-[var(--text-subtle)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("ordersDrawer.loading")}
          </div>
        )}
        {error && !loading && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <p className="py-6 text-center text-xs text-[var(--text-subtle)]">
            {t("ordersDrawer.komm.noEmails")}
          </p>
        )}
        <ol className="space-y-2">
          {entries.map((entry) => {
            const labelKey = `ordersDrawer.emailEvents.${entry.template_key}`;
            const labelTxt = t(labelKey);
            const label = labelTxt && labelTxt !== labelKey ? labelTxt : entry.template_key;
            const canResend = RESENDABLE.has(entry.template_key);
            return (
              <li
                key={entry.id}
                className="rounded border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-main)]">{label}</p>
                  <time className="shrink-0 text-xs text-[var(--text-subtle)]">{formatTime(entry.sent_at)}</time>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                  {t("ordersDrawer.komm.recipient")}: {entry.recipient}
                  {entry.template_language ? ` · ${entry.template_language.toUpperCase()}` : ""}
                </p>
                {canResend && (
                  <button
                    type="button"
                    onClick={() => handleResend(entry.template_key)}
                    disabled={resending === entry.template_key}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
                  >
                    {resending === entry.template_key ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-3 w-3" />
                    )}
                    {t("ordersDrawer.komm.resend")}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function ChatColumn({
  orderNo,
  editMode,
  t,
}: {
  orderNo: string;
  editMode: boolean;
  t: (k: string) => string;
}) {
  const token = useAuthStore((s) => s.token);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const reload = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    getOrderMessages(token, orderNo)
      .then((rows) => setMessages(Array.isArray(rows) ? rows : []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [token, orderNo]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSend = async () => {
    if (!token || !draft.trim() || sending) return;
    setSending(true);
    try {
      await postOrderMessage(token, orderNo, draft.trim());
      setDraft("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-[var(--border-soft)]">
      <header className="flex items-center justify-between border-b border-[var(--border-soft)] px-3 py-2">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-main)]">
          <MessageSquare className="h-4 w-4 text-[var(--accent)]" /> {t("ordersDrawer.komm.internalChat")}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center justify-center py-8 text-[var(--text-subtle)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("ordersDrawer.loading")}
          </div>
        )}
        {error && !loading && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="py-6 text-center text-xs text-[var(--text-subtle)]">
            {t("ordersDrawer.komm.noMessages")}
          </p>
        )}
        <ol className="space-y-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className="rounded border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 px-3 py-2"
            >
              <p className="whitespace-pre-wrap text-sm text-[var(--text-main)]">{m.message}</p>
              <time className="mt-0.5 block text-xs text-[var(--text-subtle)]">{formatTime(m.created_at)}</time>
            </li>
          ))}
        </ol>
      </div>
      <div className="border-t border-[var(--border-soft)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!editMode || sending}
            placeholder={t("ordersDrawer.komm.messagePlaceholder")}
            rows={2}
            className="flex-1 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!editMode || sending || !draft.trim()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("ordersDrawer.komm.sendMessage")}
          </button>
        </div>
      </div>
    </section>
  );
}

export function TabKommunikation({ orderNo, editMode }: Props) {
  const t = useT();
  return (
    <div className="grid h-full min-h-[60vh] grid-cols-1 gap-4 lg:grid-cols-2">
      <EmailColumn orderNo={orderNo} t={t} />
      <ChatColumn orderNo={orderNo} editMode={editMode} t={t} />
    </div>
  );
}
