import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { API_BASE } from "../../api/client";
import {
  getChatMessages,
  markChatRead,
  postChatMessage,
  type Order,
  type OrderChatAvailability,
  type OrderChatMessage,
} from "../../api/orders";
import { formatDateTime } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";
import { EmptyState } from "../ui/empty-state";

type Props = {
  token: string;
  orderNo: string;
  order: Order;
  actorRole?: "admin" | "photographer";
};

const LOADING_AVAILABILITY: OrderChatAvailability = {
  readable: false,
  writable: false,
  feedbackUntil: null,
};

function getAppointmentTs(order: Order): number {
  const date = String(order.schedule?.date || "").trim();
  const time = String(order.schedule?.time || "").trim();
  if (!date || !time) return Number.NaN;
  return new Date(`${date}T${time}`).getTime();
}

function isBeforeAppointment(order: Order): boolean {
  const ts = getAppointmentTs(order);
  return Number.isFinite(ts) ? Date.now() < ts : false;
}

export function OrderChat({ token, orderNo, order, actorRole = "admin" }: Props) {
  const language = useAuthStore((s) => s.language);
  const [items, setItems] = useState<OrderChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<OrderChatAvailability>(LOADING_AVAILABILITY);

  const effectiveAvailability = availability;
  const beforeAppointment = useMemo(() => isBeforeAppointment(order), [order]);

  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        setErr("");
        const data = await getChatMessages(token, orderNo);
        if (!alive) return;
        setItems(Array.isArray(data.messages) ? data.messages : []);
        setAvailability(data.availability || LOADING_AVAILABILITY);
        await markChatRead(token, orderNo);
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Chat konnte nicht geladen werden");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [token, orderNo]);

  useEffect(() => {
    if (!effectiveAvailability.readable) return;
    const url = `${API_BASE}/api/admin/orders/${encodeURIComponent(orderNo)}/chat/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    const onMessage = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as OrderChatMessage;
        setItems((prev) => {
          if (prev.some((item) => item.id === parsed.id)) return prev;
          return [...prev, parsed];
        });
      } catch {
        /* malformed SSE payload – skip */
      }
    };
    es.addEventListener("message", onMessage as EventListener);
    es.onerror = () => {
      // Browser reconnect handles transient disconnects automatically.
    };
    return () => es.close();
  }, [token, orderNo, effectiveAvailability.readable]);

  async function submit() {
    const text = message.trim();
    if (!text || busy || !effectiveAvailability.writable) return;
    setBusy(true);
    setErr("");
    try {
      const response = await postChatMessage(token, orderNo, text);
      setMessage("");
      if (response?.availability) setAvailability(response.availability);
      setItems((prev) => {
        const msg = response?.message;
        if (!msg) return prev;
        if (prev.some((item) => item.id === msg.id)) return prev;
        return [...prev, msg];
      });
      await markChatRead(token, orderNo);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nachricht konnte nicht gesendet werden");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="order-chat" className="mt-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t(language, "chat.title")}</h3>
        {effectiveAvailability.feedbackUntil && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {t(language, "chat.feedbackUntil").replace("{{date}}", formatDateTime(effectiveAvailability.feedbackUntil))}
          </span>
        )}
      </div>
      <p className="mb-2 text-xs text-[var(--text-subtle)]">
        {actorRole === "admin"
          ? t(language, "chat.rule.admin")
          : beforeAppointment
            ? t(language, "chat.rule.beforeAppointment")
            : t(language, "chat.rule.afterAppointment")}
      </p>

      {!effectiveAvailability.readable ? (
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]/50 px-3 py-2 text-sm text-[var(--text-subtle)]">
          {t(language, "chat.closed")}
        </div>
      ) : (
        <>
          <div data-testid="chat-messages" className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]/40 p-3">
            {!items.length && (
              <EmptyState
                icon={<MessageSquare className="h-5 w-5 text-[var(--text-subtle)]" />}
                title={t(language, "chat.empty")}
                className="!p-6"
              />
            )}
            {items.map((item) => {
              const fromCustomer = String(item.senderRole || "").toLowerCase() === "customer";
              return (
                <div key={item.id} data-testid="chat-message-item" className={`flex ${fromCustomer ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm ${
                      fromCustomer
                        ? "border border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-main)]"
                        : "bg-[var(--accent)] text-white"
                    }`}
                  >
                    <div className={`mb-1 text-[11px] ${fromCustomer ? "text-[var(--text-subtle)]" : "text-amber-100"}`}>
                      {item.senderName || (fromCustomer ? t(language, "chat.sender.customer") : t(language, "chat.sender.photographer"))} · {item.createdAt ? formatDateTime(item.createdAt) : "—"}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{item.message}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {!effectiveAvailability.writable && (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">{t(language, "chat.readonly")}</p>
          )}

          <div className="mt-3 flex gap-2">
            <input
              data-testid="chat-input"
              className="ui-input flex-1"
              placeholder={t(language, "chat.placeholder")}
              value={message}
              disabled={!effectiveAvailability.writable || busy}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <button data-testid="chat-send" className="btn-primary" disabled={!effectiveAvailability.writable || busy || !message.trim()} onClick={() => void submit()}>
              {busy ? `${t(language, "chat.send")}…` : t(language, "chat.send")}
            </button>
          </div>
        </>
      )}

      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

