import * as React from "react";
import { cn } from "../../lib/utils";

const badgeVariants = {
  default: "border-transparent",
  secondary: "border-transparent",
  destructive: "border-transparent bg-red-500 text-white hover:bg-red-600",
  outline: "border-[var(--border-strong)]",
  gold: "border-transparent text-white",
} as const;

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants;
}

const badgeStyles: Record<string, React.CSSProperties> = {
  default: { background: "var(--text-main)", color: "var(--surface)" },
  secondary: { background: "var(--surface-raised)", color: "var(--text-main)", border: "1px solid var(--border-soft)" },
  destructive: {},
  outline: { color: "var(--text-main)" },
  gold: { background: "var(--accent)", color: "#ffffff" },
};

function Badge({ className, variant = "default", style, ...props }: BadgeProps) {
  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
        badgeVariants[variant],
        className
      )}
      style={{ ...badgeStyles[variant], ...style }}
      {...props} 
    />
  );
}

export { Badge };
