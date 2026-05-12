"use client";

import { useEffect, useState } from "react";

type Props = {
  target: number;
  label: string;
  suffix?: string;
  accent?: boolean;
  delay?: number;
  durationMs?: number;
};

const FORMATTER = new Intl.NumberFormat("de-CH");

export function StatCounter({
  target,
  label,
  suffix = "",
  accent = false,
  delay = 0,
  durationMs = 1800,
}: Props) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      setValue(target);
      return;
    }

    let raf = 0;
    const startTimer = setTimeout(() => {
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        setValue(Math.floor(target * eased));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(raf);
    };
  }, [target, delay, durationMs]);

  const display = FORMATTER.format(value);

  return (
    <div className="stat" role="listitem">
      <div className="num">
        {accent ? <em>{display}</em> : display}
        {suffix}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
