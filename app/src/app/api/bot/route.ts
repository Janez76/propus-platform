/** Discount validation / bot endpoint – Proxy → Express */
import { NextRequest } from "next/server";
import { proxyToExpress } from "@/lib/proxy";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  return proxyToExpress(req, `/api/bot${url.search}`, "bot");
}

export const GET = handler;
export const POST = handler;
