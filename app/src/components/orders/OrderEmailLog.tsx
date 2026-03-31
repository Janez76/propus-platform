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
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().replace("T", " ").slice(0, 16);
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
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2 text-sm font-medium text-white/90">
          <Mail size={15} className="text-white/50" />
          {t(language, "emailLog.title")}
          {entries.length > 0 && (
            <span className="text-xs text-white/40 font-normal">({entries.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="p-1 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white/80 disabled:opacity-40"
          title="Aktualisieren"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="divide-y divide-white/5">
        {loading && entries.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-white/40">
            <RefreshCw size={14} className="animate-spin inline-block mr-2" />
            Wird geladen…
          </div>
        )}

        {error && (
          <div className="px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-white/40">
            {availability === "no_db" ? t(language, "emailLog.empty.noDb") : t(language, "emailLog.empty")}
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
            <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
              <Mail size={12} className="text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium text-white/85">
                  {templateLabel(entry.template_key)}
                </span>
                {entry.template_language && (
                  <span className="text-xs text-white/35 uppercase tracking-wide">
                    {entry.template_language}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-white/45 truncate max-w-[220px]">
                  {entry.recipient}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-white/45">
                  {t(language, "emailLog.label.sentAt")}:
                </span>
                <span className="text-xs font-medium text-[var(--accent)] shrink-0">
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

