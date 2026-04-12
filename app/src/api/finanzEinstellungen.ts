import { apiRequest } from "./client";
import type { FinanzEinstellungenData } from "../types/finanzEinstellungen";

interface FinanzResponse {
  ok: boolean;
  data: FinanzEinstellungenData;
}

export async function getFinanzEinstellungen(token?: string): Promise<FinanzEinstellungenData> {
  const res = await apiRequest<FinanzResponse>("/api/finanz-einstellungen", "GET", token);
  return res.data;
}

export async function patchFinanzEinstellungen(
  token: string | undefined,
  data: Partial<FinanzEinstellungenData>,
): Promise<FinanzEinstellungenData> {
  const res = await apiRequest<FinanzResponse>("/api/finanz-einstellungen", "PATCH", token, data);
  return res.data;
}
