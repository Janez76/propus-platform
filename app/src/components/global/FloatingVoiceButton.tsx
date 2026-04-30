"use client";

import { Mic } from "lucide-react";
import { useState } from "react";
import { ConversationView } from "@/app/(admin)/assistant/_components/ConversationView";

export function FloatingVoiceButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Assistant öffnen"
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent,#B68E20)] text-black shadow-xl transition hover:scale-105"
      >
        <Mic className="h-6 w-6" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="h-full w-full max-w-2xl p-4" onClick={(event) => event.stopPropagation()}>
            <ConversationView />
          </div>
        </div>
      ) : null}
    </>
  );
}
