"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireOrderEditor } from "@/lib/auth.server";
import { logOrderEvent } from "@/lib/audit";
import { parseMatterportInput } from "./_links";

function revalidateOrderLinks(orderNo: number) {
  revalidatePath(`/orders/${orderNo}/verknuepfungen`);
}

export async function linkMatterportTour(formData: FormData) {
  const editor = await requireOrderEditor();
  const orderNo = Number(formData.get("order_no"));
  if (!Number.isFinite(orderNo) || orderNo <= 0) {
    redirect(`/orders/${formData.get("order_no")}/verknuepfungen?error=${encodeURIComponent("Ungültige Bestellnummer")}`);
  }
  const raw = String(formData.get("space_id_or_url") ?? "").trim();
  const spaceId = parseMatterportInput(raw);
  if (!spaceId) {
    redirect(
      `/orders/${orderNo}/verknuepfungen?error=${encodeURIComponent("Bitte Matterport-Space-ID oder Link mit ?m=… eintragen")}`,
    );
  }

  const tour = await queryOne<{ id: number; booking_order_no: number | null }>(
    `SELECT id, booking_order_no FROM tour_manager.tours WHERE matterport_space_id = $1`,
    [spaceId],
  );
  if (!tour) {
    redirect(
      `/orders/${orderNo}/verknuepfungen?error=${encodeURIComponent(
        "Tour nicht in tour_manager gefunden. Bitte zuerst im Tour-Admin anlegen.",
      )}`,
    );
  }
  if (tour.booking_order_no != null && tour.booking_order_no !== orderNo) {
    redirect(
      `/orders/${orderNo}/verknuepfungen?error=${encodeURIComponent(
        `Diese Tour ist bereits mit Bestellung #${tour.booking_order_no} verknüpft`,
      )}`,
    );
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
    { old: {}, new: { matterport_space_id: spaceId, tour_id: tour.id } },
    editor,
  );
  revalidateOrderLinks(orderNo);
  redirect(`/orders/${orderNo}/verknuepfungen?saved=1`);
}

export async function unlinkMatterportTour(formData: FormData) {
  const editor = await requireOrderEditor();
  const orderNo = Number(formData.get("order_no"));
  if (!Number.isFinite(orderNo) || orderNo <= 0) {
    redirect(`/orders/${formData.get("order_no")}/verknuepfungen?error=${encodeURIComponent("Ungültige Bestellnummer")}`);
  }
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
  redirect(`/orders/${orderNo}/verknuepfungen?saved=1`);
}

export async function linkGallery(formData: FormData) {
  const editor = await requireOrderEditor();
  const orderNo = Number(formData.get("order_no"));
  if (!Number.isFinite(orderNo) || orderNo <= 0) {
    redirect(`/orders/${formData.get("order_no")}/verknuepfungen?error=${encodeURIComponent("Ungültige Bestellnummer")}`);
  }
  const input = String(formData.get("slug") ?? "").trim();
  if (!input) {
    redirect(`/orders/${orderNo}/verknuepfungen?error=${encodeURIComponent("Bitte Slug eintragen")}`);
  }

  const g = await queryOne<{ id: string; booking_order_no: number | null }>(
    `SELECT id::text AS id, booking_order_no
     FROM tour_manager.galleries
     WHERE slug = $1 OR friendly_slug = $1
     LIMIT 1`,
    [input],
  );
  if (!g) {
    redirect(
      `/orders/${orderNo}/verknuepfungen?error=${encodeURIComponent("Galerie nicht gefunden.")}`,
    );
  }
  if (g.booking_order_no != null && g.booking_order_no !== orderNo) {
    redirect(
      `/orders/${orderNo}/verknuepfungen?error=${encodeURIComponent(
        `Diese Galerie ist bereits mit Bestellung #${g.booking_order_no} verknüpft`,
      )}`,
    );
  }

  await query(
    `UPDATE tour_manager.galleries
     SET booking_order_no = $1, updated_at = NOW()
     WHERE id = $2::uuid`,
    [orderNo, g.id],
  );
  await logOrderEvent(orderNo, "gallery_linked", { old: {}, new: { gallery_id: g.id, slug: input } }, editor);
  revalidateOrderLinks(orderNo);
  redirect(`/orders/${orderNo}/verknuepfungen?saved=1`);
}

export async function unlinkGallery(formData: FormData) {
  const editor = await requireOrderEditor();
  const orderNo = Number(formData.get("order_no"));
  if (!Number.isFinite(orderNo) || orderNo <= 0) {
    redirect(`/orders/${formData.get("order_no")}/verknuepfungen?error=${encodeURIComponent("Ungültige Bestellnummer")}`);
  }
  const n = await query<{ id: string }>(
    `UPDATE tour_manager.galleries
     SET booking_order_no = NULL, updated_at = NOW()
     WHERE booking_order_no = $1
     RETURNING id::text AS id`,
    [orderNo],
  );
  if (n.length > 0) {
    await logOrderEvent(orderNo, "gallery_unlinked", { old: { gallery_ids: n.map((r) => r.id) }, new: {} }, editor);
  }
  revalidateOrderLinks(orderNo);
  redirect(`/orders/${orderNo}/verknuepfungen?saved=1`);
}
