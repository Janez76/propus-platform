/**
 * Tours Cron API – Optional Catch-All Proxy → Express
 * Routes: /api/tours/cron AND /api/tours/cron/*
 */
import { createCatchAllProxy } from "@/lib/proxy";

export const { GET, POST } = createCatchAllProxy(
  "/api/tours/cron",
  "tours-cron",
);
