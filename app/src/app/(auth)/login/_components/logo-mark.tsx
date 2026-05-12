"use client";

import { useState } from "react";

export function LogoMark() {
  const [rot, setRot] = useState(0);
  return (
    <button
      type="button"
      className="logo-mark"
      onClick={() => setRot((r) => r + 360)}
      style={{
        transform: `rotate(${rot}deg)`,
        transition: "transform 700ms cubic-bezier(.2,.7,.2,1)",
      }}
      aria-label="Propus Logo (Klick: Drehung)"
    >
      P
    </button>
  );
}
