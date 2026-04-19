import type { PasswordScore } from "../../lib/passwordStrength";
import { cn } from "../../lib/utils";

type Props = {
  score: PasswordScore;
  label: string;
};

const BAR_COLORS = [
  "bg-red-500",
  "bg-amber-500",
  "bg-amber-500",
  "bg-green-500",
] as const;

const LABEL_COLORS = [
  "text-red-500",
  "text-amber-500",
  "text-amber-500",
  "text-green-500",
] as const;

export function PasswordStrengthBars({ score, label }: Props) {
  return (
    <div className="mt-1.5">
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={4}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < score ? BAR_COLORS[score - 1] : "bg-[var(--surface-raised)]",
            )}
          />
        ))}
      </div>
      {score > 0 ? (
        <p className={cn("mt-1 text-[10px] font-semibold uppercase tracking-wider", LABEL_COLORS[score - 1])}>
          {label}
        </p>
      ) : null}
    </div>
  );
}
