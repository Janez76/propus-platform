import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, MapPin, SlidersHorizontal } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getOrders, type Order } from "../../api/orders";
import { getStatusBadgeClass, getStatusLabel } from "../../lib/status";
import { useGeolocation } from "../../components/cockpit/useGeolocation";
import {
  estimateDriveMinutes,
  estimateDriveMinutesFromGeo,
  extractZip,
} from "../../components/dashboard-v2/missionTimeline";
import { MobilePullToRefresh } from "./MobilePullToRefresh";
import { MobileSearchBar, MobileState } from "./MobileUI";
import {
  MobileDaySectionHeader,
  MobileDepartureChip,
  MobileHomeDivider,
  MobileKpiPills,
  type MobileKpiPillSpec,
  MobileObjectAddr,
  MobileOrdersSkeleton,
  MobileTourDivider,
  MobileTravelChip,
  type TravelSource,
} from "./MobileOrdersUI";
import {
  EMPTY_FILTERS,
  MobileFilterSheet,
  type MobileFilterState,
  type MobileFilterStatusOption,
  type MobileFilterPhotographerOption,
} from "./MobileFilterSheet";
import {
  bucketBadge,
  bucketLabel,
  bucketOrdersByDay,
  DEFAULT_HIDDEN_STATUSES,
  type BucketedDay,
  type BucketedOrder,
} from "./dayBuckets";
import {
  computeDeparture,
  computeTourGap,
  DEFAULT_BUFFER_MIN,
  parseDurationToMin,
} from "./departureLogic";
import { useDriveTimesFromLive } from "./useDriveTimesFromLive";

const HIDDEN_STATUSES = DEFAULT_HIDDEN_STATUSES;
const SAME_DAY_BUCKETS = new Set<string>(["today", "tomorrow"]);

interface HomeAddrPayload {
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
}

/**
 * Mobile-Orders-Redesign (Phase 1):
 *   - Day-Groups (Heute/Morgen/Diese Woche/Spaeter) statt flacher Liste
 *   - Live-Geolocation + Drive-Times aus useDriveTimesFromLive (Phase 2 ready)
 *   - Travel- und Departure-Chips pro Auftrag mit Eskalation
 *   - Tour-Divider zwischen Same-Day-Terminen
 *   - Heimfahrt-Divider am Ende von Heute/Morgen
 *
 * Reuse aus PR #376 / Polish-Pass 2:
 *   - useGeolocation (cockpit) — Live-GPS mit typisierten Errors
 *   - missionTimeline.ts (dashboard-v2) — Schweizer ZIP-Tabelle + Haversine-Schaetzung
 *   - /api/dashboard/drive-times API — Distance-Matrix mit Bug-Hunt M01 Rate-Limit
 *
 * Doku: docs/FLOWS_BOOKING.md §20 Mobile Tagesplan & Live-Routing
 */
export function MobileOrdersTab() {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  /** Mitarbeiter-Heim-Adresse fuer Tagesende-Heimfahrt-Divider. */
  const [home, setHome] = useState<HomeAddrPayload>({
    homeAddress: null,
    homeLat: null,
    homeLng: null,
  });

  /** Live-Geo: nur aktiv wenn User opt-in. Persistiert via storageKey. */
  const geo = useGeolocation({ storageKey: "propus.mobile.orders.geo.enabled.v1" });

  /** Phase 3: Filter-Sheet + KPI-Quickfilter. */
  const [filters, setFilters] = useState<MobileFilterState>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Aktive KPI-Pille (id) oder null = kein KPI-Quickfilter. */
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

  /**
   * Phase 5 Polish: 60-s-Tick fuer Departure-Eskalation.
   * Re-render alle 60 s erzwingt computeDeparture()-Neuberechnung mit
   * frischem `now`, damit die Eskalation now/soon/ok/passed live wechselt
   * ohne dass der User die Seite reload muss. Mobile haengt evtl. 30+ min
   * im Hintergrund — ohne Tick wuerden Termine hinter ihrer "now"-Schwelle
   * weiter als "soon" angezeigt.
   * Respektiert Document-Visibility: pausiert bei `hidden`, springt sofort
   * an beim `visible`-Event (Battery-Friendly).
   *
   * Wichtig: nowMs wird als Prop bis runter zu DayRowEntry gereicht, damit
   * React.memo den Tick als Prop-Aenderung erkennt — sonst bliebe die
   * Eskalation in memoizten Rows stehen waehrend die Zeit weiterlaeuft
   * (P1 — caught by Codex review on PR #400).
   */
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    let timerId: number | null = null;
    const tick = () => setNowMs(Date.now());
    const start = () => {
      if (timerId != null) return;
      timerId = window.setInterval(tick, 60_000);
    };
    const stop = () => {
      if (timerId != null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

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
    void fetchOrders().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, fetchOrders]);

  /** Heim-Adresse einmal beim Mount holen (siehe FLOWS_BOOKING.md §20). */
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/me/home", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = (await res.json()) as HomeAddrPayload;
        if (cancelled) return;
        setHome({
          homeAddress: typeof data.homeAddress === "string" ? data.homeAddress : null,
          homeLat: typeof data.homeLat === "number" ? data.homeLat : null,
          homeLng: typeof data.homeLng === "number" ? data.homeLng : null,
        });
      } catch {
        /* still functional ohne Heim-Adresse */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /** Suche + Filter-Sheet + KPI-Quickfilter alle gemeinsam angewendet. */
  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasStatusFilter = filters.statuses.size > 0;
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const tomorrow0 = today0.getTime() + 24 * 60 * 60 * 1000;

    return orders.filter((o) => {
      // Suche
      if (q) {
        const match =
          o.orderNo.toLowerCase().includes(q) ||
          (o.customerName || "").toLowerCase().includes(q) ||
          (o.address || "").toLowerCase().includes(q);
        if (!match) return false;
      }

      // Filter-Sheet: Status
      if (hasStatusFilter && !filters.statuses.has(o.status)) return false;

      // Filter-Sheet: Mitarbeiter
      if (filters.photographerKey && o.photographer?.key !== filters.photographerKey) {
        return false;
      }

      // KPI-Quickfilter
      if (activeKpi === "today_due") {
        const ts = o.appointmentDate ? new Date(o.appointmentDate).getTime() : 0;
        if (!ts || ts < today0.getTime() || ts >= tomorrow0) return false;
      } else if (activeKpi === "no_photog") {
        if (o.photographer?.key) return false;
      } else if (activeKpi === "open_only") {
        // Nur offene/ausstehende Status
        if (["completed", "done", "cancelled", "archived", "closed"].includes(o.status)) return false;
      }

      return true;
    });
  }, [orders, query, filters, activeKpi]);

  const buckets: BucketedDay[] = useMemo(
    () => bucketOrdersByDay(filteredOrders, { hideStatuses: HIDDEN_STATUSES }),
    [filteredOrders],
  );

  /** KPI-Pills aus den gefilterten Orders ableiten. Kennzahlen aus dem
   *  *ungefilterten* Bestand (orders) — Filter-State soll Zaehlung nicht
   *  veraendern, sonst widerspruechlich (KPI sagt 5 offen, Liste zeigt 0). */
  const kpiPills: MobileKpiPillSpec[] = useMemo(() => {
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const tomorrow0 = today0.getTime() + 24 * 60 * 60 * 1000;

    let openCount = 0;
    let todayDue = 0;
    let noPhotog = 0;
    let openTotal = 0;

    for (const o of orders) {
      if (HIDDEN_STATUSES.has(o.status)) continue;
      const isOpen = !["completed", "done", "cancelled", "archived"].includes(o.status);
      if (isOpen) {
        openCount += 1;
        openTotal += o.total || 0;
      }
      const ts = o.appointmentDate ? new Date(o.appointmentDate).getTime() : 0;
      if (ts >= today0.getTime() && ts < tomorrow0) todayDue += 1;
      if (isOpen && !o.photographer?.key) noPhotog += 1;
    }

    return [
      {
        id: "open_only",
        label: "Offen",
        value: String(openCount),
        sub: openTotal > 0 ? `CHF ${Math.round(openTotal).toLocaleString("de-CH")}` : undefined,
      },
      {
        id: "today_due",
        label: "Heute fällig",
        value: String(todayDue),
        sub: todayDue > 0 ? "Tippen zum Filtern" : "Tag frei",
      },
      {
        id: "no_photog",
        label: "Ohne Fotograf",
        value: String(noPhotog),
        sub: noPhotog > 0 ? "Tippen zum Filtern" : "alle zugewiesen",
      },
    ];
  }, [orders]);

  /** Status- und Mitarbeiter-Optionen fuer das Filter-Sheet aus den Daten. */
  const statusOptions: MobileFilterStatusOption[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of orders) {
      if (!seen.has(o.status)) seen.set(o.status, getStatusLabel(o.status));
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [orders]);

  const photographerOptions: MobileFilterPhotographerOption[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of orders) {
      const k = o.photographer?.key;
      if (k && !seen.has(k)) seen.set(k, o.photographer?.name || k);
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [orders]);

  const activeFilterCount = filters.statuses.size + (filters.photographerKey ? 1 : 0);

  /** Live-Drive-Times nur fuer Heute & Morgen anfragen — Cost-Optimierung. */
  const liveLegs = useMemo(() => {
    const out: Array<{ orderNo: string; address: string }> = [];
    for (const day of buckets) {
      if (!SAME_DAY_BUCKETS.has(day.bucket)) continue;
      for (const it of day.items) {
        if (it.order.address) {
          out.push({ orderNo: String(it.order.orderNo), address: it.order.address });
        }
      }
    }
    return out;
  }, [buckets]);

  const liveDrive = useDriveTimesFromLive({
    lat: geo.position?.lat ?? null,
    lng: geo.position?.lng ?? null,
    enabled: !!geo.enabled && !!geo.position,
    legs: liveLegs,
  });

  /** Effektive Fahrzeit: Live > Schaetzung > null. */
  const resolveTravelMin = useCallback(
    (order: Order, prevOrder: Order | null): { min: number | null; isLive: boolean } => {
      const liveText = liveDrive.byOrderNo[String(order.orderNo)]?.durationText;
      const liveMin = parseDurationToMin(liveText);
      if (liveMin != null) return { min: liveMin, isLive: true };
      const targetZip = extractZip(order.address) ?? extractZip(order.customerZipcity);
      if (!targetZip) return { min: null, isLive: false };
      if (prevOrder) {
        const prevZip = extractZip(prevOrder.address) ?? extractZip(prevOrder.customerZipcity);
        if (prevZip) {
          const m = estimateDriveMinutes(prevZip, targetZip);
          if (m != null) return { min: m, isLive: false };
        }
      }
      if (geo.position) {
        const m = estimateDriveMinutesFromGeo(geo.position, targetZip);
        if (m != null) return { min: m, isLive: false };
      }
      const m = estimateDriveMinutes("8005", targetZip);
      return { min: m, isLive: false };
    },
    [liveDrive.byOrderNo, geo.position],
  );

  const resolveHomeMin = useCallback(
    (lastOrder: Order): number | null => {
      if (!home.homeAddress) return null;
      const lastZip = extractZip(lastOrder.address) ?? extractZip(lastOrder.customerZipcity);
      const homeZip = extractZip(home.homeAddress);
      if (lastZip && homeZip) return estimateDriveMinutes(lastZip, homeZip);
      return null;
    },
    [home.homeAddress],
  );

  if (loading) return <MobileOrdersSkeleton />;
  if (error) return <MobileState icon={ClipboardList} message={`Fehler: ${error}`} />;

  return (
    <MobilePullToRefresh onRefresh={fetchOrders}>
      <div className="mob-page">
        <div className="mob-filter-bar">
          <MobileSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Auftrag, Kunde, Adresse…"
            ariaLabel="Aufträge suchen"
          />
          <button
            type="button"
            className={`mob-filter-trigger${activeFilterCount > 0 ? " mob-filter-trigger--active" : ""}`}
            onClick={() => setSheetOpen(true)}
            aria-label="Filter öffnen"
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={18} aria-hidden />
            {activeFilterCount > 0 && <span className="mob-filter-badge">{activeFilterCount}</span>}
          </button>
        </div>

        <MobileKpiPills
          pills={kpiPills}
          activeId={activeKpi}
          onSelect={(id) => setActiveKpi((prev) => (prev === id ? null : id))}
        />

        <GeoBarCompact geo={geo} />

        {filteredOrders.length === 0 ? (
          <MobileState
            icon={ClipboardList}
            message={
              orders.length === 0
                ? "Keine Aufträge gefunden."
                : "Keine Treffer mit aktuellen Filtern."
            }
          />
        ) : (
          <DaySectionsList
            buckets={buckets}
            home={home}
            navigate={navigate}
            resolveTravelMin={resolveTravelMin}
            resolveHomeMin={resolveHomeMin}
            geoPosLabel={geo.position ? "GPS-Standort" : "Studio · 8005"}
            nowMs={nowMs}
          />
        )}

        <MobileFilterSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          state={filters}
          onChange={setFilters}
          statusOptions={statusOptions}
          photographerOptions={photographerOptions}
        />
      </div>
    </MobilePullToRefresh>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function GeoBarCompact({ geo }: { geo: ReturnType<typeof useGeolocation> }) {
  const onToggle = useCallback(() => {
    if (geo.enabled) {
      geo.clear();
    } else {
      void geo.request();
    }
  }, [geo]);

  if (!geo.enabled && !geo.loading) {
    return (
      <div className="mob-geo">
        <div className="mob-geo-pin">
          <MapPin size={14} aria-hidden />
        </div>
        <div className="mob-geo-main">
          <span className="mob-geo-lab">Standort</span>
          <span className="mob-geo-val" style={{ color: "var(--text-muted)", fontWeight: 500 }}>
            Aus · Schätzung ab Studio
          </span>
        </div>
        <button type="button" className="mob-geo-action" onClick={onToggle}>
          Aktivieren
        </button>
      </div>
    );
  }

  const accuracy = geo.position?.accuracy
    ? `±${Math.round(geo.position.accuracy)} m`
    : geo.loading
      ? "Suche…"
      : "—";

  return (
    <div className="mob-geo">
      <div className="mob-geo-pin">
        <MapPin size={14} aria-hidden />
      </div>
      <div className="mob-geo-main">
        <span className="mob-geo-lab">Live-Standort</span>
        <span className="mob-geo-val">
          {geo.position
            ? `${geo.position.lat.toFixed(4)}, ${geo.position.lng.toFixed(4)} · ${accuracy}`
            : geo.error || "Wird geladen…"}
        </span>
      </div>
      <button type="button" className="mob-geo-action mob-geo-action--off" onClick={onToggle}>
        Aus
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface DaySectionsListProps {
  buckets: BucketedDay[];
  home: HomeAddrPayload;
  navigate: ReturnType<typeof useNavigate>;
  resolveTravelMin: (order: Order, prev: Order | null) => { min: number | null; isLive: boolean };
  resolveHomeMin: (lastOrder: Order) => number | null;
  geoPosLabel: string;
  /** Aus dem 60-s-Tick — wird bis DayRowEntry gereicht, damit memo den
   *  Zeitwechsel als Prop-Aenderung erkennt. */
  nowMs: number;
}

function DaySectionsList({
  buckets,
  home,
  navigate,
  resolveTravelMin,
  resolveHomeMin,
  geoPosLabel,
  nowMs,
}: DaySectionsListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ later: true });
  const today = new Date();

  return (
    <>
      {buckets.map((day) => {
        if (day.items.length === 0) {
          if (day.bucket === "today" || day.bucket === "tomorrow") {
            const badge = bucketBadge(day.bucket, today);
            return (
              <section key={day.bucket}>
                <MobileDaySectionHeader
                  bucket={day.bucket}
                  badgeDay={badge.day}
                  badgeMonth={badge.month}
                  title={bucketLabel(day.bucket, today)}
                  meta="Tag frei · keine Termine"
                />
              </section>
            );
          }
          return null;
        }

        const sameDay = SAME_DAY_BUCKETS.has(day.bucket);
        const badge = bucketBadge(day.bucket, today);
        const isCollapsed = collapsed[day.bucket] === true;
        const onToggle = () =>
          setCollapsed((s) => ({ ...s, [day.bucket]: !isCollapsed }));

        const meta = `${day.items.length} ${day.items.length === 1 ? "Termin" : "Termine"} · CHF ${day.totalSum.toLocaleString("de-CH", { maximumFractionDigits: 0 })}${sameDay ? " · Tour-Routing aktiv" : ""}`;

        return (
          <section key={day.bucket}>
            <MobileDaySectionHeader
              bucket={day.bucket}
              badgeDay={badge.day}
              badgeMonth={badge.month}
              title={bucketLabel(day.bucket, today)}
              meta={meta}
              collapsed={isCollapsed}
              onToggle={day.bucket === "later" || day.bucket === "week" ? onToggle : undefined}
            />
            {!isCollapsed && (
              <ul className="mob-section-list" style={{ paddingTop: 0 }}>
                {day.items.map((item, idx) => {
                  const prev = idx > 0 ? day.items[idx - 1].order : null;
                  const { min: travelMin, isLive } = resolveTravelMin(item.order, prev);
                  return (
                    <DayRowEntry
                      key={item.order.orderNo}
                      item={item}
                      prevOrder={prev}
                      travelMin={travelMin}
                      isLive={isLive}
                      bucket={day.bucket}
                      navigate={navigate}
                      geoPosLabel={geoPosLabel}
                      nowMs={nowMs}
                      tourGapTo={
                        sameDay && idx < day.items.length - 1
                          ? {
                              nextItem: day.items[idx + 1],
                              nextTravel: resolveTravelMin(day.items[idx + 1].order, item.order),
                            }
                          : null
                      }
                    />
                  );
                })}
                {sameDay && (() => {
                  const last = day.items[day.items.length - 1].order;
                  const homeMin = resolveHomeMin(last);
                  return (
                    <li style={{ listStyle: "none" }}>
                      <MobileHomeDivider homeTravelMin={homeMin} homeAddress={home.homeAddress} />
                    </li>
                  );
                })()}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface DayRowEntryProps {
  item: BucketedOrder;
  prevOrder: Order | null;
  travelMin: number | null;
  isLive: boolean;
  bucket: BucketedDay["bucket"];
  navigate: ReturnType<typeof useNavigate>;
  geoPosLabel: string;
  /** Aktueller "Jetzt"-Wert vom Parent-Tick. Pflicht-Prop, damit memo
   *  die 60-s-Eskalation nicht stale haengen laesst. */
  nowMs: number;
  tourGapTo: {
    nextItem: BucketedOrder;
    nextTravel: { min: number | null; isLive: boolean };
  } | null;
}

const DayRowEntry = memo(function DayRowEntry({
  item,
  prevOrder,
  travelMin,
  isLive,
  bucket,
  navigate,
  geoPosLabel,
  nowMs,
  tourGapTo,
}: DayRowEntryProps) {
  const o = item.order;
  const isToday = bucket === "today";

  const departure = computeDeparture({
    appointmentDate: o.appointmentDate ?? null,
    travelMin,
    bufferMin: DEFAULT_BUFFER_MIN,
    now: new Date(nowMs),
  });

  const source: TravelSource = prevOrder
    ? { kind: "chain", orderNo: String(prevOrder.orderNo) }
    : { kind: "live", label: geoPosLabel };

  const addrParts = (o.address || "").split(",");
  const street = (addrParts[0] || "").trim();
  const zipcity = addrParts.slice(1).join(",").trim();

  const tourGap = tourGapTo
    ? computeTourGap(o.appointmentDate, tourGapTo.nextItem.order.appointmentDate, tourGapTo.nextTravel.min)
    : null;

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/orders/${o.orderNo}`)}
        className="mob-list-item"
      >
        <span className="mob-time-chip">
          <span className="mob-time-chip-h">{item.time || "—"}</span>
          {(bucket === "today" || bucket === "tomorrow") && (
            <span className="mob-time-chip-sub">{bucket === "today" ? "Heute" : "Morgen"}</span>
          )}
        </span>
        <div className="mob-list-content">
          <div className="mob-list-title">
            <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono, ui-monospace, monospace)", fontWeight: 700, fontSize: 11 }}>
              #{o.orderNo}
            </span>
            {o.customerName && (
              <>
                <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>·</span>
                <span>{o.customerName}</span>
              </>
            )}
          </div>
          {street && (
            <div className="mob-list-sub">
              <MobileObjectAddr street={street} zipcity={zipcity} />
            </div>
          )}
          <div className="mob-list-meta">
            <MobileTravelChip
              durationText={
                travelMin != null
                  ? travelMin >= 60
                    ? `${Math.floor(travelMin / 60)} h ${travelMin % 60} min`
                    : `${travelMin} min`
                  : null
              }
              source={source}
              isLive={isLive}
            />
            {(bucket === "today" || bucket === "tomorrow") && (
              <MobileDepartureChip
                status={departure.status}
                leaveAtText={departure.leaveAtText}
                minutesUntilLeave={departure.minutesUntilLeave}
              />
            )}
            <span className={`mob-pill ${getStatusBadgeClass(o.status)}`}>
              {getStatusLabel(o.status)}
            </span>
          </div>
        </div>
      </button>
      {tourGap && tourGapTo && (
        <MobileTourDivider
          gapText={tourGap.gapText}
          bufferMin={DEFAULT_BUFFER_MIN}
          nextTravelMin={tourGapTo.nextTravel.min}
          nextAddress={tourGapTo.nextItem.order.address || ""}
          tight={tourGap.tight}
        />
      )}
    </li>
  );
});
