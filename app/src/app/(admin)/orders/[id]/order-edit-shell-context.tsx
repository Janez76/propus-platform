"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

/**
 * Per Shell eingebundene Order-Bereiche (ohne vollständigen Tab-Routenwechsel).
 * Wird in Schritten 4+ erweitert; `null` = reines Layout-`children` (klassische Subroute).
 */
export type OrderShellClientSection = "verlauf" | "verknuepfungen" | null;

export type OrderEditShellContextValue = {
  orderNo: number;
  clientSection: OrderShellClientSection;
  setClientSection: (s: OrderShellClientSection) => void;
  clearClientSection: () => void;
  /** Step 10: Sammeln von Dirty-Flags (Cross-Section-Wechsel-Warnung). */
  dirty: Partial<Record<OrderDirtyKey, boolean>>;
  markDirty: (key: OrderDirtyKey, value: boolean) => void;
  hasAnyDirty: () => boolean;
  clearAllDirty: () => void;
};

const OrderEditShellContext = createContext<OrderEditShellContextValue | null>(null);

export type OrderDirtyKey = "uebersicht" | "objekt" | "leistungen" | "termin";

type ProviderProps = {
  orderNo: number;
  children: ReactNode;
};

export function OrderEditShellProvider({ orderNo, children }: ProviderProps) {
  const pathname = usePathname();
  const [clientSection, setClientSectionState] = useState<OrderShellClientSection>(null);
  const [dirty, setDirty] = useState<Partial<Record<OrderDirtyKey, boolean>>>({});
  const prevPathname = useRef<string | null>(null);

  // Nach echtem Next.js-Routenwechsel: eingebettete Sektion schliessen.
  useEffect(() => {
    if (prevPathname.current === null) {
      prevPathname.current = pathname;
      return;
    }
    if (prevPathname.current !== pathname) {
      setClientSectionState(null);
      prevPathname.current = pathname;
    }
  }, [pathname]);

  const setClientSection = useCallback((s: OrderShellClientSection) => {
    setClientSectionState(s);
  }, []);

  const clearClientSection = useCallback(() => {
    setClientSectionState(null);
  }, []);

  const markDirty = useCallback((key: OrderDirtyKey, value: boolean) => {
    setDirty((d) => {
      const next = { ...d };
      if (value) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const hasAnyDirty = useCallback(
    () => Object.values(dirty).some(Boolean),
    [dirty],
  );

  const clearAllDirty = useCallback(() => {
    setDirty({});
  }, []);

  const value = useMemo(
    () => ({
      orderNo,
      clientSection,
      setClientSection,
      clearClientSection,
      dirty,
      markDirty,
      hasAnyDirty,
      clearAllDirty,
    }),
    [orderNo, clientSection, setClientSection, clearClientSection, dirty, markDirty, hasAnyDirty, clearAllDirty],
  );

  return <OrderEditShellContext.Provider value={value}>{children}</OrderEditShellContext.Provider>;
}

export function useOrderEditShell(): OrderEditShellContextValue {
  const ctx = useContext(OrderEditShellContext);
  if (!ctx) {
    throw new Error("useOrderEditShell muss innerhalb von OrderEditShellProvider verwendet werden");
  }
  return ctx;
}

export function useOrderEditShellOptional(): OrderEditShellContextValue | null {
  return useContext(OrderEditShellContext);
}
