import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, MapPin, Search } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getOrders, type Order } from "../../api/orders";
import { getStatusBadgeClass, getStatusLabel } from "../../lib/status";

const HIDDEN_STATUSES = new Set(["cancelled", "closed"]);

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function MobileOrdersTab() {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    setLoading(true);
    getOrders(token)
      .then((data) => {
        if (cancelled) return;
        setOrders(data);
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
    const list = orders
      .filter((o) => !HIDDEN_STATUSES.has(o.status))
      .filter((o) => {
        if (!q) return true;
        return (
          o.orderNo.toLowerCase().includes(q) ||
          (o.customerName || "").toLowerCase().includes(q) ||
          (o.address || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const da = a.appointmentDate ? new Date(a.appointmentDate).getTime() : 0;
        const db = b.appointmentDate ? new Date(b.appointmentDate).getTime() : 0;
        return db - da;
      })
      .slice(0, 50);
    return list;
  }, [orders, query]);

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
          placeholder="Auftrag, Kunde, Adresse…"
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
          <ClipboardList className="h-10 w-10 opacity-60" />
          <p className="text-sm">Keine Aufträge gefunden.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((o) => (
            <li key={o.orderNo}>
              <button
                type="button"
                onClick={() => navigate(`/orders/${o.orderNo}`)}
                className="block w-full rounded-xl px-3 py-3 text-left"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border-soft)",
                  minHeight: "4rem",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>
                    #{o.orderNo}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[10px] ${getStatusBadgeClass(o.status)}`}>
                    {getStatusLabel(o.status)}
                  </span>
                </div>
                {o.customerName && (
                  <div className="mt-1 truncate text-sm" style={{ color: "var(--text-main)" }}>
                    {o.customerName}
                  </div>
                )}
                {o.address && (
                  <div
                    className="mt-0.5 flex items-center gap-1 truncate text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{o.address}</span>
                  </div>
                )}
                {o.appointmentDate && (
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    Termin: {formatDate(o.appointmentDate)}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
