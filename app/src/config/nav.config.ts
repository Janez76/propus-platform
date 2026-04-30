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
  // Sub-Items:
  List,
  Link2,
  Eye,
  Settings2,
  GitBranch,
  Trash2,
  UserCog,
  FileText,
  Clock,
  CheckCircle,
  Upload,
  AlertTriangle,
  FolderSync,
  SlidersHorizontal,
  Shield,
  CreditCard,
  CalendarDays,
  Plug,
  Inbox,
  Bot,
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
  /** Optionales Untermenü — rendert Parent als Expand-Button */
  children?: NavItem[];
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

// "employee" is treated as full internal staff (see INTERNAL_STAFF_ROLES in
// app/src/lib/permissions.ts) and must see the same sections as admin /
// super_admin. SUPER_ADMIN stays exclusive — only super-admins see backups
// and bug-tracker entries.
const ADMIN: Role[] = ["admin", "super_admin", "employee"];
const ADMIN_PLUS_PHOTOGRAPHER: Role[] = ["admin", "super_admin", "employee", "photographer"];
const ADMIN_PLUS_TOUR_MANAGER: Role[] = ["admin", "super_admin", "employee", "tour_manager"];
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
      {
        id: "assistant",
        to: "/assistant",
        labelKey: "nav.item.assistant",
        icon: Bot,
        roles: ADMIN,
        matchNested: true,
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
        id: "posteingang",
        to: "/admin/posteingang",
        labelKey: "nav.item.posteingang",
        icon: Inbox,
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
        matchNested: true,
        children: [
          {
            id: "tickets-inbox",
            to: "/admin/tickets",
            labelKey: "nav.item.ticketsInbox",
            icon: Inbox,
          },
          {
            id: "tickets-email",
            to: "/admin/tickets?tab=inbox",
            labelKey: "nav.item.ticketsEmail",
            icon: Mail,
          },
        ],
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
        children: [
          { id: "tours-dashboard", to: "/admin/tours", labelKey: "nav.item.toursDashboard", icon: LayoutDashboard },
          { id: "tours-list", to: "/admin/tours/list", labelKey: "nav.item.toursList", icon: List },
          { id: "tours-matterport", to: "/admin/tours/link-matterport", labelKey: "nav.item.toursMatterport", icon: Link2 },
          { id: "tours-settings", to: "/admin/tours/settings", labelKey: "nav.item.toursSettings", icon: Settings2 },
          { id: "tours-workflow", to: "/admin/tours/workflow-settings", labelKey: "nav.item.toursWorkflow", icon: GitBranch },
          { id: "tours-cleanup", to: "/admin/tours/bereinigung", labelKey: "nav.item.toursCleanup", icon: Trash2 },
          { id: "tours-team", to: "/admin/tours/team", labelKey: "nav.item.toursTeam", icon: UserCog },
          { id: "tours-ai", to: "/admin/tours/ai-chat", labelKey: "nav.item.toursAiChat", icon: MessageSquare },
          { id: "tours-preview", to: "/admin/tours/portal-vorschau", labelKey: "nav.item.toursPreview", icon: Eye },
        ],
      },
      {
        id: "listing",
        to: "/admin/listing",
        labelKey: "nav.item.listing",
        icon: Images,
        matchNested: true,
        children: [
          { id: "listing-galleries", to: "/admin/listing", labelKey: "nav.item.listingGalleries", icon: List },
          { id: "listing-templates", to: "/admin/listing/templates", labelKey: "nav.item.listingTemplates", icon: Mail },
        ],
      },
      {
        id: "selekto",
        to: "/admin/selekto",
        labelKey: "nav.item.selekto",
        icon: ScanEye,
        matchNested: true,
        children: [
          { id: "selekto-galleries", to: "/admin/selekto", labelKey: "nav.item.selektoGalleries", icon: List },
          { id: "selekto-templates", to: "/admin/selekto/templates", labelKey: "nav.item.selektoTemplates", icon: Mail },
        ],
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
        children: [
          { id: "invoices-all", to: "/admin/finance/invoices", labelKey: "nav.item.invoicesAll", icon: FileText },
          { id: "invoices-open", to: "/admin/finance/invoices/open", labelKey: "nav.item.invoicesOpen", icon: Clock },
          { id: "invoices-paid", to: "/admin/finance/invoices/paid", labelKey: "nav.item.invoicesPaid", icon: CheckCircle },
        ],
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
        to: "/admin/finance/bank-import",
        labelKey: "nav.item.bankReconcile",
        icon: Banknote,
        matchNested: true,
        children: [
          { id: "bank-import", to: "/admin/finance/bank-import", labelKey: "nav.item.bankImport", icon: Upload },
          { id: "exxas-sync", to: "/admin/finance/exxas-sync", labelKey: "nav.item.exxasSync", icon: FolderSync },
          { id: "reminders-sub", to: "/admin/finance/reminders", labelKey: "nav.item.reminders", icon: AlertTriangle },
        ],
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
        matchNested: true,
        children: [
          { id: "settings-general", to: "/settings", labelKey: "nav.item.settingsGeneral", icon: SlidersHorizontal },
          { id: "settings-roles", to: "/settings/roles", labelKey: "nav.item.settingsRoles", icon: Shield },
          { id: "settings-workflow", to: "/settings/workflow", labelKey: "nav.item.settingsWorkflow", icon: GitBranch },
          { id: "settings-team", to: "/settings/team", labelKey: "nav.item.settingsTeam", icon: Users },
          { id: "settings-payment", to: "/settings/payment", labelKey: "nav.item.settingsPayment", icon: CreditCard },
          { id: "settings-invoice-template", to: "/settings/invoice-template", labelKey: "nav.item.settingsInvoiceTemplate", icon: FileText },
          { id: "settings-email-templates", to: "/settings/email-templates", labelKey: "nav.item.settingsEmailTemplates", icon: Mail },
          { id: "settings-calendar-templates", to: "/settings/calendar-templates", labelKey: "nav.item.settingsCalendarTemplates", icon: CalendarDays },
          { id: "settings-exxas", to: "/settings/exxas", labelKey: "nav.item.settingsExxas", icon: Plug },
        ],
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

function filterItemForRole(item: NavItem, role: Role, sectionRoles?: Role[]): NavItem | null {
  const allowed = item.roles
    ? item.roles.includes(role)
    : !sectionRoles || sectionRoles.includes(role);
  if (!allowed) return null;
  if (!item.children) return item;
  const children = item.children
    .map((c) => filterItemForRole(c, role, sectionRoles))
    .filter((c): c is NavItem => c !== null);
  return { ...item, children };
}

/** Filtert die Config anhand der Benutzerrolle */
export function filterNavForRole(role: Role): NavSection[] {
  return navConfig
    .map((section) => {
      const sectionAllowed = !section.roles || section.roles.includes(role);
      if (!sectionAllowed) return null;
      const items = section.items
        .map((item) => filterItemForRole(item, role, section.roles))
        .filter((i): i is NavItem => i !== null);
      if (items.length === 0) return null;
      return { ...section, items };
    })
    .filter((s): s is NavSection => s !== null);
}

/** Prüft, ob ein Nav-Item für den aktuellen Pfad aktiv ist (nur Item selbst). */
export function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.to) return true;
  if (item.matchNested && pathname.startsWith(item.to + "/")) return true;
  return false;
}

/** Aktiv, wenn Item ODER eines seiner Children aktiv ist (für Parent-Highlight). */
export function isItemOrChildActive(pathname: string, item: NavItem): boolean {
  if (isItemActive(pathname, item)) return true;
  if (item.children) {
    return item.children.some((c) => isItemOrChildActive(pathname, c));
  }
  return false;
}
