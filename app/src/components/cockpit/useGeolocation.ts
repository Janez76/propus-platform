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
  /**
   * Aktueller Sharing-State. Default: `true` (Standort wird beim ersten Mount
   * automatisch angefragt). Wird im Profil-Toggle auf `false` gesetzt → kein
   * Auto-Request, Position bleibt `null`. Browser-Permission ist orthogonal:
   * auch wenn `enabled === true` ist, kann der Browser den Zugriff verweigern.
   */
  enabled: boolean;
  /**
   * Triggert einen frischen `getCurrentPosition`-Call.
   *
   * Bug-Hunt MEDIUM M10: Promise resolved *immer* — Erfolg liefert eine
   * `GeoPosition`, jeder Fehler (Permission denied, Timeout, no GPS,
   * Browser-Support) liefert ein typisiertes `GeoError`.
   */
  request: () => Promise<{ ok: true; position: GeoPosition } | { ok: false; error: GeoError }>;
  /** Setzt den Profil-weiten Sharing-State. `false` deaktiviert dauerhaft, bis
   *  der User im Profil wieder einschaltet. `true` aktiviert + ruft request(). */
  setEnabled: (next: boolean) => void;
  /** @deprecated Lieber `setEnabled(false)` benutzen — bleibt fuer Backwards-
   *  Compat: Position löschen + Storage zurücksetzen (= Default-on). */
  clear: () => void;
}

/**
 * Einziger profilweit-persistierter Key für die Standort-Freigabe.
 * Tri-State im localStorage:
 *   - `'false'`     → User hat im Profil explizit deaktiviert (kein Auto-Request).
 *   - `'true'`      → vom Browser einmal erfolgreich gewährt (Auto-Request beim Mount).
 *   - kein Eintrag  → Default; behandelt wie `'true'`, aber Browser-Popup kommt bei
 *                     erstem Auto-Request.
 */
export const GEO_STORAGE_KEY = 'propus.geo.enabled.v1';
const MAX_AGE_DEFAULT_MS = 60_000;
const TIMEOUT_DEFAULT_MS = 10_000;

export type UseGeolocationOptions = {
  /** Optionaler Override des Storage-Keys — nur fuer Tests. Production-Code soll
   *  den Default (= profilweit zentral) nutzen. */
  storageKey?: string;
  maximumAgeMs?: number;
  timeoutMs?: number;
};

function readEnabledFromStorage(storageKey: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(storageKey) !== 'false';
  } catch {
    return true;
  }
}

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
  const storageKey = options?.storageKey ?? GEO_STORAGE_KEY;
  const maxAgeMs = options?.maximumAgeMs ?? MAX_AGE_DEFAULT_MS;
  const timeoutMs = options?.timeoutMs ?? TIMEOUT_DEFAULT_MS;

  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<GeoErrorCode | null>(null);
  // Default-on: ohne expliziten 'false'-Eintrag im Storage starten wir aktiviert.
  const [enabled, setEnabledState] = useState<boolean>(() => readEnabledFromStorage(storageKey));

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
          setEnabledState(true);
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
          // Browser-Permission ist orthogonal zum Profil-Toggle: wir lassen den
          // im Storage gespeicherten User-Wunsch (`'true'`/absent/`'false'`) in
          // Ruhe — wenn der User im Profil "an" hat, will er das so. Lediglich
          // den in-memory `enabled`-State muessen wir zuruecksetzen, damit
          // Consumer das CTA "Im Browser blockiert" rendern koennen.
          if (e.code === 'denied') {
            setEnabledState(false);
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
    setEnabledState(true); // Default-on: clear setzt auf den Default zurueck.
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

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    if (typeof window !== 'undefined') {
      try {
        if (next) {
          window.localStorage.setItem(storageKey, 'true');
        } else {
          window.localStorage.setItem(storageKey, 'false');
        }
      } catch {
        /* quota / privacy mode */
      }
    }
    if (next) {
      void request();
    } else {
      setPosition(null);
      setError(null);
      setErrorCode(null);
    }
  }, [storageKey, request]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabled) return; // Profil-Toggle = aus → kein Auto-Request.
    let active = true;
    if (active) {
      void request();
    }
    return () => {
      active = false;
    };
    // `enabled` ist der einzige relevante Trigger; storageKey/request sind
    // stabil pro Hook-Instanz.
  }, [enabled, request]);

  return { position, loading, error, errorCode, enabled, request, setEnabled, clear };
}
