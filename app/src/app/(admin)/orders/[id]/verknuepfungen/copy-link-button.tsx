"use client";

import { useState } from "react";

type Props = {
  label?: string;
  url: string;
  className?: string;
};

export function CopyLinkButton({ label = "Link kopieren", url, className }: Props) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          // ignore
        }
      }}
      className={className ?? "rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-2)] hover:border-[var(--gold-400)] hover:text-[var(--ink)]"}
    >
      {done ? "Kopiert" : label}
    </button>
  );
}
