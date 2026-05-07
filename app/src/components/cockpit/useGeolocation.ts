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

const STORAGE_KEY = 'propus.cockpit.geo.enabled.v1';
const MAX_AGE_MS = 60_000;
const TIMEOUT_MS = 10_000;

/**
 * Wrapper um navigator.geolocation für den Cockpit-Propi-Chat.
 * Persistiert nur den Opt-In-State (`enabled`); die tatsächliche Position bleibt
 * in-Memory. Beim nächsten Mount mit `enabled=true` wird ein frischer Lookup
 * automatisch gestartet.
 */
export function useGeolocation(): UseGeolocationReturn {
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
          try { window.localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* quota */ }
          resolve(p);
        },
        (err) => {
          // PERMISSION_DENIED = 1, POSITION_UNAVAILABLE = 2, TIMEOUT = 3
          const reason =
            err.code === 1 ? 'Standort-Zugriff verweigert' :
            err.code === 2 ? 'Position nicht verfügbar' :
            err.code === 3 ? 'Standort-Anfrage Timeout' :
            err.message || 'Standort-Fehler';
          setError(reason);
          setLoading(false);
          if (err.code === 1) {
            // User hat verweigert -> Opt-In zurücksetzen
            setEnabled(false);
            try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
          }
          resolve(null);
        },
        { enableHighAccuracy: false, maximumAge: MAX_AGE_MS, timeout: TIMEOUT_MS },
      );
    });
  }, []);

  const clear = useCallback(() => {
    setPosition(null);
    setEnabled(false);
    setError(null);
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
    }
  }, []);

  // On mount: re-request if user previously opted in
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'true' && active) {
        setEnabled(true);
        void request();
      }
    } catch { /* */ }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { position, loading, error, enabled, request, clear };
}
