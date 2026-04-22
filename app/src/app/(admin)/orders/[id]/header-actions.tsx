"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Pencil, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

function tabPathSupportsEdit(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.includes("/verlauf")) return false;
  if (pathname.includes("/kommunikation")) return false;
  if (pathname.includes("/dateien")) return false;
  return true;
}

function basePath(pathname: string, orderNo: string | number): string {
  const n = String(orderNo);
  const p = `/orders/${n}`;
  if (!pathname || pathname === p) return p;
  if (pathname.startsWith(`${p}/`)) {
    return pathname.split("?")[0].replace(/\/$/, "") || p;
  }
  return p;
}

export function OrderReadOnlyBadge() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isEditing = searchParams.get("edit") === "1";
  if (isEditing) return null;
  if (!tabPathSupportsEdit(pathname)) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-white/40">
      <Lock className="h-3 w-3" />
      Schreibgeschützt
    </span>
  );
}

type ActionProps = {
  orderNo: number | string;
};

export function OrderEditActions({ orderNo }: ActionProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isEditing = searchParams.get("edit") === "1";
  const no = String(orderNo);
  const tabBase = basePath(pathname || "", orderNo);
  const supportsEdit = tabPathSupportsEdit(pathname);

  if (!supportsEdit) {
    return null;
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={tabBase} scroll={false}>
            Abbrechen
          </Link>
        </Button>
        <Button
          type="submit"
          form="order-form"
          size="sm"
          className="bg-[#B68E20] text-black hover:bg-[#d4a82c]"
        >
          Speichern
        </Button>
      </div>
    );
  }

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="border-[#B68E20] text-[#B68E20] hover:bg-[#B68E20]/10 hover:text-[#B68E20]"
    >
      <Link href={`${tabBase}?edit=1`} scroll={false}>
        <Pencil className="h-4 w-4" />
        Bearbeiten
      </Link>
    </Button>
  );
}
