/**
 * Booking Admin API – Next.js Catch-All Route Handler
 *
 * Proxies all /api/admin/* requests to the Express booking backend
 * during the migration phase.
 *
 * TODO: Replace individual route groups with direct Next.js handlers:
 *   - /api/admin/orders/[...path] -> orders Route Handler
 *   - /api/admin/customers/[...path] -> customers Route Handler
 *   - etc.
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
  const targetPath = `/api/admin/${path.join("/")}${url.search}`;
  const targetUrl = `${PLATFORM_INTERNAL_URL}${targetPath}`;

  try {
    const headers = new Headers();
    req.headers.forEach((v, k) => {
      if (!["host", "connection"].includes(k.toLowerCase())) headers.set(k, v);
    });

    let body: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await req.arrayBuffer();
    }

    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const resBody = await res.arrayBuffer();
    const resHeaders = new Headers();
    res.headers.forEach((v, k) => {
      // Don't forward transfer-encoding, it causes issues with Next.js
      if (k.toLowerCase() !== "transfer-encoding") resHeaders.set(k, v);
    });

    return new NextResponse(resBody, {
      status: res.status,
      headers: resHeaders,
    });
  } catch (e) {
    logger.error("Booking admin proxy error", {
      url: targetUrl,
      method: req.method,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Booking backend unavailable" },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
