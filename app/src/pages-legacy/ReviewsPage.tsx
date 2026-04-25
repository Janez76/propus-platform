import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Star,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Link2,
  Link2Off,
  Reply,
  Trash2,
  Download,
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

type UnifiedReview = {
  key: string;
  source: "google" | "local";
  rating: number;
  customer: string;
  customerCo: string | null;
  text: string;
  date: string;
  responded: boolean;
  response: string | null;
  orderNo: number | null;
  internalRow: ReviewRow | null;
  gbpReview: GbpReview | null;
};

type FilterId = "recent" | "pending" | "fivestar" | "lowrating" | "all";

function isSyntheticCompanyEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase().endsWith("@company.local");
}

function toVisibleCustomerEmail(value?: string | null) {
  return isSyntheticCompanyEmail(value) ? "" : String(value || "");
}

function customerInitials(label: string | null): string {
  if (!label) return "—";
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatReviewDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

function Stars({ n }: { n: number }) {
  return (
    <span className="bw-stars" aria-label={`${n} von 5 Sternen`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? undefined : "is-empty"}>★</span>
      ))}
    </span>
  );
}

function normalizeInternal(row: ReviewRow): UnifiedReview | null {
  // Include any internal review with a star rating, even if the customer
  // didn't leave a comment — these are still valid feedback signals and
  // should count towards average/distribution/filters.
  if (row.rating == null) return null;
  const co = toVisibleCustomerEmail(row.customer_email);
  return {
    key: `local-${row.order_no}`,
    source: "local",
    rating: row.rating,
    customer: row.customer_name || "—",
    customerCo: co || null,
    text: row.comment || "",
    date: row.submitted_at || row.done_at || "",
    // Internal reviews don't have a public reply mechanism. Treat as
    // already-handled to keep them out of the "Ohne Antwort" filter
    // (which is reserved for unanswered Google reviews).
    responded: true,
    response: null,
    orderNo: row.order_no,
    internalRow: row,
    gbpReview: null,
  };
}

function normalizeGbp(rv: GbpReview): UnifiedReview {
  return {
    key: `gbp-${rv.reviewId || rv.name}`,
    source: "google",
    rating: rv.rating,
    customer: rv.isAnonymous ? "Anonym" : rv.author,
    customerCo: "Google",
    text: rv.comment || "",
    date: rv.createTime || "",
    responded: !!rv.reply,
    response: rv.reply?.comment ?? null,
    orderNo: null,
    internalRow: null,
    gbpReview: rv,
  };
}

function withinLast30Days(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return false;
  return (Date.now() - d) / 86400000 <= 30;
}

function applyFilter(reviews: UnifiedReview[], filter: FilterId): UnifiedReview[] {
  return reviews.filter((r) => {
    if (filter === "recent") return withinLast30Days(r.date);
    if (filter === "pending") return !r.responded;
    if (filter === "fivestar") return r.rating === 5;
    if (filter === "lowrating") return r.rating <= 3;
    return true;
  });
}

export function ReviewsPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language) as Lang;
  const { can } = usePermissions();
  const canManageReviews = can("reviews.manage");

  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [internalReviews, setInternalReviews] = useState<ReviewRow[]>([]);
  const [gbpStatus, setGbpStatus] = useState<GbpStatus | null>(null);
  const [gbpReviews, setGbpReviews] = useState<GbpReview[]>([]);
  const [gbpAvgRating, setGbpAvgRating] = useState<number | null>(null);
  const [gbpTotalCount, setGbpTotalCount] = useState<number | null>(null);
  const [gbpSource, setGbpSource] = useState<"gbp" | "places" | null>(null);

  const [loading, setLoading] = useState(true);
  const [gbpLoading, setGbpLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);
  const [filter, setFilter] = useState<FilterId>("recent");
  const [googleLink, setGoogleLink] = useState("https://g.page/r/CSQ5RnWmJOumEAE/review");
  const [replyMap, setReplyMap] = useState<Record<string, { open: boolean; text: string; saving: boolean; deleting: boolean }>>({});
  const [manualLocationId, setManualLocationId] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiRequest<{ ok: boolean } & GbpStatus>("/api/admin/gbp/status", "GET", token);
      setGbpStatus(res);
      return res;
    } catch {
      const fallback: GbpStatus = { connected: false, configured: false };
      setGbpStatus(fallback);
      return fallback;
    }
  }, [token]);

  const loadGbpReviews = useCallback(async () => {
    setGbpLoading(true);
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
        setGbpReviews([]);
        setGbpAvgRating(null);
        setGbpTotalCount(null);
        setGbpSource(null);
      } else {
        setGbpReviews(res.reviews || []);
        setGbpAvgRating(res.averageRating ?? null);
        setGbpTotalCount(res.totalReviewCount ?? null);
        setGbpSource(res.source === "places" ? "places" : "gbp");
      }
    } catch (e) {
      setMsg({ type: "err", text: t(lang, "reviews.gbp.error") + " " + (e as Error).message });
    } finally {
      setGbpLoading(false);
    }
  }, [token, lang]);

  const loadInternal = useCallback(async () => {
    try {
      const [kpiRes, listRes] = await Promise.all([
        apiRequest<{ ok: boolean; kpi: KpiData }>("/api/admin/reviews/kpi", "GET", token),
        apiRequest<{ ok: boolean; reviews: ReviewRow[] }>("/api/admin/reviews", "GET", token),
      ]);
      setKpi(kpiRes.kpi);
      setInternalReviews(listRes.reviews || []);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  }, [token]);

  useEffect(() => {
    apiRequest<{ ok: boolean; link: string }>("/api/reviews/google-link", "GET")
      .then((res) => { if (res.link) setGoogleLink(res.link); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    void Promise.all([loadInternal(), loadStatus()]).finally(() => setLoading(false));
  }, [loadInternal, loadStatus]);

  useEffect(() => {
    if (gbpStatus?.connected) void loadGbpReviews();
  }, [gbpStatus?.connected, loadGbpReviews]);

  // OAuth callback toasts
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

  /* ── Unified review feed ──────────────────────────────── */
  const unifiedReviews = useMemo<UnifiedReview[]>(() => {
    const list: UnifiedReview[] = [];
    for (const row of internalReviews) {
      const u = normalizeInternal(row);
      if (u) list.push(u);
    }
    for (const rv of gbpReviews) list.push(normalizeGbp(rv));
    return list.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
  }, [internalReviews, gbpReviews]);

  const counts = useMemo(() => ({
    all: unifiedReviews.length,
    recent: unifiedReviews.filter((r) => withinLast30Days(r.date)).length,
    pending: unifiedReviews.filter((r) => !r.responded).length,
    fivestar: unifiedReviews.filter((r) => r.rating === 5).length,
    lowrating: unifiedReviews.filter((r) => r.rating <= 3).length,
  }), [unifiedReviews]);

  const filtered = useMemo(() => applyFilter(unifiedReviews, filter), [unifiedReviews, filter]);

  /* ── KPIs (matching the design) ───────────────────────── */
  const totalReviews = unifiedReviews.length;
  const avgRating = useMemo(() => {
    if (totalReviews === 0) return null;
    return unifiedReviews.reduce((s, r) => s + r.rating, 0) / totalReviews;
  }, [unifiedReviews, totalReviews]);

  const dist = useMemo(() => {
    return [5, 4, 3, 2, 1].map((n) => {
      const count = unifiedReviews.filter((r) => r.rating === n).length;
      const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
      return { n, count, pct };
    });
  }, [unifiedReviews, totalReviews]);

  // Response rate measures how many reply-eligible reviews we've actually
  // replied to. Internal reviews don't have a public reply mechanism, so
  // they are excluded from both the numerator and denominator — otherwise
  // a flood of local reviews would inflate the percentage.
  const responseRate = useMemo(() => {
    const eligible = unifiedReviews.filter((r) => r.source === "google");
    if (eligible.length === 0) return 0;
    return Math.round(eligible.filter((r) => r.responded).length / eligible.length * 100);
  }, [unifiedReviews]);

  const respondedGoogleCount = useMemo(
    () => unifiedReviews.filter((r) => r.source === "google" && r.responded).length,
    [unifiedReviews],
  );
  const totalGoogleCount = useMemo(
    () => unifiedReviews.filter((r) => r.source === "google").length,
    [unifiedReviews],
  );

  const sourceCounts = useMemo(() => ({
    google: unifiedReviews.filter((r) => r.source === "google").length,
    local: unifiedReviews.filter((r) => r.source === "local").length,
  }), [unifiedReviews]);

  /* ── GBP reply actions ────────────────────────────────── */
  const openReply = (key: string, existingReply: string) => {
    setReplyMap((m) => ({
      ...m,
      [key]: { open: true, text: existingReply || "", saving: false, deleting: false },
    }));
  };

  const closeReply = (key: string) => {
    setReplyMap((m) => { const n = { ...m }; delete n[key]; return n; });
  };

  const sendReply = async (review: UnifiedReview) => {
    if (!review.gbpReview) return;
    const entry = replyMap[review.key];
    if (!entry || !entry.text.trim()) return;
    setReplyMap((m) => ({ ...m, [review.key]: { ...m[review.key], saving: true } }));
    setMsg(null);
    try {
      await apiRequest("/api/admin/gbp/reviews/reply", "PUT", token, {
        reviewName: review.gbpReview.name,
        comment: entry.text.trim(),
      });
      setMsg({ type: "ok", text: t(lang, "reviews.gbp.replySent") });
      closeReply(review.key);
      await loadGbpReviews();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
      setReplyMap((m) => ({ ...m, [review.key]: { ...m[review.key], saving: false } }));
    }
  };

  const deleteReply = async (review: UnifiedReview) => {
    if (!review.gbpReview) return;
    if (!window.confirm(t(lang, "reviews.gbp.deleteReplyConfirm"))) return;
    setReplyMap((m) => ({
      ...m,
      [review.key]: { ...(m[review.key] || { open: false, text: "", saving: false }), deleting: true },
    }));
    setMsg(null);
    try {
      await apiRequest("/api/admin/gbp/reviews/reply", "DELETE", token, {
        reviewName: review.gbpReview.name,
      });
      setMsg({ type: "ok", text: t(lang, "reviews.gbp.replyDeleted") });
      closeReply(review.key);
      await loadGbpReviews();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
      setReplyMap((m) => { const n = { ...m }; delete n[review.key]; return n; });
    }
  };

  /* ── GBP connection actions ───────────────────────────── */
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
      setGbpStatus((s) => s ? { ...s, connected: false } : s);
      setGbpReviews([]);
      setMsg({ type: "ok", text: t(lang, "reviews.gbp.disconnect") + " ✓" });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  const handleResolveLocation = async (locationId?: string) => {
    setMsg(null);
    try {
      const body = locationId ? { locationId } : {};
      const res = await apiRequest<{ ok: boolean; accountId: string; locationId: string }>(
        "/api/admin/gbp/resolve",
        "POST",
        token,
        Object.keys(body).length ? body : undefined,
      );
      setMsg({ type: "ok", text: "Location gesetzt: " + res.locationId });
      setShowManualInput(false);
      setManualLocationId("");
      await loadStatus();
      await loadGbpReviews();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadInternal(), loadStatus()]);
      if (gbpStatus?.connected) await loadGbpReviews();
    } finally {
      setLoading(false);
    }
  }, [loadInternal, loadStatus, loadGbpReviews, gbpStatus?.connected]);

  /* ── Loading splash ───────────────────────────────────── */
  if (loading && unifiedReviews.length === 0) {
    return (
      <div className="bw-shell">
        <div className="bw-loader"><div className="bw-loader-dot" /></div>
      </div>
    );
  }

  /* ── KPI tiles ────────────────────────────────────────── */
  const avgDisplay = avgRating != null ? avgRating.toFixed(2) + " ★" : "—";

  /* ── Filter pills ─────────────────────────────────────── */
  const FILTERS: { id: FilterId; label: string }[] = [
    { id: "recent", label: t(lang, "reviews.filter.recent") || "Letzte 30 T." },
    { id: "pending", label: t(lang, "reviews.filter.pending") || "Ohne Antwort" },
    { id: "fivestar", label: t(lang, "reviews.filter.fivestar") || "5 Sterne" },
    { id: "lowrating", label: t(lang, "reviews.filter.lowrating") || "≤ 3 Sterne" },
    { id: "all", label: t(lang, "common.all") || "Alle" },
  ];

  return (
    <div className="bw-shell">
      <header className="bw-page-header">
        <div className="bw-ph-top">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="bw-eyebrow">
              {t(lang, "reviews.header.eyebrow") || "Reputation"} · {totalReviews} {t(lang, "reviews.header.count") || "Bewertungen"}
            </div>
            <h1 className="bw-h1">{t(lang, "reviews.title")}</h1>
            <div className="bw-ph-sub">
              {t(lang, "reviews.header.sub") || "Google- und lokale Bewertungen — Antworten verfassen, Trends beobachten."}
            </div>
          </div>
          <div className="bw-ph-actions">
            <a
              href={googleLink}
              target="_blank"
              rel="noopener noreferrer"
              className="bw-btn-ghost"
            >
              <ExternalLink />
              <span>{t(lang, "reviews.button.google")}</span>
            </a>
            <button type="button" onClick={() => { void refreshAll(); }} className="bw-btn-ghost">
              <RefreshCw />
              <span>{t(lang, "common.refresh")}</span>
            </button>
            {canManageReviews && (
              <button type="button" className="bw-btn-primary">
                <Download />
                <span>{t(lang, "common.export") || "Export"}</span>
              </button>
            )}
          </div>
        </div>

        <div className="bw-kpis">
          <div className="bw-kpi is-gold">
            <div className="bw-kpi-label">{t(lang, "reviews.kpi.avgRating") || "Ø Bewertung"}</div>
            <div className="bw-kpi-value is-gold">{avgDisplay}</div>
            <div className="bw-kpi-trend">{totalReviews} {t(lang, "reviews.kpi.totalSuffix") || "gesamt"}</div>
          </div>
          <div className="bw-kpi">
            <div className="bw-kpi-label">{t(lang, "reviews.kpi.fivestar") || "5-Sterne"}</div>
            <div className="bw-kpi-value">{counts.fivestar}</div>
            <div className="bw-kpi-trend is-up">
              {totalReviews > 0 ? Math.round(counts.fivestar / totalReviews * 100) : 0}%
            </div>
          </div>
          <div className="bw-kpi">
            <div className="bw-kpi-label">{t(lang, "reviews.kpi.pending") || "Ohne Antwort"}</div>
            <div className="bw-kpi-value">{counts.pending}</div>
            <div className={"bw-kpi-trend " + (counts.pending ? "is-warn" : "")}>
              {counts.pending === 0 ? (t(lang, "reviews.kpi.allReplied") || "Alle beantwortet") : (t(lang, "reviews.kpi.needsReply") || "warten auf Antwort")}
            </div>
          </div>
          <div className="bw-kpi">
            <div className="bw-kpi-label">{t(lang, "reviews.kpi.responseRate") || "Antwortquote"}</div>
            <div className="bw-kpi-value">{responseRate}%</div>
            <div className="bw-kpi-trend">
              {totalGoogleCount > 0
                ? `${respondedGoogleCount}/${totalGoogleCount} ${t(lang, "reviews.kpi.googleResponded") || "Google-Reviews beantwortet"}`
                : (t(lang, "reviews.kpi.noGoogleReviews") || "Keine Google-Reviews")}
            </div>
          </div>
        </div>
      </header>

      <div className="bw-content">
        {msg && (
          <div className={`bw-alert is-${msg.type === "ok" ? "success" : msg.type === "err" ? "error" : "info"}`}>
            {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            <span>{msg.text}</span>
            <button type="button" className="bw-alert-close" onClick={() => setMsg(null)} aria-label="Schliessen">✕</button>
          </div>
        )}

        {/* GBP setup banners */}
        {gbpStatus && !gbpStatus.connected && (
          <div className="bw-gbp-banner">
            <div className="bw-gbp-info">
              <strong>{t(lang, "reviews.gbp.title")}</strong>
              <span>
                {!gbpStatus.configured
                  ? t(lang, "reviews.gbp.notConfigured")
                  : t(lang, "reviews.gbp.notConnected")}
              </span>
            </div>
            {canManageReviews && (
              <button
                type="button"
                className="bw-btn-primary"
                onClick={() => { void handleConnect(); }}
                disabled={!gbpStatus.configured}
              >
                <Link2 />
                <span>{t(lang, "reviews.gbp.connect")}</span>
              </button>
            )}
          </div>
        )}

        {gbpStatus?.connected && !gbpStatus.locationId && (
          <div className="bw-alert is-warn">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 6 }}>
                Google-Verbindung aktiv, aber der Standort konnte nicht automatisch ermittelt werden. Trage deine Location ID manuell ein.
              </div>
              {canManageReviews && showManualInput ? (
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    className="bw-input"
                    value={manualLocationId}
                    onChange={(e) => setManualLocationId(e.target.value)}
                    placeholder="z. B. 08027544707664038446 oder accounts/.../locations/…"
                  />
                  <button
                    type="button"
                    className="bw-btn-primary"
                    onClick={() => { void handleResolveLocation(manualLocationId); }}
                    disabled={!manualLocationId.trim()}
                  >
                    Speichern
                  </button>
                  <button type="button" className="bw-btn-ghost" onClick={() => setShowManualInput(false)}>
                    Abbrechen
                  </button>
                </div>
              ) : canManageReviews ? (
                <button type="button" className="bw-btn-outline-gold" onClick={() => setShowManualInput(true)}>
                  Manuell eingeben
                </button>
              ) : null}
            </div>
          </div>
        )}

        {gbpSource === "places" && (
          <div className="bw-alert is-info">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>
              Zeigt bis zu 5 Bewertungen via Google Places API (Übergangslösung). Antworten ist erst möglich,
              sobald der Google Business Profile API-Zugriff genehmigt ist.
            </span>
          </div>
        )}

        <div className="bw-grid">
          <div>
            <div className="bw-filterbar">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={"bw-filter-pill" + (filter === f.id ? " is-active" : "")}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="bw-count">{counts[f.id]}</span>
                </button>
              ))}
            </div>

            <div className="bw-reviews-list">
              {filtered.length === 0 ? (
                <div className="bw-empty">
                  <div className="bw-empty-icon"><Star /></div>
                  <div className="bw-empty-title">{t(lang, "reviews.table.empty")}</div>
                  <div className="bw-empty-sub">
                    Sobald neue Bewertungen eingehen, erscheinen sie hier. Wechsle auf «Alle», um auch ältere zu sehen.
                  </div>
                </div>
              ) : (
                filtered.map((r) => (
                  <ReviewCard
                    key={r.key}
                    r={r}
                    canManage={canManageReviews}
                    replyState={replyMap[r.key]}
                    onOpenReply={openReply}
                    onCloseReply={closeReply}
                    onChangeReply={(text) => setReplyMap((m) => ({ ...m, [r.key]: { ...m[r.key], text } }))}
                    onSendReply={() => { void sendReply(r); }}
                    onDeleteReply={() => { void deleteReply(r); }}
                    canReplyToGoogle={gbpSource !== "places"}
                    lang={lang}
                  />
                ))
              )}
            </div>
          </div>

          <aside className="bw-aside">
            <section className="bw-card">
              <div className="bw-card-head"><h3>{t(lang, "reviews.aside.distribution") || "Verteilung"}</h3></div>
              <div className="bw-card-body">
                {dist.map((d) => (
                  <div key={d.n} className="bw-dist-row">
                    <span className="bw-dist-label">{d.n} ★</span>
                    <div className="bw-dist-bar">
                      <div
                        className="bw-dist-fill"
                        style={{
                          width: d.pct + "%",
                          background: d.n >= 4 ? "var(--gold-600)" : d.n === 3 ? "#C5A073" : "#B85540",
                        }}
                      />
                    </div>
                    <span className="bw-dist-count">{d.count}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bw-card">
              <div className="bw-card-head"><h3>{t(lang, "reviews.aside.sources") || "Quellen"}</h3></div>
              <div className="bw-card-body">
                <div className="bw-source-row"><span>Google</span><span>{sourceCounts.google}</span></div>
                <div className="bw-source-row"><span>Lokal</span><span>{sourceCounts.local}</span></div>
                {gbpAvgRating != null && (
                  <div className="bw-source-row" style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 8, marginTop: 4 }}>
                    <span>Ø Google</span><span>{gbpAvgRating.toFixed(1)} ★</span>
                  </div>
                )}
                {gbpTotalCount != null && (
                  <div className="bw-source-row">
                    <span>Google gesamt</span><span>{gbpTotalCount}</span>
                  </div>
                )}
              </div>
            </section>

            {gbpStatus?.connected && canManageReviews && (
              <section className="bw-card">
                <div className="bw-card-head"><h3>Google Verbindung</h3></div>
                <div className="bw-card-body">
                  <div className="bw-source-row"><span>Status</span><span style={{ color: "var(--success)" }}>verbunden</span></div>
                  {gbpLoading && (
                    <div className="bw-source-row"><span>Lade…</span><span>—</span></div>
                  )}
                  <button
                    type="button"
                    className="bw-btn-ghost bw-btn-sm"
                    onClick={() => { void handleDisconnect(); }}
                    style={{ marginTop: 8, alignSelf: "flex-start" }}
                  >
                    <Link2Off />
                    <span>{t(lang, "reviews.gbp.disconnect")}</span>
                  </button>
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

type ReviewCardProps = {
  r: UnifiedReview;
  canManage: boolean;
  replyState: { open: boolean; text: string; saving: boolean; deleting: boolean } | undefined;
  onOpenReply: (key: string, existingReply: string) => void;
  onCloseReply: (key: string) => void;
  onChangeReply: (text: string) => void;
  onSendReply: () => void;
  onDeleteReply: () => void;
  canReplyToGoogle: boolean;
  lang: Lang;
};

function ReviewCard({
  r, canManage, replyState, onOpenReply, onCloseReply,
  onChangeReply, onSendReply, onDeleteReply, canReplyToGoogle, lang,
}: ReviewCardProps) {
  const isGoogle = r.source === "google";
  const replyOpen = replyState?.open;
  return (
    <article className="bw-review-card">
      <div className="bw-review-head">
        {isGoogle && r.gbpReview?.profilePhoto ? (
          <img
            src={r.gbpReview.profilePhoto}
            alt={r.customer}
            className="bw-avatar is-google"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className={"bw-avatar" + (isGoogle ? " is-google" : "")}>
            {customerInitials(r.customer)}
          </span>
        )}
        <div className="bw-author">
          <p className="bw-author-name">{r.customer}</p>
          {r.customerCo && <p className="bw-author-co">{r.customerCo}</p>}
        </div>
        <div className="bw-review-meta-r">
          <Stars n={r.rating} />
          <div className="bw-review-date">{formatReviewDate(r.date)}</div>
        </div>
      </div>
      {r.text && <p className="bw-review-text">{r.text}</p>}
      <div className="bw-review-meta">
        <span className={"bw-chip " + (isGoogle ? "is-google" : "is-local")}>
          {isGoogle ? "Google" : "Lokal"}
        </span>
        {r.orderNo != null && (
          <span className="bw-review-orderno">#{r.orderNo}</span>
        )}
      </div>

      {/* Existing response (non-edit mode) */}
      {r.responded && r.response && !replyOpen && (
        <div className="bw-review-response">
          <div className="bw-response-label">
            {t(lang, "reviews.response.title") || "Unsere Antwort"}
          </div>
          <div className="bw-response-text">{r.response}</div>
          {isGoogle && canManage && canReplyToGoogle && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                type="button"
                className="bw-btn-ghost bw-btn-sm"
                onClick={() => onOpenReply(r.key, r.response || "")}
              >
                <Reply />
                <span>{t(lang, "reviews.gbp.editReply") || "Antwort bearbeiten"}</span>
              </button>
              <button
                type="button"
                className="bw-btn-ghost bw-btn-sm"
                onClick={onDeleteReply}
                disabled={replyState?.deleting}
              >
                <Trash2 />
                <span>{t(lang, "reviews.gbp.deleteReply") || "Antwort löschen"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* No reply yet — Google review only */}
      {!r.responded && isGoogle && (
        <div className="bw-needs-reply">
          <span className="bw-needs-reply-text">
            ⚠ {t(lang, "reviews.response.missing") || "Noch keine Antwort verfasst."}
          </span>
          {canManage && canReplyToGoogle && (
            <button
              type="button"
              className="bw-btn-outline-gold bw-btn-sm"
              onClick={() => onOpenReply(r.key, "")}
            >
              <Reply />
              <span>{t(lang, "reviews.gbp.reply") || "Antworten"}</span>
            </button>
          )}
        </div>
      )}

      {/* Inline reply form */}
      {replyOpen && (
        <div className="bw-reply-form">
          <textarea
            value={replyState?.text || ""}
            onChange={(e) => onChangeReply(e.target.value)}
            placeholder={t(lang, "reviews.gbp.replyPlaceholder")}
            disabled={replyState?.saving}
            rows={3}
          />
          <div className="bw-reply-form-actions">
            <button
              type="button"
              className="bw-btn-primary bw-btn-sm"
              onClick={onSendReply}
              disabled={replyState?.saving || !replyState?.text.trim()}
            >
              <Send />
              <span>{replyState?.saving ? "…" : t(lang, "reviews.gbp.send")}</span>
            </button>
            <button
              type="button"
              className="bw-btn-ghost bw-btn-sm"
              onClick={() => onCloseReply(r.key)}
              disabled={replyState?.saving}
            >
              {t(lang, "reviews.gbp.cancel")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
