import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";

const PLATFORM_INTERNAL_URL = process.env.PLATFORM_INTERNAL_URL;
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS ?? 30_000);
const REQUEST_HEADERS_TO_SKIP = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function getTarget(): string {
  if (!PLATFORM_INTERNAL_URL) {
    throw new Error(
      "PLATFORM_INTERNAL_URL is not set – cannot proxy to Express backend",
    );
  }
  return PLATFORM_INTERNAL_URL;
}

/**
 * Forward a Next.js request to the Express backend.
 *
 * @param req        Incoming request
 * @param targetPath Path on the Express backend (e.g. `/api/admin/orders`)
 * @param label      Short label for logging (e.g. "admin", "booking")
 * @param opts.redirect  "manual" to handle redirects yourself (auth flows)
 */
export async function proxyToExpress(
  req: NextRequest,
  targetPath: string,
  label: string,
  opts?: { redirect?: RequestRedirect },
): Promise<NextResponse> {
  let targetUrl: string;
  try {
    targetUrl = `${getTarget()}${targetPath}`;
  } catch (e) {
    logger.error(`${label} proxy config error`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: `${label} backend not configured (PLATFORM_INTERNAL_URL missing)` },
      { status: 503 },
    );
  }

  try {
    const headers = new Headers();
    req.headers.forEach((v, k) => {
      if (!REQUEST_HEADERS_TO_SKIP.has(k.toLowerCase())) headers.set(k, v);
    });
    headers.set("x-forwarded-host", req.headers.get("host") ?? new URL(req.url).host);
    headers.set("x-forwarded-proto", new URL(req.url).protocol.replace(":", ""));

    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.arrayBuffer()
        : undefined;

    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: opts?.redirect ?? "follow",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    if (opts?.redirect === "manual" && [301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (location) {
        const redirectHeaders = new Headers();
        res.headers.forEach((v, k) => {
          const kl = k.toLowerCase();
          if (kl !== "transfer-encoding") redirectHeaders.set(k, v);
        });
        return NextResponse.redirect(location, {
          status: res.status,
          headers: redirectHeaders,
        });
      }
    }

    const resBody = await res.arrayBuffer();
    const resHeaders = new Headers();
    // Node's fetch auto-decompresses gzip/brotli → strip encoding/length headers
    // so the browser doesn't try to decompress already-decoded bytes.
    const STRIP_RES_HEADERS = new Set([
      "transfer-encoding",
      "content-encoding",
      "content-length",
    ]);
    res.headers.forEach((v, k) => {
      if (!STRIP_RES_HEADERS.has(k.toLowerCase())) resHeaders.set(k, v);
    });

    return new NextResponse(resBody, {
      status: res.status,
      headers: resHeaders,
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    logger.error(`${label} proxy error`, {
      url: targetUrl,
      method: req.method,
      timeout: isTimeout,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: `${label} backend ${isTimeout ? "timed out" : "unavailable"}` },
      { status: isTimeout ? 504 : 503 },
    );
  }
}

/** Create route exports (GET, POST, PUT, PATCH, DELETE) for a catch-all proxy */
export function createCatchAllProxy(
  prefix: string,
  label: string,
  opts?: { redirect?: RequestRedirect },
) {
  async function handler(
    req: NextRequest,
    { params }: { params: Promise<{ path?: string[] }> },
  ) {
    const { path } = await params;
    const url = new URL(req.url);
    const suffix = path?.length ? `/${path.join("/")}` : "";
    const targetPath = `${prefix}${suffix}${url.search}`;
    return proxyToExpress(req, targetPath, label, opts);
  }
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}
