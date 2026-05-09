import { CalendarCheck, CalendarRange } from "lucide-react";
import { cn } from "../../lib/utils";
import { t, type Lang } from "../../i18n";

export type BookingKind = "fixed" | "flexible";

type ToggleOptionProps = {
  name: string;
  value: BookingKind;
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onSelect: () => void;
};

function ToggleOption({ name, value, label, description, icon, checked, onSelect }: ToggleOptionProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-all",
        checked
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border-soft)] hover:border-[var(--border-strong)]",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          checked ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] text-[var(--text-subtle)]",
        )}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-[var(--text-main)]">{label}</span>
        <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">{description}</span>
      </span>
    </label>
  );
}

export function BookingTypeToggle({
  value,
  onChange,
  lang,
}: {
  value: BookingKind;
  onChange: (next: BookingKind) => void;
  lang: Lang;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t(lang, "booking.step3.bookingKind.label")}>
      <ToggleOption
        name="bookingKind"
        value="fixed"
        label={t(lang, "booking.step3.bookingKind.fixed.label")}
        description={t(lang, "booking.step3.bookingKind.fixed.desc")}
        icon={<CalendarCheck className="h-5 w-5" />}
        checked={value === "fixed"}
        onSelect={() => onChange("fixed")}
      />
      <ToggleOption
        name="bookingKind"
        value="flexible"
        label={t(lang, "booking.step3.bookingKind.flexible.label")}
        description={t(lang, "booking.step3.bookingKind.flexible.desc")}
        icon={<CalendarRange className="h-5 w-5" />}
        checked={value === "flexible"}
        onSelect={() => onChange("flexible")}
      />
    </div>
  );
}
