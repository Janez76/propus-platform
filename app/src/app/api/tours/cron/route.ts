/**
 * Tours Cron API – Next.js Route Handler
 * Proxies /api/tours/cron/* to Express during migration.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const PLATFORM_INTERNAL_URL =
  process.env.PLATFORM_INTERNAL_URL || "http://localhost:3100";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const targetUrl = `${PLATFORM_INTERNAL_URL}${url.pathname}${url.search}`;
  try {
    const headers = new Headers();
    req.headers.forEach((v, k) => {
      if (!["host", "connection"].includes(k.toLowerCase())) headers.set(k, v);
    });
    const body: ArrayBuffer | undefined =
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.arrayBuffer()
        : undefined;
    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });
    const resBody = await res.arrayBuffer();
    const resHeaders = new Headers();
    res.headers.forEach((v, k) => resHeaders.set(k, v));
    return new NextResponse(resBody, { status: res.status, headers: resHeaders });
  } catch (e) {
    logger.error("Tours cron proxy error", { url: targetUrl, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Tours backend unavailable" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
