import { createElement } from "react";
import { getStatusEntry, getStatusIcon } from "../../lib/status";

type Variant = "default" | "print";

type Props = {
  status: string | undefined | null;
  variant?: Variant;
};

const PRINT_COLORS: Record<string, string> = {
  confirmed: "#d1fae5",
  provisional: "#fef3c7",
  pending: "#f1f5f9",
  cancelled: "#fee2e2",
  done: "#ede9fe",
  completed: "#e0f2fe",
  paused: "#fce7f3",
  archived: "#f3f4f6",
};

export function StatusBadge({ status, variant = "default" }: Props) {
  const entry = getStatusEntry(status);
  if (variant === "print") {
    const key = String(status || "").toLowerCase();
    const bg = PRINT_COLORS[key] ?? "#f3f4f6";
    return (
      <span
        style={{
          background: bg,
          borderRadius: 100,
          padding: "2px 10px",
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#333",
        }}
      >
        {entry.label}
      </span>
    );
  }
  return (
    <span className={entry.badgeClass}>
      {createElement(getStatusIcon(status), { className: "mr-1 h-3 w-3 shrink-0" })}
      {entry.label}
    </span>
  );
}
