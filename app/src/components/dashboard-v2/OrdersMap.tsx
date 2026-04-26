import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map as MapIcon, CloudSun } from "lucide-react";
import type { Order } from "../../api/orders";
import { t, type Lang } from "../../i18n";
import { OrdersMapView, OrdersMapViewNoKey } from "../orders/OrdersMapView";
import { fetchConfig } from "../../api/bookingPublic";
import { useQuery } from "../../hooks/useQuery";
import { statusMatches } from "../../lib/status";
import { WEATHER_ZONES } from "./dashboardWeather";

interface OrdersMapProps {
  orders: Order[];
  lang: Lang;
}

type StatusFilter = "all" | "confirmed" | "pending" | "provisional" | "done";

/** Status-Farbpaare für die untere Legende (entsprechen Design-Handoff). */
const STATUS_LEGEND: { id: string; bg: string; dot: string; labelKey: string }[] = [
  { id: "confirmed",   bg: "#E6F2E3", dot: "#2A7A2A", labelKey: "dashboardV2.map.status.confirmed" },
  { id: "pending",     bg: "#FBEED4", dot: "#B87514", labelKey: "dashboardV2.map.status.pending" },
  { id: "provisional", bg: "#DFEBF5", dot: "#2E5A7A", labelKey: "dashboardV2.map.status.provisional" },
  { id: "done",        bg: "#D6E5D2", dot: "#244865", labelKey: "dashboardV2.map.status.done" },
  { id: "paused",      bg: "#E8E5DE", dot: "#6B6962", labelKey: "dashboardV2.map.status.paused" },
];

export function OrdersMap({ orders, lang }: OrdersMapProps) {
  const navigate = useNavigate();
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

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: mappableOrders.length,
      confirmed: 0,
      pending: 0,
      provisional: 0,
      done: 0,
    };
    for (const o of mappableOrders) {
      if (statusMatches(o.status, "confirmed")) c.confirmed += 1;
      if (statusMatches(o.status, "pending")) c.pending += 1;
      if (statusMatches(o.status, "provisional")) c.provisional += 1;
      if (statusMatches(o.status, "done") || statusMatches(o.status, "completed")) c.done += 1;
    }
    return c;
  }, [mappableOrders]);

  const filteredOrders = useMemo(() => {
    if (filter === "all") return mappableOrders;
    return mappableOrders.filter((o) => statusMatches(o.status, filter));
  }, [filter, mappableOrders]);

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

  return (
    <section className="dv2-card dv2-map-card">
      <div className="dv2-map-head">
        <div>
          <div className="dv2-card-title">
            <MapIcon size={14} />
            <span>{t(lang, "dashboardV2.map.title")}</span>
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

          <div className="dv2-map-filter">
            {filterButtons.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`dv2-map-filter-btn${filter === b.id ? " is-active" : ""}`}
                onClick={() => setFilter(b.id)}
              >
                {t(lang, b.key)}
                <span className="dv2-map-filter-count">{counts[b.id] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

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
          weatherZones={showWeather ? WEATHER_ZONES : undefined}
        />
      )}

      <div className="dv2-map-legend">
        {STATUS_LEGEND.map((s) => (
          <span key={s.id} className="dv2-map-legend-item">
            <span
              className="dv2-map-sw"
              style={{ background: s.bg, borderColor: s.dot }}
            />
            {t(lang, s.labelKey)}
          </span>
        ))}
        <span className="dv2-map-scale">{t(lang, "dashboardV2.map.legendHint")}</span>
      </div>
    </section>
  );
}
