import { apiRequest } from "./client";
import { notifyPublicCatalogChanged } from "../lib/catalogBroadcast";

export type ServiceCategory = {
  key: string;
  name: string;
  description?: string;
  kind_scope: "package" | "addon" | "service" | "extra" | "both";
  sort_order: number;
  active: boolean;
  /** Wenn true: eigener Accordion-Bereich im Buchungs-Frontpanel (dynamische Addon-Kategorien) */
  show_in_frontpanel?: boolean;
};

export type ServiceCategoryPayload = {
  key: string;
  name: string;
  description?: string;
  kind_scope: "package" | "addon" | "service" | "extra" | "both";
  sort_order?: number;
  active?: boolean;
  show_in_frontpanel?: boolean;
};

export async function getServiceCategories(token: string, includeInactive = true): Promise<ServiceCategory[]> {
  const data = await apiRequest<{ ok: boolean; categories: ServiceCategory[] }>(
    `/api/admin/service-categories?includeInactive=${includeInactive ? "true" : "false"}`,
    "GET",
    token,
  );
  return Array.isArray(data?.categories) ? data.categories : [];
}

export async function createServiceCategory(token: string, payload: ServiceCategoryPayload): Promise<ServiceCategory> {
  const data = await apiRequest<{ ok: boolean; category: ServiceCategory }>(
    "/api/admin/service-categories",
    "POST",
    token,
    payload,
  );
  notifyPublicCatalogChanged();
  return data.category;
}

export async function updateServiceCategory(token: string, key: string, payload: Partial<ServiceCategoryPayload>): Promise<ServiceCategory> {
  const data = await apiRequest<{ ok: boolean; category: ServiceCategory }>(
    `/api/admin/service-categories/${encodeURIComponent(key)}`,
    "PUT",
    token,
    payload,
  );
  notifyPublicCatalogChanged();
  return data.category;
}

export async function deleteServiceCategory(token: string, key: string, fallbackKey = ""): Promise<void> {
  const suffix = fallbackKey ? `?fallbackKey=${encodeURIComponent(fallbackKey)}` : "";
  await apiRequest<{ ok: boolean }>(
    `/api/admin/service-categories/${encodeURIComponent(key)}${suffix}`,
    "DELETE",
    token,
  );
  notifyPublicCatalogChanged();
}
