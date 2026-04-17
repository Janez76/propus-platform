import { CalendarDays, User, Wallet } from "lucide-react";
import type { Order } from "../../api/orders";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import { t, type Lang } from "../../i18n";

type Props = {
  data: Order;
  lang: Lang;
};

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

export function OrderDetailStatsBar({ data, lang }: Props) {
  const appointment = data.appointmentDate
    ? formatDateTime(data.appointmentDate)
    : t(lang, "common.notSet");
  const photographer = data.photographer?.name || t(lang, "orderDetail.select.unassigned");
  const total = data.total || data.pricing?.total || 0;

  return (
    <div className="mb-4 grid gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-3 sm:grid-cols-3">
      <Stat
        icon={<CalendarDays className="h-3.5 w-3.5" />}
        label={t(lang, "orderDetail.section.appointment")}
        value={appointment}
      />
      <Stat
        icon={<User className="h-3.5 w-3.5" />}
        label={t(lang, "orderDetail.section.employee")}
        value={photographer}
      />
      <Stat
        icon={<Wallet className="h-3.5 w-3.5" />}
        label={t(lang, "orderDetail.pricing.total")}
        value={formatCurrency(total)}
      />
    </div>
  );
}
