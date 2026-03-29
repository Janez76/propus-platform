import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeStore } from "../../store/themeStore";
import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";

/**
 * Zyklus: System → Hell → Dunkel → System (gleiche Logik wie Admin-Topbar).
 */
export function BookingThemeToggle({ lang, className }: { lang: Lang; className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const cycle = () => {
    if (theme === "system") setTheme("light");
    else if (theme === "light") setTheme("dark");
    else setTheme("system");
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label =
    theme === "dark"
      ? t(lang, "booking.theme.dark")
      : theme === "light"
        ? t(lang, "booking.theme.light")
        : t(lang, "booking.theme.system");

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${t(lang, "booking.theme.title")}: ${label}`}
      aria-label={`${t(lang, "booking.theme.title")}: ${label}`}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
        "border-zinc-200/80 bg-white/80 text-zinc-600 hover:border-[#C5A059] hover:text-[#C5A059]",
        "dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:border-[#C5A059] dark:hover:text-[#C5A059]",
        className,
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}
