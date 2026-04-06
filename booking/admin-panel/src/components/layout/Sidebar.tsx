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
  Shield,
  UserCog,
  Globe,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { usePermissions } from "../../hooks/usePermissions";
import { cn } from "../../lib/utils";
import { logger } from "../../utils/logger";
import { isCompanyWorkspaceRole } from "../../lib/companyRoles";

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

type SidebarNavItem = {
  path: string;
  icon: LucideIcon;
  labelKey?: string;
  label?: string;
};

const navigationItems: SidebarNavItem[] = [
  { path: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { path: "/admin/tours", icon: Globe, label: "Tour Manager" },
  { path: "/orders", icon: ShoppingCart, labelKey: "nav.orders" },
  { path: "/upload", icon: Upload, labelKey: "nav.upload" },
  { path: "/calendar", icon: Calendar, labelKey: "nav.calendar" },
  { path: "/customers", icon: Users, labelKey: "nav.customers" },
  { path: "/settings/companies", icon: Building2, labelKey: "sidebar.nav.companies" },
  { path: "/products", icon: Boxes, labelKey: "nav.catalog" },
  { path: "/discount-codes", icon: Tag, labelKey: "nav.discountCodes" },
  { path: "/reviews", icon: Star, labelKey: "nav.reviews" },
  { path: "/settings", icon: SlidersHorizontal, labelKey: "nav.settings" },
  { path: "/bugs", icon: ShieldAlert, labelKey: "nav.bugs" },
  { path: "/backups", icon: Database, labelKey: "nav.backups" },
  { path: "/changelog", icon: GitBranch, labelKey: "nav.changelog" },
];

const companyNavigationOwner: SidebarNavItem[] = [{ path: "/portal/firma", icon: Building2, label: "Firma" }];

const companyNavigationEmployee: SidebarNavItem[] = [
  { path: "/portal/bestellungen", icon: ShoppingCart, label: "Meine Bestellungen" },
];

const settingsSubItems = [
  { path: "/settings/users", icon: UserCog, labelKey: "sidebar.nav.userManagement" },
  { path: "/settings/access", icon: Shield, labelKey: "sidebar.nav.access" },
  { path: "/settings/workflow", icon: GitBranch, labelKey: "sidebar.nav.workflow" },
  { path: "/settings/team", icon: UserCircle, labelKey: "nav.employees" },
  { path: "/settings/email-templates", icon: Mail, labelKey: "sidebar.nav.emailTemplates" },
  { path: "/settings/calendar-templates", icon: CalendarDays, labelKey: "sidebar.nav.calendarIcs" },
  { path: "/settings/exxas", icon: Plug, labelKey: "sidebar.nav.exxas" },
  { path: "/exxas-reconcile", icon: FolderSync, labelKey: "nav.exxasReconcile" },
] as const;

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lang = useAuthStore((s) => s.language);
  const role = useAuthStore((s) => s.role);
  const { canAccessPath } = usePermissions();
  const location = useLocation();
  const showDevLoggerButton = import.meta.env.DEV;
  const isSettingsActive =
    (location.pathname.startsWith("/settings") && !location.pathname.startsWith("/settings/companies")) ||
    location.pathname.startsWith("/exxas-reconcile");
  const isCompanyRole = isCompanyWorkspaceRole(role);
  const visibleNavigationItems = useMemo(() => {
    if (!isCompanyRole) return navigationItems.filter((item) => {
      if (!canAccessPath(item.path)) return false;
      if (role === "tour_manager" && item.path === "/customers") return false;
      return true;
    });
    const base = role === "company_employee" ? companyNavigationEmployee : companyNavigationOwner;
    return base.filter((item) => canAccessPath(item.path));
  }, [isCompanyRole, role, canAccessPath]);

  const visibleSettingsSubItems = useMemo(
    () => settingsSubItems.filter((item) => canAccessPath(item.path)),
    [canAccessPath],
  );

  function triggerPinoTestLog() {
    logger.info("Sidebar Pino test button clicked", {
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
            <span className="font-bold text-lg" style={{ color: "var(--text-main)", fontFamily: "var(--propus-font-heading)" }}>Admin</span>
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
            {visibleNavigationItems.map(({ path, icon: Icon, labelKey, label }) => {
              if (path === "/settings") {
                return (
                  <div key={path}>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen((v) => !v)}
                      className={cn("propus-nav-item w-full", isSettingsActive && "active")}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate flex-1 text-left">{labelKey ? t(lang, labelKey) : label}</span>
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
              return (
                <NavLink key={path} to={path} onClick={onMobileClose} className={({ isActive }) => cn("propus-nav-item", isActive ? "active" : "")}>
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-white" : "")} />
                      <span className="truncate">{labelKey ? t(lang, labelKey) : label}</span>
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
                Admin
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
            {visibleNavigationItems.map(({ path, icon: Icon, labelKey, label }) => {
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
                          <span className="truncate flex-1 text-left">{labelKey ? t(lang, labelKey) : label}</span>
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
              return (
                <NavLink key={path} to={path} className={({ isActive }) => cn("propus-nav-item", isActive ? "active" : "")}>
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-white" : "")} />
                      {!isCollapsed && <span className="truncate">{labelKey ? t(lang, labelKey) : label}</span>}
                    </>
                  )}
                </NavLink>
              );
            })}

            {showDevLoggerButton && (
              <button
                type="button"
                onClick={triggerPinoTestLog}
                title={t(lang, "nav.pinoTest")}
                className="propus-nav-item w-full"
              >
                <TestTube2 className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && <span className="truncate">{t(lang, "nav.pinoTest")}</span>}
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
          {visibleNavigationItems.slice(0, 5).map(({ path, icon: Icon, labelKey, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px] text-xs font-medium",
                  isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                )
              }
            >
              <>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] truncate w-full text-center">{labelKey ? t(lang, labelKey) : label}</span>
              </>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}

