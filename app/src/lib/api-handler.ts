/**
 * Helpers for Next.js API Route Handlers.
 * Provides auth checking, error handling, and DB query wrappers.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool, withTransaction } from "./db";
import { logger } from "./logger";
import type { PoolClient } from "pg";

export type ApiContext = {
  params: Promise<Record<string, string>>;
};

/** Standard JSON error response */
export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Extract Bearer token from request */
export function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

/** Require a Bearer token; returns 401 if missing */
export function requireToken(req: NextRequest): string | NextResponse {
  const token = getToken(req);
  if (!token) return apiError("Unauthorized", 401);
  return token;
}

/** Parse request body as JSON with error handling */
export async function parseBody<T = Record<string, unknown>>(
  req: NextRequest,
): Promise<T | NextResponse> {
  try {
    const text = await req.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return apiError("Invalid JSON body", 400);
  }
}

/** Wrap a route handler with error handling */
export function withErrorHandling(
  handler: (req: NextRequest, ctx?: ApiContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx?: ApiContext): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      logger.error("API route error", {
        url: req.url,
        method: req.method,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      return apiError("Internal server error", 500);
    }
  };
}

/** Run multiple DB queries in a transaction and return result */
export async function dbTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(fn);
}

/** Simple paginated query helper */
export function getPagination(req: NextRequest): {
  page: number;
  limit: number;
  offset: number;
} {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)),
  );
  return { page, limit, offset: (page - 1) * limit };
}

export { pool };
