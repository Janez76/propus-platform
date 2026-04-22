import { useCallback, useEffect, useState } from "react";
import type { SearchItem } from "../api/search";

const KEY = "propus.search.recents.v1";
const MAX = 8;

function load(): SearchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.id === "string" && typeof x.title === "string").slice(0, MAX);
  } catch {
    return [];
  }
}

function save(items: SearchItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    // Quota oder sonstige Fehler still ignorieren
  }
}

export function useRecentSearchItems() {
  const [items, setItems] = useState<SearchItem[]>(() => load());

  useEffect(() => {
    save(items);
  }, [items]);

  const push = useCallback((item: SearchItem) => {
    setItems((prev) => {
      const without = prev.filter((x) => x.id !== item.id);
      return [item, ...without].slice(0, MAX);
    });
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, push, clear };
}
