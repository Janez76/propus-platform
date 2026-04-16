export type GalleryStatus = "active" | "inactive";

/** Versand an Kunde: noch offen oder Link/E-Mail als versendet behandelt. */
export type ClientDeliveryStatus = "open" | "sent";

export type ClientGalleryRow = {
  id: string;
  slug: string;
  title: string;
  /** Unterzeile im Hero (Adresse / Objekt) */
  address: string | null;
  client_name: string | null;
  client_email: string | null;
  client_delivery_status: ClientDeliveryStatus;
  /** ISO-Zeitpunkt, wenn zuletzt «versendet» gespeichert wurde (mailto / Server-Versand). */
  client_delivery_sent_at: string | null;
  /** Kunden-Log: Schritt «E-Mail erhalten» (gesetzt beim Versand). */
  client_log_email_received_at: string | null;
  /** Kunden-Log: Galerie geöffnet. */
  client_log_gallery_opened_at: string | null;
  /** Kunden-Log Schritt 3: Auswahl bestätigt (Picdrop) oder Medien-Download. */
  client_log_files_downloaded_at: string | null;
  status: GalleryStatus;
  /** Ungenutzt (Picdrop: nur Bilder); in der DB für Altdaten noch vorhanden */
  matterport_input: string | null;
  /** Zuletzt genutzte Propus-/Nextcloud-Freigabe-URL (nur Referenz) */
  cloud_share_url: string | null;
  /** Picdrop: zwischengespeicherte Auswahl (JSON), bis «Senden» */
  picdrop_selection_json: string | null;
  /** Wasserzeichen auf Bildern (Kunde / Vorschau) */
  watermark_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type GalleryImageRow = {
  id: string;
  gallery_id: string;
  /** Lokal: gleich `id` (Blob-Schlüssel in IndexedDB). */
  storage_path: string;
  sort_order: number;
  enabled: boolean;
  category: string | null;
  created_at: string;
  /** Anzeige im Backpanel (Upload-Name oder aus URL) */
  file_name: string | null;
  /** Gesetzt = Bild nur per Link (Propus Cloud), kein Blob */
  remote_src: string | null;
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

/** Kunden-Feedback zu einem Galerie-Bild (Revision = laufende Nummer pro Listing). `floor_plan` nur bei Altdaten. */
export type GalleryFeedbackRow = {
  id: string;
  gallery_id: string;
  gallery_slug: string;
  asset_type: "image" | "floor_plan";
  /** Bild: image-UUID */
  asset_key: string;
  /** Anzeige im Backpanel */
  asset_label: string;
  /** Picdrop: JSON-Array der gewählten Flaggen (bearbeiten, staging, retusche); sonst null */
  selection_flags_json: string | null;
  body: string;
  created_at: string;
  revision: number;
  /** gesetzt wenn «Behoben» im Backpanel */
  resolved_at: string | null;
  /** `office` = Rückfrage aus dem Backpanel */
  author: "client" | "office";
};

export type PublicGalleryPayload = {
  id: string;
  title: string;
  address: string | null;
  client_name: string | null;
  /** ISO-Zeitstempel (z. B. für Datumszeile im Hero) */
  updated_at: string;
  /** Propus-Cloud-Freigabe für ZIP-Download (gesamter Ordner) */
  cloud_share_url: string | null;
  /** Nicht genutzt (immer leer) */
  matterport_src: string;
  /** Nicht genutzt (immer leer) */
  video_url: string;
  /** Nicht genutzt (immer leer) */
  floor_plans: GalleryFloorPlan[];
  images: Array<{
    id: string;
    category: string | null;
    sort_order: number;
  }>;
  /** Entwurf der Bildauswahl (automatisch gespeichert) */
  picdrop_selection_json: string | null;
  watermark_enabled: boolean;
};
