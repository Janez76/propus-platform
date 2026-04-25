"use client";

import { useOrderEditShell } from "./order-edit-shell-context";

/**
 * Hinweis auf ungespeicherte Änderungen in einer der Order-Sektionen (Step 10 / Dirty-State).
 */
export function OrderBulkDirtyHint() {
  const { hasAnyDirty, dirty } = useOrderEditShell();
  if (!hasAnyDirty()) return null;
  const keys = (Object.keys(dirty) as (keyof typeof dirty)[]).filter((k) => dirty[k]);
  const label = keys.join(", ");
  return (
    <div className="mb-3 rounded-lg border border-[#E4CE94] bg-[#FBF7EE] px-3 py-2 text-xs text-[#7A5D14]">
      Ungespeicherte Änderungen: {label || "Bereiche"}. Wechsel nicht vergessen: Tab-Wechsel fragt ggf. nach. Ein
      Tab, eine Sektion: normal mit «Speichern»; mehrere Sektionen: «Sammel-Speichern» im Header.
    </div>
  );
}
