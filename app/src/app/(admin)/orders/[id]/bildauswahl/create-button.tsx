"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createBildauswahlForOrder } from "@/api/bildauswahlAdmin";

/**
 * Client-Button: legt eine Bildauswahl mit Order-Pre-Fill (Kunde/Adresse aus
 * Bestellung) an und navigiert direkt in den Editor — schneller als der
 * Umweg ueber die globale Liste.
 */
export function CreateBildauswahlForOrderButton({
  orderNo,
  label = "Bildauswahl erstellen",
  variant = "primary",
}: {
  orderNo: number;
  label?: string;
  variant?: "primary" | "outline";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setErr(null);
    try {
      const g = await createBildauswahlForOrder(orderNo);
      router.push(`/admin/bildauswahl/${g.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={onClick}
        disabled={busy}
        className={`admin-btn ${variant === "primary" ? "admin-btn--primary" : "admin-btn--outline"} inline-flex items-center gap-2 text-sm`}
      >
        <Plus className="h-4 w-4" />
        {busy ? "Erstelle …" : label}
      </button>
      {err ? <p className="text-xs text-red-600 mt-2">{err}</p> : null}
    </>
  );
}
