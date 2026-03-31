/** Reverse geocoding – Proxy → Express */
import { NextRequest } from "next/server";
import { proxyToExpress } from "@/lib/proxy";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  return proxyToExpress(req, `/api/reverse-geocode${url.search}`, "geocode");
}

export const GET = handler;
