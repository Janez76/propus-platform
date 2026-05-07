/**
 * Mobile-Orders-spezifische UI-Primitives (Phase 1 Redesign).
 *
 * Erweitert `MobileUI.tsx` um Komponenten, die nur die Order-Tab benoetigt:
 *   - `MobileDayBadge`        – farbige Tag/Monat-Badge (Heute = rot, Morgen = braun, Woche = neutral)
 *   - `MobileDaySectionHeader` – Section-Kopf mit Badge + Titel + Meta + Collapsible-Chevron
 *   - `MobileTravelChip`      – "🚗 32 min · ab Zürich HB" / "ab #100084" (chained)
 *   - `MobileDepartureChip`   – eskalierende Abfahrts-Pille (now/soon/ok/passed)
 *   - `MobileTourDivider`     – Pause zwischen Same-Day-Terminen ("2 h 30 min bis nächst …")
 *   - `MobileHomeDivider`     – Tagesende-Heimfahrt-Marker
 *
 * Tokens kommen aus `mobile-ui.css` + globalem Theme (--accent, --text-muted …).
 * Keine eigenen Farb-Hex-Werte ausser fuer die Eskalations-Stati (rot/gelb/gruen),
 * dort `color-mix` mit den definierten Status-Tokens.
 */
import { memo } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Car, Clock, Crosshair, House, TriangleAlert } from "lucide-react";
import "./mobile-ui.css";

import type { DayBucket } from "./dayBuckets";
import type { DepartureStatus } from "./departureLogic";

// ─────────────────────────────────────────────────────────────────────────────
// Day-Badge

interface MobileDayBadgeProps {
  bucket: DayBucket;
  day: string;
  month: string;
}

export const MobileDayBadge = memo(function MobileDayBadge({ bucket, day, month }: MobileDayBadgeProps) {
  return (
    <span className={`mob-day-badge mob-day-badge--${bucket}`} aria-hidden>
      <span className="mob-day-badge-d">{day}</span>
      {month && <span className="mob-day-badge-m">{month}</span>}
    </span>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Day-Section-Header (Heute / Morgen / Diese Woche / Spaeter)

interface MobileDaySectionHeaderProps {
  bucket: DayBucket;
  badgeDay: string;
  badgeMonth: string;
  title: string;
  meta?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function MobileDaySectionHeader({
  bucket,
  badgeDay,
  badgeMonth,
  title,
  meta,
  collapsed,
  onToggle,
}: MobileDaySectionHeaderProps) {
  const Wrapper: "button" | "div" = onToggle ? "button" : "div";
  return (
    <Wrapper
      type={onToggle ? "button" : undefined}
      onClick={onToggle}
      className={`mob-day-section-h mob-day-section-h--${bucket}${onToggle ? " mob-day-section-h--clickable" : ""}`}
      aria-expanded={onToggle ? !collapsed : undefined}
    >
      <MobileDayBadge bucket={bucket} day={badgeDay} month={badgeMonth} />
      <div className="mob-day-section-text">
        <span className="mob-day-section-title">{title}</span>
        {meta && <span className="mob-day-section-meta">{meta}</span>}
      </div>
      {onToggle && (
        <ArrowUpRight
          size={14}
          className="mob-day-section-chev"
          style={{ transform: collapsed ? "rotate(45deg)" : "rotate(135deg)" }}
          aria-hidden
        />
      )}
    </Wrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Travel-Chip (mit "ab Zürich HB" / "ab #12345" Subline)

export type TravelSource =
  | { kind: "live"; label: string } // GPS / Standort-Name
  | { kind: "chain"; orderNo: string } // ab vorigem Termin
  | { kind: "estimate"; label: string }; // ZIP-Schaetzung (z.B. "ab Studio")

interface MobileTravelChipProps {
  /** "12 min" / "1 h 5 min" — Duration-Text (von Google Maps oder Schaetzung). null = unbekannt. */
  durationText: string | null;
  source: TravelSource;
  /** Kennzeichnet Live-Verkehrsdaten (vs. Schaetzung) — nur visueller Hint. */
  isLive?: boolean;
}

export const MobileTravelChip = memo(function MobileTravelChip({ durationText, source, isLive }: MobileTravelChipProps) {
  if (!durationText) {
    return (
      <span className="mob-travel mob-travel--unknown" aria-label="Fahrzeit unbekannt">
        <Car size={11} aria-hidden /> —
      </span>
    );
  }
  return (
    <span className="mob-travel-stack">
      <span className={`mob-travel${isLive ? " mob-travel--live" : ""}`}>
        <Car size={11} aria-hidden />
        <span className="mob-travel-min">{durationText}</span>
      </span>
      <span className="mob-travel-from">
        {source.kind === "chain" ? (
          <>
            <ArrowRight size={9} aria-hidden /> ab <strong>#{source.orderNo}</strong>
          </>
        ) : (
          <>
            <Crosshair size={9} aria-hidden /> ab <strong>{source.kind === "live" ? source.label : source.label}</strong>
          </>
        )}
      </span>
    </span>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Departure-Chip (eskalierende Pille)

interface MobileDepartureChipProps {
  status: DepartureStatus;
  /** "13:39" oder "—". */
  leaveAtText: string;
  /** Negative Zahl = Abfahrt liegt zurueck; positive = noch X min. null = unbekannt. */
  minutesUntilLeave: number | null;
}

export const MobileDepartureChip = memo(function MobileDepartureChip({ status, leaveAtText, minutesUntilLeave }: MobileDepartureChipProps) {
  if (status === "unknown") {
    return (
      <span className="mob-dep mob-dep--unknown" aria-label="Abfahrt unbekannt">
        <Clock size={11} aria-hidden /> —
      </span>
    );
  }
  if (status === "passed") {
    return (
      <span className="mob-dep mob-dep--passed" aria-label={`Abfahrt ${leaveAtText} (verstrichen)`}>
        <Clock size={11} aria-hidden /> {leaveAtText}
      </span>
    );
  }
  if (status === "now") {
    return (
      <span className="mob-dep mob-dep--now" role="status" aria-live="polite">
        <TriangleAlert size={11} aria-hidden />
        <strong>Jetzt los · {leaveAtText}</strong>
      </span>
    );
  }
  if (status === "soon") {
    return (
      <span className="mob-dep mob-dep--soon">
        <Clock size={11} aria-hidden /> {leaveAtText}
        {minutesUntilLeave != null && minutesUntilLeave >= 0 ? (
          <small className="mob-dep-sub"> · in {minutesUntilLeave} min</small>
        ) : null}
      </span>
    );
  }
  return (
    <span className="mob-dep mob-dep--ok">
      <Clock size={11} aria-hidden /> {leaveAtText}
    </span>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Tour-Divider (zwischen Same-Day-Terminen)

interface MobileTourDividerProps {
  /** "2 h 30 min" — bereits formatiert. */
  gapText: string;
  bufferMin: number;
  /** Fahrzeit zum naechsten Termin (Live oder Schaetzung). null = unbekannt. */
  nextTravelMin: number | null;
  /** Volltext der naechsten Objektadresse. */
  nextAddress: string;
  /** Engpass (rot) wenn Pause minus Fahrt+Puffer zu klein. */
  tight?: boolean;
}

export const MobileTourDivider = memo(function MobileTourDivider({
  gapText,
  bufferMin,
  nextTravelMin,
  nextAddress,
  tight,
}: MobileTourDividerProps) {
  return (
    <div className={`mob-tour-gap${tight ? " mob-tour-gap--tight" : ""}`} aria-hidden={false}>
      <ArrowDown size={11} aria-hidden />
      <span className="mob-tour-gap-main">
        <strong>{gapText}</strong> bis nächster Termin
        <span className="mob-tour-gap-meta"> · inkl. {bufferMin} min Puffer</span>
      </span>
      {nextTravelMin != null && (
        <span className="mob-tour-gap-meta">
          {nextTravelMin} min Fahrt zu <span className="mob-tour-gap-addr">{nextAddress}</span>
        </span>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Heimfahrt-Divider (Tagesende)

interface MobileHomeDividerProps {
  /** Fahrzeit nach Hause in min — null wenn keine Heimadresse hinterlegt. */
  homeTravelMin: number | null;
  /** Heim-Adresse (z.B. "8038 Zürich") oder null. */
  homeAddress: string | null;
}

export function MobileHomeDivider({ homeTravelMin, homeAddress }: MobileHomeDividerProps) {
  if (!homeAddress) {
    return (
      <div className="mob-home-gap mob-home-gap--no-addr">
        <House size={11} aria-hidden />
        <span>
          <strong>Tagesende</strong>
          <span className="mob-home-gap-meta"> · keine Heim-Adresse hinterlegt</span>
        </span>
      </div>
    );
  }
  return (
    <div className="mob-home-gap">
      <House size={11} aria-hidden />
      <span>
        <strong>Tagesende</strong>
        {homeTravelMin != null && (
          <span className="mob-home-gap-meta"> · {homeTravelMin} min Heimfahrt zu </span>
        )}
        {homeTravelMin == null && (
          <span className="mob-home-gap-meta"> · Heimfahrt zu </span>
        )}
        <span className="mob-home-gap-addr">{homeAddress}</span>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline-Wrapper fuer Adress-Tag (Objekt vs. Rechnung-Hint in Listen-Card)

interface MobileObjectAddrProps {
  street: string;
  zipcity?: string;
  /** Optional: Trailing-Slot (z.B. Maps-Open-Link). */
  children?: ReactNode;
}

export const MobileObjectAddr = memo(function MobileObjectAddr({ street, zipcity, children }: MobileObjectAddrProps) {
  return (
    <span className="mob-obj-addr" title="Objektadresse — hier wird fotografiert">
      <span className="mob-obj-addr-tag">📷 Objekt</span>
      <span className="mob-obj-addr-val">
        <strong>{street}</strong>
        {zipcity && <span className="mob-obj-addr-sub"> · {zipcity}</span>}
      </span>
      {children}
    </span>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// KPI-Pills (Phase 3) — horizontal scrollender Snap-Strip mit klickbaren KPIs

export interface MobileKpiPillSpec {
  /** Stabile Filter-ID — gleichzeitig key + Indicator fuer "active". */
  id: string;
  label: string;
  value: string;
  /** Optionaler Sub-Text unter dem Wert. */
  sub?: string;
}

interface MobileKpiPillsProps {
  pills: MobileKpiPillSpec[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}

/**
 * Phase 5: Skeleton-Loader fuer den Mobile-Orders-Tab.
 * Wird waehrend des initialen Daten-Fetches angezeigt — visualisiert
 * Day-Section-Header + 3 Listen-Items, damit der User weiss, was kommt
 * (vs. blanker Spinner).
 */
export function MobileOrdersSkeleton() {
  return (
    <div className="mob-page" aria-busy="true" aria-live="polite">
      <div className="mob-skel-bar" aria-hidden />
      <div className="mob-skel-kpi-row" aria-hidden>
        <div className="mob-skel-kpi" />
        <div className="mob-skel-kpi" />
        <div className="mob-skel-kpi" />
      </div>
      <div className="mob-skel-section-h" aria-hidden />
      <ul className="mob-section-list" style={{ paddingTop: 0 }} aria-hidden>
        <li><div className="mob-skel-row" /></li>
        <li><div className="mob-skel-row" /></li>
        <li><div className="mob-skel-row" /></li>
      </ul>
      <span className="sr-only">Aufträge werden geladen…</span>
    </div>
  );
}

export function MobileKpiPills({ pills, activeId, onSelect }: MobileKpiPillsProps) {
  return (
    <div className="mob-kpi-row" role="group" aria-label="Schnellfilter-Kennzahlen">
      {pills.map((p) => {
        const active = activeId === p.id;
        const Wrapper: "button" | "div" = onSelect ? "button" : "div";
        return (
          <Wrapper
            key={p.id}
            type={onSelect ? "button" : undefined}
            onClick={onSelect ? () => onSelect(p.id) : undefined}
            className={`mob-kpi-pill${active ? " mob-kpi-pill--active" : ""}`}
            aria-pressed={onSelect ? active : undefined}
          >
            <span className="mob-kpi-pill-lab">{p.label}</span>
            <span className="mob-kpi-pill-val">{p.value}</span>
            {p.sub && <span className="mob-kpi-pill-sub">{p.sub}</span>}
          </Wrapper>
        );
      })}
    </div>
  );
}
