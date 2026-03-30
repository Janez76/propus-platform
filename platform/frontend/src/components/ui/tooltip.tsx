import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type TooltipProps = {
  content: string;
  children: ReactNode;
  className?: string;
};

export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        style={{
          background: "var(--text-main)",
          color: "var(--surface)",
          border: "1px solid var(--border-soft)",
        }}
      >
        {content}
      </span>
    </span>
  );
}

