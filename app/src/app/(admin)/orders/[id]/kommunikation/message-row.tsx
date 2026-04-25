"use client";

import { useTransition } from "react";
import { softDeleteChatMessage } from "./actions";
import { formatTS } from "../_shared";

type Message = {
  id: number;
  kind: "system" | "chat";
  sender_role: string | null;
  sender_name: string | null;
  message: string;
  created_at: string;
  is_internal?: boolean;
};

export function MessageRowWithDelete({ msg, orderNo }: { msg: Message; orderNo: number }) {
  const isSystem = msg.kind === "system";
  const [pend, tr] = useTransition();
  const roleColor = isSystem ? "text-[var(--ink-3)]" : "text-[#9A7619]";
  const roleLabel = msg.sender_role ?? (isSystem ? "System" : "Unbekannt");

  function onDelete() {
    if (msg.kind !== "chat" || !window.confirm("Diese Chat-Nachricht wirklich löschen?")) return;
    tr(async () => {
      await softDeleteChatMessage({ orderNo, id: msg.id });
      window.location.reload();
    });
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wider ${roleColor}`}>{roleLabel}</span>
          {msg.sender_name && (
            <span className="text-xs text-[var(--ink-3)]">{msg.sender_name}</span>
          )}
          {msg.is_internal && (
            <span className="rounded-full bg-[var(--paper-strip)] border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--ink-3)]">Intern</span>
          )}
          {!isSystem && (
            <span className="rounded-full bg-[var(--gold-50)] border border-[var(--gold-200)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--gold-700)]">Chat</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-[var(--ink-3)] tabular-nums font-mono">{formatTS(msg.created_at)}</span>
          {msg.kind === "chat" && (
            <button
              type="button"
              className="text-xs text-[var(--danger)] hover:underline"
              onClick={onDelete}
              disabled={pend}
            >
              Löschen
            </button>
          )}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink-2)]">{msg.message}</p>
    </div>
  );
}
