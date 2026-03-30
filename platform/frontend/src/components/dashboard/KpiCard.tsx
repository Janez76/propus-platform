import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { formatCHF } from "../../lib/format";

interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
  };
  icon?: React.ReactNode;
  format?: "currency" | "number" | "text";
  emphasis?: "default" | "primary";
  sparkline?: number[];
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 120;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((entry, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((entry - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-7 w-28">
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={points} />
    </svg>
  );
}

export function KpiCard({
  title,
  value,
  trend,
  icon,
  format = "number",
  emphasis = "default",
  sparkline,
}: KpiCardProps) {
  const formattedValue = format === "currency" && typeof value === "number"
    ? formatCHF(value)
    : value;

  const trendStyle = trend
    ? trend.direction === "up"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : trend.direction === "down"
        ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        : "bg-surface-raised text-token-muted"
    : "";

  const TrendIcon = trend
    ? trend.direction === "up"
      ? TrendingUp
      : trend.direction === "down"
        ? TrendingDown
        : Minus
    : null;

  return (
    <motion.div
      whileHover={{ scale: 1.015, boxShadow: "0 0 24px color-mix(in srgb, var(--accent) 18%, transparent)" }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="rounded-xl border p-4 transition-all duration-200 sm:p-6"
      style={emphasis === "primary"
        ? { border: "1px solid color-mix(in srgb, var(--accent) 35%, var(--border-soft))", background: "var(--surface)" }
        : { border: "1px solid var(--border-soft)", background: "var(--surface)" }
      }
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="section-title mb-1">
            {title}
          </p>
        </div>
        {icon && (
          <div className="rounded-lg p-2" style={{ background: "var(--surface-raised)" }}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="text-2xl font-bold p-text-main sm:text-3xl">
          {formattedValue}
        </div>

        {trend && TrendIcon && (
          <div className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold sm:text-xs", trendStyle)}>
            <TrendIcon className="h-4 w-4" />
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>

      {sparkline && sparkline.length > 1 ? (
        <div className="mt-3 flex items-center justify-end sm:mt-4">
          <Sparkline values={sparkline} />
        </div>
      ) : null}
    </motion.div>
  );
}

