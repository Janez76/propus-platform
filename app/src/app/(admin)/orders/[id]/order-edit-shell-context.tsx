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
import type { BulkSaveInput } from "./order-bulk-types";

/**
 * Per Shell eingebundene Order-Bereiche (ohne vollständigen Tab-Routenwechsel).
 * Wird in Schritten 4+ erweitert; `null` = reines Layout-`children` (klassische Subroute).
 */
export type OrderShellClientSection = "verlauf" | "verknuepfungen" | null;

export type OrderDirtyKey = "uebersicht" | "objekt" | "leistungen" | "termin";

export type OrderEditShellContextValue = {
  orderNo: number;
  clientSection: OrderShellClientSection;
  setClientSection: (s: OrderShellClientSection) => void;
  clearClientSection: () => void;
  /** Ungespeicherte Sektionen (für Wechsel-Warnung / Header). */
  dirty: Partial<Record<OrderDirtyKey, boolean>>;
  markDirty: (key: OrderDirtyKey, value: boolean) => void;
  hasAnyDirty: () => boolean;
  countDirty: () => number;
  clearDirty: (key: OrderDirtyKey) => void;
  clearAllDirty: () => void;
  allowNextPageUnload: () => void;
  /**
   * Letzter Form-Stand je Sektion (für Sammel-Speichern über Subroute-Hinweg).
   * Übersicht: FormData; RHF: rohe Form-Values.
   */
  setSectionSnapshot: (key: OrderDirtyKey, data: FormData | unknown) => void;
  clearSectionSnapshot: (key: OrderDirtyKey) => void;
  buildBulkSaveInput: () => BulkSaveInput;
  getBulkReadiness: () => { complete: boolean; missing: OrderDirtyKey[] };
  /**
   * Ob die aktive Route exakt eine editierbare Sektion trifft und es genau diese eine dirty Sektion gibt
   * (klassischer Einzel-Speichern per `form="order-form"`).
   */
  canSubmitSingleForm: (pathname: string) => boolean;
};

const OrderEditShellContext = createContext<OrderEditShellContextValue | null>(null);

type ProviderProps = {
  orderNo: number;
  children: ReactNode;
};

function getActiveEditSectionKey(
  pathname: string,
  orderNo: number,
): OrderDirtyKey | null {
  const id = String(orderNo);
  const base = `/orders/${id}`;
  if (pathname === base || pathname === `${base}/`) {
    return "uebersicht";
  }
  if (pathname.startsWith(`${base}/objekt`)) return "objekt";
  if (pathname.startsWith(`${base}/leistungen`)) return "leistungen";
  if (pathname.startsWith(`${base}/termin`)) return "termin";
  return null;
}

function onlyDirtyKey(
  d: Partial<Record<OrderDirtyKey, boolean>>,
): OrderDirtyKey | null {
  const keys = (Object.keys(d) as OrderDirtyKey[]).filter((k) => d[k]);
  if (keys.length === 1) return keys[0] ?? null;
  return null;
}

export function OrderEditShellProvider({ orderNo, children }: ProviderProps) {
  const pathname = usePathname();
  const [clientSection, setClientSectionState] = useState<OrderShellClientSection>(null);
  const [dirty, setDirty] = useState<Partial<Record<OrderDirtyKey, boolean>>>({});
  const sectionSnapshots = useRef<Partial<Record<OrderDirtyKey, FormData | unknown>>>({});
  const prevPathname = useRef<string | null>(null);
  const allowNextPageUnloadRef = useRef(false);

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
      else {
        delete next[key];
        delete sectionSnapshots.current[key];
      }
      return next;
    });
  }, []);

  const hasAnyDirty = useCallback(
    () => Object.values(dirty).some(Boolean),
    [dirty],
  );

  const countDirty = useCallback(
    () => (Object.keys(dirty) as OrderDirtyKey[]).filter((k) => dirty[k]).length,
    [dirty],
  );

  const setSectionSnapshot = useCallback((key: OrderDirtyKey, data: FormData | unknown) => {
    sectionSnapshots.current[key] = data;
  }, []);

  const clearSectionSnapshot = useCallback((key: OrderDirtyKey) => {
    delete sectionSnapshots.current[key];
  }, []);

  const clearDirty = useCallback((key: OrderDirtyKey) => {
    setDirty((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    delete sectionSnapshots.current[key];
  }, []);

  const clearAllDirty = useCallback(() => {
    setDirty({});
    sectionSnapshots.current = {};
  }, []);

  const allowNextPageUnload = useCallback(() => {
    allowNextPageUnloadRef.current = true;
  }, []);

  const buildBulkSaveInput = useCallback((): BulkSaveInput => {
    const out: BulkSaveInput = { orderNo };
    if (dirty.uebersicht && sectionSnapshots.current.uebersicht instanceof FormData) {
      out.overviewFormData = sectionSnapshots.current.uebersicht;
    }
    if (dirty.objekt && sectionSnapshots.current.objekt !== undefined) {
      out.objekt = sectionSnapshots.current.objekt;
    }
    if (dirty.leistungen && sectionSnapshots.current.leistungen !== undefined) {
      out.leistungen = sectionSnapshots.current.leistungen;
    }
    if (dirty.termin && sectionSnapshots.current.termin !== undefined) {
      out.termin = sectionSnapshots.current.termin;
    }
    return out;
  }, [orderNo, dirty]);

  const getBulkReadiness = useCallback((): { complete: boolean; missing: OrderDirtyKey[] } => {
    const missing: OrderDirtyKey[] = [];
    if (dirty.uebersicht && !(sectionSnapshots.current.uebersicht instanceof FormData)) {
      missing.push("uebersicht");
    }
    if (dirty.objekt && sectionSnapshots.current.objekt === undefined) {
      missing.push("objekt");
    }
    if (dirty.leistungen && sectionSnapshots.current.leistungen === undefined) {
      missing.push("leistungen");
    }
    if (dirty.termin && sectionSnapshots.current.termin === undefined) {
      missing.push("termin");
    }
    return { complete: missing.length === 0, missing };
  }, [dirty]);

  const canSubmitSingleForm = useCallback(
    (p: string) => {
      if (countDirty() !== 1) return false;
      const one = onlyDirtyKey(dirty);
      if (!one) return false;
      const active = getActiveEditSectionKey(p, orderNo);
      return active === one;
    },
    [countDirty, dirty, orderNo],
  );

  const anyDirty = Object.values(dirty).some(Boolean);
  useEffect(() => {
    if (!anyDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowNextPageUnloadRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [anyDirty]);

  const value = useMemo(
    () => ({
      orderNo,
      clientSection,
      setClientSection,
      clearClientSection,
      dirty,
      markDirty,
      hasAnyDirty,
      countDirty,
      clearDirty,
      clearAllDirty,
      allowNextPageUnload,
      setSectionSnapshot,
      clearSectionSnapshot,
      buildBulkSaveInput,
      getBulkReadiness,
      canSubmitSingleForm,
    }),
    [
      orderNo,
      clientSection,
      setClientSection,
      clearClientSection,
      dirty,
      markDirty,
      hasAnyDirty,
      countDirty,
      clearDirty,
      clearAllDirty,
      allowNextPageUnload,
      setSectionSnapshot,
      clearSectionSnapshot,
      buildBulkSaveInput,
      getBulkReadiness,
      canSubmitSingleForm,
    ],
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

export { getActiveEditSectionKey, onlyDirtyKey };
