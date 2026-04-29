"use client";

import { Component, useEffect, type ReactNode } from "react";

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
    // sessionStorage nicht verfügbar: lieber keinen Reload-Loop riskieren.
    return;
  }
  window.location.reload();
}

/**
 * Globaler Event-Listener für Chunk-Fehler die NICHT durch React-Boundaries
 * abgefangen werden (z. B. Script-Load-Fehler, unhandled promise rejections).
 */
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

interface ChunkErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
  reloadScheduled: boolean;
}

/**
 * React ErrorBoundary speziell für ChunkLoadErrors aus React.lazy().
 *
 * React fängt Fehler aus lazy() intern ab – sie erreichen weder
 * window.onerror noch window.unhandledrejection. Deshalb braucht es
 * diese separate Boundary, die ChunkLoadErrors erkennt und einen
 * einmaligen Reload auslöst. Alle anderen Fehler werden normal weiter-
 * geworfen damit die übergeordnete Fehlerbehandlung greift.
 */
export class ChunkErrorBoundary extends Component<
  { children: ReactNode },
  ChunkErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, isChunkError: false, reloadScheduled: false };
  }

  static getDerivedStateFromError(error: unknown): ChunkErrorBoundaryState {
    return {
      hasError: true,
      isChunkError: isStaleChunkError(error),
      reloadScheduled: false,
    };
  }

  componentDidCatch(error: unknown) {
    if (isStaleChunkError(error)) {
      reloadOnce();
      this.setState({ reloadScheduled: true });
    }
  }

  render() {
    if (this.state.hasError && this.state.isChunkError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--surface)] text-[var(--text)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent,#B68E20)]/25 border-t-[var(--accent,#B68E20)]" />
          <p className="text-sm text-[var(--text-muted,#999)]">Seite wird nach Update neu geladen…</p>
        </div>
      );
    }
    if (this.state.hasError) {
      throw new Error("Non-chunk error re-thrown from ChunkErrorBoundary");
    }
    return this.props.children;
  }
}
