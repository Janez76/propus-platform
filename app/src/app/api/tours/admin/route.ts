/**
 * Tours Admin API – Next.js Route Handler
 *
 * Proxies requests to the Express tours admin-api.js router during migration.
 * All /api/tours/admin/* requests are handled here.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const PLATFORM_INTERNAL_URL =
  process.env.PLATFORM_INTERNAL_URL || "http://localhost:3100";

async function proxyToExpress(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const targetPath = url.pathname + url.search;
  const targetUrl = `${PLATFORM_INTERNAL_URL}${targetPath}`;

  try {
    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (!["host", "connection"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    const body: ArrayBuffer | undefined =
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.arrayBuffer()
        : undefined;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseBody = await response.arrayBuffer();
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (e) {
    logger.error("Tours admin proxy error", {
      url: targetUrl,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Tours backend unavailable" },
      { status: 503 },
    );
  }
}

export const GET = proxyToExpress;
export const POST = proxyToExpress;
export const PUT = proxyToExpress;
export const PATCH = proxyToExpress;
export const DELETE = proxyToExpress;
