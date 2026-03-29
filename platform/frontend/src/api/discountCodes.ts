import { apiRequest } from "./client";

export interface DiscountCode {
  id: number;
  code: string;
  type: "percent" | "fixed";
  amount: number;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  maxUses: number | null;
  usesCount: number;
  usesPerCustomer: number | null;
  conditions: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DiscountCodeUsage {
  id: number;
  discountCodeId: number;
  customerEmail: string;
  orderId: number | null;
  usedAt: string | null;
}

interface DiscountCodesResponse {
  ok: boolean;
  discountCodes: DiscountCode[];
}

interface DiscountCodeResponse {
  ok: boolean;
  discountCode: DiscountCode;
}

interface DiscountCodeUsagesResponse {
  ok: boolean;
  usages: DiscountCodeUsage[];
}

export async function listDiscountCodes(token?: string, includeInactive = true): Promise<DiscountCode[]> {
  const res = await apiRequest<DiscountCodesResponse>(`/api/admin/discount-codes?includeInactive=${includeInactive ? "true" : "false"}`, "GET", token);
  return res.discountCodes || [];
}

export async function createDiscountCode(token: string | undefined, data: Partial<DiscountCode>): Promise<DiscountCode> {
  const res = await apiRequest<DiscountCodeResponse>("/api/admin/discount-codes", "POST", token, data);
  return res.discountCode;
}

export async function updateDiscountCode(token: string | undefined, id: number, data: Partial<DiscountCode>): Promise<DiscountCode> {
  const res = await apiRequest<DiscountCodeResponse>(`/api/admin/discount-codes/${id}`, "PATCH", token, data);
  return res.discountCode;
}

export async function deleteDiscountCode(token: string | undefined, id: number): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/admin/discount-codes/${id}`, "DELETE", token);
}

export async function listDiscountCodeUsages(token: string | undefined, id: number): Promise<DiscountCodeUsage[]> {
  const res = await apiRequest<DiscountCodeUsagesResponse>(`/api/admin/discount-codes/${id}/usages`, "GET", token);
  return res.usages || [];
}
