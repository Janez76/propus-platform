/**
 * API-Client — kommuniziert mit dem propus-platform Backend.
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? 'https://admin-booking.propus.ch';

const TOKEN_KEY = 'propus_auth_token';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function rejectIfUnauthorized(res: Response): Promise<void> {
  if (res.status === 401) {
    // Token ist tot/revoked/abgelaufen → SecureStore leeren, damit das
    // Auth-Gate beim naechsten Layout-Render zurueck zum Login navigiert.
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    throw new UnauthorizedError();
  }
}

export interface AssistantResponse {
  finalText: string;
  history: unknown[];
  toolCallsExecuted: Array<{
    name: string;
    durationMs: number;
    error?: string;
  }>;
}

export interface WhoamiResponse {
  ok: true;
  role: string;
  userKey: string | null;
  userName: string | null;
  email: string | null;
}

/**
 * Probe-Call gegen /api/assistant/whoami mit einem expliziten Token.
 * Nutzt KEINEN gespeicherten Token — wird im Login verwendet, BEVOR der
 * Token in den SecureStore wandert.
 */
export async function verifyToken(token: string): Promise<WhoamiResponse> {
  const res = await fetch(`${API_BASE}/api/assistant/whoami`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new UnauthorizedError('Token wurde abgelehnt');
  if (!res.ok) throw new Error(`Auth-Check fehlgeschlagen (${res.status})`);
  return (await res.json()) as WhoamiResponse;
}

export async function transcribe(audioUri: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    name: 'audio.m4a',
    type: mimeType,
    // @ts-expect-error — RN FormData-Typen
  });

  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/assistant/transcribe`, {
    method: 'POST',
    body: formData,
    headers,
  });
  await rejectIfUnauthorized(res);
  if (!res.ok) throw new Error(`Transkription fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as { text: string };
  return data.text;
}

export async function sendMessage(
  userMessage: string,
  history: unknown[] = [],
): Promise<AssistantResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/assistant`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userMessage, history }),
  });
  await rejectIfUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Fehler ${res.status}`);
  }
  return res.json();
}

export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function hasAuthToken(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return !!token;
}
