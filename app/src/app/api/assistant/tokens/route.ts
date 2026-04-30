import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth.server";
import { generateMobileToken, listMobileTokens } from "@/lib/assistant/auth";

export const runtime = "nodejs";

const INTERNAL_ROLES = new Set(["admin", "super_admin", "employee"]);

function sessionUser(session: { userKey: string | null; userName: string | null; role: string }) {
  const userId = String(session.userKey || session.userName || session.role || "admin").trim();
  const email = String(session.userKey || "").includes("@") ? String(session.userKey) : "";
  return { id: userId || "admin", email: email || "admin@propus.local" };
}

/** GET: List active mobile tokens for the current user. */
export async function GET() {
  const session = await getAdminSession();
  if (!session || !INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const user = sessionUser(session);
  const tokens = await listMobileTokens(user.id);
  return NextResponse.json({ ok: true, tokens });
}

/** POST: Generate a new mobile token. Admin session only (not bearer). */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !INTERNAL_ROLES.has(String(session.role || "").toLowerCase())) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  let body: { label?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const user = sessionUser(session);
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 100) : "";

  const result = await generateMobileToken(user.id, user.email, label);
  return NextResponse.json({ ok: true, id: result.id, token: result.token, label });
}
