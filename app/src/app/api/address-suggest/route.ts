/**
 * GET /api/address-suggest — Proxy → Express address autocomplete
 */
import { NextRequest } from "next/server";
import { proxyToExpress } from "@/lib/proxy";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return proxyToExpress(req, `/api/address-suggest${url.search}`, "address-suggest");
}
