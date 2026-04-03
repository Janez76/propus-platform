import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Eye, X, ExternalLink, RefreshCw } from "lucide-react";
import {
  getToursAdminCustomersList,
  postAdminImpersonate,
  postAdminImpersonateStop,
} from "../../../api/toursAdmin";

type Customer = {
  id: number;
  name: string;
  email: string;
  company?: string;
  customer_number?: string;
};

export function PortalPreviewPage() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [portalPath, setPortalPath] = useState("/embed/portal/dashboard");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await getToursAdminCustomersList(`search=${encodeURIComponent(q)}&limit=15`);
      const rows = (data as { customers?: Customer[] }).customers ?? [];
      setResults(rows);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(search), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, doSearch]);

  async function startImpersonation(customer: Customer) {
    try {
      await postAdminImpersonate(customer.email);
      setSelected(customer);
      setImpersonating(true);
      setSearch("");
      setResults([]);
      setPortalPath("/embed/portal/dashboard");
      setIframeKey((k) => k + 1);
    } catch (err) {
      alert("Impersonation fehlgeschlagen: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function stopImpersonation() {
    try {
      await postAdminImpersonateStop();
    } catch { /* ignore */ }
    setSelected(null);
    setImpersonating(false);
  }

  function openInNewTab() {
    if (!selected) return;
    const realPath = portalPath.replace("/embed/portal", "/portal");
    window.open(realPath, "_blank", "noopener");
  }

  const portalPages = [
    { label: "Dashboard", path: "/embed/portal/dashboard" },
    { label: "Touren", path: "/embed/portal/tours" },
    { label: "Rechnungen", path: "/embed/portal/invoices" },
    { label: "Team", path: "/embed/portal/team" },
  ];

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Header Bar */}
      <div className="border-b border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-[var(--propus-gold)]" />
            <h1 className="text-lg font-semibold text-[var(--text-main)]">Kunden-Vorschau</h1>
          </div>

          {!impersonating ? (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-subtle)]" />
              <input
                className="w-full rounded border border-[var(--border-soft)] bg-[var(--bg-main)] pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-[var(--propus-gold)]"
                placeholder="Kunde suchen (Firma, E-Mail, Kundennr.)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
              {search.length >= 2 && (results.length > 0 || loading) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded border border-[var(--border-soft)] bg-[var(--surface)] shadow-lg max-h-72 overflow-y-auto">
                  {loading && (
                    <div className="px-3 py-2 text-xs text-[var(--text-subtle)]">Suche…</div>
                  )}
                  {results.map((c) => {
                    const displayName = c.company || c.name || "—";
                    const secondary = c.company && c.name && c.company !== c.name ? c.name : null;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-[var(--propus-gold)]/10 transition-colors flex items-center gap-3 border-b border-[var(--border-soft)] last:border-b-0"
                        onClick={() => startImpersonation(c)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--text-main)] truncate">
                            {displayName}
                            {secondary && (
                              <span className="ml-2 font-normal text-[var(--text-subtle)]">({secondary})</span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-subtle)] truncate">
                            {c.email}
                            {c.customer_number ? ` · #${c.customer_number}` : ""}
                          </div>
                        </div>
                        <Eye className="h-4 w-4 text-[var(--text-subtle)] shrink-0" />
                      </button>
                    );
                  })}
                  {!loading && results.length === 0 && search.length >= 2 && (
                    <div className="px-3 py-2 text-xs text-[var(--text-subtle)]">Kein Kunde gefunden.</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded bg-[var(--propus-gold)]/10 border border-[var(--propus-gold)]/30 px-3 py-1.5">
                <Eye className="h-4 w-4 text-[var(--propus-gold)]" />
                <span className="text-sm font-medium text-[var(--text-main)]">
                  {selected?.company || selected?.name || selected?.email}
                </span>
                <span className="text-xs text-[var(--text-subtle)]">{selected?.email}</span>
              </div>

              {/* Portal-Seiten-Tabs */}
              <div className="flex items-center gap-1">
                {portalPages.map((p) => (
                  <button
                    key={p.path}
                    type="button"
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      portalPath === p.path
                        ? "bg-[var(--propus-gold)] text-black font-medium"
                        : "text-[var(--text-subtle)] hover:text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
                    }`}
                    onClick={() => {
                      setPortalPath(p.path);
                      setIframeKey((k) => k + 1);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-[var(--surface-raised)] text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
                  title="Neu laden"
                  onClick={() => setIframeKey((k) => k + 1)}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-[var(--surface-raised)] text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
                  title="In neuem Tab öffnen"
                  onClick={openInNewTab}
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                  onClick={stopImpersonation}
                >
                  <X className="h-3.5 w-3.5" />
                  Beenden
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {impersonating ? (
        <div className="flex-1 relative">
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={portalPath}
            className="w-full h-full border-0"
            style={{ minHeight: "calc(100vh - 120px)" }}
            title="Kundenportal-Vorschau"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <Eye className="h-12 w-12 text-[var(--text-subtle)] mx-auto mb-4 opacity-30" />
            <h2 className="text-lg font-medium text-[var(--text-main)] mb-2">Kundenportal-Vorschau</h2>
            <p className="text-sm text-[var(--text-subtle)]">
              Wähle einen Kunden aus, um das Portal aus seiner Sicht zu sehen. Die Ansicht wird hier eingebettet angezeigt.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
