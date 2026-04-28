import { useEffect, useRef, useState } from "react";
import { LogIn, Search, X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getCustomers, type Customer } from "../../api/customers";
import { ImpersonateDialog } from "../customers/ImpersonateDialog";
import { t } from "../../i18n";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function displayName(c: Customer): string {
  const company = String(c.company || "").trim();
  const name = String(c.name || "").trim();
  return company || name || c.email;
}

export function QuickImpersonateButton() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const language = useAuthStore((s) => s.language);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? customers.filter((c) => {
        const q = query.toLowerCase();
        return (
          displayName(c).toLowerCase().includes(q) ||
          String(c.email || "").toLowerCase().includes(q)
        );
      })
    : customers.slice(0, 8);

  const handleOpen = async () => {
    setOpen(true);
    setQuery("");
    if (customers.length === 0) {
      setLoading(true);
      try {
        const list = await getCustomers(token);
        setCustomers(list.filter((c) => !c.blocked));
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
      }
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleClose = () => {
    setOpen(false);
    setQuery("");
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!token || !ADMIN_ROLES.has(String(role))) return null;

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={open ? handleClose : handleOpen}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 focus:outline-none"
        style={{
          background: open ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface)",
          borderColor: open ? "var(--accent)" : "var(--border-soft)",
          color: open ? "var(--accent)" : "var(--text-main)",
        }}
        title={t(language, "impersonate.start")}
      >
        <LogIn className="h-4 w-4" />
        <span className="hidden md:inline">{t(language, "impersonate.start")}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-xl border shadow-2xl z-50 overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b text-xs font-semibold uppercase tracking-wider"
            style={{ borderColor: "var(--border-soft)", color: "var(--text-muted)" }}
          >
            <span>{t(language, "impersonate.start")}</span>
            <button
              type="button"
              onClick={handleClose}
              className="rounded p-0.5 hover:opacity-70"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative px-3 py-2">
            <Search
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kunde suchen…"
              className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm focus:outline-none"
              style={{
                background: "var(--surface-raised)",
                borderColor: "var(--border-soft)",
                color: "var(--text-main)",
              }}
            />
          </div>

          {/* List */}
          <div className="max-h-56 overflow-y-auto pb-2">
            {loading ? (
              <div className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Lade Kunden…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                {query ? "Keine Treffer" : "Keine Kunden"}
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelected(c);
                    handleClose();
                  }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:opacity-80"
                  style={{ color: "var(--text-main)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-raised)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: "var(--accent)" }}>
                    {displayName(c).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{displayName(c)}</div>
                    <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                      {c.email}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {selected && token && (
        <ImpersonateDialog
          token={token}
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
