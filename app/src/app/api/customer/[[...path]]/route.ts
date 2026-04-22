/**
 * Kunden-API – Catch-All Proxy → Express
 * Routes: /api/customer AND /api/customer/*
 *
 * Ohne Rewrite/Proxy liefert Next.js HTML → "Unexpected token '<' ... is not valid JSON".
 */
import { createCatchAllProxy } from "@/lib/proxy";

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllProxy(
  "/api/customer",
  "customer",
);
