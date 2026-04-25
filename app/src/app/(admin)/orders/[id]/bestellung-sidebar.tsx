"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarCheck, Users, Map,
  FileText, Ticket, UploadCloud, Settings,
} from "lucide-react";
import { legacyCanAccessPath } from "@/lib/permissions";
import type { Role } from "@/types";

// Hrefs match the canonical SPA routes registered in
// app/src/components/ClientShell.tsx (PrivateRoutes) and the
// nav config in app/src/config/nav.config.ts.
const NAV_MAIN = [
  { href: "/dashboard",                label: "Dashboard",    icon: LayoutDashboard },
  { href: "/orders",                   label: "Bestellungen", icon: CalendarCheck },
  { href: "/customers",                label: "Kunden",       icon: Users },
  { href: "/admin/tours",              label: "Tour Manager", icon: Map },
  { href: "/admin/finance/invoices",   label: "Rechnungen",   icon: FileText },
  { href: "/admin/tickets",            label: "Tickets",      icon: Ticket },
] as const;

const NAV_SYSTEM = [
  { href: "/upload",   label: "Uploads",       icon: UploadCloud },
  { href: "/settings", label: "Einstellungen", icon: Settings },
] as const;

export type SidebarUser = {
  initials: string;
  name: string;
  /** Display label for the role (e.g. "Admin"). */
  roleLabel: string;
};

type Props = {
  /** Role used for nav permission checks. Always required so filtering
   *  stays active even when display-only user data is missing. */
  role: Role;
  /** Optional display info (avatar initials + name). When absent, the
   *  user footer renders a neutral placeholder but filtering still runs. */
  user?: SidebarUser;
};

export function BestellungSidebar({ role, user }: Props) {
  const pathname = usePathname() ?? "";

  const isActive = (href: string) =>
    href === "/orders"
      ? pathname.startsWith("/orders")
      : pathname === href || pathname.startsWith(href + "/");

  // Same role-based filter as the AppShell sidebar uses, so users like
  // tour_manager don't see finance/tickets entries that would just bounce
  // them off RouteGuard.
  const canSee = (href: string): boolean => legacyCanAccessPath(role, href);

  const mainItems = NAV_MAIN.filter((it) => canSee(it.href));
  const systemItems = NAV_SYSTEM.filter((it) => canSee(it.href));

  return (
    <aside className="bd-sidebar">
      <div className="brand">Propus</div>

      {mainItems.length > 0 && <div className="nav-group">Hauptmenü</div>}
      {mainItems.length > 0 && (
        <nav>
          {mainItems.map(({ href, label, icon: Icon }) => (
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
      )}

      {systemItems.length > 0 && <div className="nav-group">System</div>}
      {systemItems.length > 0 && (
        <nav>
          {systemItems.map(({ href, label, icon: Icon }) => (
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
      )}

      <div className="user">
        <span className="av">{user?.initials ?? "—"}</span>
        <div>
          <strong>{user?.name ?? "Nicht angemeldet"}</strong>
          <span>{user?.roleLabel ?? ""}</span>
        </div>
      </div>
    </aside>
  );
}
