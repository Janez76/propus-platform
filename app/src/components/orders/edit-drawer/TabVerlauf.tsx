import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  FileEdit,
  Loader2,
  Mail,
  Package,
  StickyNote,
  Upload,
  User2,
  Wrench,
} from "lucide-react";
import { getOrderEvents, type OrderEventLogEntry } from "../../../api/orders";
import { useAuthStore } from "../../../store/authStore";
import { useT } from "../../../hooks/useT";

type Props = {
  orderNo: string;
};

const EVENT_ICONS: Record<string, typeof CalendarDays> = {
  status_change: Wrench,
  schedule_change: CalendarDays,
  photographer_change: Camera,
  services_change: Package,
  billing_change: User2,
  object_change: FileEdit,
  address_change: FileEdit,
  internal_notes_change: StickyNote,
  file_upload: Upload,
  email_sent: Mail,
  order_created: Package,
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function bucketFor(iso: string): "today" | "yesterday" | "thisWeek" | "older" {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "older";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = d.getTime();
  if (ts >= startOfToday) return "today";
  if (ts >= startOfToday - 86_400_000) return "yesterday";
  if (ts >= startOfToday - 7 * 86_400_000) return "thisWeek";
  return "older";
}

function summarizeStatus(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "status" in value) {
    const s = (value as { status?: unknown }).status;
    if (typeof s === "string") return s;
  }
  return "—";
}

function summarizeSchedule(value: unknown): string {
  if (value && typeof value === "object") {
    const v = value as { date?: string; time?: string; durationMin?: number };
    const parts = [v.date || "", v.time || ""].filter(Boolean).join(" ");
    return parts || "—";
  }
  return "—";
}

function summarizePhotographer(value: unknown): string {
  if (value && typeof value === "object") {
    const v = value as { name?: string; key?: string };
    return v.name || v.key || "—";
  }
  return typeof value === "string" ? value : "—";
}

function eventDiff(event: OrderEventLogEntry): string | null {
  switch (event.eventType) {
    case "status_change":
      return `${summarizeStatus(event.oldValue)} → ${summarizeStatus(event.newValue)}`;
    case "schedule_change":
      return `${summarizeSchedule(event.oldValue)} → ${summarizeSchedule(event.newValue)}`;
    case "photographer_change":
      return `${summarizePhotographer(event.oldValue)} → ${summarizePhotographer(event.newValue)}`;
    default:
      return null;
  }
}

export function TabVerlauf({ orderNo }: Props) {
  const t = useT();
  const token = useAuthStore((s) => s.token);
  const [events, setEvents] = useState<OrderEventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !orderNo) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrderEvents(token, orderNo)
      .then((rows) => {
        if (cancelled) return;
        setEvents(Array.isArray(rows) ? rows : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, orderNo]);

  const grouped = useMemo(() => {
    const buckets: Record<"today" | "yesterday" | "thisWeek" | "older", OrderEventLogEntry[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };
    for (const ev of events) buckets[bucketFor(ev.createdAt)].push(ev);
    return buckets;
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-subtle)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("ordersDrawer.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="py-12 text-center text-sm text-[var(--text-subtle)]">
        {t("ordersDrawer.verlauf.noEvents")}
      </div>
    );
  }

  const sections: Array<{ key: "today" | "yesterday" | "thisWeek" | "older"; title: string }> = [
    { key: "today", title: t("ordersDrawer.verlauf.today") },
    { key: "yesterday", title: t("ordersDrawer.verlauf.yesterday") },
    { key: "thisWeek", title: t("ordersDrawer.verlauf.thisWeek") },
    { key: "older", title: t("ordersDrawer.verlauf.older") },
  ];

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const items = grouped[section.key];
        if (!items.length) return null;
        return (
          <section key={section.key}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {section.title}
            </h3>
            <ol className="relative space-y-3 border-l border-[var(--border-soft)] pl-4">
              {items.map((ev) => {
                const Icon = EVENT_ICONS[ev.eventType] || FileEdit;
                const diff = eventDiff(ev);
                return (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[22px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                      <Icon className="h-2.5 w-2.5" />
                    </span>
                    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]/40 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--text-main)]">
                          {t(`ordersDrawer.eventTypes.${ev.eventType}`) || ev.eventType}
                        </p>
                        <time className="shrink-0 text-xs text-[var(--text-subtle)]" title={ev.createdAt}>
                          {formatDate(ev.createdAt)} · {formatTime(ev.createdAt)}
                        </time>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                        {t("ordersDrawer.verlauf.by")} {ev.actorUser || "—"}
                        {ev.actorRole ? ` · ${ev.actorRole}` : ""}
                      </p>
                      {diff && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                          {diff.split(" → ")[0]}
                          <ArrowRight className="h-3 w-3" />
                          {diff.split(" → ")[1]}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
