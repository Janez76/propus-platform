"use client";

/**
 * Next.js-compatible variant of `Sidebar.tsx`.
 *
 * Identical visual + behavioral surface as the legacy React-Router sidebar
 * (sections, sub-items, badges, collapse, role filter), but built on
 * `next/link` + `usePathname` so it can be mounted from App-Router layouts
 * (e.g. `/orders/[id]/...`) where there is no `<BrowserRouter>` context.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Aperture,
} from "lucide-react";

import { useAuthStore } from "../../store/authStore";
import { t as translate, type Lang } from "../../i18n";
import {
  filterNavForRole,
  isItemActive,
  isItemOrChildActive,
  type NavBadgeKey,
  type NavSection as NavSectionType,
  type NavItem as NavItemType,
} from "../../config/nav.config";
import type { Role } from "../../types";

import "../../styles/sidebar.css";

const LS_COLLAPSED = "propus.nav.collapsed";
const LS_SECTIONS = "propus.nav.sections.v1";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export function useNavBadge(key: NavBadgeKey | undefined): number | null {
  if (!key) return null;
  const demo: Record<NavBadgeKey, number> = {
    "orders.openToday": 4,
    "tickets.openCount": 7,
    "invoices.openCount": 12,
    "invoices.overdueCount": 3,
  };
  return demo[key] ?? null;
}

type Props = {
  /** Server-resolved role; used until the client store has hydrated. */
  initialRole?: Role;
};

export function AppSidebar({ initialRole }: Props): JSX.Element {
  const storeRole = useAuthStore((s) => s.role);
  const role = (storeRole || initialRole || "admin") as Role;
  const lang: Lang = (useAuthStore((s) => s.language) || "de") as Lang;
  const t = useCallback((key: string) => translate(lang, key), [lang]);
  const pathname = usePathname() ?? "";

  const sections = useMemo(() => filterNavForRole(role), [role]);

  const [hydrated, setHydrated] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of filterNavForRole((initialRole || "admin") as Role)) {
      initial[s.id] = s.defaultOpen ?? true;
    }
    return initial;
  });

  // Read persisted UI state after hydration so SSR + first paint stay stable.
  useEffect(() => {
    setCollapsed(readLocal(LS_COLLAPSED, false));
    const stored = readLocal<Record<string, boolean>>(LS_SECTIONS, {});
    setOpenMap((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const s of sections) {
        next[s.id] = stored[s.id] ?? prev[s.id] ?? s.defaultOpen ?? true;
      }
      return next;
    });
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add defaults for any newly visible sections after a role change.
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

  useEffect(() => {
    if (hydrated) writeLocal(LS_COLLAPSED, collapsed);
  }, [collapsed, hydrated]);
  useEffect(() => {
    if (hydrated) writeLocal(LS_SECTIONS, openMap);
  }, [openMap, hydrated]);

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
      data-mobile-open="false"
      aria-label={t("nav.aria.sidebar")}
    >
      <div className="propus-sidebar__brand">
        <div className="propus-sidebar__brand-mark" aria-hidden="true">
          <Aperture />
        </div>
        <div className="propus-sidebar__brand-text">
          <span className="propus-sidebar__brand-title">Propus</span>
          <span className="propus-sidebar__brand-sub">Platform</span>
        </div>
      </div>

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

      <div id={`sec-${section.id}`} className="propus-nav-section__items" role="list">
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
      href={item.to}
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
      href={item.to}
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
