import "server-only";
import { query, queryOne } from "@/lib/db";
import type {
  VerknuepfungenData,
  VerknuepfungFolderCounts,
  VerknuepfungGallery,
  VerknuepfungInvoice,
  VerknuepfungSuggestedTour,
  VerknuepfungTour,
} from "./verknuepfungenTypes";

export type { VerknuepfungenData } from "./verknuepfungenTypes";

export async function loadVerknuepfungenData(orderId: string): Promise<VerknuepfungenData | null> {
  const orderCheck = await queryOne<{ order_no: number }>(`
    SELECT order_no FROM booking.orders WHERE order_no = $1
  `, [orderId]);
  if (!orderCheck) {
    return null;
  }
  const orderNo = orderCheck.order_no;

  const [tour, suggestedTours, gallery, folderCounts, invoices] = await Promise.all([
    queryOne<VerknuepfungTour>(`
      SELECT
        matterport_space_id,
        tour_url,
        matterport_state,
        COALESCE(
          NULLIF(TRIM(object_label), ''),
          NULLIF(TRIM(bezeichnung), ''),
          'Matterport-Tour'
        ) AS display_title
      FROM tour_manager.tours
      WHERE booking_order_no = $1
      LIMIT 1
    `, [orderNo]),
    query<VerknuepfungSuggestedTour>(`
      SELECT
        id,
        matterport_space_id,
        tour_url,
        matterport_state,
        matterport_created_at,
        updated_at,
        COALESCE(
          NULLIF(TRIM(object_label), ''),
          NULLIF(TRIM(bezeichnung), ''),
          'Matterport-Tour'
        ) AS display_title,
        COALESCE(
          NULLIF(TRIM(customer_name), ''),
          NULLIF(TRIM(kunde_ref), ''),
          NULLIF(TRIM(customer_email), '')
        ) AS customer_label
      FROM tour_manager.tours
      WHERE booking_order_no IS NULL
        AND (
          NULLIF(TRIM(matterport_space_id), '') IS NOT NULL
          OR NULLIF(TRIM(tour_url), '') IS NOT NULL
        )
      ORDER BY COALESCE(matterport_created_at, updated_at, created_at) DESC NULLS LAST, id DESC
      LIMIT 10
    `),
    queryOne<VerknuepfungGallery>(`
      SELECT slug, friendly_slug, status, cloud_share_url
      FROM tour_manager.galleries
      WHERE booking_order_no = $1
      LIMIT 1
    `, [orderNo]),
    queryOne<VerknuepfungFolderCounts>(`
      SELECT
        COUNT(*)::int AS folder_count,
        COUNT(*) FILTER (WHERE nextcloud_share_url IS NOT NULL AND BTRIM(nextcloud_share_url) <> '')::int AS shared_count
      FROM booking.order_folder_links
      WHERE order_no = $1
        AND archived_at IS NULL
    `, [orderNo]),
    query<VerknuepfungInvoice>(`
      SELECT
        iv.invoice_source,
        iv.id,
        iv.invoice_number,
        iv.invoice_status,
        iv.invoice_kind,
        iv.amount_chf::text AS amount_chf,
        iv.due_at,
        iv.paid_at,
        iv.created_at
      FROM tour_manager.invoices_central_v iv
      JOIN tour_manager.tours t ON t.id = iv.tour_id
      WHERE t.booking_order_no = $1
      ORDER BY iv.created_at DESC
    `, [orderNo]),
  ]);

  return { orderNo, tour, suggestedTours, gallery, folderCounts, invoices };
}
