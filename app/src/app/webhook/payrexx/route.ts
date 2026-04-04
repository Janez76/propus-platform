/**
 * Payrexx Webhook Proxy
 *
 * Leitet POST /webhook/payrexx 1:1 (raw bytes + alle Header) an Express weiter.
 * Wird als Next.js-Route statt als next.config.ts-Rewrite implementiert, damit
 * der Body unverändert (gleiche Byte-Reihenfolge) ankommt und die HMAC-Signatur
 * gültig bleibt.
 */
import { NextRequest, NextResponse } from "next/server";

const PLATFORM_INTERNAL_URL = process.env.PLATFORM_INTERNAL_URL;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!PLATFORM_INTERNAL_URL) {
    return NextResponse.json({ error: "backend unavailable" }, { status: 503 });
  }

  const target = `${PLATFORM_INTERNAL_URL}/tour-manager/webhook/payrexx`;

  const rawBody = await req.arrayBuffer();

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    const kl = k.toLowerCase();
    if (kl === "host" || kl === "connection" || kl === "transfer-encoding") return;
    headers.set(k, v);
  });

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers,
      body: rawBody,
    });

    const resBody = await upstream.arrayBuffer();
    const resHeaders = new Headers();
    const STRIP = new Set(["transfer-encoding", "content-encoding", "content-length"]);
    upstream.headers.forEach((v, k) => {
      if (!STRIP.has(k.toLowerCase())) resHeaders.set(k, v);
    });

    return new NextResponse(resBody, { status: upstream.status, headers: resHeaders });
  } catch (e) {
    console.error("[webhook/payrexx] proxy error:", e);
    return NextResponse.json({ error: "backend unavailable" }, { status: 503 });
  }
}
