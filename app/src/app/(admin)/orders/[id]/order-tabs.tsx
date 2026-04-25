"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, MapPin, ListChecks, CalendarClock,
  MessagesSquare, Folder, Link2, History,
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
    { kind: "route" as const, href: `/orders/${orderId}`,               label: "Übersicht",         icon: LayoutGrid },
    { kind: "route" as const, href: `/orders/${orderId}/objekt`,         label: "Objekt & Vor-Ort", icon: MapPin },
    { kind: "route" as const, href: `/orders/${orderId}/leistungen`,     label: "Leistungen",      icon: ListChecks },
    { kind: "route" as const, href: `/orders/${orderId}/termin`,         label: "Termin & Status",  icon: CalendarClock },
    { kind: "route" as const, href: `/orders/${orderId}/kommunikation`,  label: "Kommunikation",    icon: MessagesSquare },
    { kind: "route" as const, href: `/orders/${orderId}/dateien`,        label: "Dateien",          icon: Folder },
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
    <>
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
                className={`bd-tab${active ? " is-active" : ""}`}
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
                className="bd-tab-pop"
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
            className={`bd-tab${isActive ? " is-active" : ""}`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}
