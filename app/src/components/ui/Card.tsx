import type { PropsWithChildren } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={cn("rounded-xl p-4 shadow-sm", className)}
      style={{ background: "var(--surface)", border: "1px solid var(--border-soft)" }}
    >
      {children}
    </section>
  );
}

