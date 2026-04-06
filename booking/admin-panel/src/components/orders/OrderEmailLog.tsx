import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Mail } from "lucide-react";
import { getOrderEmailLog, type OrderEmailLogEntry, type OrderEmailLogResponse } from "../../api/orders";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

const TEMPLATE_LABELS: Record<string, string> = {
  booking_office: "Neue Buchung (Büro)",
  booking_photographer: "Neue Buchung (Fotograf)",
  booking_customer: "Neue Buchung (Kunde)",
  customer_confirmation_resent: "Bestätigung erneut gesendet",
  booking_confirmation_request: "Bestätigungsanfrage",
  booking_confirmed: "Buchung bestätigt",
  provisional_created: "Provisorisch erstellt",
  provisional_reminder_1: "Erinnerung 1",
  provisional_reminder_2: "Erinnerung 2",
  provisional_expired: "Provisorium abgelaufen",
  attendee_notification: "CC-Teilnehmer-Info",
  office_confirmation_pending_notice: "Büro-Hinweis (offen)",
  booking_cancelled: "Stornierung",
  booking_rescheduled: "Terminänderung",
  review_request: "Bewertungsanfrage",
  photographer_assigned: "Fotograf zugeteilt",
};

function templateLabel(key: string): string {
  return TEMPLATE_LABELS[key] ?? key;
}

function formatSentAt(value: unknown): string {
  if (!value) return "-";
  const raw = value instanceof Date ? value.toISOString() : String(value);

  let d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const normalized = raw
      .replace(" ", "T")
      .replace(/([+-]\d{2})(\d{2})?$/, (_, h: string, m?: string) => `${h}:${m ?? "00"}`);
    d = new Date(normalized);
  }
  if (Number.isNaN(d.getTime())) return "-";

  try {
    return new Intl.DateTimeFormat("de-CH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const yr = d.getFullYear();
    const hr = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const sec = String(d.getSeconds()).padStart(2, "0");
    return `${day}.${mon}.${yr} ${hr}:${mi}:${sec}`;
  }
}

type Props = {
  token: string;
  orderNo: string;
};

export function OrderEmailLog({ token, orderNo }: Props) {
  const language = useAuthStore((s) => s.language);
  const [entries, setEntries] = useState<OrderEmailLogEntry[]>([]);
  const [availability, setAvailability] = useState<OrderEmailLogResponse["availability"]>("available");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOrderEmailLog(token, orderNo);
      setEntries(data.entries);
      setAvailability(data.availability ?? "available");
    } catch (err) {
      setError(t(language, "emailLog.error.loadFailed"));
      console.error("EmailLog load error", err);
    } finally {
      setLoading(false);
    }
  }, [token, orderNo, language]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium p-text-main">
          <Mail size={15} className="shrink-0 p-text-muted" aria-hidden />
          {t(language, "emailLog.title")}
          {entries.length > 0 && (
            <span className="p-text-subtle text-xs font-normal">({entries.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded p-1 transition-colors p-text-muted hover:bg-[var(--accent-subtle)] hover:text-[var(--text-main)] disabled:opacity-40"
          title="Aktualisieren"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="divide-y divide-[var(--border-soft)]">
        {loading && entries.length === 0 && (
          <div className="px-4 py-6 text-center text-sm p-text-muted">
            <RefreshCw size={14} className="mr-2 inline-block animate-spin" />
            Wird geladen…
          </div>
        )}

        {error && (
          <div className="px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="px-4 py-6 text-center text-sm p-text-muted">
            {availability === "no_db" ? t(language, "emailLog.empty.noDb") : t(language, "emailLog.empty")}
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-subtle)]">
              <Mail size={12} className="text-[var(--accent)]" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium p-text-main">
                  {templateLabel(entry.template_key)}
                </span>
                {entry.template_language && (
                  <span className="p-text-subtle text-xs uppercase tracking-wide">
                    {entry.template_language}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="max-w-[220px] truncate text-xs p-text-muted">
                  {entry.recipient}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs p-text-muted">
                  {t(language, "emailLog.label.sentAt")}:
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--accent)]">
                  {formatSentAt((entry as OrderEmailLogEntry & { sentAt?: unknown }).sent_at ?? (entry as OrderEmailLogEntry & { sentAt?: unknown }).sentAt)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

