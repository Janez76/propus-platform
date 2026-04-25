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
      className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--ink-3)] bg-white hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:opacity-50"
      title="Archivieren"
    >
      <Archive className="h-3 w-3" />
      Archivieren
    </button>
  );
}
