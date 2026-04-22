"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Zeigt success toast wenn URL `?saved=1` (nach Server-Action-Redirect) */
export function OrderSaveToast() {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (sp.get("saved") !== "1" || done.current) return;
    done.current = true;
    toast.success("Gespeichert", { id: "order-saved" });
    const p = new URLSearchParams(sp.toString());
    p.delete("saved");
    const q = p.toString();
    router.replace(q ? `${path}?${q}` : path, { scroll: false });
  }, [sp, path, router]);
  return null;
}
