import type { ReactNode } from "react";

export interface FilterPill {
  id: string;
  label: string;
  count?: number;
}

interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  pills?: FilterPill[];
  activePillId?: string;
  onPillClick?: (id: string) => void;
  rightSlot?: ReactNode;
}

export function FilterBar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder,
  pills = [],
  activePillId,
  onPillClick,
  rightSlot,
}: FilterBarProps) {
  return (
    <section className="filterbar">
      {onSearchChange ? (
        <input
          className="search-input"
          type="search"
          value={searchValue}
          placeholder={searchPlaceholder}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      ) : null}
      {pills.map((pill) => (
        <button
          key={pill.id}
          type="button"
          className={`filter-pill${activePillId === pill.id ? " is-active" : ""}`}
          onClick={() => onPillClick?.(pill.id)}
        >
          {pill.label}
          {typeof pill.count === "number" ? ` ${pill.count}` : ""}
        </button>
      ))}
      {rightSlot}
    </section>
  );
}
