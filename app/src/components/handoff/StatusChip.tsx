import { getStatusLabel } from "../../lib/status";

interface StatusChipProps {
  status: string | null | undefined;
  size?: "sm" | "md";
}

export function StatusChip({ status, size = "md" }: StatusChipProps) {
  const label = getStatusLabel(status);
  return <span className={`status-chip status-chip-${size}`}>{label}</span>;
}
