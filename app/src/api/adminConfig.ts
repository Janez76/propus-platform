import { apiRequest } from "./client";

export type AdminPackage = { key: string; label: string; price: number };
export type AdminAddon = { id: string; label: string; price?: number; unitPrice?: number; pricingType?: string };

export type AdminConfig = {
  packages: AdminPackage[];
  addons: AdminAddon[];
  photographers: Array<{ key: string; name: string }>;
};

export async function getAdminConfig(token: string): Promise<AdminConfig> {
  const data = await apiRequest<unknown>("/api/bot", "POST", token, { action: "config" });
  const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    packages: Array.isArray(r.packages) ? (r.packages as AdminPackage[]) : [],
    addons: Array.isArray(r.addons) ? (r.addons as AdminAddon[]) : [],
    photographers: Array.isArray(r.photographers) ? (r.photographers as Array<{ key: string; name: string }>) : [],
  };
}
