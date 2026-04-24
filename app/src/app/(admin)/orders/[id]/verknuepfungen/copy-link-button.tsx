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
      className={className ?? "rounded border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"}
    >
      {done ? "Kopiert" : label}
    </button>
  );
}
