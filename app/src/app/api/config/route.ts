/** Public config endpoint – Proxy → Express */
import { NextRequest } from "next/server";
import { proxyToExpress } from "@/lib/proxy";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  return proxyToExpress(req, `/api/config${url.search}`, "config");
}

export const GET = handler;
