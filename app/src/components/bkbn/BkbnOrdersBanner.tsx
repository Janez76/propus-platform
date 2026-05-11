import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ArrowRight } from "lucide-react";
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

  return (
    <Link
      to="/admin/bkbn-orders"
      className={`flex items-center gap-2 rounded-xl border border-[#ea580c]/30 bg-[#ea580c]/10 px-4 py-2.5 text-sm text-[var(--text-main)] transition hover:bg-[#ea580c]/15 ${className}`}
    >
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ea580c] text-white">
        <CalendarClock className="h-3.5 w-3.5" />
      </span>
      <span className="rounded bg-[#ea580c] px-1.5 py-0.5 text-[10px] font-bold text-white">BKBN</span>
      <span>
        <strong>{upcoming}</strong> kommende{upcoming === 1 ? "r" : ""} Backbone-Photo-Auftrag{upcoming === 1 ? "" : "e"} aus den 365-Kalendern
      </span>
      <ArrowRight className="ml-auto h-4 w-4 text-[#ea580c]" />
    </Link>
  );
}
