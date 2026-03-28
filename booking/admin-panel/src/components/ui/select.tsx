import * as React from "react";
import { cn } from "../../lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => {
    return (
      <div className="relative">
        {label && (
          <label
            className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-muted)", fontFamily: "var(--propus-font-heading)" }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              "w-full appearance-none rounded-lg px-3 py-2 pr-10 text-sm font-medium shadow-sm transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-main)",
            }}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-subtle)" }} />
        </div>
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
