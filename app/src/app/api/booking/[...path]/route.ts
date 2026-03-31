/**
 * Public Booking API – Next.js Catch-All Route Handler
 * Proxies /api/booking/* to the Express booking backend.
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
  const targetPath = `/api/booking/${path.join("/")}${url.search}`;
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
    const res = await fetch(targetUrl, { method: req.method, headers, body });
    const resBody = await res.arrayBuffer();
    const resHeaders = new Headers();
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "transfer-encoding") resHeaders.set(k, v);
    });
    return new NextResponse(resBody, { status: res.status, headers: resHeaders });
  } catch (e) {
    logger.error("Booking public proxy error", {
      url: targetUrl,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
