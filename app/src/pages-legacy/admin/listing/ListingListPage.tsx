import { bulkDeleteGalleries, deleteGallery, listGalleries, publicGalleryUrl } from "../../../api/listingAdmin";
import { pathListingAdmin } from "../../../components/listing/paths";
import { GalleryOverviewPage } from "../../../components/listing/GalleryOverviewPage";
import { ListingDeleteConfirmModal } from "./ListingDeleteConfirmModal";

export function ListingListPage() {
  return (
    <GalleryOverviewPage
      pageTitle="Listings"
      nounSingular="Listing"
      nounPlural="Listings"
      newButtonLabel="Neues Listing"
      buildAdminHref={pathListingAdmin}
      thumbApiBase="/api/tours/admin/galleries"
      api={{ listGalleries, deleteGallery, bulkDeleteGalleries, publicGalleryUrl }}
      renderDeleteModal={({ target, onClose, onConfirm }) => (
        <ListingDeleteConfirmModal gallery={target} onClose={onClose} onConfirm={onConfirm} />
      )}
      renderBulkDeleteModal={({ galleries, onClose, onConfirm }) => (
        <ListingDeleteConfirmModal galleries={galleries} onClose={onClose} onConfirm={onConfirm} />
      )}
    />
  );
}
