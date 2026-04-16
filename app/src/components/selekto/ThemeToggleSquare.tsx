type ThemeToggleSquareProps = {
  isDark: boolean;
  onToggle: () => void;
  /** z. B. `theme-toggle-square--header` oder Login-Ecke */
  className?: string;
};

const sunSvg = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const moonSvg = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
    />
  </svg>
);

/**
 * Quadratischer Schalter: nur eine Ikone sichtbar — Sonne (Hell) / Mond (Dunkel), Klick wechselt.
 */
export function ThemeToggleSquare({ isDark, onToggle, className = "" }: ThemeToggleSquareProps) {
  const root = `theme-toggle-square${isDark ? " theme-toggle-square--dark" : ""}`;
  const merged = [root, className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={merged}
      onClick={onToggle}
      aria-pressed={isDark}
      aria-label={isDark ? "Zu Hellmodus wechseln" : "Zu Dunkelmodus wechseln"}
    >
      <span className="theme-toggle-square__stack" aria-hidden="true">
        <span className={"theme-toggle-square__layer" + (isDark ? "" : " theme-toggle-square__layer--on")}>{sunSvg}</span>
        <span className={"theme-toggle-square__layer" + (isDark ? " theme-toggle-square__layer--on" : "")}>{moonSvg}</span>
      </span>
    </button>
  );
}
