'use client';

import { useCallback, useEffect, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface UseGeolocationReturn {
  position: GeoPosition | null;
  loading: boolean;
  error: string | null;
  /** Permission persistiert. True = User hat Standort-Sharing aktiv erlaubt. */
  enabled: boolean;
  request: () => Promise<GeoPosition | null>;
  clear: () => void;
}

const STORAGE_DEFAULT = 'propus.cockpit.geo.enabled.v1';
const MAX_AGE_DEFAULT_MS = 60_000;
const TIMEOUT_DEFAULT_MS = 10_000;

export type UseGeolocationOptions = {
  /** localStorage-Key für den Opt-In (z. B. Dashboard vs. Cockpit). */
  storageKey?: string;
  maximumAgeMs?: number;
  timeoutMs?: number;
};

/**
 * Wrapper um navigator.geolocation (Cockpit-Propi, Dashboard, Assistant).
 * Persistiert nur den Opt-In-State (`enabled`); die tatsächliche Position bleibt
 * in-Memory. Beim nächsten Mount mit `enabled=true` wird ein frischer Lookup
 * automatisch gestartet.
 */
export function useGeolocation(options?: UseGeolocationOptions): UseGeolocationReturn {
  const storageKey = options?.storageKey ?? STORAGE_DEFAULT;
  const maxAgeMs = options?.maximumAgeMs ?? MAX_AGE_DEFAULT_MS;
  const timeoutMs = options?.timeoutMs ?? TIMEOUT_DEFAULT_MS;

  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  const request = useCallback(async (): Promise<GeoPosition | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation wird nicht unterstützt');
      return null;
    }
    setLoading(true);
    setError(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p: GeoPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };
          setPosition(p);
          setEnabled(true);
          setLoading(false);
          try {
            window.localStorage.setItem(storageKey, 'true');
          } catch {
            /* quota */
          }
          resolve(p);
        },
        (err) => {
          const reason =
            err.code === 1
              ? 'Standort-Zugriff verweigert'
              : err.code === 2
                ? 'Position nicht verfügbar'
                : err.code === 3
                  ? 'Standort-Anfrage Timeout'
                  : err.message || 'Standort-Fehler';
          setError(reason);
          setLoading(false);
          if (err.code === 1) {
            setEnabled(false);
            try {
              window.localStorage.removeItem(storageKey);
            } catch {
              /* */
            }
          }
          resolve(null);
        },
        { enableHighAccuracy: false, maximumAge: maxAgeMs, timeout: timeoutMs },
      );
    });
  }, [storageKey, maxAgeMs, timeoutMs]);

  const clear = useCallback(() => {
    setPosition(null);
    setEnabled(false);
    setError(null);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* */
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'true' && active) {
        setEnabled(true);
        void request();
      }
    } catch {
      /* */
    }
    return () => {
      active = false;
    };
  }, [storageKey, request]);

  return { position, loading, error, enabled, request, clear };
}
