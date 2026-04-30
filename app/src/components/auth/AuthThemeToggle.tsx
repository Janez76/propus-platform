import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeStore, type Theme } from "../../store/themeStore";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";

const ORDER: Theme[] = ["system", "light", "dark"];

export function AuthThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const language = useAuthStore((s) => s.language) || "de";

  const cycle = () => {
    const idx = ORDER.indexOf(theme);
    setTheme(ORDER[(idx + 1) % ORDER.length]);
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label =
    theme === "dark"
      ? t(language, "profile.theme.dark")
      : theme === "light"
      ? t(language, "profile.theme.light")
      : t(language, "profile.theme.system");

  return (
    <button
      type="button"
      onClick={cycle}
      className="absolute top-4 right-4 z-20 inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border-soft)",
        color: "var(--text-main)",
      }}
      aria-label={`${t(language, "profile.theme")}: ${label}`}
      title={`${t(language, "profile.theme")}: ${label}`}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
