"use client";

import { useEffect } from "react";

/**
 * Lädt die Seite einmalig neu, wenn der Browser nach einem Deploy auf
 * gelöschte Chunks oder unbekannte Server-Action-IDs trifft.
 *
 * Schutz gegen Reload-Loops: vor dem Reload wird ein Marker in der
 * sessionStorage gesetzt; bei einem zweiten Treffer in derselben Session
 * wird nicht erneut geladen.
 */
const STORAGE_KEY = "stale_client_reload_at";
const COOLDOWN_MS = 60_000;

function isStaleChunkError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "ChunkLoadError") return true;
  const msg = String(e.message || err);
  if (/Loading chunk \S+ failed/i.test(msg)) return true;
  if (/Server Action ".*" was not found/i.test(msg)) return true;
  if (/UnrecognizedActionError/i.test(msg)) return true;
  return false;
}

function reloadOnce() {
  try {
    const last = Number(window.sessionStorage.getItem(STORAGE_KEY) || 0);
    if (last && Date.now() - last < COOLDOWN_MS) return;
    window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable – noop, lieber kein Reload
    return;
  }
  window.location.reload();
}

export function StaleClientReloadHandler() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isStaleChunkError(event.error ?? event.message)) {
        reloadOnce();
      }
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      if (isStaleChunkError(event.reason)) {
        reloadOnce();
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);
  return null;
}
