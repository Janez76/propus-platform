import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center p-12 text-center rounded-xl shadow-sm", className)}
      style={{ background: "var(--surface)", border: "1px solid var(--border-soft)" }}
    >
      {icon && (
        <div className="mb-4 p-4 rounded-full" style={{ background: "var(--surface-raised)" }}>
          {icon}
        </div>
      )}
      <h3 className="text-lg font-bold mb-2" style={{ color: "var(--text-main)", fontFamily: "var(--propus-font-heading)" }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-md mb-6" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

