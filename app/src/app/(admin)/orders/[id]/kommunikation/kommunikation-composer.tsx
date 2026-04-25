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
    <div className="rounded-xl border border-[var(--gold-200)] bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--gold-700)]">Nachricht senden</h3>
      {err && <p className="mb-2 text-sm text-[var(--danger)]">{err}</p>}
      <div className="mb-2 flex flex-wrap gap-3 items-center">
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)] flex items-center gap-2">
          An
          <select
            className="rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value as typeof recipient)}
          >
            <option value="customer">Kunde</option>
            <option value="photographer">Mitarbeiter (Fotograf)</option>
            <option value="internal">Intern</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="rounded accent-[var(--gold-600)]"
          />
          Nur intern (Kunde sieht es nicht)
        </label>
      </div>
      <textarea
        className="mb-2 w-full min-h-24 rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm text-[var(--ink)] focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
        placeholder="Nachrichtentext…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button
        type="button"
        onClick={submit}
        disabled={pend || !message.trim()}
        className="bd-btn-primary"
      >
        {pend ? "…" : "Senden"}
      </Button>
    </div>
  );
}
