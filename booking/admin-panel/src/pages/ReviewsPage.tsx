import { useState, useEffect, useCallback } from "react";
import {
  Star,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  MailCheck,
  MessageSquare,
  BanIcon,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

interface KpiData {
  faellig: number;
  gesendet: number;
  beantwortet: number;
  responseRate: number;
  avgRating: number | null;
}

interface ReviewRow {
  order_no: number;
  customer_name: string | null;
  customer_email: string | null;
  done_at: string | null;
  review_request_sent_at: string | null;
  review_request_count: number;
  review_id: number | null;
  rating: number | null;
  comment: string | null;
  submitted_at: string | null;
  review_status: "responded" | "sent" | "pending" | "not_due";
}

function isSyntheticCompanyEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase().endsWith("@company.local");
}

function toVisibleCustomerEmail(value?: string | null) {
  return isSyntheticCompanyEmail(value) ? "" : String(value || "");
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3.5 w-3.5 ${s <= rating ? "text-yellow-400 fill-yellow-400" : "text-slate-300 text-[var(--text-subtle)]"}`}
        />
      ))}
    </span>
  );
}

const STATUS_CONFIG = {
  responded:  { labelKey: "reviews.status.responded",  bg: "bg-green-100  text-green-700  dark:bg-green-900  dark:text-green-300",  icon: CheckCircle2 },
  sent:       { labelKey: "reviews.status.sent",       bg: "bg-blue-100   text-blue-700   dark:bg-blue-900   dark:text-blue-300",   icon: MailCheck },
  pending:    { labelKey: "reviews.status.pending",    bg: "bg-amber-100  text-amber-700  dark:bg-amber-900  dark:text-amber-300",  icon: Clock },
  not_due:    { labelKey: "reviews.status.notDue",     bg: "bg-slate-100   text-slate-500  bg-[var(--surface-raised)]   text-[var(--text-subtle)]",  icon: Clock },
};

export function ReviewsPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMap, setActionMap] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "responded" | "sent">("all");
  const [googleLink, setGoogleLink] = useState("https://g.page/r/CSQ5RnWmJOumEAE/review");

  useEffect(() => {
    apiRequest<{ ok: boolean; link: string }>("/api/reviews/google-link", "GET")
      .then((res) => { if (res.link) setGoogleLink(res.link); })
      .catch(() => {});
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiRes, listRes] = await Promise.all([
        apiRequest<{ ok: boolean; kpi: KpiData }>("/api/admin/reviews/kpi", "GET", token),
        apiRequest<{ ok: boolean; reviews: ReviewRow[] }>("/api/admin/reviews", "GET", token),
      ]);
      setKpi(kpiRes.kpi);
      setReviews(listRes.reviews || []);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const resend = async (orderNo: number) => {
    setActionMap((m) => ({ ...m, [orderNo]: "sending" }));
    setMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; sentTo: string | null }>(
        `/api/admin/orders/${orderNo}/review/resend`, "POST", token
      );
      setMsg({
        type: "ok",
        text: t(lang, "reviews.success.sent").replace("{{email}}", toVisibleCustomerEmail(res.sentTo) || "-"),
      });
      await loadAll();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setActionMap((m) => { const n = { ...m }; delete n[orderNo]; return n; });
    }
  };

  const dismiss = async (orderNo: number) => {
    setActionMap((m) => ({ ...m, [orderNo]: "dismissing" }));
    setMsg(null);
    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/orders/${orderNo}/review/dismiss`, "PATCH", token);
      setMsg({ type: "ok", text: t(lang, "reviews.success.dismissed").replace("{{orderNo}}", String(orderNo)) });
      await loadAll();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setActionMap((m) => { const n = { ...m }; delete n[orderNo]; return n; });
    }
  };

  const filtered = reviews.filter((r) => filter === "all" || r.review_status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Star className="h-6 w-6 text-[var(--accent)]" />
          <h1 className="text-2xl font-bold text-[var(--text-main)]">{t(lang, "reviews.title")}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367D6] transition-colors shadow-sm"
          >
            <ExternalLink className="h-4 w-4" />
            {t(lang, "reviews.button.google")}
          </a>
          <button
            onClick={() => { void loadAll(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-soft)] text-sm text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> {t(lang, "common.refresh")}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* KPI-Kacheln */}
      {kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{kpi.faellig}</div>
            <div className="text-xs text-[var(--text-subtle)] mt-1">{t(lang, "reviews.status.pending")}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{kpi.gesendet}</div>
            <div className="text-xs text-[var(--text-subtle)] mt-1">{t(lang, "reviews.status.sent")}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{kpi.beantwortet}</div>
            <div className="text-xs text-[var(--text-subtle)] mt-1">{t(lang, "reviews.status.responded")}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--text-main)]">{kpi.responseRate}%</div>
            <div className="text-xs text-[var(--text-subtle)] mt-1">{t(lang, "reviews.kpi.responseRate")}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 text-center">
            {kpi.avgRating != null ? (
              <>
                <div className="text-2xl font-bold text-yellow-500">{kpi.avgRating.toFixed(1)}</div>
                <div className="flex justify-center mt-1">
                  <StarRating rating={Math.round(kpi.avgRating)} />
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-slate-300 text-[var(--text-subtle)]">—</div>
                <div className="text-xs text-[var(--text-subtle)] mt-1">{t(lang, "reviews.kpi.noRatings")}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter-Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "pending", "sent", "responded"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] text-[var(--text-subtle)] hover:bg-slate-200 hover:bg-[var(--surface-raised)]"}`}
          >
            {f === "all" ? t(lang, "common.all") : f === "pending" ? t(lang, "reviews.status.pending") : f === "sent" ? t(lang, "reviews.status.sent") : t(lang, "reviews.status.responded")}
            {f !== "all" && (
              <span className="ml-1.5 text-xs opacity-70">
                {reviews.filter((r) => r.review_status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tabelle */}
      <div className="rounded-xl border border-[var(--border-soft)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-raised)] text-left">
                <th className="px-4 py-3 font-medium text-[var(--text-subtle)] text-xs uppercase tracking-wider">{t(lang, "reviews.table.order")}</th>
                <th className="px-4 py-3 font-medium text-[var(--text-subtle)] text-xs uppercase tracking-wider">{t(lang, "reviews.table.customer")}</th>
                <th className="px-4 py-3 font-medium text-[var(--text-subtle)] text-xs uppercase tracking-wider">{t(lang, "reviews.table.completed")}</th>
                <th className="px-4 py-3 font-medium text-[var(--text-subtle)] text-xs uppercase tracking-wider">{t(lang, "orderDetail.section.status")}</th>
                <th className="px-4 py-3 font-medium text-[var(--text-subtle)] text-xs uppercase tracking-wider">{t(lang, "reviews.table.rating")}</th>
                <th className="px-4 py-3 font-medium text-[var(--text-subtle)] text-xs uppercase tracking-wider">{t(lang, "reviews.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[var(--text-subtle)]">
                    {t(lang, "reviews.table.empty")}
                  </td>
                </tr>
              ) : filtered.map((row) => {
                const sc = STATUS_CONFIG[row.review_status] || STATUS_CONFIG.not_due;
                const StatusIcon = sc.icon;
                const customerEmail = toVisibleCustomerEmail(row.customer_email);
                return (
                  <tr key={row.order_no} className="hover:bg-[var(--surface-raised)]/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-[var(--text-main)]">#{row.order_no}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-main)]">{row.customer_name || "—"}</div>
                      <div className="text-xs text-[var(--text-subtle)]">{customerEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-subtle)]">
                      {row.done_at ? new Date(row.done_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${sc.bg}`}>
                        <StatusIcon className="h-3 w-3" />
                        {t(lang, sc.labelKey)}
                      </span>
                      {row.review_request_count > 0 && (
                        <div className="text-xs text-[var(--text-subtle)] mt-0.5">{row.review_request_count}{t(lang, "reviews.label.timesSent")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.rating ? (
                        <div>
                          <StarRating rating={row.rating} />
                          {row.comment && (
                            <div className="text-xs text-[var(--text-subtle)] mt-1 max-w-xs truncate" title={row.comment}>
                              <MessageSquare className="h-3 w-3 inline mr-1" />
                              {row.comment}
                            </div>
                          )}
                          {row.submitted_at && (
                            <div className="text-xs text-[var(--text-subtle)]">{new Date(row.submitted_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-[var(--text-subtle)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(row.review_status === "pending" || row.review_status === "sent") && (
                          <button
                            onClick={() => { void resend(row.order_no); }}
                            disabled={actionMap[row.order_no] === "sending"}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                          >
                            <Send className="h-3 w-3" />
                            {actionMap[row.order_no] === "sending" ? "..." : t(lang, "common.send")}
                          </button>
                        )}
                        {row.review_status === "pending" && (
                          <button
                            onClick={() => { void dismiss(row.order_no); }}
                            disabled={actionMap[row.order_no] === "dismissing"}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-soft)] text-[var(--text-subtle)] text-xs hover:bg-[var(--surface-raised)] disabled:opacity-50 transition-colors"
                          >
                            <BanIcon className="h-3 w-3" />
                            {t(lang, "reviews.button.ignore")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

