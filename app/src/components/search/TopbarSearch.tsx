import { useCallback, useEffect, useState, type JSX } from "react";
import { Search } from "lucide-react";
import { SearchPalette } from "./SearchPalette";
import { useT } from "../../hooks/useT";
import "./topbar-search.css";

/**
 * Persistente Suchleiste in der Topbar.
 * - Klick/Fokus öffnet die SearchPalette
 * - Cmd+K / Ctrl+K öffnet ebenfalls (global)
 * - "/" öffnet, wenn der Fokus nicht in einem Eingabefeld liegt
 */
export function TopbarSearch(): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");

  const openPalette = useCallback((q = "") => {
    setInitialQuery(q);
    setOpen(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // Cmd/Ctrl+K
      if ((e.metaKey || e.ctrlKey) && key === "k") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // "/" öffnet, wenn Fokus nicht in Input/Textarea/contenteditable
      if (key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        const isEditable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          (e.target as HTMLElement | null)?.isContentEditable;
        if (!isEditable) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <button
        type="button"
        className="propus-topbar-search"
        onClick={() => openPalette()}
        aria-label={t("search.open")}
      >
        <Search className="propus-topbar-search__icon" aria-hidden="true" />
        <span className="propus-topbar-search__placeholder">
          {t("search.placeholder")}
        </span>
        <span className="propus-topbar-search__hint" aria-hidden="true">
          <kbd className="propus-topbar-search__kbd">⌘</kbd>
          <kbd className="propus-topbar-search__kbd">K</kbd>
        </span>
      </button>
      <SearchPalette open={open} onClose={() => setOpen(false)} initialQuery={initialQuery} />
    </>
  );
}
