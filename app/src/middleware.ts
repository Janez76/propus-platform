import { NextRequest, NextResponse } from "next/server";
import { isKiAssistantHostname } from "@/lib/kiHost";

function requestHostname(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-host");
  const host = req.headers.get("host") ?? "";
  return (forwarded ?? host).split(":")[0];
}

export function middleware(req: NextRequest) {
  if (!isKiAssistantHostname(requestHostname(req))) return NextResponse.next();

  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next/") || pathname.startsWith("/assets/")) {
    return NextResponse.next();
  }
  if (pathname === "/favicon.ico" || pathname === "/robots.txt") {
    return NextResponse.next();
  }

  // PWA auf ki: nur Assistant als Startpunkt
  if (pathname === "/manifest.webmanifest") {
    return NextResponse.rewrite(new URL("/manifest-ki.webmanifest", req.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/assistant", req.url));
  }

  const allowedExact = new Set(["/login", "/assistant"]);
  const allowedPrefixes = ["/assistant/", "/api/assistant", "/api/auth"];

  if (allowedExact.has(pathname)) return NextResponse.next();
  if (allowedPrefixes.some((p) => pathname.startsWith(p))) return NextResponse.next();

  return NextResponse.redirect(new URL("/assistant", req.url));
}

export const config = {
  matcher: [
    /*
     * Alles ausser typische Next-Static-Assets — inkl. /api/* damit ki.propus.ch
     * keine fremden API-Pfade durchreicht.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
