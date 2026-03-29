import { formatPhoneDisplay, phoneTelHref } from "../../lib/format";
import { cn } from "../../lib/utils";

/** Einheitliche Anzeige +41 xx xxx xx xx; klickbar mit `tel:` wenn genügend Ziffern. */
export function PhoneLink({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const display = formatPhoneDisplay(raw);
  const href = phoneTelHref(raw);
  if (!href) return <span className={className}>{display}</span>;
  return (
    <a href={href} className={cn("hover:underline", className)}>
      {display}
    </a>
  );
}
