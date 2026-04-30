/**
 * API-Client — kommuniziert mit dem propus-platform Backend.
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? 'https://admin-booking.propus.ch';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync('propus_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Fehler ${res.status}`);
  }
  return res.json();
}

export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('propus_auth_token', token);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync('propus_auth_token');
}

export async function hasAuthToken(): Promise<boolean> {
  const token = await SecureStore.getItemAsync('propus_auth_token');
  return !!token;
}
