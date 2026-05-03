/**
 * Hilfsfunktionen für Next.js Routen.
 *
 * Wichtig: Die produktive Authentifizierung läuft über `auth.server.ts`
 * (`getAdminSession`/`requireOrderEditor`) auf Basis von `booking.admin_sessions`
 * mit SHA-256-Token-Hash. Das ist die einzige vertrauenswürdige Auth-Quelle.
 *
 * Frühere Helper `decodeJwtPayload` und `requireAuth` wurden hier entfernt:
 * Sie haben Token ohne Signaturverifikation als Identität durchgereicht und
 * waren ein Auth-Bypass-Vektor (Bug-Hunt CRITICAL). Sie waren ungenutzt;
 * jeder neue Auth-Pfad muss `auth.server.ts` verwenden.
 */

import { NextRequest } from "next/server";

/** Bearer-Token aus Authorization-Header oder Cookie. */
export function getTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookie = req.cookies.get("admin_session");
  if (cookie?.value) return cookie.value;
  return null;
}
