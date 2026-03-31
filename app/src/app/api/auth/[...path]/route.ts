/**
 * Auth Routes – Catch-All Proxy → Express (Logto OIDC)
 * Routes: /api/auth/*  →  /auth/* on Express
 *
 * Uses redirect: "manual" to forward Set-Cookie headers on OIDC redirects.
 */
import { NextRequest } from "next/server";
import { proxyToExpress } from "@/lib/proxy";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  const targetPath = `/auth/${path.join("/")}${url.search}`;
  return proxyToExpress(req, targetPath, "auth", { redirect: "manual" });
}

export const GET = handler;
export const POST = handler;
