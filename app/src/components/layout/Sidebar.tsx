import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Calendar,
  Users,
  Boxes,
  ShieldAlert,
  Database,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  TestTube2,
  SlidersHorizontal,
  Tag,
  GitBranch,
  Mail,
  CalendarDays,
  Star,
  X,
  Plug,
  FolderSync,
  Building2,
  Upload,
  UserCog,
  Globe,
  FileText,
  List,
  Link2,
  Shield,
  Settings2,
  MessageSquare,
  Eye,
  Inbox,
  CreditCard,
  Image,
  Images,
  Clock,
  CheckCircle,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { usePermissions } from "../../hooks/usePermissions";
import { cn } from "../../lib/utils";
import { logger } from "../../utils/logger";
import { isCompanyWorkspaceRole } from "../../lib/companyRoles";
import { isKundenRole } from "../../lib/permissions";

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

type SidebarNavItem = {
  path: string;
  icon: LucideIcon;
  labelKey: string;
  href?: string;
  financeNav?: boolean;
  toursNav?: boolean;
  customersNav?: boolean;
  listingNav?: boolean;
  selektoNav?: boolean;
  messagesNav?: boolean;
};

const navigationItems: SidebarNavItem[] = [
  { path: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { path: "/admin/finance", icon: CreditCard, labelKey: "nav.finance", financeNav: true },
  { path: "/admin/tickets", icon: MessageSquare, labelKey: "nav.messages", messagesNav: true },
  { path: "/admin/tours", icon: Globe, labelKey: "nav.tourManager", toursNav: true },
  { path: "/admin/listing", icon: Image, labelKey: "nav.listingPage", listingNav: true },
  { path: "/orders", icon: ShoppingCart, labelKey: "nav.orders" },
  { path: "/upload", icon: Upload, labelKey: "nav.upload" },
  { path: "/calendar", icon: Calendar, labelKey: "nav.calendar" },
  { path: "/customers", icon: Users, labelKey: "nav.customersAndFirms", customersNav: true },
  { path: "/products", icon: Boxes, labelKey: "nav.catalog" },
  { path: "/discount-codes", icon: Tag, labelKey: "nav.discountCodes" },
  { path: "/reviews", icon: Star, labelKey: "nav.reviews" },
  { path: "/admin/selekto", icon: Images, labelKey: "nav.selekto", selektoNav: true },
  { path: "/settings", icon: SlidersHorizontal, labelKey: "nav.settings" },
  { path: "/bugs", icon: ShieldAlert, labelKey: "nav.bugs" },
  { path: "/backups", icon: Database, labelKey: "nav.backups" },
  { path: "/changelog", icon: GitBranch, labelKey: "nav.changelog" },
];

const companyNavigationOwner: SidebarNavItem[] = [{ path: "/portal/firma", icon: Building2, labelKey: "nav.portal.firma" }];

const companyNavigationEmployee: SidebarNavItem[] = [
  { path: "/portal/bestellungen", icon: ShoppingCart, labelKey: "nav.portal.myOrders" },
];

/** Kunden-Panel: alle möglichen Items; werden per canAccessPath gefiltert. */
const kundenNavigationItems: SidebarNavItem[] = [
  { path: "/portal/dashboard", icon: LayoutDashboard, labelKey: "nav.portal.dashboard" },
  { path: "/portal/tours",     icon: Globe,           labelKey: "nav.portal.myTours" },
  { path: "/portal/invoices",  icon: FileText,        labelKey: "nav.portal.invoices" },
  { path: "/portal/team",      icon: Users,           labelKey: "nav.portal.team" },
  { path: "/portal/firma",     icon: Building2,       labelKey: "nav.portal.firma" },
];

const settingsSubItems = [
  { path: "/settings/roles", icon: Shield, labelKey: "sidebar.nav.roleMatrix" },
  { path: "/settings/workflow", icon: GitBranch, labelKey: "sidebar.nav.workflow" },
  { path: "/settings/team", icon: UserCircle, labelKey: "nav.employees" },
  { path: "/settings/payment", icon: CreditCard, labelKey: "sidebar.nav.paymentSettings" },
  { path: "/settings/invoice-template", icon: FileText, labelKey: "sidebar.nav.invoiceTemplate" },
  { path: "/settings/email-templates", icon: Mail, labelKey: "sidebar.nav.emailTemplates" },
  { path: "/settings/calendar-templates", icon: CalendarDays, labelKey: "sidebar.nav.calendarIcs" },
  { path: "/settings/exxas", icon: Plug, labelKey: "sidebar.nav.exxas" },
  { path: "/exxas-reconcile", icon: FolderSync, labelKey: "nav.exxasReconcile" },
] as const;

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [financeNavOpen, setFinanceNavOpen] = useState(false);
  const [toursNavOpen, setToursNavOpen] = useState(false);
  const [customersNavOpen, setCustomersNavOpen] = useState(false);
  const [listingNavOpen, setListingNavOpen] = useState(false);
  const [selektoNavOpen, setSelektoNavOpen] = useState(false);
  const [messagesNavOpen, setMessagesNavOpen] = useState(false);
  const lang = useAuthStore((s) => s.language);
  const role = useAuthStore((s) => s.role);
  const { canAccessPath } = usePermissions();
  const location = useLocation();
  const showDevLoggerButton = process.env.NODE_ENV === "development";
  const isSettingsActive =
    location.pathname.startsWith("/settings") ||
    location.pathname.startsWith("/exxas-reconcile");
  const isFinanceNavActive =
    location.pathname.startsWith("/admin/finance") ||
    location.pathname.startsWith("/admin/invoices");
  const isToursNavActive = location.pathname.startsWith("/admin/tours");
  const isListingNavActive = location.pathname.startsWith("/admin/listing");
  const isSelektoNavActive = location.pathname.startsWith("/admin/selekto");
  const isMessagesNavActive = location.pathname.startsWith("/admin/tickets");
  const isCustomersNavActive = location.pathname.startsWith("/customers");
  const isCompanyRole = isCompanyWorkspaceRole(role);
  const isKunden = isKundenRole(role);
  const visibleNavigationItems = useMemo(() => {
    // Kunden-Rollen: einheitliches Kunden-Panel
    if (isKunden) {
      if (isCompanyRole) {
        // company_owner/admin: Touren + Firma; company_employee: Touren + Bestellungen
        if (role === "company_employee") {
          return [...kundenNavigationItems, ...companyNavigationEmployee].filter((item) => canAccessPath(item.path));
        }
        return [...kundenNavigationItems, ...companyNavigationOwner].filter((item) => canAccessPath(item.path));
      }
      return kundenNavigationItems.filter((item) => canAccessPath(item.path));
    }
    return navigationItems.filter((item) => {
      if (!canAccessPath(item.path)) return false;
      // tour_manager sieht keine globale Kundenliste — Kunden werden zentral über /customers verwaltet,
      // aber der Nav-Eintrag ist für tour_manager nicht relevant
      if (role === "tour_manager" && (item.customersNav || item.path === "/customers")) return false;
      return true;
    });
  }, [isCompanyRole, isKunden, role, canAccessPath]);

  const visibleSettingsSubItems = useMemo(
    () => settingsSubItems.filter((item) => canAccessPath(item.path)),
    [canAccessPath],
  );

  function triggerTestLog() {
    logger.info("Sidebar logger test button clicked", {
      module: "sidebar",
      source: "dev-button",
      href: typeof window !== "undefined" ? window.location.href : undefined,
    });
  }

  return (
    <>
      {/* Mobile Drawer */}
      <aside
        className={cn(
          "lg:hidden fixed top-0 left-0 z-50 flex h-dvh max-h-dvh w-72 min-h-0 flex-col propus-sidebar",
          "transform transition-transform duration-300 ease-in-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <div className="flex items-center gap-3">
            <img src="/assets/brand/logopropus.png" alt="Propus" className="h-8 w-auto" />
            <span className="font-bold text-lg" style={{ color: "var(--text-main)", fontFamily: "var(--propus-font-heading)" }}>{isKunden ? t(lang, "nav.portal.customerPortal") : t(lang, "nav.admin")}</span>
          </div>
          <button
            onClick={onMobileClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            aria-label={t(lang, "sidebar.aria.closeMenu")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-0.5">
            {visibleNavigationItems.map((item) => {
              const { path, icon: Icon, labelKey, href, financeNav, toursNav, customersNav, listingNav, selektoNav, messagesNav } = item;
              if (href) {
                return (
                  <a key={path} href={href} className="propus-nav-item" onClick={onMobileClose}>
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{t(lang, labelKey)}</span>
                  </a>
                );
              }
              if (path === "/settings") {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isSettingsActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (settingsOpen || isSettingsActive) ? "rotate-180" : "")} />
                    </button>
                    {(settingsOpen || isSettingsActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/settings" end onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <SlidersHorizontal className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "sidebar.nav.general")}
                        </NavLink>
                        {visibleSettingsSubItems.map(({ path: subPath, icon: SubIcon, labelKey }) => (
                          <NavLink key={subPath} to={subPath} onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                            <SubIcon className="h-4 w-4 flex-shrink-0" />
                            {t(lang, labelKey)}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              if (financeNav) {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setFinanceNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isFinanceNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (financeNavOpen || isFinanceNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(financeNavOpen || isFinanceNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/finance/invoices" end onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.invoices")}
                        </NavLink>
                        <NavLink to="/admin/finance/invoices/open" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Clock className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.openInvoices")}
                        </NavLink>
                        <NavLink to="/admin/finance/invoices/paid" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <CheckCircle className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.paidInvoices")}
                        </NavLink>
                        <NavLink to="/admin/finance/bank-import" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Upload className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.bankImport")}
                        </NavLink>
                        <NavLink to="/admin/finance/reminders" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.reminders")}
                        </NavLink>
                        <NavLink to="/admin/finance/exxas-sync" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <FolderSync className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.exxasSync")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (customersNav) {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setCustomersNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isCustomersNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (customersNavOpen || isCustomersNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(customersNavOpen || isCustomersNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/customers" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Users className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.customers")}
                        </NavLink>
                        <NavLink to="/customers?tab=portal-firms" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", location.pathname === "/customers" && location.search === "?tab=portal-firms" ? "active-sub" : "")}>
                          <Building2 className="h-4 w-4 flex-shrink-0" />
                          Portal-Firmen
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (listingNav) {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setListingNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isListingNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (listingNavOpen || isListingNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(listingNavOpen || isListingNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/listing" end onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <List className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.listing.listings")}
                        </NavLink>
                        <NavLink to="/admin/listing/templates" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Mail className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.listing.emailTemplates")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (selektoNav) {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setSelektoNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isSelektoNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (selektoNavOpen || isSelektoNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(selektoNavOpen || isSelektoNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/selekto" end onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <List className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.selekto.galleries")}
                        </NavLink>
                        <NavLink to="/admin/selekto/templates" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Mail className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.selekto.emailTemplates")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (toursNav) {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setToursNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isToursNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (toursNavOpen || isToursNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(toursNavOpen || isToursNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/tours" end onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.dashboard")}
                        </NavLink>
                        <NavLink to="/admin/tours/list" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <List className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.tours")}
                        </NavLink>
                        <NavLink to="/admin/tours/link-matterport" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Link2 className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.matterport")}
                        </NavLink>
                        <NavLink to="/admin/tours/portal-vorschau" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Eye className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.portalPreview")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (messagesNav) {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setMessagesNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isMessagesNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (messagesNavOpen || isMessagesNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(messagesNavOpen || isMessagesNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/tickets" end onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Inbox className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.messages.tickets")}
                        </NavLink>
                        <NavLink to="/admin/tickets?tab=inbox" onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Mail className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.messages.email")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <NavLink key={path} to={path} onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item", isActive ? "active" : "")}>
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-white" : "")} />
                      <span className="truncate">{t(lang, labelKey)}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col fixed left-0 top-0 h-screen propus-sidebar transition-all duration-300 z-30",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        {/* Logo Section */}
        <div className="h-16 flex items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <img
                src="/assets/brand/logopropus.png"
                alt="Propus"
                className="h-8 w-auto"
              />
              <span className="font-bold text-lg" style={{ color: "var(--text-main)", fontFamily: "var(--propus-font-heading)" }}>
                {isKunden ? t(lang, "nav.portal.customerPortal") : t(lang, "nav.admin")}
              </span>
            </div>
          )}
          {isCollapsed && (
            <img
              src="/assets/brand/favicon.png"
              alt="Propus"
              className="h-8 w-8 mx-auto"
            />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <div className="space-y-0.5">
            {visibleNavigationItems.map((item) => {
              const { path, icon: Icon, labelKey, href, financeNav, toursNav, customersNav, listingNav, selektoNav, messagesNav } = item;
              if (href) {
                return (
                  <a key={path} href={href} className="propus-nav-item">
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!isCollapsed && <span className="truncate">{t(lang, labelKey)}</span>}
                  </a>
                );
              }
              if (path === "/settings") {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isSettingsActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      {!isCollapsed && (
                        <>
                          <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                          <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (settingsOpen || isSettingsActive) ? "rotate-180" : "")} />
                        </>
                      )}
                    </button>
                    {!isCollapsed && (settingsOpen || isSettingsActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/settings" end className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <SlidersHorizontal className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "sidebar.nav.general")}
                        </NavLink>
                        {visibleSettingsSubItems.map(({ path: subPath, icon: SubIcon, labelKey }) => (
                          <NavLink key={subPath} to={subPath} className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                            <SubIcon className="h-4 w-4 flex-shrink-0" />
                            {t(lang, labelKey)}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              if (financeNav) {
                if (isCollapsed) {
                  return (
                    <NavLink
                      key={path}
                      to="/admin/finance/invoices"
                      title={t(lang, labelKey)}
                      className={cn("propus-nav-item", isFinanceNavActive ? "active" : "")}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isFinanceNavActive ? "text-white" : "")} />
                    </NavLink>
                  );
                }
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setFinanceNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isFinanceNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (financeNavOpen || isFinanceNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(financeNavOpen || isFinanceNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/finance/invoices" end className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.invoices")}
                        </NavLink>
                        <NavLink to="/admin/finance/invoices/open" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Clock className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.openInvoices")}
                        </NavLink>
                        <NavLink to="/admin/finance/invoices/paid" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <CheckCircle className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.paidInvoices")}
                        </NavLink>
                        <NavLink to="/admin/finance/bank-import" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Upload className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.bankImport")}
                        </NavLink>
                        <NavLink to="/admin/finance/reminders" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.reminders")}
                        </NavLink>
                        <NavLink to="/admin/finance/exxas-sync" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <FolderSync className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.finance.exxasSync")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (customersNav) {
                if (isCollapsed) {
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      title={t(lang, labelKey)}
                      className={cn("propus-nav-item", isCustomersNavActive ? "active" : "")}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isCustomersNavActive ? "text-white" : "")} />
                    </NavLink>
                  );
                }
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setCustomersNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isCustomersNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (customersNavOpen || isCustomersNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(customersNavOpen || isCustomersNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/customers" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Users className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.customers")}
                        </NavLink>
                        <NavLink to="/customers?tab=portal-firms" className={({ isActive }) => cn("propus-nav-item text-sm", location.pathname === "/customers" && location.search === "?tab=portal-firms" ? "active-sub" : "")}>
                          <Building2 className="h-4 w-4 flex-shrink-0" />
                          Portal-Firmen
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (listingNav) {
                if (isCollapsed) {
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      title={t(lang, labelKey)}
                      className={cn("propus-nav-item", isListingNavActive ? "active" : "")}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isListingNavActive ? "text-white" : "")} />
                    </NavLink>
                  );
                }
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setListingNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isListingNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (listingNavOpen || isListingNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(listingNavOpen || isListingNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/listing" end className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <List className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.listing.listings")}
                        </NavLink>
                        <NavLink to="/admin/listing/templates" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Mail className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.listing.emailTemplates")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (selektoNav) {
                if (isCollapsed) {
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      title={t(lang, labelKey)}
                      className={cn("propus-nav-item", isSelektoNavActive ? "active" : "")}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isSelektoNavActive ? "text-white" : "")} />
                    </NavLink>
                  );
                }
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setSelektoNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isSelektoNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (selektoNavOpen || isSelektoNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(selektoNavOpen || isSelektoNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/selekto" end className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <List className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.selekto.galleries")}
                        </NavLink>
                        <NavLink to="/admin/selekto/templates" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Mail className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.selekto.emailTemplates")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (toursNav) {
                if (isCollapsed) {
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      title={t(lang, labelKey)}
                      className={cn("propus-nav-item", isToursNavActive ? "active" : "")}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isToursNavActive ? "text-white" : "")} />
                    </NavLink>
                  );
                }
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setToursNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isToursNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (toursNavOpen || isToursNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(toursNavOpen || isToursNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/tours" end className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.dashboard")}
                        </NavLink>
                        <NavLink to="/admin/tours/list" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <List className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.tours")}
                        </NavLink>
                        <NavLink to="/admin/tours/link-matterport" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Link2 className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.matterport")}
                        </NavLink>
                        <NavLink to="/admin/tours/settings" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Settings2 className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.settings")}
                        </NavLink>
                        <NavLink to="/admin/tours/workflow-settings" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <GitBranch className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.workflowSettings")}
                        </NavLink>
                        <NavLink to="/admin/tours/bereinigung" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Trash2 className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.cleanup")}
                        </NavLink>
                        <NavLink to="/admin/tours/team" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <UserCog className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.adminTeam")}
                        </NavLink>
                        <NavLink to="/admin/tours/ai-chat" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <MessageSquare className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.aiChat")}
                        </NavLink>
                        <NavLink to="/admin/tours/portal-vorschau" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Eye className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.tours.portalPreview")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              if (messagesNav) {
                if (isCollapsed) {
                  return (
                    <NavLink
                      key={path}
                      to="/admin/tickets"
                      title={t(lang, labelKey)}
                      className={cn("propus-nav-item", isMessagesNavActive ? "active" : "")}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isMessagesNavActive ? "text-white" : "")} />
                    </NavLink>
                  );
                }
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setMessagesNavOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isMessagesNavActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{t(lang, labelKey)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform opacity-60", (messagesNavOpen || isMessagesNavActive) ? "rotate-180" : "")} />
                    </button>
                    {(messagesNavOpen || isMessagesNavActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                        <NavLink to="/admin/tickets" end className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Inbox className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.messages.tickets")}
                        </NavLink>
                        <NavLink to="/admin/tickets?tab=inbox" className={({ isActive }) => cn("propus-nav-item text-sm", isActive ? "active-sub" : "")}>
                          <Mail className="h-4 w-4 flex-shrink-0" />
                          {t(lang, "nav.messages.email")}
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <NavLink key={path} to={path} className={({ isActive }) => cn("propus-nav-item", isActive ? "active" : "")}>
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-white" : "")} />
                      {!isCollapsed && <span className="truncate">{t(lang, labelKey)}</span>}
                    </>
                  )}
                </NavLink>
              );
            })}

            {showDevLoggerButton && (
              <button
                type="button"
                onClick={triggerTestLog}
                title={t(lang, "nav.loggerTest")}
                className="propus-nav-item w-full"
              >
                <TestTube2 className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && <span className="truncate">{t(lang, "nav.loggerTest")}</span>}
              </button>
            )}
          </div>
        </nav>

        {/* Collapse Toggle */}
        <div className="p-3" style={{ borderTop: "1px solid var(--border-soft)" }}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="propus-nav-item w-full justify-center"
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm font-medium">{t(lang, "sidebar.button.collapse")}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 propus-sidebar z-30 safe-area-inset-bottom" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="flex items-center justify-around px-2 py-2">
          {visibleNavigationItems.slice(0, 5).map((item) => {
            const { path, icon: Icon, labelKey, toursNav } = item;
            const toursBottomActive = Boolean(toursNav && location.pathname.startsWith("/admin/tours"));
            return (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px] text-xs font-medium",
                    isActive || toursBottomActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                  )
                }
              >
                <>
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] truncate w-full text-center">{t(lang, labelKey)}</span>
                </>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}

