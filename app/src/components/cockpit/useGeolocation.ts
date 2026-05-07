'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

/**
 * Bug-Hunt MEDIUM M09: typisierter Error-Code statt freitext-`error`-String,
 * damit Caller (TodayCard, ConversationView) zwischen "Permission denied"
 * (User muss Browser-Setting aendern), "Position nicht verfuegbar" (GPS-
 * Hardware), "Timeout" (schwaches Signal) und "Browser unterstuetzt es nicht"
 * unterscheiden und die UI gezielt formulieren koennen.
 *
 * `error` (Freitext) bleibt als zusaetzliches Feld bestehen — keine Caller-
 * Aenderung noetig, wer schon `geo.error` rendert.
 */
export type GeoErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'other';

export type GeoError = {
  code: GeoErrorCode;
  message: string;
};

interface UseGeolocationReturn {
  position: GeoPosition | null;
  loading: boolean;
  error: string | null;
  /** Bug-Hunt M09: typisiertes Pendant zu `error` fuer kontextspezifische UI. */
  errorCode: GeoErrorCode | null;
  /** Permission persistiert. True = User hat Standort-Sharing aktiv erlaubt. */
  enabled: boolean;
  /**
   * Triggert einen frischen `getCurrentPosition`-Call.
   *
   * Bug-Hunt MEDIUM M10: Promise resolved *immer* — Erfolg liefert eine
   * `GeoPosition`, jeder Fehler (Permission denied, Timeout, no GPS,
   * Browser-Support) liefert ein typisiertes `GeoError`. Vorher resolved
   * die Promise mit `null` und der Caller konnte Permission-denied nicht
   * von einem Browser-Support-Fehler unterscheiden, ohne `error`/`errorCode`
   * separat zu lesen. Die State-Felder `position`, `error`, `errorCode`,
   * `loading` werden parallel zum Promise-Resolve aktualisiert; Caller die
   * `void geo.request()` nutzen, brauchen nichts zu aendern.
   */
  request: () => Promise<{ ok: true; position: GeoPosition } | { ok: false; error: GeoError }>;
  clear: () => void;
}

const STORAGE_DEFAULT = 'propus.cockpit.geo.enabled.v1';
const MAX_AGE_DEFAULT_MS = 60_000;
const TIMEOUT_DEFAULT_MS = 10_000;

export type UseGeolocationOptions = {
  /** localStorage-Key für den Opt-In (z. B. Cockpit, Dashboard oder Assistant). */
  storageKey?: string;
  maximumAgeMs?: number;
  timeoutMs?: number;
};

export function mapBrowserError(err: GeolocationPositionError): GeoError {
  // Browser GeolocationPositionError codes:
  // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  if (err.code === 1) return { code: 'denied', message: 'Standort-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.' };
  if (err.code === 2) return { code: 'unavailable', message: 'Position nicht verfügbar.' };
  if (err.code === 3) return { code: 'timeout', message: 'Standort-Anfrage Timeout.' };
  return { code: 'other', message: err.message || 'Standort-Fehler' };
}

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
  const [errorCode, setErrorCode] = useState<GeoErrorCode | null>(null);
  const [enabled, setEnabled] = useState(false);

  /**
   * Bug-Hunt MEDIUM M07: ohne In-Flight-Coalesce kann ein Doppel-Klick auf
   * den «Standort teilen»-Button (oder zwei Komponenten, die gleichzeitig
   * `request()` rufen — TodayCard + ConversationView) zwei parallele
   * `getCurrentPosition`-Calls starten. Das spaeter resolvende Callback
   * ueberschreibt die Position des frueheren — Lat/Lng-Snapshots in
   * verschiedenen Komponenten driften auseinander. Mit Singleton-Promise
   * deduplizieren wir parallele Aufrufe.
   */
  type RequestResult = { ok: true; position: GeoPosition } | { ok: false; error: GeoError };
  const inFlightRef = useRef<Promise<RequestResult> | null>(null);

  const request = useCallback(async (): Promise<RequestResult> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const e: GeoError = {
        code: 'unsupported',
        message: 'Geolocation wird von diesem Browser nicht unterstützt.',
      };
      setError(e.message);
      setErrorCode(e.code);
      return { ok: false, error: e };
    }
    setLoading(true);
    setError(null);
    setErrorCode(null);
    const promise = new Promise<RequestResult>((resolve) => {
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
          resolve({ ok: true, position: p });
        },
        (err) => {
          const e = mapBrowserError(err);
          setError(e.message);
          setErrorCode(e.code);
          setLoading(false);
          if (e.code === 'denied') {
            // Bug-Hunt M09: bei Permission-Denied kein Auto-Retry beim
            // naechsten Mount — der Browser merkt sich die Verweigerung,
            // erneutes getCurrentPosition wuerde sofort wieder den Error
            // ausloesen. User muss explizit klicken (oder im Browser
            // freigeben) → wir clearen den Opt-In.
            setEnabled(false);
            try {
              window.localStorage.removeItem(storageKey);
            } catch {
              /* */
            }
          }
          resolve({ ok: false, error: e });
        },
        { enableHighAccuracy: false, maximumAge: maxAgeMs, timeout: timeoutMs },
      );
    });
    inFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      inFlightRef.current = null;
    }
  }, [storageKey, maxAgeMs, timeoutMs]);

  const clear = useCallback(() => {
    setPosition(null);
    setEnabled(false);
    setError(null);
    setErrorCode(null);
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

  return { position, loading, error, errorCode, enabled, request, clear };
}
