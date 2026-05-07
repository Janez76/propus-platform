import { Calendar, ClipboardList, MessageCircle, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type MobileTab = "calendar" | "orders" | "contacts" | "propi";

const TABS: { key: MobileTab; label: string; Icon: LucideIcon }[] = [
  { key: "calendar", label: "Kalender", Icon: Calendar },
  { key: "orders", label: "Aufträge", Icon: ClipboardList },
  { key: "contacts", label: "Kontakte", Icon: Users },
  { key: "propi", label: "Propi", Icon: MessageCircle },
];

/**
 * Modernisierte Bottom-Tab-Navigation für `/mobile` (Polish-Pass 2).
 *
 * - Aktiver Tab wird mit gold-getintetem Pill-Background hervorgehoben
 * - Inaktive Tabs zeigen nur das Icon kompakt — aktiver Tab dehnt sich auf
 *   Icon + Label aus (saves horizontal space)
 * - Top-Border ersetzt durch subtilen `box-shadow` für „floating"-Wirkung
 * - Hover/Tap-Feedback per `active:scale-95` Transition
 * - Safe-area-aware (`env(safe-area-inset-bottom)`)
 */
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
        boxShadow: "0 -1px 0 var(--border-soft), 0 -8px 24px -16px rgba(0,0,0,0.12)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Mobile Navigation"
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch gap-1 px-2 py-2">
        {TABS.map(({ key, label, Icon }) => {
          const active = current === key;
          return (
            <li key={key} className={active ? "flex-2" : "flex-1"}>
              <button
                type="button"
                onClick={() => onChange(key)}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95"
                style={{
                  background: active
                    ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                    : "transparent",
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  border: active
                    ? "1px solid color-mix(in srgb, var(--accent) 32%, transparent)"
                    : "1px solid transparent",
                }}
                aria-current={active ? "page" : undefined}
                aria-label={label}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {active && <span className="whitespace-nowrap">{label}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
