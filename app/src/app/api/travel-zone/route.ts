/**
 * GET /api/travel-zone — Proxy → Express Zonen-Lookup
 */
import { NextRequest } from "next/server";
import { proxyToExpress } from "@/lib/proxy";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return proxyToExpress(req, `/api/travel-zone${url.search}`, "travel-zone");
}
