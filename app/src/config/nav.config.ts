/**
 * Zentrale Nav-Konfiguration für die Propus Admin-Sidebar.
 *
 * Die Sidebar wird NICHT mehr hart in AppShell codiert, sondern deklarativ
 * aus dieser Datei gebaut. Neue Seite = 1 Eintrag hier (plus i18n-Key).
 *
 * Geltungsbereich:
 *   - Rollen-Filter (adminOnly, photographer, tourManager) werden pro Section
 *     und pro Item ausgewertet. Items ohne `roles` erben die Section-Rollen.
 *   - i18n: Nur `labelKey` referenziert; in `de.json` gepflegt.
 *   - Badges: `badgeKey` zeigt auf einen Zähler, der im `useNavBadge(key)`-Hook
 *     aufgelöst wird (siehe Sidebar.tsx).
 *
 * Hinweis: Die Reihenfolge hier ist die Reihenfolge in der Sidebar.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Calendar,
  UploadCloud,
  Users,
  MessageSquare,
  Star,
  Home,
  Images,
  ScanEye,
  Receipt,
  BellRing,
  Banknote,
  Box,
  TicketPercent,
  Mail,
  ShieldCheck,
  Settings,
  History,
  Bug,
  DatabaseBackup,
} from "lucide-react";

import type { Role } from "../types";

/* -------------------------------------------------------------------------- */
/* Typen                                                                      */
/* -------------------------------------------------------------------------- */

export type NavBadgeKey =
  | "orders.openToday"
  | "tickets.openCount"
  | "invoices.openCount"
  | "invoices.overdueCount";

export type NavBadgeTone = "default" | "warn" | "danger";

export interface NavItem {
  /** Stabile ID, z.B. für Analytics oder Active-Matching */
  id: string;
  /** React-Router-Ziel */
  to: string;
  /** i18n-Key (z.B. `nav.item.orders`) */
  labelKey: string;
  /** Lucide-Icon-Component */
  icon: LucideIcon;
  /** Wenn gesetzt, überschreibt Section-Rollen */
  roles?: Role[];
  /** Zähler-Key; wird von useNavBadge() aufgelöst */
  badgeKey?: NavBadgeKey;
  /** Optische Tönung des Badges */
  badgeTone?: NavBadgeTone;
  /** Aktiv auch bei Sub-Routen (z.B. /admin/tours/123) */
  matchNested?: boolean;
}

export interface NavSection {
  id: string;
  labelKey: string;
  /** Section-Default-Zustand (collapsible via UI, persistiert in localStorage) */
  defaultOpen?: boolean;
  /** Rollen-Filter für die gesamte Section */
  roles?: Role[];
  items: NavItem[];
}

/* -------------------------------------------------------------------------- */
/* Rollen-Sets                                                                */
/* -------------------------------------------------------------------------- */

const ADMIN: Role[] = ["admin", "super_admin"];
const ADMIN_PLUS_PHOTOGRAPHER: Role[] = ["admin", "super_admin", "photographer"];
const ADMIN_PLUS_TOUR_MANAGER: Role[] = ["admin", "super_admin", "tour_manager"];
const SUPER_ADMIN: Role[] = ["super_admin"];

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

export const navConfig: NavSection[] = [
  // 1) HEUTE ─ Tagesgeschäft, immer offen
  {
    id: "today",
    labelKey: "nav.section.today",
    defaultOpen: true,
    roles: ADMIN_PLUS_PHOTOGRAPHER,
    items: [
      {
        id: "dashboard",
        to: "/dashboard",
        labelKey: "nav.item.dashboard",
        icon: LayoutDashboard,
        roles: ADMIN,
      },
      {
        id: "orders",
        to: "/orders",
        labelKey: "nav.item.orders",
        icon: Package,
        badgeKey: "orders.openToday",
        matchNested: true,
      },
      {
        id: "calendar",
        to: "/calendar",
        labelKey: "nav.item.calendar",
        icon: Calendar,
      },
      {
        id: "upload",
        to: "/upload",
        labelKey: "nav.item.upload",
        icon: UploadCloud,
      },
    ],
  },

  // 2) KUNDSCHAFT ─ Menschen & eingehende Signale
  {
    id: "customers",
    labelKey: "nav.section.customers",
    defaultOpen: true,
    roles: ADMIN_PLUS_TOUR_MANAGER,
    items: [
      {
        id: "customers",
        to: "/customers",
        labelKey: "nav.item.customers",
        icon: Users,
        roles: ADMIN,
        matchNested: true,
      },
      {
        id: "tickets",
        to: "/admin/tickets",
        labelKey: "nav.item.tickets",
        icon: MessageSquare,
        badgeKey: "tickets.openCount",
        badgeTone: "warn",
      },
      {
        id: "reviews",
        to: "/reviews",
        labelKey: "nav.item.reviews",
        icon: Star,
        roles: ADMIN,
      },
    ],
  },

  // 3) PRODUKTION ─ Deliverables
  {
    id: "production",
    labelKey: "nav.section.production",
    defaultOpen: true,
    roles: ADMIN_PLUS_TOUR_MANAGER,
    items: [
      {
        id: "tours",
        to: "/admin/tours",
        labelKey: "nav.item.tours",
        icon: Home,
        matchNested: true,
      },
      {
        id: "listing",
        to: "/admin/listing",
        labelKey: "nav.item.listing",
        icon: Images,
        matchNested: true,
      },
      {
        id: "selekto",
        to: "/admin/selekto",
        labelKey: "nav.item.selekto",
        icon: ScanEye,
        matchNested: true,
      },
    ],
  },

  // 4) ABRECHNUNG ─ Rechnungen, Mahnungen, Bank-Abgleich
  {
    id: "billing",
    labelKey: "nav.section.billing",
    defaultOpen: true,
    roles: ADMIN_PLUS_TOUR_MANAGER,
    items: [
      {
        id: "invoices",
        to: "/admin/finance/invoices",
        labelKey: "nav.item.invoices",
        icon: Receipt,
        badgeKey: "invoices.openCount",
        matchNested: true,
      },
      {
        id: "reminders",
        to: "/admin/finance/reminders",
        labelKey: "nav.item.reminders",
        icon: BellRing,
        badgeKey: "invoices.overdueCount",
        badgeTone: "danger",
      },
      {
        id: "bank-reconcile",
        // Sammelt Bank-Import + Exxas-Sync als Tab-Ansicht auf einer Seite
        to: "/admin/finance/bank-import",
        labelKey: "nav.item.bankReconcile",
        icon: Banknote,
        matchNested: true,
      },
    ],
  },

  // 5) KATALOG ─ Stammdaten des Angebots, by default zu
  {
    id: "catalog",
    labelKey: "nav.section.catalog",
    defaultOpen: false,
    roles: ADMIN,
    items: [
      {
        id: "products",
        to: "/products",
        labelKey: "nav.item.products",
        icon: Box,
      },
      {
        id: "discount-codes",
        to: "/discount-codes",
        labelKey: "nav.item.discountCodes",
        icon: TicketPercent,
      },
      {
        id: "templates",
        to: "/settings/email-templates",
        labelKey: "nav.item.templates",
        icon: Mail,
      },
    ],
  },

  // 6) SYSTEM ─ Konfiguration & Betrieb, by default zu
  {
    id: "system",
    labelKey: "nav.section.system",
    defaultOpen: false,
    roles: ADMIN,
    items: [
      {
        id: "team",
        to: "/settings/team",
        labelKey: "nav.item.team",
        icon: ShieldCheck,
        matchNested: true,
      },
      {
        id: "settings",
        to: "/settings",
        labelKey: "nav.item.settings",
        icon: Settings,
      },
      {
        id: "changelog",
        to: "/changelog",
        labelKey: "nav.item.changelog",
        icon: History,
      },
      {
        id: "bugs",
        to: "/bugs",
        labelKey: "nav.item.bugs",
        icon: Bug,
        roles: SUPER_ADMIN,
      },
      {
        id: "backups",
        to: "/backups",
        labelKey: "nav.item.backups",
        icon: DatabaseBackup,
        roles: SUPER_ADMIN,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Helper für Filter & Matching                                               */
/* -------------------------------------------------------------------------- */

/** Filtert die Config anhand der Benutzerrolle */
export function filterNavForRole(role: Role): NavSection[] {
  return navConfig
    .map((section) => {
      const sectionAllowed = !section.roles || section.roles.includes(role);
      if (!sectionAllowed) return null;
      const items = section.items.filter((item) => {
        const allowed = item.roles
          ? item.roles.includes(role)
          : !section.roles || section.roles.includes(role);
        return allowed;
      });
      if (items.length === 0) return null;
      return { ...section, items };
    })
    .filter((s): s is NavSection => s !== null);
}

/** Prüft, ob ein Nav-Item für den aktuellen Pfad aktiv ist */
export function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.to) return true;
  if (item.matchNested && pathname.startsWith(item.to + "/")) return true;
  return false;
}
