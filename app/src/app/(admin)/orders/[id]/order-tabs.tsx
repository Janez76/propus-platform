"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, MapPin, ListChecks, CalendarClock,
  MessagesSquare, Folder, Link2, History,
} from "lucide-react";
import { useOrderEditShellOptional } from "./order-edit-shell-context";

type Tab = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function getTabs(orderId: string): Tab[] {
  return [
    { href: `/orders/${orderId}`,               label: "Übersicht",         icon: LayoutGrid },
    { href: `/orders/${orderId}/objekt`,        label: "Objekt & Vor-Ort", icon: MapPin },
    { href: `/orders/${orderId}/leistungen`,    label: "Leistungen",      icon: ListChecks },
    { href: `/orders/${orderId}/termin`,        label: "Termin & Status", icon: CalendarClock },
    { href: `/orders/${orderId}/kommunikation`, label: "Kommunikation",   icon: MessagesSquare },
    { href: `/orders/${orderId}/dateien`,       label: "Dateien",         icon: Folder },
    { href: `/orders/${orderId}/verknuepfungen`, label: "Verknüpfungen",  icon: Link2 },
    { href: `/orders/${orderId}/verlauf`,       label: "Verlauf",         icon: History },
  ];
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

  const tabs = getTabs(orderId);

  return (
    <>
      {tabs.map((tab) => {
        const Icon = tab.icon;
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
