import { useEffect, useId, useRef, useState } from "react";
import type { InputHTMLAttributes, KeyboardEvent } from "react";
import { Building2, Mail, Phone, User } from "lucide-react";
import { type Customer } from "../../api/customers";
import { cn } from "../../lib/utils";
import { useCustomerAutocomplete } from "../../hooks/useCustomerAutocomplete";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type CustomerAutocompleteInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  onSelectCustomer: (customer: Customer) => void;
  token?: string;
  customers?: Customer[];
  minChars?: number;
  maxSuggestions?: number;
  selectValue?: (customer: Customer) => string;
};

export function CustomerAutocompleteInput({
  value,
  onChange,
  onSelectCustomer,
  token,
  customers,
  minChars = 3,
  maxSuggestions = 8,
  selectValue,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  autoComplete = "off",
  ...props
}: CustomerAutocompleteInputProps) {
  const lang = useAuthStore((s) => s.language);
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { suggestions, isLoading, hasEnoughChars } = useCustomerAutocomplete({
    token,
    customers,
    query: value,
    minChars,
    limit: maxSuggestions,
  });

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
      setActiveIndex(-1);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  const showSuggestions = open && hasEnoughChars && suggestions.length > 0;

  function handleSelect(customer: Customer) {
    onChange(selectValue ? selectValue(customer) : (customer.name || ""));
    onSelectCustomer(customer);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!showSuggestions) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        {...props}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          onBlur?.(event);
        }}
        onKeyDown={handleKeyDown}
        autoComplete={autoComplete}
        className={cn(className)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={listboxId}
      />

      {isLoading && value.trim().length >= minChars ? (
        <div className="pointer-events-none absolute right-2 top-[36px] rounded bg-zinc-800/90 px-2 py-1 text-[11px] text-zinc-200">
          Suche...
        </div>
      ) : null}

      {showSuggestions ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl border-[var(--border-soft)] bg-[var(--surface)]"
        >
          {suggestions.map((item, index) => (
            <li
              key={item.id || `${item.name}-${item.email}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              className={cn(
                "cursor-pointer rounded-md px-3 py-2 text-sm",
                activeIndex === index
                  ? "bg-[var(--surface-raised)]"
                  : "hover:bg-slate-50 hover:bg-[var(--surface-raised)]/70",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(item);
              }}
            >
              <div className="flex items-start gap-2">
                <User className="mt-[2px] h-3.5 w-3.5 text-[var(--accent)]" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--text-main)]">
                    {String(item.company || "").trim() || item.name || "-"}
                  </p>
                  {item.company && item.name ? (
                    <p className="truncate text-xs text-[var(--text-subtle)]">{item.name}</p>
                  ) : null}
                  {item.id != null ? (
                    <p className="text-[11px] font-medium tabular-nums text-[var(--text-subtle)]">
                      {t(lang, "customerList.table.id")}: {item.id}
                    </p>
                  ) : null}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-subtle)]">
                    {item.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {item.email}
                      </span>
                    ) : null}
                    {item.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {item.phone}
                      </span>
                    ) : null}
                    {item.company ? (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {item.company}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

