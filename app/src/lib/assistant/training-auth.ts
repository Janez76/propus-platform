/**
 * Super-Admin-only gates for Assistant training API routes (same as PATCH /api/assistant/settings).
 */
import type { NextRequest } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { isAssistantSettingsAdminUi } from "@/lib/assistant/access-env";
import { resolveAssistantUser, type AssistantUser } from "@/lib/assistant/auth";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

export type TrainingAccessOk = { session: AdminSession; user: AssistantUser };

export async function requireAssistantTrainingAccess(req: NextRequest): Promise<TrainingAccessOk | null> {
  const session = await getAdminSession();
  const role = String(session?.role || "").toLowerCase();
  if (!session || !INTERNAL_ROLES.has(role)) return null;
  if (!isAssistantSettingsAdminUi(session)) return null;
  const user = await resolveAssistantUser(req);
  if (!user) return null;
  return { session, user };
}
