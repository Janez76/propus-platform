/** Public catalog endpoints – Proxy → Express */
import { createCatchAllProxy } from "@/lib/proxy";

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllProxy(
  "/api/catalog",
  "catalog",
);
