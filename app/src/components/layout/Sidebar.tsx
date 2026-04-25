import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Aperture,
} from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { useT } from "../../hooks/useT";
import {
  filterNavForRole,
  isItemActive,
  isItemOrChildActive,
  type NavBadgeKey,
  type NavSection as NavSectionType,
  type NavItem as NavItemType,
} from "../../config/nav.config";

import "../../styles/sidebar.css";

/* -------------------------------------------------------------------------- */
/* Persistenz                                                                 */
/* -------------------------------------------------------------------------- */

const LS_COLLAPSED = "propus.nav.collapsed";
const LS_SECTIONS = "propus.nav.sections.v1";

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop: quota, private mode, etc. */
  }
}

/* -------------------------------------------------------------------------- */
/* Badge-Hook — TODO: echten Live-Counter anbinden                            */
/* -------------------------------------------------------------------------- */

/**
 * Platzhalter-Hook für Nav-Badges.
 *
 * INTEGRATION:
 * Hier React-Query-Calls gegen die Core-API einhängen, z.B.
 *    const { data } = useQuery({
 *      queryKey: ['nav-badges'],
 *      queryFn: () => api.get('/api/core/nav-badges'),
 *      staleTime: 60_000,
 *    });
 *    return data?.[key] ?? null;
 *
 * Rückgabe `null` bedeutet: kein Badge anzeigen.
 */
export function useNavBadge(key: NavBadgeKey | undefined): number | null {
  if (!key) return null;
  // Demo-Werte, bis der Endpoint steht:
  const demo: Record<NavBadgeKey, number> = {
    "orders.openToday": 4,
    "tickets.openCount": 7,
    "invoices.openCount": 12,
    "invoices.overdueCount": 3,
  };
  return demo[key] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Kompo: Sidebar                                                             */
/* -------------------------------------------------------------------------- */

export function Sidebar({
  onOpenCmdk,
  isMobileOpen = false,
  onMobileClose,
}: {
  onOpenCmdk?: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}): JSX.Element {
  const { role } = useAuth();
  const t = useT();
  const { pathname } = useLocation();

  useEffect(() => {
    if (isMobileOpen) onMobileClose?.();
    // Schließt das Mobile-Drawer-Menü automatisch bei Navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const sections = useMemo(() => filterNavForRole(role), [role]);

  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readLocal(LS_COLLAPSED, false),
  );
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const stored = readLocal<Record<string, boolean>>(LS_SECTIONS, {});
    const initial: Record<string, boolean> = {};
    for (const s of filterNavForRole(role)) {
      initial[s.id] = stored[s.id] ?? s.defaultOpen ?? true;
    }
    return initial;
  });

  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const s of sections) {
        if (next[s.id] === undefined) {
          next[s.id] = s.defaultOpen ?? true;
        }
      }
      return next;
    });
  }, [sections]);

  useEffect(() => writeLocal(LS_COLLAPSED, collapsed), [collapsed]);
  useEffect(() => writeLocal(LS_SECTIONS, openMap), [openMap]);

  const toggleSection = useCallback((id: string) => {
    setOpenMap((m) => ({ ...m, [id]: !m[id] }));
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const userInitials = useMemo(
    () =>
      String(role)
        .replace(/[^a-z]/gi, " ")
        .split(/\s+/)
        .map((n) => n[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 2) || "??",
    [role],
  );

  return (
    <aside
      className="propus-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      data-mobile-open={isMobileOpen ? "true" : "false"}
      aria-label={t("nav.aria.sidebar")}
    >
      {/* Brand */}
      <div className="propus-sidebar__brand">
        <div className="propus-sidebar__brand-mark" aria-hidden="true">
          <Aperture />
        </div>
        <div className="propus-sidebar__brand-text">
          <span className="propus-sidebar__brand-title">Propus</span>
          <span className="propus-sidebar__brand-sub">Platform</span>
        </div>
      </div>

      {/* Cmd+K trigger */}
      <button
        type="button"
        className="propus-sidebar__search"
        onClick={onOpenCmdk}
        aria-label={t("nav.cmdk.open")}
      >
        <Search className="propus-sidebar__search-icon" aria-hidden="true" />
        <span className="propus-sidebar__search-text">{t("nav.cmdk.placeholder")}</span>
        <span className="propus-sidebar__kbd">⌘K</span>
      </button>

      {/* Sections */}
      <nav className="propus-sidebar__scroll" aria-label={t("nav.aria.primary")}>
        {sections.map((section) => (
          <NavSection
            key={section.id}
            section={section}
            open={openMap[section.id] ?? section.defaultOpen ?? true}
            collapsed={collapsed}
            pathname={pathname}
            onToggle={() => toggleSection(section.id)}
            t={t}
          />
        ))}
      </nav>

      {/* Footer — authStore liefert kein Profil; Anzeigename folgt in Folge-PR */}
      <div className="propus-sidebar__footer">
        <div className="propus-sidebar__avatar" aria-hidden="true">
          {userInitials}
        </div>
        <div className="propus-sidebar__user">
          <div className="propus-sidebar__user-role">{t(`nav.role.${role}`)}</div>
        </div>
        <button
          type="button"
          className="propus-sidebar__collapse-btn"
          onClick={toggleCollapsed}
          aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
          title={t(collapsed ? "nav.expand" : "nav.collapse")}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Kompo: NavSection                                                          */
/* -------------------------------------------------------------------------- */

function NavSection({
  section,
  open,
  collapsed,
  pathname,
  onToggle,
  t,
}: {
  section: NavSectionType;
  open: boolean;
  collapsed: boolean;
  pathname: string;
  onToggle: () => void;
  t: (key: string) => string;
}): JSX.Element {
  return (
    <div className="propus-nav-section" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="propus-nav-section__header"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`sec-${section.id}`}
      >
        <ChevronDown className="propus-nav-section__chev" aria-hidden="true" />
        <span className="propus-nav-section__label">{t(section.labelKey)}</span>
      </button>

      <div
        id={`sec-${section.id}`}
        className="propus-nav-section__items"
        role="list"
      >
        {section.items.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Kompo: NavItem                                                             */
/* -------------------------------------------------------------------------- */

function NavItem({
  item,
  pathname,
  collapsed,
  t,
}: {
  item: NavItemType;
  pathname: string;
  collapsed: boolean;
  t: (key: string) => string;
}): JSX.Element {
  const badgeValue = useNavBadge(item.badgeKey);
  const label = t(item.labelKey);
  const Icon = item.icon;
  const hasChildren = Boolean(item.children && item.children.length > 0);
  const selfActive = isItemActive(pathname, item);
  const subtreeActive = isItemOrChildActive(pathname, item);

  // Expand-State für Untermenüs: automatisch offen, wenn eine Sub-Route aktiv ist.
  const [open, setOpen] = useState<boolean>(() => subtreeActive);
  useEffect(() => {
    if (subtreeActive) setOpen(true);
  }, [subtreeActive]);

  const badge =
    badgeValue !== null && badgeValue > 0 ? (
      <span
        className="propus-nav-badge"
        data-tone={item.badgeTone ?? "default"}
        aria-label={`${badgeValue} ${t("nav.badge.openSuffix")}`}
      >
        {badgeValue}
      </span>
    ) : null;

  if (hasChildren && !collapsed) {
    return (
      <div className="propus-nav-group" data-open={open ? "true" : "false"}>
        <button
          type="button"
          className="propus-nav-item propus-nav-item--parent"
          data-active={subtreeActive ? "true" : "false"}
          data-label={label}
          data-badge={badgeValue !== null && badgeValue > 0 ? "true" : undefined}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon className="propus-nav-item__icon" aria-hidden="true" />
          <span className="propus-nav-item__label">{label}</span>
          {badge}
          <ChevronRight className="propus-nav-item__chev" aria-hidden="true" />
        </button>
        {open ? (
          <div className="propus-nav-children" role="list">
            {item.children!.map((child) => (
              <NavSubItem
                key={child.id}
                item={child}
                active={isItemActive(pathname, child)}
                t={t}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Link
      to={item.to}
      className="propus-nav-item"
      data-active={(collapsed ? subtreeActive : selfActive) ? "true" : "false"}
      data-label={label}
      data-badge={badgeValue !== null && badgeValue > 0 ? "true" : undefined}
      aria-current={selfActive ? "page" : undefined}
      title={collapsed ? label : undefined}
      role="listitem"
    >
      <Icon className="propus-nav-item__icon" aria-hidden="true" />
      <span className="propus-nav-item__label">{label}</span>
      {badge}
    </Link>
  );
}

function NavSubItem({
  item,
  active,
  t,
}: {
  item: NavItemType;
  active: boolean;
  t: (key: string) => string;
}): JSX.Element {
  const label = t(item.labelKey);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="propus-nav-subitem"
      data-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
      role="listitem"
    >
      <Icon className="propus-nav-subitem__icon" aria-hidden="true" />
      <span className="propus-nav-subitem__label">{label}</span>
    </Link>
  );
}
