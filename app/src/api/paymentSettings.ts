import { apiRequest } from "./client";

export interface PaymentSettingsData {
  ok: true;
  vatRate: number;
  vatPercent: number;
  payrexxConfigured: boolean;
  payrexxInstance: string;
  floorplanUnitPrice: number;
  hostingUnitPrice: number;
}

export interface PaymentSettingsPatch {
  vatPercent?: number;
}

const BASE = "/api/tours/admin";

export async function getPaymentSettings(token?: string): Promise<PaymentSettingsData> {
  return apiRequest<PaymentSettingsData>(`${BASE}/payment-settings`, "GET", token);
}

export async function patchPaymentSettings(
  token: string | undefined,
  patch: PaymentSettingsPatch,
): Promise<PaymentSettingsData> {
  return apiRequest<PaymentSettingsData>(`${BASE}/payment-settings`, "PATCH", token, patch);
}
