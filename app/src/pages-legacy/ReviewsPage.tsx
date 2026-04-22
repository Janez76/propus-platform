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
  ThumbsUp,
  Link2,
  Link2Off,
  Reply,
  Trash2,
} from "lucide-react";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { usePermissions } from "../hooks/usePermissions";
import { t, Lang } from "../i18n";

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
  google_review_left: boolean | null;
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

interface GbpStatus {
  connected: boolean;
  configured: boolean;
  accountId?: string | null;
  locationId?: string | null;
  expiresAt?: string | null;
}

interface GbpReview {
  name: string;
  reviewId: string;
  author: string;
  profilePhoto: string | null;
  isAnonymous: boolean;
  rating: number;
  comment: string;
  createTime: string | null;
  updateTime: string | null;
  reply: { comment: string; updateTime: string | null } | null;
}

function GbpStars({ rating }: { rating: number }) {
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

function GbpAvatar({ author, photo }: { author: string; photo: string | null }) {
  const initial = author ? author.charAt(0).toUpperCase() : "?";
  if (photo) {
    return <img src={photo} alt={author} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div
      className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
      style={{ background: "#4285F4", color: "#fff" }}
    >
      {initial}
    </div>
  );
}

function GbpPanel({ token, lang, readOnly = false }: { token: string | undefined; lang: Lang; readOnly?: boolean }) {
  const [status, setStatus] = useState<GbpStatus | null>(null);
  const [reviews, setReviews] = useState<GbpReview[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [reviewsSource, setReviewsSource] = useState<"gbp" | "places" | null>(null);
  const [placesEnvMissing, setPlacesEnvMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [replyMap, setReplyMap] = useState<Record<string, { open: boolean; text: string; saving: boolean; deleting: boolean }>>({});

  // URL-Parameter nach OAuth-Callback prüfen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gbp_connected") === "1") {
      setMsg({ type: "ok", text: t(lang, "reviews.gbp.connectSuccess") });
      const url = new URL(window.location.href);
      url.searchParams.delete("gbp_connected");
      window.history.replaceState({}, "", url.toString());
    } else if (params.get("gbp_error")) {
      const err = params.get("gbp_error") || "";
      setMsg({ type: "err", text: t(lang, "reviews.gbp.connectError").replace("{{error}}", err) });
      const url = new URL(window.location.href);
      url.searchParams.delete("gbp_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [lang]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiRequest<{ ok: boolean } & GbpStatus>("/api/admin/gbp/status", "GET", token);
      setStatus(res);
    } catch {
      setStatus({ connected: false, configured: false });
    }
  }, [token]);

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    setPlacesEnvMissing(false);
    try {
      const res = await apiRequest<{
        ok: boolean;
        reviews: GbpReview[];
        averageRating: number | null;
        totalReviewCount: number | null;
        source?: string;
        notConfigured?: boolean;
      }>("/api/admin/gbp/reviews", "GET", token);
      if (res.notConfigured) {
        setReviews([]);
        setAvgRating(null);
        setTotalCount(null);
        setReviewsSource(null);
        setPlacesEnvMissing(true);
        setMsg(null);
      } else {
        setReviews(res.reviews || []);
        setAvgRating(res.averageRating ?? null);
        setTotalCount(res.totalReviewCount ?? null);
        setReviewsSource(res.source === "places" ? "places" : "gbp");
        setMsg(null);
      }
    } catch (e) {
      setMsg({ type: "err", text: t(lang, "reviews.gbp.error") + " " + (e as Error).message });
    } finally {
      setReviewsLoading(false);
    }
  }, [token, lang]);

  useEffect(() => {
    setLoading(true);
    loadStatus().then(() => setLoading(false));
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected) {
      void loadReviews();
    }
  }, [status?.connected, loadReviews]);

  const handleConnect = async () => {
    try {
      const res = await apiRequest<{ ok: boolean; authUrl: string }>("/api/admin/gbp/auth-url", "GET", token);
      if (res.authUrl) window.location.href = res.authUrl;
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t(lang, "reviews.gbp.disconnectConfirm"))) return;
    try {
      await apiRequest("/api/admin/gbp/disconnect", "DELETE", token);
      setStatus((s) => s ? { ...s, connected: false } : s);
      setReviews([]);
      setMsg({ type: "ok", text: t(lang, "reviews.gbp.disconnect") + " ✓" });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  const [manualLocationId, setManualLocationId] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  const handleResolveLocation = async (locationId?: string) => {
    setMsg(null);
    try {
      const body = locationId ? { locationId } : {};
      const res = await apiRequest<{ ok: boolean; accountId: string; locationId: string }>("/api/admin/gbp/resolve", "POST", token, Object.keys(body).length ? body : undefined);
      setMsg({ type: "ok", text: "Location gesetzt: " + res.locationId });
      setShowManualInput(false);
      setManualLocationId("");
      await loadStatus();
      await loadReviews();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  const openReply = (reviewName: string, existingReply: string) => {
    setReplyMap((m) => ({
      ...m,
      [reviewName]: { open: true, text: existingReply || "", saving: false, deleting: false },
    }));
  };

  const closeReply = (reviewName: string) => {
    setReplyMap((m) => { const n = { ...m }; delete n[reviewName]; return n; });
  };

  const sendReply = async (reviewName: string) => {
    const entry = replyMap[reviewName];
    if (!entry || !entry.text.trim()) return;
    setReplyMap((m) => ({ ...m, [reviewName]: { ...m[reviewName], saving: true } }));
    setMsg(null);
    try {
      await apiRequest("/api/admin/gbp/reviews/reply", "PUT", token, { reviewName, comment: entry.text.trim() });
      setMsg({ type: "ok", text: t(lang, "reviews.gbp.replySent") });
      closeReply(reviewName);
      await loadReviews();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
      setReplyMap((m) => ({ ...m, [reviewName]: { ...m[reviewName], saving: false } }));
    }
  };

  const deleteReply = async (reviewName: string) => {
    if (!window.confirm(t(lang, "reviews.gbp.deleteReplyConfirm"))) return;
    setReplyMap((m) => ({ ...m, [reviewName]: { ...(m[reviewName] || { open: false, text: "", saving: false }), deleting: true } }));
    setMsg(null);
    try {
      await apiRequest("/api/admin/gbp/reviews/reply", "DELETE", token, { reviewName });
      setMsg({ type: "ok", text: t(lang, "reviews.gbp.replyDeleted") });
      closeReply(reviewName);
      await loadReviews();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
      setReplyMap((m) => { const n = { ...m }; delete n[reviewName]; return n; });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--accent-subtle)", borderTopColor: "#4285F4" }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header-Zeile */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <h2 className="font-semibold" style={{ color: "var(--text-main)" }}>{t(lang, "reviews.gbp.title")}</h2>
          {status?.connected && (
            <span className="cust-status-badge cust-status-completed text-xs">
              <CheckCircle2 className="h-3 w-3" />
              {t(lang, "reviews.gbp.connected")}
            </span>
          )}
          {avgRating != null && (
            <span className="text-sm font-medium text-yellow-500">{avgRating.toFixed(1)} ★</span>
          )}
          {totalCount != null && (
            <span className="text-xs" style={{ color: "var(--text-subtle)" }}>({totalCount})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status?.connected && (
            <button
              onClick={() => { void loadReviews(); }}
              disabled={reviewsLoading}
              className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs min-h-0 min-w-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reviewsLoading ? "animate-spin" : ""}`} />
              {t(lang, "reviews.gbp.refresh")}
            </button>
          )}
          {!readOnly && (status?.connected ? (
            <button
              onClick={() => { void handleDisconnect(); }}
              className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs min-h-0 min-w-0"
              style={{ color: "var(--text-subtle)" }}
            >
              <Link2Off className="h-3.5 w-3.5" />
              {t(lang, "reviews.gbp.disconnect")}
            </button>
          ) : (
            <button
              onClick={() => { void handleConnect(); }}
              disabled={!status?.configured}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: "#4285F4", color: "#fff" }}
            >
              <Link2 className="h-4 w-4" />
              {t(lang, "reviews.gbp.connect")}
            </button>
          ))}
        </div>
      </div>

      {/* Meldungen */}
      {msg && (
        <div className={`cust-alert ${msg.type === "ok" ? "cust-alert--success" : "cust-alert--error"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Verbunden aber Location fehlt */}
      {status?.connected && !status?.locationId && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
          <div className="flex items-start gap-3">
            <span className="text-sm flex-1" style={{ color: "var(--text-main)" }}>
              Google-Verbindung aktiv, aber der Standort konnte nicht automatisch ermittelt werden
              (Google Business Profile API benötigt Quota-Freigabe).
              Trage deine Location ID manuell ein:
            </span>
            {!readOnly ? (
            <button
              onClick={() => setShowManualInput((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
              style={{ background: "#f59e0b", color: "#fff" }}
            >
              {showManualInput ? "Abbrechen" : "Manuell eingeben"}
            </button>
            ) : null}
          </div>
          {!readOnly && showManualInput && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualLocationId}
                onChange={(e) => setManualLocationId(e.target.value)}
                placeholder="z.B. 08027544707664038446 oder accounts/.../locations/..."
                className="flex-1 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--input-bg)", color: "var(--text-main)" }}
              />
              <button
                onClick={() => { void handleResolveLocation(manualLocationId); }}
                disabled={!manualLocationId.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: "#4285F4", color: "#fff" }}
              >
                Speichern
              </button>
            </div>
          )}
        </div>
      )}

      {/* Places API Fallback Hinweis */}
      {reviewsSource === "places" && (
        <div className="rounded-xl border px-4 py-3 text-xs flex items-center gap-2" style={{ borderColor: "#e5e7eb", background: "#f9fafb", color: "var(--text-subtle)" }}>
          <span>⚠️</span>
          <span>
            Zeigt bis zu 5 Bewertungen via Google Places API (Übergangslösung).
            Antworten ist erst möglich sobald der Google Business Profile API-Zugriff genehmigt wurde.
          </span>
        </div>
      )}

      {/* Nicht verbunden / nicht konfiguriert */}
      {!status?.connected && (
        <div className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          {!status?.configured
            ? t(lang, "reviews.gbp.notConfigured")
            : t(lang, "reviews.gbp.notConnected")}
        </div>
      )}

      {/* Review-Liste */}
      {status?.connected && (
        reviewsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--text-subtle)" }}>
            <div className="h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent-subtle)", borderTopColor: "#4285F4" }} />
            {t(lang, "reviews.gbp.loading")}
          </div>
        ) : placesEnvMissing ? (
          <div
            className="rounded-xl border px-4 py-4 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-main)" }}
          >
            {t(lang, "reviews.gbp.placesEnvHint")}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-sm py-4" style={{ color: "var(--text-subtle)" }}>
            {t(lang, "reviews.gbp.empty")}
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((rv) => {
              const entry = replyMap[rv.name];
              const hasReply = !!rv.reply;
              return (
                <div key={rv.name} className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  {/* Review-Header */}
                  <div className="flex items-start gap-3">
                    <GbpAvatar author={rv.author} photo={rv.profilePhoto} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" style={{ color: "var(--text-main)" }}>
                          {rv.isAnonymous ? t(lang, "reviews.gbp.anonymous") : rv.author}
                        </span>
                        <GbpStars rating={rv.rating} />
                        <span
                          className={`cust-status-badge text-xs ${hasReply ? "cust-status-completed" : "cust-status-pending"}`}
                        >
                          {hasReply ? t(lang, "reviews.gbp.status.replied") : t(lang, "reviews.gbp.status.open")}
                        </span>
                        {rv.createTime && (
                          <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                            {new Date(rv.createTime).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </span>
                        )}
                      </div>
                      {rv.comment && (
                        <p className="text-sm mt-1" style={{ color: "var(--text-main)" }}>{rv.comment}</p>
                      )}
                    </div>
                    {/* Aktionen */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!readOnly && reviewsSource !== "places" && <button
                        onClick={() => openReply(rv.name, rv.reply?.comment || "")}
                        className="cust-action-icon min-h-0 min-w-0"
                        title={hasReply ? t(lang, "reviews.gbp.editReply") : t(lang, "reviews.gbp.reply")}
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>}
                      {!readOnly && hasReply && (
                        <button
                          onClick={() => { void deleteReply(rv.name); }}
                          disabled={replyMap[rv.name]?.deleting}
                          className="cust-action-icon min-h-0 min-w-0 disabled:opacity-50"
                          title={t(lang, "reviews.gbp.deleteReply")}
                          style={{ color: "var(--text-subtle)" }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bestehende Antwort anzeigen */}
                  {hasReply && !entry?.open && (
                    <div className="ml-11 pl-3 border-l-2 text-sm" style={{ borderColor: "#4285F4", color: "var(--text-muted)" }}>
                      <span className="text-xs font-medium" style={{ color: "#4285F4" }}>Propus GmbH · </span>
                      {rv.reply!.comment}
                    </div>
                  )}

                  {/* Antwort-Eingabe */}
                  {entry?.open && !readOnly && (
                    <div className="ml-11 space-y-2">
                      <textarea
                        value={entry.text}
                        onChange={(e) => setReplyMap((m) => ({ ...m, [rv.name]: { ...m[rv.name], text: e.target.value } }))}
                        rows={3}
                        className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
                        style={{ borderColor: "var(--border)", background: "var(--input-bg)", color: "var(--text-main)" }}
                        placeholder={t(lang, "reviews.gbp.replyPlaceholder")}
                        disabled={entry.saving}
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { void sendReply(rv.name); }}
                          disabled={entry.saving || !entry.text.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                          style={{ background: "#4285F4", color: "#fff" }}
                        >
                          <Send className="h-3 w-3" />
                          {entry.saving ? "..." : t(lang, "reviews.gbp.send")}
                        </button>
                        <button
                          onClick={() => closeReply(rv.name)}
                          disabled={entry.saving}
                          className="btn-secondary px-3 py-1.5 rounded-lg text-xs min-h-0 min-w-0"
                        >
                          {t(lang, "reviews.gbp.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

export function ReviewsPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language) as Lang;
  const { can } = usePermissions();
  const canManageReviews = can("reviews.manage");
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

  const toggleGoogleFlag = async (orderNo: number, currentValue: boolean | null) => {
    setActionMap((m) => ({ ...m, [orderNo]: "flagging" }));
    setMsg(null);
    try {
      const newValue = currentValue === true ? false : true;
      await apiRequest<{ ok: boolean }>(
        `/api/admin/orders/${orderNo}/review/google-flag`,
        "PATCH",
        token,
        { google_review_left: newValue }
      );
      setMsg({
        type: "ok",
        text: newValue
          ? t(lang, "reviews.success.googleFlagSet").replace("{{orderNo}}", String(orderNo))
          : t(lang, "reviews.success.googleFlagUnset").replace("{{orderNo}}", String(orderNo)),
      });
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

      {/* Google Reviews Panel */}
      <div className="cust-card p-5">
        <GbpPanel token={token} lang={lang} readOnly={!canManageReviews} />
      </div>

      {/* Interne Review-Tabelle */}
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
                      {row.done_at ? new Date(row.done_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
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
                            <div className="text-xs" style={{ color: "var(--text-subtle)" }}>{new Date(row.submitted_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-subtle)" }}>—</span>
                      )}
                      {row.google_review_left === true && (
                        <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: "#4285F4" }}>
                          <ThumbsUp className="h-3 w-3" />
                          {t(lang, "reviews.label.googleReviewed")}
                        </div>
                      )}
                    </td>
                    <td>
                      {canManageReviews ? (
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {row.review_id != null && (
                          <button
                            onClick={() => { void toggleGoogleFlag(row.order_no, row.google_review_left); }}
                            disabled={actionMap[row.order_no] === "flagging"}
                            className="cust-action-icon disabled:opacity-50"
                            title={row.google_review_left === true
                              ? t(lang, "reviews.button.googleFlagUnset")
                              : t(lang, "reviews.button.googleFlagSet")}
                            style={row.google_review_left === true ? { color: "#4285F4" } : undefined}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-subtle)" }}>—</span>
                      )}
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

