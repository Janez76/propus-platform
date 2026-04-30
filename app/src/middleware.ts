import { NextRequest, NextResponse } from "next/server";

const KI_HOST = "ki.propus.ch";

function isKiHost(req: NextRequest): boolean {
  const forwarded = req.headers.get("x-forwarded-host");
  const host = req.headers.get("host") ?? "";
  return (forwarded ?? host).split(":")[0] === KI_HOST;
}

export function middleware(req: NextRequest) {
  if (!isKiHost(req)) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Redirect root to /assistant
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/assistant", req.url));
  }

  // Serve ki-specific PWA manifest so the install prompt uses the correct name/start_url
  if (pathname === "/manifest.webmanifest") {
    return NextResponse.rewrite(new URL("/manifest-ki.webmanifest", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/manifest.webmanifest"],
};
