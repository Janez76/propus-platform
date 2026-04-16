export type GalleryStatus = "active" | "inactive";
export type ClientDeliveryStatus = "open" | "sent";

export type ClientGalleryRow = {
  id: string;
  slug: string;
  title: string;
  address: string | null;
  storage_source_type: "share_link" | "order_folder" | "nas_browser" | null;
  storage_root_kind: "customer" | "raw" | null;
  storage_relative_path: string | null;
  customer_id: number | null;
  customer_contact_id: number | null;
  booking_order_no: number | null;
  client_name: string | null;
  client_contact: string | null;
  client_email: string | null;
  client_delivery_status: ClientDeliveryStatus;
  client_delivery_sent_at: string | null;
  client_log_email_received_at: string | null;
  client_log_gallery_opened_at: string | null;
  client_log_files_downloaded_at: string | null;
  status: GalleryStatus;
  matterport_input: string | null;
  cloud_share_url: string | null;
  video_source_type: "url" | "nas_local" | null;
  video_source_root_kind: "customer" | "raw" | null;
  video_source_path: string | null;
  video_url: string | null;
  floor_plans_json: string | null;
  created_at: string;
  updated_at: string;
};

export type GalleryImageRow = {
  id: string;
  gallery_id: string;
  sort_order: number;
  enabled: boolean;
  category: string | null;
  file_name: string | null;
  source_type: "remote_url" | "nas_local" | null;
  source_root_kind: "customer" | "raw" | null;
  source_path: string | null;
  remote_src: string | null;
  created_at: string;
};

export type GalleryFeedbackRow = {
  id: string;
  gallery_id: string;
  gallery_slug: string;
  asset_type: "image" | "floor_plan";
  asset_key: string;
  asset_label: string;
  body: string;
  created_at: string;
  revision: number;
  resolved_at: string | null;
  author: "client" | "office";
};

export type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type GalleryFloorPlan = { url: string; title: string };

export type GalleryMediaSummary = {
  imagesWebsize: number;
  imagesFullsize: number;
  floorPlans: number;
  hasVideo: boolean;
  bytesWebsize: number;
  bytesFullsize: number;
  bytesTotal: number;
};

export type PublicGalleryPayload = {
  id: string;
  title: string;
  address: string | null;
  client_name: string | null;
  updated_at: string;
  cloud_share_url: string | null;
  download_all_url: string | null;
  matterport_src: string;
  video_url: string;
  floor_plans: GalleryFloorPlan[];
  images: Array<{
    id: string;
    category: string | null;
    sort_order: number;
  }>;
  media_summary?: GalleryMediaSummary | null;
};

export type GalleryListRow = ClientGalleryRow & {
  image_count: number;
  feedback_count: number;
};
