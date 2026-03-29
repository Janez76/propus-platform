import { t, type Lang } from "../../i18n";
import { cn } from "../../lib/utils";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "de", label: "DE" },
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
  { value: "it", label: "IT" },
];

type Props = {
  lang: Lang;
  onChange: (l: Lang) => void;
  className?: string;
};

export function BookingLangSelect({ lang, onChange, className }: Props) {
  return (
    <select
      aria-label={t(lang, "booking.lang.select")}
      value={lang}
      onChange={(e) => onChange(e.target.value as Lang)}
      className={cn(
        "cursor-pointer appearance-none rounded-lg border border-zinc-200 bg-white py-1.5 pl-3 pr-8 text-xs font-semibold text-zinc-800 shadow-sm transition-colors",
        "dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100",
        "bg-[length:1rem_1rem] bg-[right_0.4rem_center] bg-no-repeat",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A059]/40",
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
      }}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
