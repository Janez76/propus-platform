import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getOrderMessages, postOrderMessage, type OrderMessage } from "../../api/orders";
import { formatDateTime } from "../../lib/utils";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = { token: string; orderNo: string; onClose: () => void };

export function OrderMessages({ token, orderNo, onClose }: Props) {
  const lang = useAuthStore((s) => s.language);
  const [items, setItems] = useState<OrderMessage[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    setItems(await getOrderMessages(token, orderNo));
  }

  useEffect(() => {
    let alive = true;
    getOrderMessages(token, orderNo).then((rows) => {
      if (alive) setItems(rows);
    }).catch(() => {});
    return () => { alive = false; };
  }, [token, orderNo]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    await postOrderMessage(token, orderNo, message.trim());
    setMessage("");
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4">
      <div className="w-full max-w-full sm:max-w-xl rounded-xl bg-white p-3 sm:p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">{t(lang, "messages.title").replace("{{orderNo}}", orderNo)}</h3>
          <button onClick={onClose} className="rounded border px-3 py-2 text-sm">{t(lang, "common.close")}</button>
        </div>
        <div className="max-h-56 space-y-2 overflow-auto rounded border p-2">
          {items.map((m) => <p key={m.id} className="text-sm"><span className="text-zinc-500">{formatDateTime(m.created_at)}</span> - {m.message}</p>)}
          {!items.length ? <p className="text-sm text-zinc-500">{t(lang, "messages.empty")}</p> : null}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={submit}>
          <label htmlFor="msgInput" className="sr-only">{t(lang, "messages.label.message")}</label>
          <input id="msgInput" name="msgInput" value={message} onChange={(e) => setMessage(e.target.value)} className="ui-input min-w-0 flex-1" />
          <button className="btn-primary">{t(lang, "common.send")}</button>
        </form>
      </div>
    </div>
  );
}
