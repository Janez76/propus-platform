/**
 * Public Listing API – Optional Catch-All Proxy → Express
 * Routes: /api/listing AND /api/listing/*
 *
 * [[...path]] matches both /api/listing (path=[]) and /api/listing/xyz (path=["xyz"]).
 */
import { createCatchAllProxy } from "@/lib/proxy";

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllProxy(
  "/api/listing",
  "listing",
);
