import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map as MapIcon, CloudSun } from "lucide-react";
import type { Order } from "../../api/orders";
import { t, type Lang } from "../../i18n";
import { OrdersMapView, OrdersMapViewNoKey } from "../orders/OrdersMapView";
import { fetchConfig } from "../../api/bookingPublic";
import { useQuery } from "../../hooks/useQuery";
import { useNow } from "../../hooks/useNow";
import { statusMatches } from "../../lib/status";
import { OPEN_METEO_ATTRIBUTION } from "../../api/weatherProvider";
import { STATUS_PALETTE } from "../orders/mapStatusColors";

interface OrdersMapProps {
  orders: Order[];
  lang: Lang;
  hoveredOrderNo?: string | null;
}

type StatusFilter = "all" | "confirmed" | "pending" | "provisional" | "done";
type RangeFilter = "today" | "week" | "month" | "year";

/** [from, to) in epoch ms für den gewählten Zeitraum (Schweizer Wochenstart Mo). */
function computeRangeBounds(now: Date, range: RangeFilter): { from: number; to: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "today") {
    const from = start.getTime();
    return { from, to: from + 86_400_000 };
  }
  if (range === "week") {
    const dow = (start.getDay() + 6) % 7; // Mo=0 … So=6
    const from = new Date(start);
    from.setDate(from.getDate() - dow);
    return { from: from.getTime(), to: from.getTime() + 7 * 86_400_000 };
  }
  if (range === "month") {
    const from = new Date(start.getFullYear(), start.getMonth(), 1);
    const to = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { from: from.getTime(), to: to.getTime() };
  }
  const from = new Date(start.getFullYear(), 0, 1);
  const to = new Date(start.getFullYear() + 1, 0, 1);
  return { from: from.getTime(), to: to.getTime() };
}

function isInRange(dateStr: string | undefined | null, from: number, to: number): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) && t >= from && t < to;
}

export function OrdersMap({ orders, lang, hoveredOrderNo }: OrdersMapProps) {
  const navigate = useNavigate();
  const now = useNow();
  const [range, setRange] = useState<RangeFilter>("week");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showWeather, setShowWeather] = useState(true);

  const { data: bookingConfig, loading: configLoading } = useQuery(
    "bookingConfig:public",
    () => fetchConfig(),
    { enabled: true, staleTime: 15 * 60 * 1000, refetchOnWindowFocus: false },
  );
  const googleMapsKey = bookingConfig?.googleMapsKey?.trim() || null;

  const mappableOrders = useMemo(
    () => orders.filter((o) => String(o.address || "").trim().length >= 6),
    [orders],
  );

  const { from, to } = useMemo(() => computeRangeBounds(now, range), [now, range]);

  const inRangeOrders = useMemo(
    () => mappableOrders.filter((o) => isInRange(o.appointmentDate, from, to)),
    [mappableOrders, from, to],
  );

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: inRangeOrders.length,
      confirmed: 0,
      pending: 0,
      provisional: 0,
      done: 0,
    };
    for (const o of inRangeOrders) {
      if (statusMatches(o.status, "confirmed")) c.confirmed += 1;
      if (statusMatches(o.status, "pending")) c.pending += 1;
      if (statusMatches(o.status, "provisional")) c.provisional += 1;
      if (statusMatches(o.status, "done") || statusMatches(o.status, "completed")) c.done += 1;
    }
    return c;
  }, [inRangeOrders]);

  const filteredOrders = useMemo(() => {
    if (filter === "all") return inRangeOrders;
    return inRangeOrders.filter((o) => statusMatches(o.status, filter));
  }, [filter, inRangeOrders]);

  const skipped = orders.length - mappableOrders.length;
  const openDetail = (orderNo: string) => {
    navigate(`/orders/${encodeURIComponent(orderNo)}`);
  };

  const filterButtons: { id: StatusFilter; key: string }[] = [
    { id: "all", key: "dashboardV2.map.filter.all" },
    { id: "confirmed", key: "dashboardV2.map.filter.confirmed" },
    { id: "pending", key: "dashboardV2.map.filter.pending" },
    { id: "provisional", key: "dashboardV2.map.filter.provisional" },
    { id: "done", key: "dashboardV2.map.filter.done" },
  ];

  const rangeButtons: { id: RangeFilter; key: string }[] = [
    { id: "today", key: "dashboardV2.map.range.today" },
    { id: "week", key: "dashboardV2.map.range.week" },
    { id: "month", key: "dashboardV2.map.range.month" },
    { id: "year", key: "dashboardV2.map.range.year" },
  ];

  return (
    <section className="dv2-card dv2-map-card">
      <div className="dv2-map-head">
        <div>
          <div className="dv2-card-title">
            <MapIcon size={14} />
            <span>{t(lang, `dashboardV2.map.titleByRange.${range}`)}</span>
          </div>
          <div className="dv2-map-subtitle">
            {t(lang, "dashboardV2.map.region")} —{" "}
            {t(lang, "dashboardV2.map.subtitle").replace("{{n}}", String(filteredOrders.length))}
            {skipped > 0 && (
              <>
                {" · "}
                {t(lang, "dashboardV2.map.skipped").replace("{{n}}", String(skipped))}
              </>
            )}
          </div>
        </div>

        <div className="dv2-map-toolbar">
          <button
            type="button"
            className={`dv2-map-weather-btn${showWeather ? " is-on" : ""}`}
            onClick={() => setShowWeather((s) => !s)}
            aria-pressed={showWeather}
            title={t(lang, "dashboardV2.map.weatherToggle")}
          >
            <CloudSun size={14} />
            <span>{t(lang, "dashboardV2.map.weatherToggle")}</span>
          </button>

          <div className="dv2-map-filter dv2-map-range">
            {rangeButtons.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`dv2-map-filter-btn${range === b.id ? " is-active" : ""}`}
                onClick={() => setRange(b.id)}
                aria-pressed={range === b.id}
              >
                {t(lang, b.key)}
              </button>
            ))}
          </div>

          <div className="dv2-map-filter">
            {filterButtons.map((b) => {
              const count = counts[b.id] ?? 0;
              const disabled = b.id !== "all" && count === 0 && filter !== b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`dv2-map-filter-btn${filter === b.id ? " is-active" : ""}`}
                  onClick={() => setFilter(b.id)}
                  disabled={disabled}
                  aria-pressed={filter === b.id}
                >
                  {t(lang, b.key)}
                  <span className="dv2-map-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="dv2-map-host-wrap">
        {configLoading ? (
          <div className="dv2-map-host flex items-center justify-center text-sm text-subtle">
            {t(lang, "orders.map.configLoading")}
          </div>
        ) : !googleMapsKey ? (
          <OrdersMapViewNoKey lang={lang} />
        ) : (
          <OrdersMapView
            apiKey={googleMapsKey}
            orders={filteredOrders}
            onOpenDetail={openDetail}
            lang={lang}
            showOrderWeather={showWeather}
            hoveredOrderNo={hoveredOrderNo ?? null}
          />
        )}
        {googleMapsKey && !configLoading && filteredOrders.length === 0 ? (
          <div className="dv2-map-empty">
            <div className="dv2-map-empty-text">{t(lang, "dashboardV2.map.empty")}</div>
          </div>
        ) : null}
      </div>

      <div className="dv2-map-legend">
        {STATUS_PALETTE.map((s) => (
          <span key={s.id} className="dv2-map-legend-item">
            <span
              className="dv2-map-sw"
              style={{ background: s.bg, borderColor: s.ring }}
            />
            {t(lang, s.labelKey)}
          </span>
        ))}
        {showWeather ? (
          <span className="dv2-map-attrib">{OPEN_METEO_ATTRIBUTION}</span>
        ) : null}
        <span className="dv2-map-scale">{t(lang, "dashboardV2.map.legendHint")}</span>
      </div>
    </section>
  );
}
