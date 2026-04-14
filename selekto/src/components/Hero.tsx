import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useHeroSlideshow } from "../hooks/useHeroSlideshow";

type HeroProps = {
  title: string;
  address: string;
  standDisplay: string;
  photoCount: number;
  videoCount: number;
  floorPlanCount: number;
  tourCount: number;
  heroSlides: string[];
  onDownload: () => void;
};

type DockMetric = {
  value: number;
  label: string;
  delayMs: number;
  labelClass?: string;
};

/** Max. drei Slides im DOM (aktuell + Nachbarn) — weniger Dekodierung/Compositing als N Vollbild-Bilder. */
function visibleSlideIndices(length: number, active: number): number[] {
  if (length <= 0) return [];
  if (length <= 3) return Array.from({ length }, (_, i) => i);
  return [...new Set([active, (active + 1) % length, (active - 1 + length) % length])];
}

export function Hero({
  title,
  address,
  standDisplay,
  photoCount,
  videoCount,
  floorPlanCount,
  tourCount,
  heroSlides,
  onDownload,
}: HeroProps) {
  const dockMetrics: DockMetric[] = useMemo(() => {
    const m: DockMetric[] = [{ value: photoCount, label: "Aufnahmen", delayMs: 0 }];
    if (videoCount > 0) {
      m.push({ value: videoCount, label: "Video", delayMs: 0 });
    }
    if (floorPlanCount > 0) {
      m.push({ value: floorPlanCount, label: "Grundrisse", delayMs: 0 });
    }
    if (tourCount > 0) {
      m.push({
        value: tourCount,
        label: "360° Tour",
        delayMs: 0,
        labelClass: "hero__metric-label--tour-title",
      });
    }
    return m.map((row, i) => ({ ...row, delayMs: 300 + i * 40 }));
  }, [photoCount, videoCount, floorPlanCount, tourCount]);

  const standDelayMs = 300 + dockMetrics.length * 40;

  const slides = heroSlides.length > 0 ? heroSlides : [""];
  const len = slides.length;
  const activeSlide = useHeroSlideshow(len);
  const slideIndex = len > 0 ? activeSlide % len : 0;
  const visible = useMemo(() => visibleSlideIndices(len, slideIndex), [len, slideIndex]);

  return (
    <section className="hero hero--welcome hero--cinematic" aria-label="Hero">
      <div className="hero__media">
        <div className="hero__slides">
          {visible.map((i) => {
            const src = slides[i];
            const isActive = i === slideIndex;
            return (
              <div
                key={`hero-slide-${i}`}
                className={`hero-slide${isActive ? " is-active" : ""}`}
                aria-hidden={!isActive}
              >
                {src ? (
                  <img
                    className="hero-slide__img"
                    src={src}
                    alt=""
                    decoding="async"
                    fetchPriority={i === 0 ? "high" : "low"}
                    loading={isActive || i === (slideIndex + 1) % len ? "eager" : "lazy"}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="hero__blurshade" aria-hidden="true" />
        <div className="hero__overlay" aria-hidden="true" />
        <div className="hero__vignette" aria-hidden="true" />
      </div>

      <div className="hero__frame">
        <div className="hero__main">
          <div className="hero__main-inner">
            <p className="hero__welcome u-animate" style={{ "--delay": "0ms" } as CSSProperties}>
              Propus präsentiert
            </p>
            <h1 className="hero__headline u-animate" style={{ "--delay": "80ms" } as CSSProperties}>
              <span className="hero__hl">{title}</span>
            </h1>
            <div className="hero__headline-rule" aria-hidden="true" />
            <p className="hero__address u-animate" style={{ "--delay": "160ms" } as CSSProperties}>
              {address}
            </p>
            <div className="hero__cta u-animate" style={{ "--delay": "260ms" } as CSSProperties}>
              <button type="button" className="btn btn--outline btn--xl" onClick={onDownload}>
                Alle Medien herunterladen
              </button>
            </div>
          </div>
        </div>

        <div className="hero__dock" aria-label="Inhalt dieser Unterlagen">
          <div className="hero__dock-rule hero__dock-rule--full" aria-hidden="true" />
          <div className="hero__dock-inner">
            <div className={`hero__metrics hero__metrics--${dockMetrics.length}`}>
              {dockMetrics.map((row) => (
                <div
                  key={row.label}
                  className="hero__metric u-animate"
                  style={{ "--delay": `${row.delayMs}ms` } as CSSProperties}
                >
                  <span className="hero__metric-value">{row.value}</span>
                  <span
                    className={
                      row.labelClass ? `hero__metric-label ${row.labelClass}` : "hero__metric-label"
                    }
                  >
                    {row.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="hero__dock-rule hero__dock-rule--full hero__dock-rule--soft" aria-hidden="true" />
            <p className="hero__stand u-animate" style={{ "--delay": `${standDelayMs}ms` } as CSSProperties}>
              {standDisplay}
            </p>
          </div>
          <div className="hero__dock-rule hero__dock-rule--full" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
