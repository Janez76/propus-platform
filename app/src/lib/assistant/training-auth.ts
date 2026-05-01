/**
 * Super-Admin-only gates for Assistant training API routes (same as PATCH /api/assistant/settings).
 */
import type { NextRequest } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { isAssistantSettingsAdminUi } from "@/lib/assistant/access-env";
import { resolveAssistantUser, type AssistantUser } from "@/lib/assistant/auth";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

export type TrainingAccessResult =
  | { ok: true; session: AdminSession; user: AssistantUser }
  | { ok: false; status: 401 | 403 };

export async function requireAssistantTrainingAccess(req: NextRequest): Promise<TrainingAccessResult> {
  const session = await getAdminSession();
  const role = String(session?.role || "").toLowerCase();
  if (!session || !INTERNAL_ROLES.has(role)) {
    return { ok: false, status: 401 };
  }
  if (!isAssistantSettingsAdminUi(session)) {
    return { ok: false, status: 403 };
  }
  const user = await resolveAssistantUser(req);
  if (!user) {
    return { ok: false, status: 401 };
  }
  return { ok: true, session, user };
}
