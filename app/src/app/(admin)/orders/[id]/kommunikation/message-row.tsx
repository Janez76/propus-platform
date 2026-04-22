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
  const roleColor = isSystem ? "text-white/40" : "text-[#B68E20]";
  const roleLabel = msg.sender_role ?? (isSystem ? "System" : "Unbekannt");

  function onDelete() {
    if (msg.kind !== "chat" || !window.confirm("Diese Chat-Nachricht wirklich löschen?")) return;
    tr(async () => {
      await softDeleteChatMessage({ orderNo, id: msg.id });
      window.location.reload();
    });
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-medium uppercase ${roleColor}`}>{roleLabel}</span>
          {msg.sender_name && (
            <span className="text-xs text-white/50">{msg.sender_name}</span>
          )}
          {msg.is_internal && (
            <span className="rounded-full bg-zinc-500/20 px-1.5 py-0.5 text-[10px] text-zinc-300">Intern</span>
          )}
          {!isSystem && (
            <span className="rounded-full bg-[#B68E20]/10 px-1.5 py-0.5 text-[10px] text-[#B68E20]">Chat</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-white/30 tabular-nums">{formatTS(msg.created_at)}</span>
          {msg.kind === "chat" && (
            <button
              type="button"
              className="text-xs text-rose-400/80 hover:text-rose-300"
              onClick={onDelete}
              disabled={pend}
            >
              Löschen
            </button>
          )}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{msg.message}</p>
    </div>
  );
}
