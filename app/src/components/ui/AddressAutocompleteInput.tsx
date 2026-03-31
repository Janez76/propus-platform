import { useEffect, useId, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { MapPin } from "lucide-react";
import { cn } from "../../lib/utils";
import { API_BASE, ADDRESS_AUTOCOMPLETE_ENDPOINT } from "../../api/client";

type AddressResult = {
  type: "address" | "place";
  main: string;
  sub: string;
  display?: string;
  street?: string;
  houseNumber?: string;
  zip?: string;
  city?: string;
  canton?: string;
  countryCode?: string;
  complete?: boolean;
  lat: number;
  lng?: number;
  lon: number;
};

export type ParsedAddress = {
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  countryCode: "CH";
  display: string;
};

type AddressAutocompleteInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  /**
   * "combined" — ein Freitextfeld (Strasse + PLZ/Ort), z.B. für homeAddress oder Objekt-Adresse.
   * "street"   — Strassenfeld; bei Auswahl wird onSelectZipcity mit PLZ/Ort aufgerufen.
   */
  mode: "combined" | "street";
  onSelectZipcity?: (zipcity: string) => void;
  onSelectCoords?: (lat: number, lon: number) => void;
  /** Strukturierte Adressdaten bei Auswahl (Strasse, Hausnummer, PLZ, Ort) */
  onSelectParsed?: (parsed: ParsedAddress) => void;
  minChars?: number;
  lang?: string;
  /** Bei gesetzten Werten: Vorschlaege unterdruecken, wenn Adresse bereits vollstaendig */
  zip?: string;
  city?: string;
};

async function fetchSuggestions(q: string, lang: string, signal?: AbortSignal): Promise<AddressResult[]> {
  const requestUrl = API_BASE
    ? new URL(ADDRESS_AUTOCOMPLETE_ENDPOINT, API_BASE).toString()
    : ADDRESS_AUTOCOMPLETE_ENDPOINT;
  const url = new URL(requestUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("q", q.replace(/\u00DF/g, "ss"));
  url.searchParams.set("lang", lang === "de" ? "de-CH" : lang);
  try {
    const r = await fetch(url.toString(), { signal, headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const json = await r.json() as { ok: boolean; results?: AddressResult[] };
    return Array.isArray(json.results) ? json.results.map(normalizeAddressResult).filter((r): r is AddressResult => r != null) : [];
  } catch {
    return [];
  }
}

function stripCountrySuffix(input: string): string {
  return String(input || "")
    .replace(/,\s*Schweiz$/i, "")
    .replace(/\s*Schweiz$/i, "")
    .trim();
}

function parseSwissStreetLine(input: string): { street: string; houseNumber: string } {
  const cleaned = stripCountrySuffix(input);
  if (!cleaned) return { street: "", houseNumber: "" };
  const match = cleaned.match(/^(.*?)(?:\s+(\d+[A-Za-z]?[\w/-]*))$/);
  if (!match) return { street: cleaned, houseNumber: "" };
  return {
    street: String(match[1] || "").trim(),
    houseNumber: String(match[2] || "").trim(),
  };
}

function parseSwissZipCity(input: string): { zip: string; city: string } {
  const cleaned = stripCountrySuffix(input);
  if (!cleaned) return { zip: "", city: "" };
  const match = cleaned.match(/^(\d{4})\s+(.+)$/);
  if (!match) return { zip: "", city: cleaned };
  return {
    zip: String(match[1] || "").trim(),
    city: String(match[2] || "").trim(),
  };
}

function normalizeAddressResult(raw: AddressResult): AddressResult | null {
  if (!raw || typeof raw !== "object") return null;
  const main = stripCountrySuffix(raw.main || raw.display || "");
  const sub = stripCountrySuffix(raw.sub || "");
  const parsedStreet = parseSwissStreetLine(main);
  const parsedZipCity = parseSwissZipCity(sub);
  const countryCode = String(raw.countryCode || "CH").toUpperCase();
  const street = String(raw.street || parsedStreet.street || "").trim();
  const houseNumber = String(raw.houseNumber || parsedStreet.houseNumber || "").trim();
  const zip = String(raw.zip || parsedZipCity.zip || "").trim();
  const city = String(raw.city || parsedZipCity.city || "").trim();
  const complete = typeof raw.complete === "boolean"
    ? raw.complete
    : Boolean(street && houseNumber && zip && city && countryCode === "CH");

  return {
    ...raw,
    type: raw.type || (street ? "address" : "place"),
    main,
    sub,
    street,
    houseNumber,
    zip,
    city,
    countryCode,
    complete,
  };
}

export function AddressAutocompleteInput({
  value,
  onChange,
  mode,
  onSelectZipcity,
  onSelectCoords,
  onSelectParsed,
  minChars = 3,
  lang = "de",
  zip,
  city,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  autoComplete = "off",
  ...props
}: AddressAutocompleteInputProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectError, setSelectError] = useState("");

  const addressAlreadyComplete = Boolean(
    zip?.trim() && city?.trim() && value.trim().length >= minChars
  );

  useEffect(() => {
    const query = value.trim();
    if (query.length < minChars || addressAlreadyComplete) {
      setSuggestions([]);
      setOpen(false);
      setShowEmpty(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      setShowEmpty(false);
      try {
        const results = await fetchSuggestions(query, lang, controller.signal);
        // Phase 1: Vorschläge nicht auf Hausnummer blockieren, nur CH-Adressen.
        const filtered = results
          .filter((r) => r.type === "address" && String(r.countryCode || "").toUpperCase() === "CH")
          .slice(0, 5);
        setSuggestions(filtered);
        setOpen(filtered.length > 0);
        setShowEmpty(filtered.length === 0);
      } catch {
        setSuggestions([]);
        setShowEmpty(false);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, minChars, lang, mode, addressAlreadyComplete]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowEmpty(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  function handleSelect(result: AddressResult) {
    const main = result.street
      ? `${result.street}${result.houseNumber ? ` ${result.houseNumber}` : ""}`.trim()
      : result.main;
    const zipcity = [result.zip, result.city].filter(Boolean).join(" ").trim() || result.sub || "";
    const displayRaw = result.display ?? (zipcity ? `${main}, ${zipcity}` : main);
    const display = stripCountrySuffix(displayRaw);

    onChange(display);
    setSelectError("");

    const isComplete = Boolean(
      (result.complete ?? true)
      && result.street
      && result.houseNumber
      && result.zip
      && result.city
      && String(result.countryCode || "CH").toUpperCase() === "CH",
    );

    if (!isComplete) {
      const zipcityHint = [result.zip, result.city].filter(Boolean).join(" ").trim();
      if (onSelectZipcity && zipcityHint) onSelectZipcity(zipcityHint);
      setSelectError("Bitte eine vollständige Adresse mit Hausnummer wählen.");
      setOpen(false);
      setShowEmpty(false);
      setActiveIndex(-1);
      setSuggestions([]);
      return;
    }

    // Strukturierte Daten (Priorität)
    if (onSelectParsed && result.street && result.houseNumber) {
      onSelectParsed({
        street: result.street,
        houseNumber: result.houseNumber,
        zip: result.zip ?? "",
        city: result.city ?? "",
        countryCode: "CH",
        display,
      });
    }

    // Legacy-Kompatibilität
    if (onSelectZipcity) {
      const zipcity = result.zip && result.city
        ? `${result.zip} ${result.city}`
        : stripCountrySuffix(result.sub ?? "");
      if (zipcity) onSelectZipcity(zipcity);
    }

    if (onSelectCoords) onSelectCoords(result.lat, result.lng ?? result.lon);
    setOpen(false);
    setShowEmpty(false);
    setActiveIndex(-1);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;

    if (e.key === "Escape") { setOpen(false); setShowEmpty(false); setActiveIndex(-1); return; }
    if (!open || !suggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    }
  }

  const showSuggestions = open && suggestions.length > 0;
  const showEmptyState = showEmpty && !isLoading && value.trim().length >= minChars;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        {...props}
        value={value}
        onChange={(e) => {
          onChange(e.target.value); setOpen(true); setShowEmpty(false); setSelectError("");
        }}
        onFocus={(e) => {
          if (suggestions.length > 0) setOpen(true); onFocus?.(e);
        }}
        onBlur={(e) => { onBlur?.(e); }}
        onKeyDown={handleKeyDown}
        autoComplete={autoComplete}
        className={cn(className)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={listboxId}
      />

      {isLoading && value.trim().length >= minChars ? (
        <div className="pointer-events-none absolute right-2 top-[36px] rounded bg-zinc-800/90 px-2 py-1 text-[11px] text-zinc-300">
          Suche…
        </div>
      ) : null}

      {showSuggestions ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-1 shadow-xl"
        >
          {suggestions.map((item, index) => (
            <li
              key={`${item.display ?? item.main}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              className={cn(
                "cursor-pointer rounded-md px-3 py-2 text-sm",
                activeIndex === index
                  ? "bg-[var(--surface-raised)]"
                  : "hover:bg-[var(--surface-raised)]/70",
              )}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
            >
              <div className="flex items-start gap-2">
                <MapPin className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--text-main)]">{item.main}</p>
                  {item.sub ? (
                    <p className="truncate text-xs text-[var(--text-subtle)]">{item.sub}</p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showEmptyState ? (
        <div
          className="absolute z-40 mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-subtle)] shadow-xl"
        >
          Keine vollständige Adresse gefunden (Hausnummer erforderlich).
        </div>
      ) : null}

      {selectError ? (
        <p className="mt-1 text-xs text-amber-500">{selectError}</p>
      ) : null}
    </div>
  );
}

