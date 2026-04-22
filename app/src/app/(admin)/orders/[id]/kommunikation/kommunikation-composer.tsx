"use client";

import { useState, useTransition } from "react";
import { sendOrderMessage } from "./actions";
import { Button } from "@/components/ui/button";

export function KommunikationComposer({ orderNo }: { orderNo: number }) {
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState<"customer" | "photographer" | "internal">("customer");
  const [isInternal, setIsInternal] = useState(false);
  const [err, setErr] = useState("");
  const [pend, tr] = useTransition();

  function submit() {
    setErr("");
    tr(async () => {
      const r = await sendOrderMessage({
        orderNo,
        message,
        recipient,
        isInternal,
      });
      if (r && "ok" in r && r.ok) {
        setMessage("");
        window.location.reload();
        return;
      }
      if (r && "ok" in r && r.ok === false) {
        setErr(r.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-[#B68E20]/30 bg-white/[0.02] p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase text-[#B68E20]">Nachricht senden</h3>
      {err && <p className="mb-2 text-sm text-rose-400">{err}</p>}
      <div className="mb-2 flex flex-wrap gap-2">
        <label className="text-xs text-white/60">
          An
          <select
            className="ml-1 rounded border border-white/10 bg-[#0c0d10] px-2 py-1"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value as typeof recipient)}
          >
            <option value="customer">Kunde</option>
            <option value="photographer">Mitarbeiter (Fotograf)</option>
            <option value="internal">Intern</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-white/60">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="rounded"
          />
          Nur intern (Kunde sieht es nicht)
        </label>
      </div>
      <textarea
        className="mb-2 w-full min-h-24 rounded border border-white/10 bg-[#0c0d10] px-3 py-2 text-sm"
        placeholder="Nachrichtentext…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button
        type="button"
        onClick={submit}
        disabled={pend || !message.trim()}
        className="bg-[#B68E20] text-black"
      >
        {pend ? "…" : "Senden"}
      </Button>
    </div>
  );
}
