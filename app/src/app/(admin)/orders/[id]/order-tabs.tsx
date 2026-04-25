"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User, Building2, ListChecks, CalendarClock,
  MessageSquare, Files, Link2, History,
} from "lucide-react";
import { useOrderEditShellOptional, type OrderShellClientSection } from "./order-edit-shell-context";

type Tab = {
  kind: "route";
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
} | {
  kind: "shell";
  id: Exclude<OrderShellClientSection, null>;
  hrefFallback: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function getTabs(orderId: string): Tab[] {
  return [
    { kind: "route" as const, href: `/orders/${orderId}`,               label: "Übersicht",         icon: User },
    { kind: "route" as const, href: `/orders/${orderId}/objekt`,         label: "Objekt & Vor-Ort", icon: Building2 },
    { kind: "route" as const, href: `/orders/${orderId}/leistungen`,     label: "Leistungen",      icon: ListChecks },
    { kind: "route" as const, href: `/orders/${orderId}/termin`,         label: "Termin & Status",  icon: CalendarClock },
    { kind: "route" as const, href: `/orders/${orderId}/kommunikation`,  label: "Kommunikation",    icon: MessageSquare },
    { kind: "route" as const, href: `/orders/${orderId}/dateien`,        label: "Dateien",          icon: Files },
    { kind: "shell" as const,  id: "verknuepfungen", hrefFallback: `/orders/${orderId}/verknuepfungen`, label: "Verknüpfungen",  icon: Link2 },
    { kind: "shell" as const,  id: "verlauf",         hrefFallback: `/orders/${orderId}/verlauf`,         label: "Verlauf",         icon: History },
  ];
}

function pathMatchesBase(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + "/");
}

function isActiveRoute(pathname: string, orderId: string, href: string): boolean {
  const home = `/orders/${orderId}`;
  if (href === home) {
    return pathname === home;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function OrderTabs({ orderId }: { orderId: string }) {
  const pathname = usePathname();
  const shell = useOrderEditShellOptional();
  const clearShell = () => shell?.clearClientSection();
  const confirmLeave = () => {
    if (!shell?.hasAnyDirty()) return true;
    return window.confirm("Ungespeicherte Änderungen wirklich verwerfen und wechseln?");
  };
  const setShell = (s: OrderShellClientSection) => {
    if (!shell) return;
    if (s === "verlauf" || s === "verknuepfungen" || s === null) {
      if (!confirmLeave()) return;
      shell.setClientSection(s);
    }
  };

  const base = `/orders/${orderId}`;
  const onVerlaufPath = pathMatchesBase(pathname, `${base}/verlauf`);
  const onVerknuepfPath = pathMatchesBase(pathname, `${base}/verknuepfungen`);
  const tabs = getTabs(orderId);

  return (
    <nav className="flex gap-1 overflow-x-auto -mb-px">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        if (tab.kind === "shell") {
          const active =
            (tab.id === "verlauf" && (onVerlaufPath || shell?.clientSection === "verlauf")) ||
            (tab.id === "verknuepfungen" && (onVerknuepfPath || shell?.clientSection === "verknuepfungen"));
          return (
            <div key={tab.id} className="flex">
              <button
                type="button"
                onClick={() => setShell(tab.id)}
                className={`
                  flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors
                  ${active
                    ? "border-[#B68E20] text-[#B68E20]"
                    : "border-transparent text-white/60 hover:border-white/20 hover:text-white"}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
              <Link
                href={tab.hrefFallback}
                onClick={(e) => {
                  if (!confirmLeave()) {
                    e.preventDefault();
                    return;
                  }
                  clearShell();
                }}
                className="self-center pl-0.5 pr-1 text-[10px] text-white/25 hover:text-white/50"
                title="In neuer/klassischer Subroute öffnen"
                prefetch={false}
              >
                ↗
              </Link>
            </div>
          );
        }
        const href = tab.href;
        const isActive = isActiveRoute(pathname, orderId, href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={(e) => {
              if (!confirmLeave()) {
                e.preventDefault();
                return;
              }
              clearShell();
            }}
            className={`
              flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors
              ${isActive
                ? "border-[#B68E20] text-[#B68E20]"
                : "border-transparent text-white/60 hover:border-white/20 hover:text-white"}`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
