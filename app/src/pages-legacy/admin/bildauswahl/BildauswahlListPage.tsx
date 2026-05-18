import { Link } from "react-router-dom";
import { ArrowRight, Package } from "lucide-react";
import { bulkDeleteGalleries, deleteGallery, listGalleries, publicGalleryUrl } from "../../../api/bildauswahlAdmin";
import { pathBildauswahlAdmin } from "../../../components/bildauswahl/paths";
import { GalleryOverviewPage } from "../../../components/listing/GalleryOverviewPage";
import { BildauswahlDeleteConfirmModal } from "./BildauswahlDeleteConfirmModal";

export function BildauswahlListPage() {
  return (
    <GalleryOverviewPage
      pageTitle="Bildauswahl"
      nounSingular="Bildauswahl"
      nounPlural="Bildauswahlen"
      newButtonLabel="Neue Bildauswahl"
      buildAdminHref={pathBildauswahlAdmin}
      thumbApiBase="/api/tours/admin/bildauswahl"
      emptyHint="Noch keine Bildauswahl angelegt."
      api={{ listGalleries, deleteGallery, bulkDeleteGalleries, publicGalleryUrl }}
      infoBanner={({ total }) =>
        total > 0 && total < 3 ? (
          <div className="gov-info-banner">
            <div className="gov-info-banner__icon" aria-hidden>
              <Package className="h-4 w-4" />
            </div>
            <div className="gov-info-banner__body">
              Tipp: Bildauswahl direkt aus einer Bestellung anlegen — Kunde, Adresse und Bestell-Nr.
              werden dabei automatisch übernommen.
            </div>
            <Link to="/orders" className="gov-info-banner__link">
              Zu Bestellungen <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        ) : null
      }
      renderDeleteModal={({ target, onClose, onConfirm }) => (
        <BildauswahlDeleteConfirmModal gallery={target} onClose={onClose} onConfirm={onConfirm} />
      )}
      renderBulkDeleteModal={({ galleries, onClose, onConfirm }) => (
        <BildauswahlDeleteConfirmModal galleries={galleries} onClose={onClose} onConfirm={onConfirm} />
      )}
    />
  );
}
