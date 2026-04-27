import { useEffect, useMemo, useState } from "react";
import { Mail, Phone, Search, Users } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getCustomers, type Customer } from "../../api/customers";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function bestPhone(c: Customer): string {
  return (c.phone_mobile || c.phone || c.phone_2 || "").trim();
}

export function MobileContactsTab() {
  const token = useAuthStore((s) => s.token);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    setLoading(true);
    getCustomers(token)
      .then((data) => {
        if (cancelled) return;
        setCustomers(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Fehler beim Laden");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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
    <div className="px-3 py-3">
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, Firma, E-Mail…"
          className="h-11 w-full rounded-lg pl-9 pr-3 text-sm outline-none"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border-soft)",
            color: "var(--text-main)",
          }}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : error ? (
        <div className="px-1 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
          Fehler: {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center" style={{ color: "var(--text-muted)" }}>
          <Users className="h-10 w-10 opacity-60" />
          <p className="text-sm">Keine Kontakte gefunden.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const phone = bestPhone(c);
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl px-3 py-3"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border-soft)",
                }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ background: "var(--accent)", color: "#fff" }}
                  aria-hidden="true"
                >
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" style={{ color: "var(--text-main)" }}>
                    {c.name}
                  </div>
                  {c.company && (
                    <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                      {c.company}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {phone && (
                    <a
                      href={`tel:${phone.replace(/\s+/g, "")}`}
                      aria-label={`Anrufen ${c.name}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg"
                      style={{ color: "var(--accent)", background: "var(--surface)" }}
                    >
                      <Phone className="h-5 w-5" />
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      aria-label={`E-Mail an ${c.name}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg"
                      style={{ color: "var(--accent)", background: "var(--surface)" }}
                    >
                      <Mail className="h-5 w-5" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
