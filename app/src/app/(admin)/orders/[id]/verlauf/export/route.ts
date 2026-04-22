import { NextResponse } from "next/server";
import { getAdminSession, isOrderEditorRole } from "@/lib/auth.server";
import { query } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const s = await getAdminSession();
  if (!s) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOrderEditorRole(s.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await query<{
    event_type: string;
    actor_user: string | null;
    actor_role: string | null;
    metadata: unknown;
    created_at: string;
  }>(`
    SELECT event_type, actor_user, actor_role, metadata, created_at
    FROM booking.order_event_log
    WHERE order_no = $1
    ORDER BY created_at ASC
  `, [id]);

  const head = "event_type;actor;role;created_at;metadata\n";
  const body = events
    .map(
      (e) =>
        `${csv(e.event_type)};${csv(e.actor_user || "")};${csv(e.actor_role || "")};${e.created_at};${csv(
          JSON.stringify(e.metadata ?? null),
        )}\n`,
    )
    .join("");

  return new NextResponse(head + body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="order-${id}-verlauf.csv"`,
    },
  });
}

function csv(s: string) {
  if (s.includes('"') || s.includes(";") || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}
