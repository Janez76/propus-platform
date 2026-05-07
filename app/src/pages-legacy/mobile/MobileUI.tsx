import { Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import "./mobile-ui.css";

/* ──────────────────────────────────────────────────────────────────────
 * Shared Mobile-UI primitives für `/mobile` (Polish-Pass 2 · Phase 2).
 * Konsumiert Tokens aus index.css/admin-redesign.css (--surface,
 * --accent, --text-main, --border-soft, --paper-strip).
 * ──────────────────────────────────────────────────────────────────── */

interface MobileCardProps {
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

/** Generic Card-Wrapper. Wenn `onClick` gesetzt → wird Button mit Tap-Feedback. */
export function MobileCard({ onClick, className, children }: MobileCardProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`mob-card mob-card--clickable ${className ?? ""}`.trim()}
      >
        {children}
      </button>
    );
  }
  return <div className={`mob-card ${className ?? ""}`.trim()}>{children}</div>;
}

interface MobileListItemProps {
  onClick?: () => void;
  /** Linkes Slot (Avatar, Time-Chip, Icon …). */
  leading?: ReactNode;
  title: ReactNode;
  /** 2. Zeile (typischerweise Adresse / Sub-Info). */
  subtitle?: ReactNode;
  /** 3. Zeile mit Pills/Meta-Info. */
  meta?: ReactNode;
  /** Rechtes Slot (Status-Pill, Action-Buttons, Time …). */
  trailing?: ReactNode;
}

/** Generischer List-Item mit Avatar + Content + optionalem Trailing-Slot.
 *  Pflicht: title. Alle anderen Slots optional. */
export function MobileListItem({
  onClick,
  leading,
  title,
  subtitle,
  meta,
  trailing,
}: MobileListItemProps) {
  const Wrapper: "button" | "div" = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`mob-list-item${onClick ? "" : " mob-list-item--static"}`}
    >
      {leading ? <div className="mob-list-leading">{leading}</div> : null}
      <div className="mob-list-content">
        <div className="mob-list-title">{title}</div>
        {subtitle ? <div className="mob-list-sub">{subtitle}</div> : null}
        {meta ? <div className="mob-list-meta">{meta}</div> : null}
      </div>
      {trailing ? <div className="mob-list-trailing">{trailing}</div> : null}
    </Wrapper>
  );
}

interface MobileSectionHeaderProps {
  children: ReactNode;
}

/** Sticky-Section-Header — wird beim Scrollen oben festgepinnt. */
export function MobileSectionHeader({ children }: MobileSectionHeaderProps) {
  return <h2 className="mob-section-header">{children}</h2>;
}

interface MobileSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/** Standard-Suchfeld mit Lupe-Icon. */
export function MobileSearchBar({ value, onChange, placeholder, ariaLabel }: MobileSearchBarProps) {
  return (
    <div className="mob-search">
      <Search className="mob-search-icon" size={16} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="mob-search-input"
      />
    </div>
  );
}

interface MobileStateProps {
  /** Lucide-Icon. */
  icon?: LucideIcon;
  /** Hauptbotschaft. */
  message: string;
  /** Optional: untergeordnete Aktion. */
  children?: ReactNode;
}

/** Empty-State / Error-State / Info-Block. */
export function MobileState({ icon: Icon, message, children }: MobileStateProps) {
  return (
    <div className="mob-state">
      {Icon ? <Icon className="mob-state-icon" size={36} /> : null}
      <p>{message}</p>
      {children}
    </div>
  );
}

/** Loading-Spinner für Mobile — gleiche Brand-Farbe wie Pull-to-Refresh. */
export function MobileSpinner() {
  return (
    <div className="mob-state">
      <div className="mob-spinner" role="status" aria-label="Laden" />
    </div>
  );
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #B68E20 0%, #d4b860 100%)",
  "linear-gradient(135deg, #4a7aa8 0%, #7aa6c8 100%)",
  "linear-gradient(135deg, #8a5fb8 0%, #b18bd8 100%)",
  "linear-gradient(135deg, #d05a87 0%, #f08aaa 100%)",
  "linear-gradient(135deg, #4a8a52 0%, #82b888 100%)",
  "linear-gradient(135deg, #d6a447 0%, #f0c878 100%)",
];

/** Stable Hash-basierte Bucket-Auswahl für deterministische Avatar-Farben. */
function avatarBucket(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % AVATAR_GRADIENTS.length;
}

export interface MobileAvatarProps {
  name: string;
  size?: "md" | "sm";
}

/** Initialen-Avatar mit deterministischer Brand-Gradient-Farbe. */
export function MobileAvatar({ name, size = "md" }: MobileAvatarProps) {
  const trimmed = name.trim();
  const initials = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("") || "?";
  const bucket = avatarBucket(trimmed.toLowerCase() || "?");
  return (
    <span
      className={`mob-avatar${size === "sm" ? " mob-avatar--sm" : ""}`}
      style={{ background: AVATAR_GRADIENTS[bucket] }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
