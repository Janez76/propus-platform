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
          className={`h-3.5 w-3.5 ${s <= rating ? "text-yellow-400 fill-yellow-400" : ""}`}
          style={s > rating ? { color: "var(--text-subtle)" } : undefined}
        />
      ))}
    </span>
  );
}

const STATUS_CONFIG = {
  responded: { labelKey: "reviews.status.responded", cls: "cust-status-badge cust-status-completed", icon: CheckCircle2 },
  sent:      { labelKey: "reviews.status.sent",       cls: "cust-status-badge cust-status-confirmed",  icon: MailCheck },
  pending:   { labelKey: "reviews.status.pending",    cls: "cust-status-badge cust-status-pending",   icon: Clock },
  not_due:   { labelKey: "reviews.status.notDue",     cls: "cust-status-badge cust-status-draft",     icon: Clock },
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
        <div className="h-8 w-8 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--accent-subtle)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Star className="h-6 w-6" style={{ color: "var(--accent)" }} />
          <h1 className="cust-page-header-title">{t(lang, "reviews.title")}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            style={{ background: "#4285F4", color: "#ffffff" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#3367D6"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#4285F4"; }}
          >
            <ExternalLink className="h-4 w-4" />
            {t(lang, "reviews.button.google")}
          </a>
          <button
            onClick={() => { void loadAll(); }}
            className="btn-secondary flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm min-h-0 min-w-0"
          >
            <RefreshCw className="h-4 w-4" /> {t(lang, "common.refresh")}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`cust-alert ${msg.type === "ok" ? "cust-alert--success" : "cust-alert--error"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* KPI-Kacheln */}
      {kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="cust-stat-card text-center">
            <div className="cust-stat-value" style={{ color: "#c87f0a" }}>{kpi.faellig}</div>
            <div className="cust-stat-label mt-1">{t(lang, "reviews.status.pending")}</div>
          </div>
          <div className="cust-stat-card text-center">
            <div className="cust-stat-value" style={{ color: "#1a6fa8" }}>{kpi.gesendet}</div>
            <div className="cust-stat-label mt-1">{t(lang, "reviews.status.sent")}</div>
          </div>
          <div className="cust-stat-card text-center">
            <div className="cust-stat-value" style={{ color: "#1d9e56" }}>{kpi.beantwortet}</div>
            <div className="cust-stat-label mt-1">{t(lang, "reviews.status.responded")}</div>
          </div>
          <div className="cust-stat-card text-center">
            <div className="cust-stat-value">{kpi.responseRate}%</div>
            <div className="cust-stat-label mt-1">{t(lang, "reviews.kpi.responseRate")}</div>
          </div>
          <div className="cust-stat-card text-center">
            {kpi.avgRating != null ? (
              <>
                <div className="cust-stat-value text-yellow-500">{kpi.avgRating.toFixed(1)}</div>
                <div className="flex justify-center mt-1">
                  <StarRating rating={Math.round(kpi.avgRating)} />
                </div>
              </>
            ) : (
              <>
                <div className="cust-stat-value" style={{ color: "var(--text-subtle)" }}>—</div>
                <div className="cust-stat-label mt-1">{t(lang, "reviews.kpi.noRatings")}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter-Tabs */}
      <div className="cust-tab-row">
        {(["all", "pending", "sent", "responded"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`cust-tab${filter === f ? " active" : ""}`}
          >
            {f === "all" ? t(lang, "common.all") : f === "pending" ? t(lang, "reviews.status.pending") : f === "sent" ? t(lang, "reviews.status.sent") : t(lang, "reviews.status.responded")}
            {f !== "all" && (
              <span className={`cust-tab-count${filter !== f ? " cust-tab-count--neutral" : ""}`}>
                {reviews.filter((r) => r.review_status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tabelle */}
      <div className="cust-table-wrap">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>{t(lang, "reviews.table.order")}</th>
                <th>{t(lang, "reviews.table.customer")}</th>
                <th>{t(lang, "reviews.table.completed")}</th>
                <th>{t(lang, "orderDetail.section.status")}</th>
                <th>{t(lang, "reviews.table.rating")}</th>
                <th>{t(lang, "reviews.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="cust-empty-state">
                      <Star className="h-10 w-10 mx-auto" />
                      <p className="cust-empty-title">{t(lang, "reviews.table.empty")}</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((row) => {
                const sc = STATUS_CONFIG[row.review_status] || STATUS_CONFIG.not_due;
                const StatusIcon = sc.icon;
                const customerEmail = toVisibleCustomerEmail(row.customer_email);
                return (
                  <tr key={row.order_no}>
                    <td className="cust-td-id">#{row.order_no}</td>
                    <td>
                      <div className="font-medium" style={{ color: "var(--text-main)" }}>{row.customer_name || "—"}</div>
                      <div className="text-xs" style={{ color: "var(--text-subtle)" }}>{customerEmail}</div>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                      {row.done_at ? new Date(row.done_at).toLocaleDateString("de-CH") : "—"}
                    </td>
                    <td>
                      <span className={sc.cls}>
                        <StatusIcon className="h-3 w-3" />
                        {t(lang, sc.labelKey)}
                      </span>
                      {row.review_request_count > 0 && (
                        <div className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
                          {row.review_request_count}{t(lang, "reviews.label.timesSent")}
                        </div>
                      )}
                    </td>
                    <td>
                      {row.rating ? (
                        <div>
                          <StarRating rating={row.rating} />
                          {row.comment && (
                            <div className="text-xs mt-1 max-w-xs truncate" style={{ color: "var(--text-muted)" }} title={row.comment}>
                              <MessageSquare className="h-3 w-3 inline mr-1" />
                              {row.comment}
                            </div>
                          )}
                          {row.submitted_at && (
                            <div className="text-xs" style={{ color: "var(--text-subtle)" }}>{new Date(row.submitted_at).toLocaleDateString("de-CH")}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-subtle)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {(row.review_status === "pending" || row.review_status === "sent") && (
                          <button
                            onClick={() => { void resend(row.order_no); }}
                            disabled={actionMap[row.order_no] === "sending"}
                            className="cust-action-view min-h-0 min-w-0 disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" />
                            {actionMap[row.order_no] === "sending" ? "..." : t(lang, "common.send")}
                          </button>
                        )}
                        {row.review_status === "pending" && (
                          <button
                            onClick={() => { void dismiss(row.order_no); }}
                            disabled={actionMap[row.order_no] === "dismissing"}
                            className="cust-action-icon disabled:opacity-50"
                            title={t(lang, "reviews.button.ignore")}
                          >
                            <BanIcon className="h-3.5 w-3.5" />
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
