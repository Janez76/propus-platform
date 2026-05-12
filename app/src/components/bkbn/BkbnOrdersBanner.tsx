import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ChevronRight } from "lucide-react";
import { getBkbnOrders } from "../../api/bkbnOrders";
import { useAuthStore } from "../../store/authStore";

/**
 * Kompakter Hinweis-Streifen: zeigt die Anzahl kommender BKBN-Auftraege
 * (Backbone Photo) aus den 365-Kalendern und verlinkt auf die Detailseite.
 * Rendert nichts, solange keine Daten geladen sind oder es keine kommenden gibt.
 */
export function BkbnOrdersBanner({ className = "" }: { className?: string }) {
  const token = useAuthStore((s) => s.token);
  const [upcoming, setUpcoming] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        const resp = await getBkbnOrders(token);
        if (!alive) return;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const cutoff = now.getTime();
        const count = resp.events.filter((ev) => {
          const t = ev.end ? new Date(ev.end).getTime() : new Date(ev.start).getTime();
          return !Number.isFinite(t) || t >= cutoff;
        }).length;
        setUpcoming(count);
      } catch {
        if (alive) setUpcoming(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (!upcoming || upcoming <= 0) return null;

  const headline = upcoming === 1
    ? `${upcoming} kommender Backbone-Photo-Auftrag`
    : `${upcoming} kommende Backbone-Photo-Aufträge`;
  return (
    <Link to="/admin/bkbn-orders" className={`op-banner ${className}`}>
      <div className="op-banner-left">
        <span className="op-banner-icon"><ArrowDown /></span>
        <div className="op-banner-text">
          <strong>{headline}</strong>
          <small>Aus den 365-Kalendern · BKBN</small>
        </div>
      </div>
      <ChevronRight className="op-banner-arrow" />
    </Link>
  );
}
