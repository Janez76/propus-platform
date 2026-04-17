import { useEffect } from "react";

// Simple global registry to track unsaved/dirty states across components
const dirtyRegistry = new Map<string, boolean>();

function hasAnyDirty() {
  for (const v of dirtyRegistry.values()) {
    if (v) return true;
  }
  return false;
}

/**
 * Hook to register/unregister a component's dirty state and wire beforeunload.
 * @param id unique id per consumer
 * @param isDirty boolean flag
 */
export function useUnsavedChangesGuard(id: string, isDirty: boolean) {
  useEffect(() => {
    dirtyRegistry.set(id, isDirty);
    return () => {
      dirtyRegistry.delete(id);
    };
  }, [id, isDirty]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasAnyDirty()) return;
      e.preventDefault();
      e.returnValue = ""; // triggers prompt in modern browsers
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}

/** Utility to query global dirty status (if needed) */
export function isAnyUnsaved() {
  return hasAnyDirty();
}
