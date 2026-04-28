import { NextResponse } from "next/server";
import { getAdminSession, requireOrderViewAccess } from "@/lib/auth.server";
import { loadVerknuepfungenData } from "@/lib/repos/orders/verknuepfungenData";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Nicht angemeldet" }, { status: 401 });
  }

  await requireOrderViewAccess(id, session);
  const data = await loadVerknuepfungenData(id);
  if (!data) {
    return NextResponse.json({ ok: false, error: "Bestellung nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, data },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
