"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { VerlaufSectionClient } from "./verlauf/verlauf-section-client";
import { VerknuepfungenSectionClient } from "./verknuepfungen/verknuepfungen-section-client";
import { useOrderEditShell } from "./order-edit-shell-context";

type Props = {
  orderId: string;
  children: ReactNode;
};

/**
 * Zeigt entweder klassische RSC-`children` (Subroute) oder eingebettete Client-Sections
 * (ohne vollständigen Wechsel der Subroute), je nach `clientSection` im Context.
 */
export function OrderEditShellContent({ orderId, children }: Props) {
  const { clientSection } = useOrderEditShell();
  const pathname = usePathname();
  const base = `/orders/${orderId}`;

  const onVerlaufRoute = pathname === `${base}/verlauf` || pathname.startsWith(`${base}/verlauf/`);
  const onVerknuepfungenRoute =
    pathname === `${base}/verknuepfungen` || pathname.startsWith(`${base}/verknuepfungen/`);

  if (clientSection === "verlauf" && !onVerlaufRoute) {
    return <VerlaufSectionClient orderId={orderId} />;
  }
  if (clientSection === "verknuepfungen" && !onVerknuepfungenRoute) {
    return <VerknuepfungenSectionClient orderId={orderId} />;
  }

  return <>{children}</>;
}
