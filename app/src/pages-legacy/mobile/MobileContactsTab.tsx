import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Phone, Users } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getCustomers, type Customer } from "../../api/customers";
import { MobilePullToRefresh } from "./MobilePullToRefresh";
import {
  MobileAvatar,
  MobileListItem,
  MobileListSkeleton,
  MobileSearchBar,
  MobileState,
} from "./MobileUI";

function bestPhone(c: Customer): string {
  return (c.phone_mobile || c.phone || c.phone_2 || "").trim();
}

export function MobileContactsTab() {
  const token = useAuthStore((s) => s.token);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getCustomers(token);
      setCustomers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    setLoading(true);
    fetchCustomers().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, fetchCustomers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => !c.blocked)
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.company || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de-CH"))
      .slice(0, 100);
  }, [customers, query]);

  return (
    <MobilePullToRefresh onRefresh={fetchCustomers}>
      <div className="mob-page">
        <MobileSearchBar
          value={query}
          onChange={setQuery}
          placeholder="Name, Firma, E-Mail…"
          ariaLabel="Kontakte suchen"
        />

        {loading ? (
          <MobileListSkeleton rows={6} withSection={false} />
        ) : error ? (
          <MobileState icon={Users} message={`Fehler: ${error}`} />
        ) : filtered.length === 0 ? (
          <MobileState icon={Users} message="Keine Kontakte gefunden." />
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((c) => {
              const phone = bestPhone(c);
              return (
                <li key={c.id}>
                  <MobileListItem
                    leading={<MobileAvatar name={c.name} />}
                    title={c.name}
                    subtitle={c.company ?? undefined}
                    trailing={
                      <div className="flex items-center gap-1">
                        {phone && (
                          <a
                            href={`tel:${phone.replace(/\s+/g, "")}`}
                            aria-label={`Anrufen ${c.name}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
                            style={{
                              color: "var(--accent)",
                              border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
                              background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                            }}
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            aria-label={`E-Mail an ${c.name}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
                            style={{
                              color: "var(--accent)",
                              border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
                              background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                            }}
                          >
                            <Mail className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </MobilePullToRefresh>
  );
}
