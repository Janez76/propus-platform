import { useEffect, useId, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { MapPin } from "lucide-react";
import { cn } from "../../lib/utils";
import { API_BASE } from "../../api/client";

export type ZipCityPair = {
  zip: string;
  city: string;
  canton: string;
  lat: number;
  lng: number;
};

type Mode = "zip" | "city";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  mode: Mode;
  onSelectPair: (pair: ZipCityPair) => void;
  lang?: string;
  sessionToken?: string;
  minChars?: number;
};

async function fetchZipCity(q: string, mode: Mode, lang: string, signal?: AbortSignal, sessionToken?: string): Promise<ZipCityPair[]> {
  const base = API_BASE || "";
  const url = new URL("/api/zip-city-suggest", base || (typeof window !== "undefined" ? window.location.origin : "http://localhost"));
  url.searchParams.set("q", q.replace(/\u00DF/g, "ss"));
  url.searchParams.set("mode", mode);
  url.searchParams.set("lang", lang === "de" ? "de-CH" : lang);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  try {
    const r = await fetch(url.toString(), { signal, headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const json = await r.json() as { ok?: boolean; results?: ZipCityPair[] };
    return Array.isArray(json.results) ? json.results : [];
  } catch {
    return [];
  }
}

export function ZipCitySuggestInput({
  value,
  onChange,
  mode,
  onSelectPair,
  lang = "de",
  sessionToken,
  minChars,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  autoComplete = "off",
  ...props
}: Props) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [results, setResults] = useState<ZipCityPair[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);

  const effectiveMinChars = minChars ?? 2;

  useEffect(() => {
    const q = value.trim();
    if (q.length < effectiveMinChars) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      try {
        const list = await fetchZipCity(q, mode, lang, controller.signal, sessionToken);
        setResults(list);
        setOpen(list.length > 0);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, mode, lang, effectiveMinChars, sessionToken]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  function handlePick(p: ZipCityPair) {
    onChange(mode === "zip" ? p.zip : p.city);
    onSelectPair(p);
    setOpen(false);
    setActiveIndex(-1);
    setResults([]);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Escape") { setOpen(false); setActiveIndex(-1); return; }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((p) => (p + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((p) => (p - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handlePick(results[activeIndex]);
    }
  }

  const showList = open && results.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        {...props}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={(e) => { if (results.length > 0) setOpen(true); onFocus?.(e); }}
        onBlur={(e) => { onBlur?.(e); }}
        onKeyDown={handleKey}
        autoComplete={autoComplete}
        className={cn(className)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
      />
      {isLoading && value.trim().length >= effectiveMinChars ? (
        <div className="pointer-events-none absolute right-2 top-[36px] rounded bg-zinc-800/90 px-2 py-1 text-[11px] text-zinc-300">
          …
        </div>
      ) : null}
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-1 shadow-xl"
        >
          {results.map((item, index) => (
            <li
              key={`${item.zip}-${item.city}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              className={cn(
                "cursor-pointer rounded-md px-3 py-2 text-sm",
                activeIndex === index
                  ? "bg-[var(--surface-raised)]"
                  : "hover:bg-[var(--surface-raised)]/70",
              )}
              onMouseDown={(e) => { e.preventDefault(); handlePick(item); }}
            >
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                <span className="font-mono text-[var(--text-main)]">{item.zip}</span>
                <span className="text-[var(--text-main)]">{item.city}</span>
                {item.canton ? (
                  <span className="ml-auto text-xs text-[var(--text-subtle)]">{item.canton}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
