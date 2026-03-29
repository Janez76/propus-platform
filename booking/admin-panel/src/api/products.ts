import { apiRequest } from "./client";
import { notifyPublicCatalogChanged } from "../lib/catalogBroadcast";

export type PricingRule = {
  id?: number;
  rule_type: "fixed" | "per_floor" | "per_room" | "area_tier" | "conditional";
  config_json: Record<string, unknown>;
  priority?: number;
  valid_from?: string | null;
  valid_to?: string | null;
  active?: boolean;
};

export type Product = {
  id: number;
  code: string;
  name: string;
  kind: "package" | "addon" | "service" | "extra";
  group_key: string;
  category_key?: string;
  description?: string;
  affects_travel?: boolean;
  affects_duration?: boolean;
  duration_minutes?: number;
  skill_key?: string;
  required_skills?: string[];
  active: boolean;
  show_on_website?: boolean;
  sort_order: number;
  rules: PricingRule[];
};

export type ProductPayload = {
  code: string;
  name: string;
  kind: "package" | "addon" | "service" | "extra";
  group_key: string;
  category_key?: string;
  description?: string;
  affects_travel?: boolean;
  affects_duration?: boolean;
  duration_minutes?: number;
  skill_key?: string;
  required_skills?: string[];
  active?: boolean;
  show_on_website?: boolean;
  sort_order?: number;
  rules: PricingRule[];
};

export async function getProducts(token: string, includeInactive = true): Promise<Product[]> {
  const data = await apiRequest<{ ok: boolean; products: Product[] }>(
    `/api/admin/products?includeInactive=${includeInactive ? "true" : "false"}`,
    "GET",
    token,
  );
  return Array.isArray(data?.products) ? data.products : [];
}

export async function createProduct(token: string, payload: ProductPayload): Promise<Product> {
  const data = await apiRequest<{ ok: boolean; product: Product }>("/api/admin/products", "POST", token, payload);
  notifyPublicCatalogChanged();
  return data.product;
}

export async function updateProduct(token: string, id: number, payload: Partial<ProductPayload>): Promise<Product> {
  const data = await apiRequest<{ ok: boolean; product: Product }>(`/api/admin/products/${id}`, "PUT", token, payload);
  notifyPublicCatalogChanged();
  return data.product;
}

export async function setProductActive(token: string, id: number, active: boolean): Promise<Product> {
  const data = await apiRequest<{ ok: boolean; product: Product }>(`/api/admin/products/${id}/active`, "PATCH", token, { active });
  notifyPublicCatalogChanged();
  return data.product;
}

export async function previewPricing(
  token: string,
  payload: {
    packageKey?: string;
    addonIds?: string[];
    area?: number;
    floors?: number;
    discountCode?: string;
    customerEmail?: string;
  },
) {
  return apiRequest<{ ok: boolean; pricing: { subtotal: number; discountAmount: number; vat: number; total: number }; serviceListWithPrice: string; serviceListNoPrice: string }>(
    "/api/admin/pricing/preview",
    "POST",
    token,
    {
      package: payload.packageKey ? { key: payload.packageKey } : undefined,
      addons: (payload.addonIds || []).map((id) => ({ id })),
      object: { area: payload.area || 0, floors: payload.floors || 1 },
      discountCode: payload.discountCode || "",
      customerEmail: payload.customerEmail || "",
    },
  );
}
