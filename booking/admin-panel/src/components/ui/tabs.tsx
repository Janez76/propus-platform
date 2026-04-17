import { createContext, useContext, useId, useState, type ReactNode } from "react";

type TabsContextValue = {
  value: string;
  onChange: (next: string) => void;
  idBase: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used inside <Tabs>");
  return ctx;
}

type TabsProps = {
  value?: string;
  defaultValue: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
};

export function Tabs({ value: controlled, defaultValue, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const idBase = useId();
  const value = controlled ?? internal;
  const onChange = (next: string) => {
    if (controlled === undefined) setInternal(next);
    onValueChange?.(next);
  };
  return (
    <TabsContext.Provider value={{ value, onChange, idBase }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

type TabsListProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function TabsList({ children, className, ariaLabel }: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={
        className ??
        "flex flex-wrap gap-1 border-b border-[var(--border-soft)] mb-4"
      }
    >
      {children}
    </div>
  );
}

type TabsTriggerProps = {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
};

export function TabsTrigger({ value, children, disabled, className }: TabsTriggerProps) {
  const ctx = useTabs();
  const active = ctx.value === value;
  const base =
    "px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-t-md";
  const stateClass = active
    ? "border-[var(--accent)] text-[var(--accent)]"
    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200";
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.idBase}-trigger-${value}`}
      aria-controls={`${ctx.idBase}-panel-${value}`}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      onClick={() => ctx.onChange(value)}
      className={className ?? `${base} ${stateClass} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

type TabsContentProps = {
  value: string;
  children: ReactNode;
  className?: string;
};

export function TabsContent({ value, children, className }: TabsContentProps) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.idBase}-panel-${value}`}
      aria-labelledby={`${ctx.idBase}-trigger-${value}`}
      className={className}
    >
      {children}
    </div>
  );
}
