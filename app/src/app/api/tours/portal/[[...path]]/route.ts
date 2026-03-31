/**
 * Tours Portal API – Optional Catch-All Proxy → Express
 * Routes: /api/tours/portal AND /api/tours/portal/*
 */
import { createCatchAllProxy } from "@/lib/proxy";

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllProxy(
  "/api/tours/portal",
  "tours-portal",
);
