/**
 * Auth Routes – Next.js Catch-All Route Handler
 *
 * Handles Logto OIDC login/callback/logout flows.
 * During migration, proxies to Express auth handlers.
 *
 * Routes:
 *   GET /api/auth/logto/login    -> Redirect to Logto
 *   GET /api/auth/logto/callback -> Exchange code for token
 *   GET /api/auth/logout         -> Clear session + redirect to Logto logout
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const PLATFORM_INTERNAL_URL =
  process.env.PLATFORM_INTERNAL_URL || "http://localhost:3100";

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const url = new URL(req.url);
  const targetPath = `/auth/${path.join("/")}${url.search}`;
  const targetUrl = `${PLATFORM_INTERNAL_URL}${targetPath}`;

  try {
    const headers = new Headers();
    req.headers.forEach((v, k) => {
      if (!["host", "connection"].includes(k.toLowerCase())) headers.set(k, v);
    });
    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.arrayBuffer()
        : undefined;

    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    const resHeaders = new Headers();
    res.headers.forEach((v, k) => resHeaders.set(k, v));

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (location) {
        return NextResponse.redirect(location, { status: res.status });
      }
    }

    const resBody = await res.arrayBuffer();
    return new NextResponse(resBody, { status: res.status, headers: resHeaders });
  } catch (e) {
    logger.error("Auth proxy error", {
      url: targetUrl,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Auth service unavailable" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
