/**
 * Tours Admin API – Optional Catch-All Proxy → Express
 * Routes: /api/tours/admin AND /api/tours/admin/*
 */
import { createCatchAllProxy } from "@/lib/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllProxy(
  "/api/tours/admin",
  "tours-admin",
);
