import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  Home,
  Images,
  Link2,
  Loader2,
  MessageSquare,
  Receipt,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { useGlobalSearch } from "../../hooks/useGlobalSearch";
import { useRecentSearchItems } from "../../hooks/useRecentSearchItems";
import type { SearchItem, SearchItemIcon } from "../../api/search";
import { filterNavForRole, type NavItem as NavItemType } from "../../config/nav.config";
import { useAuth } from "../../hooks/useAuth";
import { useT } from "../../hooks/useT";
import "./search-palette.css";

function iconFor(icon: SearchItemIcon | undefined) {
  switch (icon) {
    case "users": return Users;
    case "home": return Home;
    case "receipt": return Receipt;
    case "images": return Images;
    case "message": return MessageSquare;
    case "link":
    default: return Link2;
  }
}

/** Nav-Items (inkl. Children) flach durchsuchen. */
function collectNavMatches(
  sections: ReturnType<typeof filterNavForRole>,
  needle: string,
  t: (k: string) => string,
): SearchItem[] {
  const out: SearchItem[] = [];
  const walk = (item: NavItemType, parentLabel?: string) => {
    const label = t(item.labelKey);
    const haystack = `${label} ${parentLabel ?? ""}`.toLowerCase();
    if (haystack.includes(needle)) {
      out.push({
        id: `nav-${item.id}`,
        title: label,
        subtitle: parentLabel ? parentLabel : undefined,
        href: item.to,
        icon: "link",
      });
    }
    if (item.children) item.children.forEach((c) => walk(c, label));
  };
  sections.forEach((s) => s.items.forEach((it) => walk(it, t(s.labelKey))));
  return out.slice(0, 8);
}

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export function SearchPalette({ open, onClose, initialQuery = "" }: SearchPaletteProps): JSX.Element | null {
  const navigate = useNavigate();
  const { role } = useAuth();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState<string>(initialQuery);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const { groups: backendGroups, loading, error } = useGlobalSearch(q);
  const { items: recents, push: pushRecent, clear: clearRecents } = useRecentSearchItems();

  const navSections = useMemo(() => filterNavForRole(role), [role]);
  const navMatches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 1) return [];
    return collectNavMatches(navSections, needle, t);
  }, [navSections, q, t]);

  // Flache Liste für Keyboard-Navigation: Recents (leer q) oder Nav + Backend-Groups
  const flatItems = useMemo(() => {
    if (q.trim().length === 0) return recents;
    const out: SearchItem[] = [];
    if (navMatches.length) out.push(...navMatches);
    backendGroups.forEach((g) => out.push(...g.items));
    return out;
  }, [q, recents, navMatches, backendGroups]);

  useEffect(() => {
    if (!open) return;
    setQ(initialQuery);
    setActiveIndex(0);
    // Focus mit kleinem Delay, sonst schluckt das Browser-Modal den Focus
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open, initialQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [q]);

  // Body-Scroll sperren
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const activate = useCallback(
    (item: SearchItem) => {
      pushRecent(item);
      onClose();
      // Query-Strings in href unterstützen (z. B. /admin/tickets?tab=inbox)
      navigate(item.href);
    },
    [navigate, onClose, pushRecent],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) activate(item);
    }
  };

  // Scroll aktives Item ins Sichtfeld
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const showRecents = q.trim().length === 0 && recents.length > 0;
  const noResults =
    q.trim().length >= 2 && !loading && navMatches.length === 0 && backendGroups.length === 0;

  let flatIdx = 0;

  const renderItem = (item: SearchItem) => {
    const Icon = iconFor(item.icon);
    const idx = flatIdx++;
    const active = idx === activeIndex;
    return (
      <button
        key={item.id}
        data-idx={idx}
        data-active={active ? "true" : "false"}
        type="button"
        className="propus-search-item"
        onClick={() => activate(item)}
        onMouseEnter={() => setActiveIndex(idx)}
      >
        <Icon className="propus-search-item__icon" aria-hidden="true" />
        <div className="propus-search-item__text">
          <div className="propus-search-item__title">{item.title}</div>
          {item.subtitle ? (
            <div className="propus-search-item__subtitle">{item.subtitle}</div>
          ) : null}
        </div>
      </button>
    );
  };

  return (
    <div
      className="propus-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("search.title")}
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <div
        className="propus-search-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="propus-search-header">
          <Search className="propus-search-header__icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="propus-search-input"
            type="text"
            placeholder={t("search.placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={t("search.placeholder")}
          />
          {loading ? (
            <Loader2 className="propus-search-header__spinner" aria-hidden="true" />
          ) : null}
          <button
            type="button"
            className="propus-search-close"
            onClick={onClose}
            aria-label={t("search.close")}
            title="Esc"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={listRef} className="propus-search-body">
          {error ? <div className="propus-search-error">{error}</div> : null}

          {showRecents ? (
            <section className="propus-search-group">
              <div className="propus-search-group__header">
                <span className="propus-search-group__label">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("search.recents")}
                </span>
                <button
                  type="button"
                  className="propus-search-group__action"
                  onClick={clearRecents}
                  title={t("search.clearRecents")}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  {t("search.clearRecents")}
                </button>
              </div>
              {recents.map(renderItem)}
            </section>
          ) : null}

          {q.trim().length > 0 && navMatches.length > 0 ? (
            <section className="propus-search-group">
              <div className="propus-search-group__header">
                <span className="propus-search-group__label">{t("search.group.nav")}</span>
              </div>
              {navMatches.map(renderItem)}
            </section>
          ) : null}

          {backendGroups.map((group) => (
            <section key={group.id} className="propus-search-group">
              <div className="propus-search-group__header">
                <span className="propus-search-group__label">
                  {t(`search.group.${group.id}`)}
                </span>
              </div>
              {group.items.map(renderItem)}
            </section>
          ))}

          {noResults ? (
            <div className="propus-search-empty">{t("search.empty")}</div>
          ) : null}

          {q.trim().length === 0 && recents.length === 0 ? (
            <div className="propus-search-hint">{t("search.hint")}</div>
          ) : null}
        </div>

        <footer className="propus-search-footer">
          <span className="propus-search-kbd">↑</span>
          <span className="propus-search-kbd">↓</span>
          <span>{t("search.navigate")}</span>
          <span className="propus-search-kbd">↵</span>
          <span>{t("search.open")}</span>
          <span className="propus-search-kbd">Esc</span>
          <span>{t("search.close")}</span>
        </footer>
      </div>
    </div>
  );
}
