import { describe, it, expect } from "vitest";
import { mapBrowserError, type GeoError } from "@/components/cockpit/useGeolocation";

/**
 * Bug-Hunt MEDIUM M09: Caller (TodayCard, ConversationView, PropiChat) muessen
 * "Permission denied" von "Position unavailable" / "Timeout" / "Browser
 * unterstuetzt es nicht" unterscheiden koennen, um gezielte Hilfe-Texte
 * anzuzeigen ("Browser-Schloss freigeben" vs. "GPS schwach"). Diese Tests
 * pinnen das Mapping fest.
 */
function mockBrowserError(code: number, message = ""): GeolocationPositionError {
  return { code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

describe("mapBrowserError (Bug-Hunt M09)", () => {
  it("maps PERMISSION_DENIED (code 1) to 'denied'", () => {
    const e: GeoError = mapBrowserError(mockBrowserError(1));
    expect(e.code).toBe("denied");
    expect(e.message).toMatch(/verweigert|denied|Browser/i);
  });

  it("maps POSITION_UNAVAILABLE (code 2) to 'unavailable'", () => {
    expect(mapBrowserError(mockBrowserError(2)).code).toBe("unavailable");
  });

  it("maps TIMEOUT (code 3) to 'timeout'", () => {
    expect(mapBrowserError(mockBrowserError(3)).code).toBe("timeout");
  });

  it("maps unknown codes to 'other' and falls back to .message", () => {
    const e = mapBrowserError(mockBrowserError(99, "weird browser bug"));
    expect(e.code).toBe("other");
    expect(e.message).toBe("weird browser bug");
  });

  it("provides a fallback message for empty .message on unknown code", () => {
    const e = mapBrowserError(mockBrowserError(99, ""));
    expect(e.code).toBe("other");
    expect(e.message).toMatch(/Standort-Fehler/);
  });

  it("denied message contains actionable hint about browser settings", () => {
    // Caller-UIs branchen zwar via errorCode, aber der Fallback-Pfad
    // (geo.error ohne errorCode-Match) muss trotzdem hilfreich sein.
    const e = mapBrowserError(mockBrowserError(1));
    expect(e.message).toMatch(/Browser-Einstellung|Browser/i);
  });
});
