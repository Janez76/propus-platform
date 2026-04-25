"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarCheck, Users, Map,
  FileText, Ticket, Image as ImageIcon, Settings, CircleHelp,
} from "lucide-react";

const NAV_MAIN = [
  { href: "/dashboard", label: "Dashboard",    icon: LayoutDashboard },
  { href: "/orders",    label: "Bestellungen", icon: CalendarCheck },
  { href: "/customers", label: "Kunden",       icon: Users },
  { href: "/tours",     label: "Tour Manager", icon: Map },
  { href: "/invoices",  label: "Rechnungen",   icon: FileText },
  { href: "/tickets",   label: "Tickets",      icon: Ticket },
] as const;

const NAV_SYSTEM = [
  { href: "/media",    label: "Medien",        icon: ImageIcon },
  { href: "/settings", label: "Einstellungen", icon: Settings },
  { href: "/help",     label: "Hilfe",         icon: CircleHelp },
] as const;

export type SidebarUser = {
  initials: string;
  name: string;
  role: string;
};

export function BestellungSidebar({ user }: { user?: SidebarUser }) {
  const pathname = usePathname() ?? "";

  const isActive = (href: string) =>
    href === "/orders"
      ? pathname.startsWith("/orders")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="bd-sidebar">
      <div className="brand">Propus</div>

      <div className="nav-group">Hauptmenü</div>
      <nav>
        {NAV_MAIN.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "is-active" : undefined}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="nav-group">System</div>
      <nav>
        {NAV_SYSTEM.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "is-active" : undefined}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="user">
        <span className="av">{user?.initials ?? "—"}</span>
        <div>
          <strong>{user?.name ?? "Nicht angemeldet"}</strong>
          <span>{user?.role ?? ""}</span>
        </div>
      </div>
    </aside>
  );
}
