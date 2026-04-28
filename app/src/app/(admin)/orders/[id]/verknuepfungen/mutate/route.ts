import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getAdminSession, isOrderEditorRole } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { parseMatterportInput } from "../_links";

type Props = {
  params: Promise<{ id: string }>;
};

function backUrl(request: Request, orderNo: number, params?: Record<string, string>): URL {
  const url = new URL(`/orders/${orderNo}/verknuepfungen`, request.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function redirectBack(request: Request, orderNo: number, params?: Record<string, string>): NextResponse {
  return NextResponse.redirect(backUrl(request, orderNo, params), { status: 303 });
}

function revalidateOrderLinks(orderNo: number) {
  revalidatePath(`/orders/${orderNo}/verknuepfungen`);
}

async function requireEditorResponse(request: Request, orderNo: number) {
  const editor = await getAdminSession();
  if (!editor) {
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", `/orders/${orderNo}/verknuepfungen`);
    return { editor: null, response: NextResponse.redirect(login, { status: 303 }) };
  }
  if (!isOrderEditorRole(editor.role)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("forbidden", "1");
    return { editor: null, response: NextResponse.redirect(login, { status: 303 }) };
  }
  return { editor, response: null };
}

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const orderNo = Number(id);
  if (!Number.isInteger(orderNo) || orderNo <= 0) {
    return NextResponse.json(
      { ok: false, error: `Ungültige Bestellnummer: ${id}` },
      { status: 400 },
    );
  }

  const { editor, response } = await requireEditorResponse(request, orderNo);
  if (response || !editor) return response;

  const formData = await request.formData();
  const action = String(formData.get("_action") ?? "");

  if (action === "link-matterport") {
    const raw = String(formData.get("space_id_or_url") ?? "").trim();
    const spaceId = parseMatterportInput(raw);
    if (!spaceId) {
      return redirectBack(request, orderNo, { error: "Bitte Matterport-Space-ID oder Link mit ?m=... eintragen" });
    }

    const tour = await queryOne<{ id: number; booking_order_no: number | null }>(
      `SELECT id, booking_order_no FROM tour_manager.tours WHERE matterport_space_id = $1`,
      [spaceId],
    );
    if (!tour) {
      return redirectBack(request, orderNo, { error: "Tour nicht in tour_manager gefunden. Bitte zuerst im Tour-Admin anlegen." });
    }
    if (tour.booking_order_no != null && tour.booking_order_no !== orderNo) {
      return redirectBack(request, orderNo, { error: `Diese Tour ist bereits mit Bestellung #${tour.booking_order_no} verknüpft` });
    }

    await query(
      `UPDATE tour_manager.tours
       SET booking_order_no = $1, updated_at = NOW()
       WHERE id = $2`,
      [orderNo, tour.id],
    );
    await logOrderEvent(orderNo, "matterport_linked", { old: {}, new: { matterport_space_id: spaceId, tour_id: tour.id } }, editor);
    revalidateOrderLinks(orderNo);
    return redirectBack(request, orderNo, { saved: "1" });
  }

  if (action === "link-suggested-matterport") {
    const tourId = Number(formData.get("tour_id"));
    if (!Number.isInteger(tourId) || tourId <= 0) {
      return redirectBack(request, orderNo, { error: "Ungültige Tour" });
    }

    const tour = await queryOne<{
      id: number;
      booking_order_no: number | null;
      matterport_space_id: string | null;
      tour_url: string | null;
    }>(
      `SELECT id, booking_order_no, matterport_space_id, tour_url
       FROM tour_manager.tours
       WHERE id = $1`,
      [tourId],
    );
    if (!tour) {
      return redirectBack(request, orderNo, { error: "Tour nicht gefunden." });
    }
    if (tour.booking_order_no != null && tour.booking_order_no !== orderNo) {
      return redirectBack(request, orderNo, { error: `Diese Tour ist bereits mit Bestellung #${tour.booking_order_no} verknüpft` });
    }
    if (!tour.matterport_space_id && !tour.tour_url) {
      return redirectBack(request, orderNo, { error: "Diese Tour hat noch keine Matterport-ID oder URL." });
    }

    await query(
      `UPDATE tour_manager.tours
       SET booking_order_no = $1, updated_at = NOW()
       WHERE id = $2`,
      [orderNo, tour.id],
    );
    await logOrderEvent(
      orderNo,
      "matterport_linked",
      { old: {}, new: { matterport_space_id: tour.matterport_space_id, tour_id: tour.id, via: "suggestion" } },
      editor,
    );
    revalidateOrderLinks(orderNo);
    return redirectBack(request, orderNo, { saved: "1" });
  }

  if (action === "unlink-matterport") {
    const rows = await query<{ id: number }>(
      `UPDATE tour_manager.tours
       SET booking_order_no = NULL, updated_at = NOW()
       WHERE booking_order_no = $1
       RETURNING id`,
      [orderNo],
    );
    if (rows.length > 0) {
      await logOrderEvent(orderNo, "matterport_unlinked", { old: { tour_ids: rows.map((r) => r.id) }, new: {} }, editor);
    }
    revalidateOrderLinks(orderNo);
    return redirectBack(request, orderNo, { saved: "1" });
  }

  if (action === "link-gallery") {
    const input = String(formData.get("slug") ?? "").trim();
    if (!input) {
      return redirectBack(request, orderNo, { error: "Bitte Slug eintragen" });
    }

    const g = await queryOne<{ id: string; booking_order_no: number | null }>(
      `SELECT id::text AS id, booking_order_no
       FROM tour_manager.galleries
       WHERE slug = $1 OR friendly_slug = $1
       LIMIT 1`,
      [input],
    );
    if (!g) {
      return redirectBack(request, orderNo, { error: "Galerie nicht gefunden." });
    }
    if (g.booking_order_no != null && g.booking_order_no !== orderNo) {
      return redirectBack(request, orderNo, { error: `Diese Galerie ist bereits mit Bestellung #${g.booking_order_no} verknüpft` });
    }

    await query(
      `UPDATE tour_manager.galleries
       SET booking_order_no = $1, updated_at = NOW()
       WHERE id = $2::uuid`,
      [orderNo, g.id],
    );
    await logOrderEvent(orderNo, "gallery_linked", { old: {}, new: { gallery_id: g.id, slug: input } }, editor);
    revalidateOrderLinks(orderNo);
    return redirectBack(request, orderNo, { saved: "1" });
  }

  if (action === "unlink-gallery") {
    const rows = await query<{ id: string }>(
      `UPDATE tour_manager.galleries
       SET booking_order_no = NULL, updated_at = NOW()
       WHERE booking_order_no = $1
       RETURNING id::text AS id`,
      [orderNo],
    );
    if (rows.length > 0) {
      await logOrderEvent(orderNo, "gallery_unlinked", { old: { gallery_ids: rows.map((r) => r.id) }, new: {} }, editor);
    }
    revalidateOrderLinks(orderNo);
    return redirectBack(request, orderNo, { saved: "1" });
  }

  return redirectBack(request, orderNo, { error: "Unbekannte Aktion" });
}
