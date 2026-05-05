import { notFound } from "next/navigation";
import { queryOne, query } from "@/lib/db";
import Link from "next/link";
import { ExternalLink, Plus, Image } from "lucide-react";

type GalleryRow = {
  id: string;
  slug: string;
  friendly_slug: string | null;
  title: string | null;
  status: string;
  client_delivery_status: string | null;
  created_at: string;
};

export default async function ListingPage({
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

  const galleries = await query<GalleryRow>(
    `SELECT id, slug, friendly_slug, title, status, client_delivery_status, created_at
     FROM tour_manager.galleries
     WHERE booking_order_no = $1
     ORDER BY created_at DESC`,
    [orderCheck.order_no],
  );

  if (galleries.length === 0) {
    return (
      <div className="bd-panel">
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Image className="h-12 w-12 text-gray-300" />
          <p className="text-sm text-gray-500">
            Für diese Bestellung existiert noch kein Listing.
          </p>
          <Link
            href={`/admin/listing/new?orderNo=${orderCheck.order_no}`}
            className="admin-btn admin-btn--primary inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Listing erstellen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bd-panel space-y-4">
      <h2 className="text-base font-semibold">
        {galleries.length === 1 ? "Listing" : `${galleries.length} Listings`}
      </h2>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {galleries.map((g) => (
          <Link
            key={g.id}
            href={`/admin/listing/${g.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">
                {g.title || g.friendly_slug || g.slug}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {g.friendly_slug || g.slug}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusBadge status={g.status} delivery={g.client_delivery_status} />
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
      {galleries.length < 3 && (
        <Link
          href={`/admin/listing/new?orderNo=${orderCheck.order_no}`}
          className="admin-btn admin-btn--outline inline-flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Weiteres Listing erstellen
        </Link>
      )}
    </div>
  );
}

function StatusBadge({ status, delivery }: { status: string; delivery: string | null }) {
  if (delivery === "sent") {
    return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Versendet</span>;
  }
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "bg-green-50", text: "text-green-700", label: "Aktiv" },
    draft: { bg: "bg-gray-100", text: "text-gray-600", label: "Entwurf" },
    archived: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Archiviert" },
  };
  const s = map[status] ?? { bg: "bg-gray-100", text: "text-gray-600", label: status };
  return (
    <span className={`inline-flex items-center rounded-full ${s.bg} px-2 py-0.5 text-xs font-medium ${s.text}`}>
      {s.label}
    </span>
  );
}
