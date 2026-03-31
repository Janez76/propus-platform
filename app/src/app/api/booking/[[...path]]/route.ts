/**
 * Public Booking API – Optional Catch-All Proxy → Express
 * Routes: /api/booking AND /api/booking/*
 *
 * [[...path]] matches both /api/booking (path=[]) and /api/booking/xyz (path=["xyz"]).
 */
import { createCatchAllProxy } from "@/lib/proxy";

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllProxy(
  "/api/booking",
  "booking",
);
