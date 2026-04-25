import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L, { type Map as LMap, type LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon } from "lucide-react";
import type { Order } from "../../api/orders";
import { statusMatches, normalizeStatusKey } from "../../lib/status";
import { t, type Lang } from "../../i18n";
import { lookupZip, type ZipCoord } from "./zipCoords";

interface OrdersMapProps {
  orders: Order[];
  lang: Lang;
}

type StatusFilter = "all" | "confirmed" | "pending" | "provisional" | "done";

interface MapPoint extends ZipCoord {
  order: Order;
  lat: number;
  lng: number;
}

const MARKER_COLOR: Record<string, { bg: string; dot: string }> = {
  pending:     { bg: "#FBEED4", dot: "#B87514" },
  provisional: { bg: "#DFEBF5", dot: "#2E5A7A" },
  confirmed:   { bg: "#E6F2E3", dot: "#2A7A2A" },
  completed:   { bg: "#D6E5D2", dot: "#244865" },
  done:        { bg: "#E8E5DE", dot: "#244865" },
  paused:      { bg: "#E8E5DE", dot: "#6B6962" },
  cancelled:   { bg: "#F8E0DB", dot: "#B4311B" },
  archived:    { bg: "#E8E5DE", dot: "#6B6962" },
};

function statusColors(status: string): { bg: string; dot: string } {
  const norm = normalizeStatusKey(status);
  return MARKER_COLOR[norm ?? "pending"] ?? MARKER_COLOR.pending;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default:  return "&#39;";
    }
  });
}

function formatApptShort(iso: string | undefined, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const locale = lang === "de" ? "de-CH" : lang === "fr" ? "fr-CH" : lang === "it" ? "it-CH" : "en-GB";
  const date = d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function statusLabel(status: string, lang: Lang): string {
  return t(lang, `dashboardV2.map.status.${normalizeStatusKey(status) ?? "pending"}`);
}

export function OrdersMap({ orders, lang }: OrdersMapProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersLayerRef = useRef<LayerGroup | null>(null);

  // ── Build points (orders with mappable ZIP)
  const points = useMemo<MapPoint[]>(() => {
    return orders.flatMap((o, i) => {
      const c = lookupZip(o.customerZipcity);
      if (!c) return [];
      // small jitter so stacked orders don't perfectly overlap
      const j = (i % 5) * 0.0006 - 0.0012;
      return [{ ...c, order: o, lat: c.lat + j, lng: c.lng + j * 1.3 }];
    });
  }, [orders]);

  const filtered = useMemo(() => {
    if (filter === "all") return points;
    return points.filter((p) => statusMatches(p.order.status, filter));
  }, [points, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: points.length, confirmed: 0, pending: 0, provisional: 0, done: 0 };
    for (const p of points) {
      if (statusMatches(p.order.status, "confirmed")) c.confirmed += 1;
      if (statusMatches(p.order.status, "pending")) c.pending += 1;
      if (statusMatches(p.order.status, "provisional")) c.provisional += 1;
      if (statusMatches(p.order.status, "done") || statusMatches(p.order.status, "completed")) {
        c.done += 1;
      }
    }
    return c;
  }, [points]);

  const skipped = orders.length - points.length;

  // ── Init map once
  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) return;
    const map = L.map(mapHostRef.current, {
      center: [47.355, 8.55],
      zoom: 10,
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // ── Render markers when filtered changes
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const p of filtered) {
      const c = statusColors(p.order.status);
      const html = `<div class="dv2-map-pin"><svg viewBox="0 0 26 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M 13,1.5 C 6,1.5 1.5,6.5 1.5,13 C 1.5,19.5 7,24.5 13,30.5 C 19,24.5 24.5,19.5 24.5,13 C 24.5,6.5 20,1.5 13,1.5 Z" fill="${c.bg}" stroke="#141413" stroke-width="1.5"/>
  <circle cx="13" cy="13" r="4.2" fill="${c.dot}"/>
</svg></div>`;
      const icon = L.divIcon({
        className: "dv2-map-marker",
        html,
        iconSize: [26, 32],
        iconAnchor: [13, 32],
        popupAnchor: [0, -30],
      });
      const customer = escapeHtml(p.order.customerName ?? "—");
      const address = escapeHtml(p.order.address ?? "");
      const zipcity = escapeHtml(p.order.customerZipcity ?? p.area);
      const apptStr = escapeHtml(formatApptShort(p.order.appointmentDate, lang));
      const statusStr = escapeHtml(statusLabel(p.order.status, lang));
      const popup = `<div class="dv2-map-pop"><div class="dv2-map-pop-row1"><span class="dv2-map-pop-no">#${escapeHtml(p.order.orderNo)}</span>${customer}</div>${address ? `<div class="dv2-map-pop-row2">${address}</div>` : ""}<div class="dv2-map-pop-row3">${zipcity} · ${apptStr}</div><div class="dv2-map-pop-status"><span class="dv2-map-pop-dot" style="background:${c.dot}"></span>${statusStr}</div></div>`;
      const marker = L.marker([p.lat, p.lng], { icon })
        .bindPopup(popup, { className: "dv2-map-popup" });
      marker.on("popupopen", () => {
        const el = document.querySelector(".dv2-map-pop");
        if (!el) return;
        el.addEventListener(
          "click",
          () => navigate(`/orders/${p.order.orderNo}`),
          { once: true },
        );
      });
      marker.addTo(layer);
    }
  }, [filtered, lang, navigate]);

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
            {t(lang, "dashboardV2.map.subtitle").replace("{{n}}", String(filtered.length))}
            {skipped > 0 && (
              <>
                {" · "}
                {t(lang, "dashboardV2.map.skipped").replace("{{n}}", String(skipped))}
              </>
            )}
          </div>
        </div>
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
      <div ref={mapHostRef} className="dv2-map-host" />
      <div className="dv2-map-legend">
        <span className="dv2-map-legend-item">
          <span className="dv2-map-sw" style={{ background: MARKER_COLOR.confirmed.bg, borderColor: MARKER_COLOR.confirmed.dot }} />
          {t(lang, "dashboardV2.map.status.confirmed")}
        </span>
        <span className="dv2-map-legend-item">
          <span className="dv2-map-sw" style={{ background: MARKER_COLOR.pending.bg, borderColor: MARKER_COLOR.pending.dot }} />
          {t(lang, "dashboardV2.map.status.pending")}
        </span>
        <span className="dv2-map-legend-item">
          <span className="dv2-map-sw" style={{ background: MARKER_COLOR.provisional.bg, borderColor: MARKER_COLOR.provisional.dot }} />
          {t(lang, "dashboardV2.map.status.provisional")}
        </span>
        <span className="dv2-map-legend-item">
          <span className="dv2-map-sw" style={{ background: MARKER_COLOR.done.bg, borderColor: MARKER_COLOR.done.dot }} />
          {t(lang, "dashboardV2.map.status.done")}
        </span>
        <span className="dv2-map-scale">{t(lang, "dashboardV2.map.legendHint")}</span>
      </div>
    </section>
  );
}
