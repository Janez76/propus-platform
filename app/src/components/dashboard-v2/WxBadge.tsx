import type { WeatherForecastDay, WeatherKind } from "../../api/weather";
import { weatherEmoji, weatherLabel } from "../../api/weather";

type Size = "sm" | "md" | "lg";
type Anchor = "left" | "right" | "auto";

interface WxBadgeProps {
  forecast?: WeatherForecastDay | null;
  size?: Size;
  anchor?: Anchor;
  /** Falls keine vollständigen Daten — minimaler Fallback auf nur kind. */
  fallbackKind?: WeatherKind;
}

/**
 * Kompaktes Wetter-Chip (Emoji), das beim Hover/Focus ein Popover mit Details anzeigt.
 * Wird in Heatmap (Monat/Woche/Tag) und ggf. anderswo wiederverwendet.
 */
export function WxBadge({ forecast, size = "sm", anchor = "auto", fallbackKind }: WxBadgeProps) {
  const kind = forecast?.kind ?? fallbackKind;
  if (!kind) return null;
  const label = weatherLabel(kind);
  const emoji = weatherEmoji(kind);
  const cls = ["dv2-wx-badge", `dv2-wx-badge--${size}`, `dv2-wx-anchor--${anchor}`].join(" ");

  return (
    <span className={cls} data-wx={kind} tabIndex={0} aria-label={label}>
      <span className="dv2-wx-emoji" aria-hidden>{emoji}</span>
      <span className="dv2-wx-pop" role="tooltip">
        <span className="dv2-wx-pop-head">
          <span className="dv2-wx-pop-emoji" aria-hidden>{emoji}</span>
          <span className="dv2-wx-pop-temps">
            {forecast ? <strong>{forecast.t_max}°C</strong> : <strong>—</strong>}
            {forecast ? <span>↓ {forecast.t_min}°</span> : null}
          </span>
        </span>
        <dl className="dv2-wx-pop-body">
          <dt>Bedingung</dt><dd>{label}</dd>
          {forecast && forecast.precip > 0 ? (<><dt>Regen</dt><dd>{forecast.precip}%</dd></>) : null}
          {forecast ? (<><dt>Spanne</dt><dd>{forecast.t_min}° – {forecast.t_max}°</dd></>) : null}
        </dl>
      </span>
    </span>
  );
}
