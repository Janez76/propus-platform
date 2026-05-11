import { notFound } from "next/navigation";
import { queryOne, query } from "@/lib/db";
import Link from "next/link";
import { ExternalLink, Image } from "lucide-react";
import { CreateBildauswahlForOrderButton } from "./create-button";

type BildauswahlRow = {
  id: string;
  slug: string;
  friendly_slug: string | null;
  title: string | null;
  status: string;
  client_delivery_status: string | null;
  created_at: string;
  image_count: number;
  feedback_count: number;
};

export default async function BildauswahlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const orderCheck = await queryOne<{ order_no: number }>(
    `SELECT order_no FROM booking.orders WHERE order_no = $1`,
    [id],
  );
  if (!orderCheck) notFound();

  const galleries = await query<BildauswahlRow>(
    `SELECT g.id, g.slug, g.friendly_slug, g.title, g.status, g.client_delivery_status, g.created_at,
       COALESCE((SELECT COUNT(*)::int FROM tour_manager.bildauswahl_images WHERE gallery_id = g.id AND enabled = TRUE), 0) AS image_count,
       COALESCE((SELECT COUNT(*)::int FROM tour_manager.bildauswahl_feedback WHERE gallery_id = g.id AND author = 'client' AND resolved_at IS NULL), 0) AS feedback_count
     FROM tour_manager.bildauswahl_galleries g
     WHERE g.booking_order_no = $1
     ORDER BY g.created_at DESC`,
    [orderCheck.order_no],
  );

  if (galleries.length === 0) {
    return (
      <div className="bd-panel">
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Image className="h-12 w-12 text-gray-300" />
          <p className="text-sm text-gray-500">
            Für diese Bestellung existiert noch keine Bildauswahl.
          </p>
          <CreateBildauswahlForOrderButton orderNo={orderCheck.order_no} />
        </div>
      </div>
    );
  }

  return (
    <div className="bd-panel space-y-4">
      <h2 className="text-base font-semibold">
        {galleries.length === 1 ? "Bildauswahl" : `${galleries.length} Bildauswahl-Galerien`}
      </h2>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {galleries.map((g) => (
          <Link
            key={g.id}
            href={`/admin/bildauswahl/${g.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">
                {g.title || g.friendly_slug || g.slug}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {g.image_count} Bild(er)
                {g.feedback_count > 0 ? ` · ${g.feedback_count} offene Kommentare` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusBadge status={g.status} delivery={g.client_delivery_status} />
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
      <CreateBildauswahlForOrderButton
        orderNo={orderCheck.order_no}
        label="Weitere Bildauswahl erstellen"
        variant="outline"
      />
    </div>
  );
}

function StatusBadge({ status, delivery }: { status: string; delivery: string | null }) {
  if (delivery === "sent") {
    return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Versendet</span>;
  }
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "bg-green-50", text: "text-green-700", label: "Aktiv" },
    inactive: { bg: "bg-gray-100", text: "text-gray-600", label: "Inaktiv" },
  };
  const s = map[status] ?? { bg: "bg-gray-100", text: "text-gray-600", label: status };
  return (
    <span className={`inline-flex items-center rounded-full ${s.bg} px-2 py-0.5 text-xs font-medium ${s.text}`}>
      {s.label}
    </span>
  );
}
