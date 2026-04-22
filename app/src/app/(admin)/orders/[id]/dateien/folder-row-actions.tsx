"use client";

import { useTransition } from "react";
import { Archive } from "lucide-react";
import { archiveOrderFolderLink } from "./actions";

export function FolderArchiveButton({ id, orderNo }: { id: number; orderNo: number }) {
  const [pen, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pen}
      onClick={() => {
        if (!window.confirm("Diese Verknüpfung archivieren?")) return;
        start(async () => {
          await archiveOrderFolderLink({ id, orderNo });
        });
      }}
      className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/5 disabled:opacity-50"
      title="Archivieren"
    >
      <Archive className="h-3 w-3" />
      Archivieren
    </button>
  );
}
