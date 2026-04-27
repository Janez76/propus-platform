import { Calendar, ClipboardList, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type MobileTab = "calendar" | "orders" | "contacts";

const TABS: { key: MobileTab; label: string; Icon: LucideIcon }[] = [
  { key: "calendar", label: "Kalender", Icon: Calendar },
  { key: "orders", label: "Aufträge", Icon: ClipboardList },
  { key: "contacts", label: "Kontakte", Icon: Users },
];

export function MobileBottomTabs({
  current,
  onChange,
}: {
  current: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border-soft)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Mobile Navigation"
    >
      <ul className="mx-auto flex w-full max-w-md">
        {TABS.map(({ key, label, Icon }) => {
          const active = current === key;
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(key)}
                className="flex min-h-16 w-full flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors"
                style={{
                  color: active ? "var(--accent)" : "var(--text-muted)",
                }}
                aria-current={active ? "page" : undefined}
                aria-label={label}
              >
                <Icon className="h-6 w-6" />
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
