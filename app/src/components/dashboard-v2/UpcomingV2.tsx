import { Camera, Car, Check, ChevronRight, Circle, Coins, MapPin, Plus, Send } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { t, type Lang } from "../../i18n";
import { formatCHF } from "../../lib/format";
import type { DashboardMetrics } from "./useDashboardMetrics";
import { paletteForStatus } from "../orders/mapStatusColors";
import type { Order } from "../../api/orders";
import { buildMissionTimeline, type GeoPoint, type MissionItem, type MissionStatus } from "./missionTimeline";
import { WxBadge } from "./WxBadge";
import type { WeatherForecastDay } from "../../api/weather";
import { useWeatherForMissions, type MissionLocationKey } from "../../hooks/useWeatherForMissions";

interface UpcomingV2Props {
  metrics: DashboardMetrics;
  lang: Lang;
  weather?: WeatherForecastDay[] | null;
  /** Aktuelle Live-Position des Users — wenn gesetzt, ersetzt sie die ZIP-zu-ZIP-
   *  Schätzung für den „next"-Slot durch eine Standort-zu-Termin-Schätzung. */
  liveOrigin?: GeoPoint | null;
  /** Callback, falls der User Live-Standort noch nicht freigegeben hat — Empty-/
   *  Drive-Pill kann dann „Standort teilen"-CTA anzeigen. */
  onShareLocation?: () => void;
  onHover?: (orderNo: string | null) => void;
  onCreateOrder?: () => void;
}

/** Kompakter Status-Pill für die "Nächste Termine"-Sektion (unverändert). */
function StatusPill({ status, lang }: { status: string; lang: Lang }) {
  const p = paletteForStatus(status);
  return (
    <span
      className="dv2-upc-status"
      style={{ background: p.bg, color: p.ring, borderColor: p.ring }}
    >
      {t(lang, p.labelKey)}
    </span>
  );
}

function staffShort(o: Order): string {
  const key = o.photographer?.key?.trim();
  if (key) return key;
  const name = o.photographer?.name?.trim();
  if (!name) return "—";
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/** Extrahiert eine Bilderzahl aus Service-Package-Label/Addons (z. B. "Premium 25 Bilder"). */
const PHOTOS_RE = /(\d{1,3})\s*(Bilder|Bilds|Foto|Fotos|Photos|Pics)/i;
function extractPhotoCount(o: Order): number | null {
  const haystacks: (string | undefined | null)[] = [
    o.services?.package?.label,
    ...(o.services?.addons?.map((a) => a.label) ?? []),
  ];
  for (const h of haystacks) {
    if (!h) continue;
    const m = PHOTOS_RE.exec(h);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 500) return n;
    }
  }
  return null;
}

/** Kurzer Ort aus PLZ-Stadt-String — z. B. "8610 Uster" → "Uster". */
function shortLocality(zipcity: string | undefined | null): string | null {
  if (!zipcity) return null;
  const m = /^\s*\d{4,5}\s+(.+)$/.exec(zipcity.trim());
  if (m) return m[1];
  const trimmed = zipcity.trim();
  return trimmed || null;
}

/** Strassen-Teil aus Adresse extrahieren — z. B. "Zelglackerstrasse 23B, 8610 Uster" → "Zelglackerstrasse 23B". */
function shortStreet(address: string | undefined | null): string | null {
  if (!address) return null;
  const part = address.split(",")[0]?.trim();
  return part || null;
}

interface MissionItemView extends MissionItem {
  photoCount: number | null;
  weatherDay: WeatherForecastDay | null;
}

function StatusBadge({ status, lang }: { status: MissionStatus; lang: Lang }) {
  const cls = `dv2-mt-status dv2-mt-status--${status}`;
  if (status === "done") {
    return (
      <span className={cls}>
        <Check size={11} aria-hidden />
        {t(lang, "dashboardV2.mission.status.done")}
      </span>
    );
  }
  if (status === "next") {
    return (
      <span className={cls}>
        <ChevronRight size={11} aria-hidden />
        {t(lang, "dashboardV2.mission.status.next")}
      </span>
    );
  }
  if (status === "todo") {
    return (
      <span className={cls}>
        <Circle size={9} aria-hidden />
        {t(lang, "dashboardV2.mission.status.todo")}
      </span>
    );
  }
  return (
    <span className={cls}>
      <Circle size={9} aria-hidden />
      {t(lang, "dashboardV2.mission.status.planned")}
    </span>
  );
}

type UpcomingGroupKey = "tomorrow" | "thisWeek" | "later";

interface UpcomingGroup {
  key: UpcomingGroupKey;
  labelKey: string;
  items: Order[];
}

const MS_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function groupUpcoming(orders: Order[], today: Date): UpcomingGroup[] {
  const todayMs = startOfDay(today).getTime();
  const tomorrowMs = todayMs + MS_DAY;
  const dayAfterMs = todayMs + 2 * MS_DAY;
  const nextWeekMs = todayMs + 7 * MS_DAY;
  const groups: Record<UpcomingGroupKey, Order[]> = {
    tomorrow: [],
    thisWeek: [],
    later: [],
  };
  for (const o of orders) {
    if (!o.appointmentDate) continue;
    const ts = new Date(o.appointmentDate).getTime();
    if (ts >= tomorrowMs && ts < dayAfterMs) groups.tomorrow.push(o);
    else if (ts >= dayAfterMs && ts < nextWeekMs) groups.thisWeek.push(o);
    else if (ts >= nextWeekMs) groups.later.push(o);
  }
  const list: UpcomingGroup[] = [];
  if (groups.tomorrow.length) list.push({ key: "tomorrow", labelKey: "dashboardV2.upcoming.tomorrow", items: groups.tomorrow });
  if (groups.thisWeek.length) list.push({ key: "thisWeek", labelKey: "dashboardV2.upcoming.thisWeek", items: groups.thisWeek });
  if (groups.later.length) list.push({ key: "later", labelKey: "dashboardV2.upcoming.later", items: groups.later });
  return list;
}

export function UpcomingV2({
  metrics,
  lang,
  weather,
  liveOrigin,
  onShareLocation,
  onHover,
  onCreateOrder,
}: UpcomingV2Props) {
  const navigate = useNavigate();
  const { today, todayOrders, upcomingOrders } = metrics;
  const todayLabel = `${today.getDate()}. ${MONTHS_SHORT[today.getMonth()]}`;

  const weatherByDate = useMemo(() => {
    const m = new Map<string, WeatherForecastDay>();
    for (const d of weather ?? []) {
      if (d?.date) m.set(d.date, d);
    }
    return m;
  }, [weather]);

  const missionTimeline = useMemo(
    () => buildMissionTimeline(todayOrders, today, { liveOrigin: liveOrigin ?? null }),
    [todayOrders, today, liveOrigin],
  );

  const missionLocationKeys = useMemo<MissionLocationKey[]>(() => {
    return missionTimeline.map((item) => {
      const orderNo = item.order.orderNo;
      const dateIso = item.order.appointmentDate
        ? new Date(item.order.appointmentDate).toISOString().slice(0, 10)
        : null;
      return {
        key: orderNo == null ? "" : String(orderNo),
        zip: item.zip,
        dateIso,
      };
    });
  }, [missionTimeline]);

  const perOrderWeather = useWeatherForMissions(missionLocationKeys);

  const missionItems = useMemo<MissionItemView[]>(() => {
    return missionTimeline.map((item) => {
      const orderKey = item.order.orderNo == null ? "" : String(item.order.orderNo);
      const dateKey = item.order.appointmentDate
        ? new Date(item.order.appointmentDate).toISOString().slice(0, 10)
        : null;
      // Per-Order-Wetter (von der Auftragsadresse) hat Vorrang; nur wenn die
      // PLZ unbekannt oder der Forecast (noch) nicht geladen ist, fallen wir
      // auf das globale Zürich-Wetter zurück.
      const orderWx = orderKey ? perOrderWeather.get(orderKey) ?? null : null;
      const fallbackWx = dateKey ? (weatherByDate.get(dateKey) ?? null) : null;
      return {
        ...item,
        photoCount: extractPhotoCount(item.order),
        weatherDay: orderWx ?? fallbackWx,
      };
    });
  }, [missionTimeline, weatherByDate, perOrderWeather]);

  const upcomingGroups = useMemo(() => groupUpcoming(upcomingOrders, today), [upcomingOrders, today]);

  const goToOrder = (orderNo: string | number | undefined | null) => {
    if (orderNo == null || orderNo === "") return;
    navigate(`/orders/${orderNo}`);
  };
  const onEnter = (orderNo: string | number | undefined | null) => {
    if (!onHover) return;
    onHover(orderNo == null || orderNo === "" ? null : String(orderNo));
  };
  const onLeave = () => onHover?.(null);
  const minLabel = t(lang, "dashboardV2.mission.minShort");

  /** Live-Standort-CTA: zeigt sich auf dem `next`-Slot, wenn keine Geo-Position
   *  vorliegt. Klick → request() im Parent (DashboardV2). */
  const showLocateCta = !liveOrigin && Boolean(onShareLocation);

  return (
    <div className="dv2-card dv2-mt-card">
      <header className="dv2-mt-section-head">
        <span className="dv2-mt-section-eyebrow">{t(lang, "dashboardV2.mission.heute.eyebrow")}</span>
        <h3 className="dv2-mt-section-title">
          {t(lang, "dashboardV2.upcoming.today").replace("{{date}}", todayLabel)}
        </h3>
      </header>

      {missionItems.length === 0 ? (
        <div className="dv2-mt-empty">
          <p className="dv2-mt-empty-text">{t(lang, "dashboardV2.mission.empty")}</p>
          {onCreateOrder ? (
            <button
              type="button"
              className="dv2-btn-primary dv2-mt-empty-cta"
              onClick={onCreateOrder}
            >
              <Plus size={14} aria-hidden />
              {t(lang, "dashboardV2.mission.empty.cta")}
            </button>
          ) : null}
        </div>
      ) : (
        <ol className="dv2-mt-list" aria-label={t(lang, "dashboardV2.mission.aria.list")}>
          {missionItems.map((item) => {
            const o = item.order;
            const apptDate = o.appointmentDate ? new Date(o.appointmentDate) : null;
            const time = apptDate
              ? apptDate.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })
              : "—";
            const dur = o.schedule?.durationMin ?? null;
            const locality = shortLocality(o.customerZipcity);
            const street = shortStreet(o.address);
            const photos = item.photoCount;
            const isNext = item.status === "next";
            /** Drive-Pill priorisiert Live-Standort für „next"; sonst ZIP-zu-ZIP-
             *  Schätzung ab Vortermin/Studio. */
            const driveLive = item.driveMinFromLive;
            const drivePrev = item.driveMinFromPrev;
            const drive = isNext ? (driveLive ?? drivePrev) : drivePrev;
            const driveSource: "live" | "prev" =
              isNext && driveLive != null ? "live" : "prev";
            const departAt = item.departAt;
            const total = o.total ?? null;
            const rowCls = `dv2-mt-row dv2-mt-row--${item.status}`;

            return (
              <li key={o.orderNo}>
                <button
                  type="button"
                  className={rowCls}
                  onClick={() => goToOrder(o.orderNo)}
                  onMouseEnter={() => onEnter(o.orderNo)}
                  onMouseLeave={onLeave}
                  onFocus={() => onEnter(o.orderNo)}
                  onBlur={onLeave}
                >
                  <span className="dv2-mt-time">
                    <span className="dv2-mt-time-h">{time}</span>
                    {dur != null ? (
                      <span className="dv2-mt-time-dur">
                        {dur} {minLabel}
                      </span>
                    ) : null}
                  </span>

                  <span className="dv2-mt-info">
                    <span className="dv2-mt-who">
                      <span className="dv2-mt-orderno">#{o.orderNo}</span>
                      {locality ? (
                        <>
                          <span className="dv2-mt-sep">·</span>
                          <span className="dv2-mt-locality">{locality}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="dv2-mt-where">
                      {street ?? "—"}
                      {o.customerName ? (
                        <>
                          <span className="dv2-mt-sep"> · </span>
                          <span className="dv2-mt-customer">{o.customerName}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="dv2-mt-meta">
                      {photos != null ? (
                        <span
                          className="dv2-mt-pill"
                          aria-label={`${photos} ${t(lang, "dashboardV2.mission.photos")}`}
                        >
                          <Camera size={11} aria-hidden />
                          {photos} {t(lang, "dashboardV2.mission.photos")}
                        </span>
                      ) : null}
                      {drive != null ? (
                        <span
                          className={`dv2-mt-pill${driveSource === "live" ? " dv2-mt-pill--live" : ""}`}
                          aria-label={`${drive} ${minLabel} ${t(lang, "dashboardV2.mission.drive")}`}
                          title={t(
                            lang,
                            driveSource === "live"
                              ? "dashboardV2.mission.driveLiveHint"
                              : "dashboardV2.mission.driveHint",
                          )}
                        >
                          {driveSource === "live" ? (
                            <MapPin size={11} aria-hidden />
                          ) : (
                            <Car size={11} aria-hidden />
                          )}
                          {drive} {minLabel}
                        </span>
                      ) : null}
                      {departAt && isNext ? (
                        <span
                          className="dv2-mt-pill dv2-mt-pill--depart"
                          aria-label={t(lang, "dashboardV2.mission.depart.aria").replace(
                            "{{time}}",
                            departAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }),
                          )}
                          title={t(lang, "dashboardV2.mission.depart.hint")}
                        >
                          <Send size={11} aria-hidden />
                          {t(lang, "dashboardV2.mission.depart.label")}{" "}
                          {departAt.toLocaleTimeString("de-CH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : null}
                      {isNext && showLocateCta && drive == null ? (
                        <button
                          type="button"
                          className="dv2-mt-pill dv2-mt-pill--locate"
                          onClick={(e) => {
                            e.stopPropagation();
                            onShareLocation?.();
                          }}
                          title={t(lang, "dashboardV2.mission.locate.hint")}
                        >
                          <MapPin size={11} aria-hidden />
                          {t(lang, "dashboardV2.mission.locate.cta")}
                        </button>
                      ) : null}
                      {total != null && total > 0 ? (
                        <span className="dv2-mt-pill" aria-label={formatCHF(total)}>
                          <Coins size={11} aria-hidden />
                          {formatCHF(total)}
                        </span>
                      ) : null}
                      {item.weatherDay ? (
                        <span className="dv2-mt-pill dv2-mt-pill--wx">
                          <WxBadge forecast={item.weatherDay} size="sm" />
                        </span>
                      ) : null}
                      <span className="dv2-mt-pill dv2-mt-pill--staff" aria-hidden>
                        {staffShort(o)}
                      </span>
                    </span>
                  </span>

                  <span className="dv2-mt-status-col">
                    <StatusBadge status={item.status} lang={lang} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {upcomingGroups.length > 0 && (
        <section className="dv2-mt-upcoming">
          <header className="dv2-mt-section-head dv2-mt-section-head--sub">
            <span className="dv2-mt-section-eyebrow dv2-mt-section-eyebrow--muted">
              {t(lang, "dashboardV2.mission.upcoming.eyebrow")}
            </span>
          </header>
          {upcomingGroups.map((g) => (
            <div key={g.key} className="dv2-mt-upcoming-group">
              <div className="dv2-mt-upcoming-group-label">{t(lang, g.labelKey)}</div>
              {g.items.map((o, i) => {
                const d = o.appointmentDate ? new Date(o.appointmentDate) : null;
                const weekday = d ? WEEKDAYS_SHORT[d.getDay()] : "";
                const day = d ? String(d.getDate()) : "";
                const time = d
                  ? d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })
                  : "";
                const dur = o.schedule?.durationMin ?? null;
                return (
                  <button
                    key={o.orderNo}
                    type="button"
                    className={`dv2-upcoming-item${i < g.items.length - 1 ? " dv2-upcoming-item--border" : ""}`}
                    onClick={() => goToOrder(o.orderNo)}
                    onMouseEnter={() => onEnter(o.orderNo)}
                    onMouseLeave={onLeave}
                    onFocus={() => onEnter(o.orderNo)}
                    onBlur={onLeave}
                  >
                    <div className="dv2-upcoming-date-chip">
                      <div className="dv2-upcoming-weekday">{weekday}</div>
                      <div className="dv2-upcoming-day">{day}</div>
                    </div>
                    <div className="dv2-upcoming-info">
                      <div className="dv2-upcoming-primary">
                        <span className="dv2-upcoming-orderno">#{o.orderNo}</span>
                        {o.customerName ? <span> · {o.customerName}</span> : null}
                      </div>
                      <div className="dv2-upcoming-meta">
                        {o.address ?? "—"}
                        {dur ? ` · ${dur} ${minLabel}` : ""}
                        {` · ${staffShort(o)}`}
                      </div>
                    </div>
                    <div className="dv2-upcoming-side">
                      <span className="dv2-upcoming-time">{time}</span>
                      <StatusPill status={o.status} lang={lang} />
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
