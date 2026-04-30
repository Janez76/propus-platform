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

function audioFilename(audioUri: string, mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  const uriExtension = audioUri.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (uriExtension && ['m4a', 'mp4', 'mp3', 'wav', 'webm', 'ogg'].includes(uriExtension)) {
    return `audio.${uriExtension === 'mp4' ? 'm4a' : uriExtension}`;
  }
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'audio.m4a';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'audio.mp3';
  if (normalized.includes('wav')) return 'audio.wav';
  if (normalized.includes('ogg')) return 'audio.ogg';
  return 'audio.webm';
}

export async function transcribe(audioUri: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  // React Native accepts URI-backed file parts although DOM FormData types do not.
  const audioPart = {
    uri: audioUri,
    name: audioFilename(audioUri, mimeType),
    type: mimeType,
  } as unknown as Blob;
  formData.append('audio', audioPart);

  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/assistant/transcribe`, {
    method: 'POST',
    body: formData,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Transkription fehlgeschlagen (${res.status})`);
  }
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
