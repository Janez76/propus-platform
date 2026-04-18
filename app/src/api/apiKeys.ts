import { apiRequest } from "./client";

export type ApiKey = {
  id: number;
  label: string;
  prefix: string;
  createdById: number | null;
  createdByName: string | null;
  createdByEmail: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type CreatedApiKey = {
  key: ApiKey;
  token: string;
};

export const listApiKeys = (token: string) =>
  apiRequest<{ keys: ApiKey[] }>("/api/admin/api-keys", "GET", token).then((r) => r.keys);

export const createApiKey = (token: string, label: string) =>
  apiRequest<CreatedApiKey>("/api/admin/api-keys", "POST", token, { label });

export const revokeApiKey = (token: string, id: number) =>
  apiRequest<{ ok: true }>(`/api/admin/api-keys/${id}`, "DELETE", token);
