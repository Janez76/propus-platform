import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, MapPin } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getOrders, type Order } from "../../api/orders";
import { getStatusBadgeClass, getStatusLabel } from "../../lib/status";
import { MobilePullToRefresh } from "./MobilePullToRefresh";
import {
  MobileListItem,
  MobileSearchBar,
  MobileSpinner,
  MobileState,
} from "./MobileUI";

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

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getOrders(token);
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    setLoading(true);
    fetchOrders().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, fetchOrders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
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
  }, [orders, query]);

  return (
    <MobilePullToRefresh onRefresh={fetchOrders}>
      <div className="mob-page">
        <MobileSearchBar
          value={query}
          onChange={setQuery}
          placeholder="Auftrag, Kunde, Adresse…"
          ariaLabel="Aufträge suchen"
        />

        {loading ? (
          <MobileSpinner />
        ) : error ? (
          <MobileState icon={ClipboardList} message={`Fehler: ${error}`} />
        ) : filtered.length === 0 ? (
          <MobileState icon={ClipboardList} message="Keine Aufträge gefunden." />
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((o) => (
              <li key={o.orderNo}>
                <MobileListItem
                  onClick={() => navigate(`/orders/${o.orderNo}`)}
                  title={
                    <span>
                      <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono, ui-monospace, monospace)", fontWeight: 700, fontSize: 12 }}>
                        #{o.orderNo}
                      </span>
                      {o.customerName ? (
                        <>
                          <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>·</span>
                          <span>{o.customerName}</span>
                        </>
                      ) : null}
                    </span>
                  }
                  subtitle={
                    o.address ? (
                      <>
                        <MapPin size={12} aria-hidden />
                        <span>{o.address}</span>
                      </>
                    ) : null
                  }
                  meta={
                    o.appointmentDate ? (
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                        Termin · {formatDate(o.appointmentDate)}
                      </span>
                    ) : null
                  }
                  trailing={
                    <span className={`mob-pill ${getStatusBadgeClass(o.status)}`}>
                      {getStatusLabel(o.status)}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </MobilePullToRefresh>
  );
}
