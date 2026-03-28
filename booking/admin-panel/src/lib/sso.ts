import { API_BASE } from "../api/client";

export function getAdminRootUrl() {
  return new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString();
}

export function buildSsoLoginUrl() {
  const redirect = encodeURIComponent(getAdminRootUrl());
  return `${API_BASE}/auth/login?redirect=${redirect}`;
}

export function getSsoResetUrl() {
  const explicitResetUrl = String(import.meta.env.VITE_SSO_RESET_PASSWORD_URL || "").trim();
  if (explicitResetUrl) return explicitResetUrl;
  return buildSsoLoginUrl();
}

export function startSsoLogin() {
  window.location.href = buildSsoLoginUrl();
}

export function startSsoPasswordReset() {
  window.location.href = getSsoResetUrl();
}
