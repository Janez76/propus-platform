import { apiRequest } from "./client";

export interface ReviewsKpi {
  faellig: number;
  gesendet: number;
  beantwortet: number;
  responseRate: number;
  avgRating: number | null;
}

export interface ReviewRow {
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

export interface GbpStatus {
  connected: boolean;
  configured: boolean;
  accountId?: string | null;
  locationId?: string | null;
  expiresAt?: string | null;
}

export interface GbpReview {
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

export function getGoogleReviewLink() {
  return apiRequest<{ ok: boolean; link: string }>("/api/reviews/google-link", "GET");
}

export function getReviewsKpi(token: string) {
  return apiRequest<{ ok: boolean; kpi: ReviewsKpi }>("/api/admin/reviews/kpi", "GET", token);
}

export function getReviewsList(token: string) {
  return apiRequest<{ ok: boolean; reviews: ReviewRow[] }>("/api/admin/reviews", "GET", token);
}

export function resendReviewRequest(token: string, orderNo: number) {
  return apiRequest<{ ok: boolean; sentTo: string | null }>(`/api/admin/orders/${orderNo}/review/resend`, "POST", token);
}

export function dismissReviewRequest(token: string, orderNo: number) {
  return apiRequest<{ ok: boolean }>(`/api/admin/orders/${orderNo}/review/dismiss`, "PATCH", token);
}

export function setReviewGoogleFlag(token: string, orderNo: number, googleReviewLeft: boolean) {
  return apiRequest<{ ok: boolean }>(`/api/admin/orders/${orderNo}/review/google-flag`, "PATCH", token, {
    google_review_left: googleReviewLeft,
  });
}

export function getGbpStatus(token?: string) {
  return apiRequest<{ ok: boolean } & GbpStatus>("/api/admin/gbp/status", "GET", token);
}

export function getGbpReviews(token?: string) {
  return apiRequest<{
    ok: boolean;
    reviews: GbpReview[];
    averageRating: number | null;
    totalReviewCount: number | null;
    source?: string;
    notConfigured?: boolean;
  }>("/api/admin/gbp/reviews", "GET", token);
}

export function getGbpAuthUrl(token?: string) {
  return apiRequest<{ ok: boolean; authUrl: string }>("/api/admin/gbp/auth-url", "GET", token);
}

export function disconnectGbp(token?: string) {
  return apiRequest("/api/admin/gbp/disconnect", "DELETE", token);
}

export function resolveGbp(token: string | undefined, body: { accountId?: string; locationId?: string }) {
  return apiRequest<{ ok: boolean; accountId: string; locationId: string }>(
    "/api/admin/gbp/resolve",
    "POST",
    token,
    Object.keys(body).length ? body : undefined,
  );
}

export function upsertGbpReviewReply(token: string | undefined, reviewName: string, comment: string) {
  return apiRequest("/api/admin/gbp/reviews/reply", "PUT", token, { reviewName, comment });
}

export function deleteGbpReviewReply(token: string | undefined, reviewName: string) {
  return apiRequest("/api/admin/gbp/reviews/reply", "DELETE", token, { reviewName });
}
