"use client";

import { useEffect, useState } from "react";

const FORMATTER = new Intl.DateTimeFormat("de-CH", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Europe/Zurich",
});

export function LiveClock() {
  // Initial leer, damit kein Hydration-Mismatch entsteht
  const [time, setTime] = useState("--:--:--");

  useEffect(() => {
    const tick = () => setTime(FORMATTER.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className="clock"
      aria-label="Aktuelle Uhrzeit Zürich"
      suppressHydrationWarning
    >
      {time}
    </span>
  );
}
