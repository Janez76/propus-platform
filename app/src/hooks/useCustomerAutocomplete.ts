import { useEffect, useMemo, useState } from "react";
import { getCustomers, type Customer } from "../api/customers";
import { customersQueryKey } from "../lib/queryKeys";
import { useQuery } from "./useQuery";

export type CustomerSearchMode = "default" | "onsite";

type UseCustomerAutocompleteOptions = {
  token?: string;
  query: string;
  customers?: Customer[];
  minChars?: number;
  debounceMs?: number;
  limit?: number;
  /** Suche nach Vor-Ort-Kontakten (onsite_name, onsite_phone) – nur Kunden mit ausgefüllten Onsite-Feldern */
  searchMode?: CustomerSearchMode;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D+/g, "");
}

export function useCustomerAutocomplete({
  token,
  query,
  customers,
  minChars = 3,
  debounceMs = 200,
  limit = 8,
  searchMode = "default",
}: UseCustomerAutocompleteOptions) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, query]);

  const trimmedQuery = debouncedQuery.trim();
  const hasEnoughChars = trimmedQuery.length >= minChars;
  const canFetch = !customers && Boolean(token);

  const customerQuery = useQuery(
    customersQueryKey(token || "anon"),
    () => getCustomers(token || ""),
    {
      enabled: canFetch,
      staleTime: 5 * 60 * 1000,
      refetchOnMount: true,
    },
  );

  const sourceCustomers = customers ?? customerQuery.data ?? [];

  const suggestions = useMemo(() => {
    if (!hasEnoughChars || !sourceCustomers.length) return [];

    const q = normalize(trimmedQuery);
    const qPhone = normalizePhone(trimmedQuery);

    const ranked = sourceCustomers
      .map((customer) => {
        if (searchMode === "onsite") {
          const onsiteName = normalize(customer.onsite_name || "");
          const onsitePhoneRaw = customer.onsite_phone || "";
          const onsitePhone = normalize(onsitePhoneRaw);
          const onsitePhoneDigits = normalizePhone(onsitePhoneRaw);
          if (!onsiteName && !onsitePhoneRaw) return null;
          const matches =
            onsiteName.includes(q) ||
            onsitePhone.includes(q) ||
            (qPhone.length >= 3 && onsitePhoneDigits.includes(qPhone));
          if (!matches) return null;
          let score = 0;
          if (onsiteName.startsWith(q)) score += 30;
          if (onsitePhone.startsWith(q) || (qPhone.length >= 3 && onsitePhoneDigits.startsWith(qPhone))) score += 20;
          return { customer, score };
        }

        const name = normalize(customer.name || "");
        const email = normalize(customer.email || "");
        const company = normalize(customer.company || "");
        const phoneRaw = customer.phone || "";
        const phone = normalize(phoneRaw);
        const phoneDigits = normalizePhone(phoneRaw);

        const matches =
          name.includes(q) ||
          email.includes(q) ||
          company.includes(q) ||
          phone.includes(q) ||
          (qPhone.length >= 3 && phoneDigits.includes(qPhone));

        if (!matches) return null;

        let score = 0;
        if (name.startsWith(q)) score += 30;
        if (email.startsWith(q)) score += 20;
        if (company.startsWith(q)) score += 10;
        if (phone.startsWith(q) || (qPhone.length >= 3 && phoneDigits.startsWith(qPhone))) score += 15;

        return { customer, score };
      })
      .filter((item): item is { customer: Customer; score: number } => Boolean(item))
      .sort((a, b) => b.score - a.score || (a.customer.name || "").localeCompare(b.customer.name || "", "de-CH"))
      .slice(0, limit)
      .map((item) => item.customer);

    return ranked;
  }, [hasEnoughChars, limit, sourceCustomers, searchMode, trimmedQuery]);

  return {
    suggestions,
    hasEnoughChars,
    isLoading: canFetch && (customerQuery.loading || customerQuery.isFetching),
    error: customerQuery.error,
  };
}
