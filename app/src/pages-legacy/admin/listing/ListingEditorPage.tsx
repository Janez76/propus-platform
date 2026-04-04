import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteFeedback,
  displayNameForGalleryImage,
  EMAIL_TEMPLATE_REVISION_DONE_ID,
  getGallery,
  importImagesFromShare,
  publicGalleryDeepLink,
  publicGalleryUrl,
  reorderImages,
  setFeedbackResolved,
  updateGallery,
  updateImage,
} from "../../../api/listingAdmin";
import { pathListingAdmin } from "../../../components/listing/paths";
import type { ClientGalleryRow, GalleryFeedbackRow, GalleryImageRow, GalleryStatus } from "../../../components/listing/types";
import { ListingFeedbackMailModal } from "./ListingFeedbackMailModal";
import { ListingRueckfrageModal } from "./ListingRueckfrageModal";
import { ListingSendMailModal } from "./ListingSendMailModal";

function floorPlanIndexFromFeedbackAssetKey(key: string): number | null {
  const m = key.match(/floor_plan_(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

const LISTING_STATUS_FILTER_OPTIONS: { value: GalleryStatus; label: string }[] = [
  { value: "active", label: "aktiv" },
  { value: "inactive", label: "deaktiviert" },
];

function fmtFeedbackDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Wie kunden_log_fa.html: Datum + kurze Uhrzeit */
function fmtClientLogStepTime(iso: string) {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("de-CH");
    const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
    return `${date}, ${time}`;
  } catch {
    return iso;
  }
}

function IconLink() {
  return (
    <svg
      className="gal-edit-link-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Lokaler State fürs Tippen: verhindert Parent-Re-Renders (DnD-Grid bleibt ruhig).
 * `syncKey` (z. B. updated_at nach load) setzt das Feld zurück, wenn der Serverstand neu geladen wurde.
 */
function EditorDraftField({
  syncKey,
  serverValue,
  draftRef,
  inputId,
  type = "text",
  placeholder,
}: {
  syncKey: string;
  serverValue: string;
  draftRef: MutableRefObject<string>;
  inputId: string;
  type?: "text" | "url" | "email";
  placeholder?: string;
}) {
  const [v, setV] = useState(serverValue);
  useEffect(() => {
    setV(serverValue);
    draftRef.current = serverValue;
  }, [serverValue, syncKey]);
  return (
    <input
      id={inputId}
      type={type}
      placeholder={placeholder}
      value={v}
      onChange={(e) => {
        const nv = e.target.value;
        setV(nv);
        draftRef.current = nv;
      }}
    />
  );
}

function GalleryListingStatusDropdown({
  status,
  onStatusChange,
}: {
  status: GalleryStatus;
  onStatusChange: (s: GalleryStatus) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = dropdownRef.current;
      if (el && !el.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="gal-edit-field gal-edit-field--full">
      <label id="gal-edit-status-label" htmlFor="gal-edit-status-trigger">
        Listing öffentlich
      </label>
      <div className="gal-admin-filter-dropdown gal-admin-filter-dropdown--full-width" ref={dropdownRef}>
        <button
          type="button"
          id="gal-edit-status-trigger"
          className="gal-admin-filter-dropdown__trigger"
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          aria-controls="gal-edit-status-panel"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg
            className="gal-admin-filter-dropdown__filter-icon"
            width={14}
            height={14}
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden={true}
          >
            <path
              d="M2 3.5h10M4 7h6M6 10.5h2"
              stroke="currentColor"
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          </svg>
          <span>{LISTING_STATUS_FILTER_OPTIONS.find((o) => o.value === status)?.label ?? status}</span>
          <svg
            className={
              "gal-admin-filter-dropdown__chevron" +
              (menuOpen ? " gal-admin-filter-dropdown__chevron--open" : "")
            }
            width={12}
            height={12}
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden={true}
          >
            <path
              d="M2.5 4.5l3.5 3 3.5-3"
              stroke="currentColor"
              strokeWidth={1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {menuOpen ? (
          <div
            className="gal-admin-filter-dropdown__panel"
            id="gal-edit-status-panel"
            role="dialog"
            aria-label="Listing öffentlich"
          >
            <div className="gal-admin-filter-dropdown__section gal-admin-filter-dropdown__section--sort">
              <div
                className="gal-admin-filter-dropdown__options"
                role="radiogroup"
                aria-labelledby="gal-edit-status-label"
              >
                {LISTING_STATUS_FILTER_OPTIONS.map(({ value: v, label }) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={status === v}
                    className={
                      "gal-admin-filter-dropdown__option" +
                      (status === v ? " gal-admin-filter-dropdown__option--active" : "")
                    }
                    onClick={() => {
                      onStatusChange(v);
                      setMenuOpen(false);
                    }}
                  >
                    <span>{label}</span>
                    <svg
                      className="gal-admin-filter-dropdown__check"
                      width={14}
                      height={14}
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden={true}
                    >
                      <path
                        d="M2.5 7l3.5 3.5 5.5-6"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const SortableImageThumb = memo(function SortableImageThumb({
  img,
  onToggle,
}: {
  img: GalleryImageRow;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };

  const thumbUrl = img.remote_src ?? "";

  const name = displayNameForGalleryImage(img);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`gal-edit-thumb${img.enabled ? "" : " gal-edit-thumb--dim"}`}
      title={name}
    >
      <div className="gal-edit-thumb__inner">
        {thumbUrl ? (
          <img className="gal-edit-thumb__img" src={thumbUrl} alt="" loading="lazy" />
        ) : (
          <div className="gal-edit-thumb__placeholder" aria-hidden="true" />
        )}
        <button
          type="button"
          className="gal-edit-thumb-drag"
          {...attributes}
          {...listeners}
          aria-label="Verschieben"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} />
          ))}
        </button>
        <div className="gal-edit-thumb-actions">
          <button
            type="button"
            className="gal-edit-fbt"
            title={img.enabled ? "Verstecken" : "Einblenden"}
            onClick={() => onToggle(img.id, !img.enabled)}
          >
            {img.enabled ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
      </div>
    </div>
  );
});

const GalleryImagesDndGrid = memo(function GalleryImagesDndGrid({
  images,
  onToggle,
  onDragEnd,
}: {
  images: GalleryImageRow[];
  onToggle: (id: string, enabled: boolean) => void;
  onDragEnd: (ev: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const imageIds = useMemo(() => images.map((i) => i.id), [images]);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={imageIds} strategy={rectSortingStrategy}>
        <div className="gal-edit-grid">
          {images.map((img) => (
            <SortableImageThumb key={img.id} img={img} onToggle={onToggle} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
});

export function ListingEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [g, setG] = useState<ClientGalleryRow | null>(null);
  const [images, setImages] = useState<GalleryImageRow[]>([]);
  const imagesRef = useRef<GalleryImageRow[]>([]);
  imagesRef.current = images;
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<GalleryStatus>("active");
  const titleDraftRef = useRef("");
  const addressDraftRef = useRef("");
  const clientNameDraftRef = useRef("");
  const clientEmailDraftRef = useRef("");
  const cloudDraftRef = useRef("");
  const matterportDraftRef = useRef("");
  const [mailOpen, setMailOpen] = useState(false);
  const [feedback, setFeedback] = useState<GalleryFeedbackRow[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revisionMailFeedback, setRevisionMailFeedback] = useState<GalleryFeedbackRow | null>(null);
  const [rueckfrageFor, setRueckfrageFor] = useState<GalleryFeedbackRow | null>(null);

  const sortedFeedback = useMemo(() => {
    return [...feedback].sort((a, b) => {
      const aDone = a.resolved_at ? 1 : 0;
      const bDone = b.resolved_at ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [feedback]);

  const feedbackOpenCount = useMemo(
    () => feedback.filter((f) => !f.resolved_at && f.author !== "office").length,
    [feedback],
  );

  const customerAssetHref = useCallback(
    (row: GalleryFeedbackRow): string | null => {
      if (!g) return null;
      if (row.asset_type === "image") {
        return publicGalleryDeepLink(g.slug, { bild: row.asset_key });
      }
      const idx = floorPlanIndexFromFeedbackAssetKey(row.asset_key);
      return idx != null ? publicGalleryDeepLink(g.slug, { grundriss: idx }) : publicGalleryUrl(g.slug);
    },
    [g],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const { gallery: row, images: ims, feedback: fb } = await getGallery(id);
      if (!row) {
        navigate(pathListingAdmin("galleries"), { replace: true });
        return;
      }
      setG(row);
      setStatus(row.status);
      setImages(ims);
      setFeedback(fb);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Einmal speichern: Stammdaten, Freigabe-Link, Matterport; bei neuer/geänderter Freigabe-URL Bilder einlesen. */
  async function saveAll() {
    if (!id || !g) return;
    setSavedMsg(null);
    const prevCloud = (g.cloud_share_url ?? "").trim();
    const nextCloud = cloudDraftRef.current.trim();
    const runImport = Boolean(nextCloud && nextCloud !== prevCloud);

    setSaving(true);
    try {
      await updateGallery(id, {
        title: titleDraftRef.current.trim() || "Ohne Titel",
        address: addressDraftRef.current.trim() || null,
        client_name: clientNameDraftRef.current.trim() || null,
        client_email: clientEmailDraftRef.current.trim() || null,
        status,
        slug: (g.slug ?? "").trim(),
        cloud_share_url: nextCloud || null,
        matterport_input: matterportDraftRef.current.trim() || null,
      });

      let msg = "Gespeichert.";
      if (runImport) {
        try {
          const res = await importImagesFromShare(id, [{ url: nextCloud }]);
          msg = `Gespeichert. ${res.added} Bild(er) importiert.`;
        } catch {
          msg = "Gespeichert. Freigabe konnte nicht eingelesen werden.";
        }
      }
      setSavedMsg(msg);
      window.setTimeout(() => setSavedMsg(null), 5000);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function onMarkFeedbackResolved(fid: string) {
    if (!id) return;
    setResolvingId(fid);
    try {
      await setFeedbackResolved(id, fid, true);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setResolvingId(null);
    }
  }

  async function onReopenFeedback(fid: string) {
    if (!id) return;
    setResolvingId(fid);
    try {
      await setFeedbackResolved(id, fid, false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setResolvingId(null);
    }
  }

  async function onDeleteFeedback(fid: string) {
    if (!id) return;
    if (!window.confirm("Diesen Kommentar endgültig löschen?")) return;
    setDeletingId(fid);
    try {
      await deleteFeedback(id, fid);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setDeletingId(null);
    }
  }

  const onToggle = useCallback(
    async (imgId: string, enabled: boolean) => {
      if (!id) return;
      setImages((prev) => prev.map((x) => (x.id === imgId ? { ...x, enabled } : x)));
      try {
        await updateImage(id, imgId, { enabled });
      } catch {
        await load();
      }
    },
    [id, load],
  );

  const onDragEnd = useCallback(
    async (ev: DragEndEvent) => {
      const { active, over } = ev;
      if (!over || active.id === over.id) return;
      const prev = imagesRef.current;
      const ids = prev.map((i) => i.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(prev, oldIndex, newIndex);
      setImages(next);
      if (!id) return;
      try {
        await reorderImages(
          id,
          next.map((x) => x.id),
        );
      } catch {
        await load();
      }
    },
    [id, load],
  );

  /** Schritt 3: nur nach Galerie geöffnet. */
  async function onClientLogStep3() {
    if (!id || !g || !g.client_log_gallery_opened_at) return;
    try {
      if (g.client_log_files_downloaded_at) {
        await updateGallery(id, { client_log_files_downloaded_at: null });
        setG((prev) => (prev ? { ...prev, client_log_files_downloaded_at: null } : null));
      } else {
        const now = new Date().toISOString();
        await updateGallery(id, { client_log_files_downloaded_at: now });
        setG((prev) => (prev ? { ...prev, client_log_files_downloaded_at: now } : null));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  if (!id) return null;
  if (err && !g) {
    return (
      <div className="admin-content">
        <p className="admin-msg admin-msg--err">{err}</p>
        <Link to={pathListingAdmin("galleries")} className="admin-link">
          Zur Übersicht
        </Link>
      </div>
    );
  }
  if (!g) {
    return (
      <div className="admin-content">
        <p className="admin-muted">Laden…</p>
      </div>
    );
  }

  const magicUrl = publicGalleryUrl(g.slug);
  const imgVisible = images.filter((i) => i.enabled).length;
  const imgHidden = images.length - imgVisible;

  const logEmailDone = Boolean(g.client_log_email_received_at);
  const logGalleryDone = Boolean(g.client_log_gallery_opened_at);
  const logFilesDone = Boolean(g.client_log_files_downloaded_at);
  const logDoneCount = [logEmailDone, logGalleryDone, logFilesDone].filter(Boolean).length;
  const logProgressPct = (logDoneCount / 3) * 100;

  return (
    <div className="admin-content gal-admin-editor gal-edit-page">
      <p className="gal-admin-breadcrumb gal-edit-breadcrumb">
        <Link to={pathListingAdmin("galleries")}>Listings</Link>
        <span aria-hidden="true"> / </span>
        <span>{g.title}</span>
      </p>

      <div className="gal-edit-page-header">
        <h1 className="gal-edit-page-title">Galerie bearbeiten</h1>
        <span
          className={
            status === "active" ? "gal-edit-badge gal-edit-badge--active" : "gal-edit-badge gal-edit-badge--inactive"
          }
        >
          {status === "active" ? "aktiv" : "deaktiviert"}
        </span>
      </div>

      <article className="admin-card gal-edit-card">
        <p className="gal-edit-card-label">Kunden-link</p>
        <div className="gal-edit-link-box">
          <IconLink />
          <span className="gal-edit-link-url">{magicUrl}</span>
        </div>
        <div className="gal-edit-link-actions">
          <button type="button" className="gal-edit-link-action" onClick={() => void navigator.clipboard.writeText(magicUrl)}>
            Link kopieren
          </button>
          <span className="gal-edit-link-sep" aria-hidden="true">
            ·
          </span>
          <a className="gal-edit-link-action" href={magicUrl} target="_blank" rel="noreferrer">
            Galerie öffnen
          </a>
        </div>
      </article>

      <article className="admin-card gal-edit-card">
        <p className="gal-edit-card-label">Stammdaten</p>
        <div className="gal-edit-two-col">
          <div className="gal-edit-field">
            <label htmlFor="gal-edit-title">Titel</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.title}
              draftRef={titleDraftRef}
              inputId="gal-edit-title"
            />
          </div>
          <div className="gal-edit-field">
            <label htmlFor="gal-edit-addr">Adresse / Unterzeile</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.address ?? ""}
              draftRef={addressDraftRef}
              inputId="gal-edit-addr"
              placeholder="z. B. Musterstrasse 1, 8000 Zürich"
            />
          </div>
          <div className="gal-edit-field">
            <label htmlFor="gal-edit-client">Kunde (optional)</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.client_name ?? ""}
              draftRef={clientNameDraftRef}
              inputId="gal-edit-client"
            />
          </div>
          <div className="gal-edit-field">
            <label htmlFor="gal-edit-email">E-Mail des Kunden</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.client_email ?? ""}
              draftRef={clientEmailDraftRef}
              inputId="gal-edit-email"
              type="email"
              placeholder="kunde@beispiel.ch"
            />
          </div>
        </div>
        <GalleryListingStatusDropdown status={status} onStatusChange={setStatus} />
      </article>

      <article className="admin-card gal-edit-card">
        <p className="gal-edit-card-label">Freigabe &amp; 3D-Rundgang</p>
        <div className="gal-edit-two-col">
          <div className="gal-edit-field">
            <label htmlFor="gal-edit-cloud">Freigabe-Link (Propus Cloud)</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.cloud_share_url ?? ""}
              draftRef={cloudDraftRef}
              inputId="gal-edit-cloud"
              type="url"
              placeholder="https://…/s/…"
            />
            <p className="gal-edit-field-hint">Bilder, PDF-Grundrisse und MP4-Video werden beim Speichern automatisch eingelesen.</p>
          </div>
          <div className="gal-edit-field">
            <label htmlFor="gal-edit-mp">Matterport (URL oder Modell-ID)</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.matterport_input ?? ""}
              draftRef={matterportDraftRef}
              inputId="gal-edit-mp"
              placeholder="https://my.matterport.com/show/?m=…"
            />
            <p className="gal-edit-field-hint">Erscheint auf der Kunden-Galerie.</p>
          </div>
        </div>
      </article>

      <article className="admin-card gal-edit-card">
        <div className="gal-edit-section-header">
          <span className="gal-edit-section-title">Bilder in dieser Galerie</span>
          <span className="gal-edit-section-meta">
            {imgVisible} sichtbar · {imgHidden} versteckt
          </span>
        </div>
        {images.length > 0 ? (
          <GalleryImagesDndGrid images={images} onToggle={onToggle} onDragEnd={onDragEnd} />
        ) : (
          <p className="gal-edit-empty">Noch keine Bilder in dieser Galerie.</p>
        )}
        {images.length > 0 ? (
          <div className="gal-edit-stats">
            <span className="gal-edit-stat">
              <strong>{imgVisible}</strong> sichtbar
            </span>
            <span className="gal-edit-stat">
              <strong>{imgHidden}</strong> versteckt
            </span>
            <span className="gal-edit-stat">
              <strong>{images.length}</strong> total
            </span>
          </div>
        ) : null}
      </article>

      <article className="admin-card gal-edit-card gal-edit-fb-card">
        <div className="gal-edit-fb-meta">
          <h2 className="gal-edit-fb-title">Kundenfeedback</h2>
          <span className="gal-edit-fb-count">
            {feedback.length === 0
              ? "Keine Einträge"
              : `${feedback.length} Eintrag${feedback.length === 1 ? "" : "e"} · ${feedbackOpenCount} offen${
                  feedback.length > feedbackOpenCount ? ` · ${feedback.length - feedbackOpenCount} erledigt` : ""
                }`}
          </span>
        </div>
        {feedback.length === 0 ? (
          <p className="gal-edit-fb-empty">Noch keine Kommentare aus der Kundengalerie.</p>
        ) : (
          <div className="gal-edit-fb-list">
            {sortedFeedback.map((r) => (
              <div
                key={r.id}
                className={`gal-edit-fb-item${r.resolved_at ? " gal-edit-fb-item--resolved" : ""}${
                  r.author === "office" ? " gal-edit-fb-item--office" : ""
                }`}
              >
                <div className="gal-edit-fb-item-head">
                  <div className="gal-edit-fb-item-head-main">
                    {customerAssetHref(r) ? (
                      <a
                        className="gal-edit-fb-imglink"
                        href={customerAssetHref(r)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Kundenansicht mit diesem Bild bzw. Grundriss öffnen"
                      >
                        {r.asset_label}
                      </a>
                    ) : (
                      <span className="gal-edit-fb-imglink gal-edit-fb-imglink--text" title={r.asset_label}>
                        {r.asset_label}
                      </span>
                    )}
                    {r.author === "office" ? (
                      <span className="gal-admin-feedback-entry__office-pill" title="Vom Backpanel gesendet">
                        Büro · Rückfrage
                      </span>
                    ) : null}
                  </div>
                  <time className="gal-edit-fb-date" dateTime={r.created_at}>
                    {fmtFeedbackDate(r.created_at)}
                  </time>
                </div>
                <p className="gal-edit-fb-text">{r.body}</p>
                <div className="gal-edit-fb-actions">
                  {r.author === "office" ? (
                    <button
                      type="button"
                      className="gal-edit-fb-btn gal-edit-fb-btn--danger"
                      disabled={deletingId === r.id}
                      onClick={() => void onDeleteFeedback(r.id)}
                    >
                      {deletingId === r.id ? "…" : "Löschen"}
                    </button>
                  ) : r.resolved_at ? (
                    <>
                      <button
                        type="button"
                        className="gal-edit-fb-btn gal-edit-fb-btn--danger"
                        disabled={deletingId === r.id || resolvingId === r.id}
                        onClick={() => void onDeleteFeedback(r.id)}
                      >
                        {deletingId === r.id ? "…" : "Löschen"}
                      </button>
                      <button
                        type="button"
                        className="gal-edit-fb-btn"
                        title={
                          g?.client_email?.trim()
                            ? undefined
                            : "Ohne E-Mail: Vorschau trotzdem möglich; Versand über «E-Mail öffnen» erst nach Eintrag der Kunden-E-Mail."
                        }
                        onClick={() => setRevisionMailFeedback(r)}
                      >
                        Kunde informieren
                      </button>
                      <span className="gal-admin-feedback-entry__resolved-pill">Behoben</span>
                      <span className="gal-edit-fb-resolved-meta">{fmtFeedbackDate(r.resolved_at)}</span>
                      <button
                        type="button"
                        className="gal-edit-fb-btn gal-edit-fb-btn--link"
                        disabled={resolvingId === r.id}
                        onClick={() => void onReopenFeedback(r.id)}
                      >
                        Wieder öffnen
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="gal-edit-fb-btn gal-edit-fb-btn--danger"
                        disabled={deletingId === r.id || resolvingId === r.id}
                        onClick={() => void onDeleteFeedback(r.id)}
                      >
                        {deletingId === r.id ? "…" : "Löschen"}
                      </button>
                      <button
                        type="button"
                        className="gal-edit-fb-btn"
                        disabled={resolvingId === r.id || deletingId === r.id}
                        onClick={() => void onMarkFeedbackResolved(r.id)}
                      >
                        {resolvingId === r.id ? "Wird gespeichert…" : "Behoben"}
                      </button>
                      <button
                        type="button"
                        className="gal-edit-fb-btn"
                        title={
                          g?.client_email?.trim()
                            ? undefined
                            : "Auch ohne Kunden-E-Mail: Rückfrage wird im Listing gespeichert. E-Mail bitte später ergänzen oder manuell senden."
                        }
                        onClick={() => setRueckfrageFor(r)}
                      >
                        Rückfrage
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="admin-card gal-edit-card gal-edit-kl">
        <div className="gal-kl-card-header">
          <span className="gal-kl-card-title">Kunden Log</span>
          <span className="gal-kl-card-count" aria-live="polite">
            <span className="gal-kl-card-count-num">{logDoneCount}</span>/3
          </span>
        </div>

        <div className={`gal-kl-step${logEmailDone ? " gal-kl-step--done" : ""} gal-kl-step--readonly`}>
          <div className={`gal-kl-status${logEmailDone ? " gal-kl-status--done" : " gal-kl-status--pending"}`}>
            <i className={logEmailDone ? "fa-solid fa-check" : "fa-solid fa-hourglass-half"} aria-hidden={true} />
          </div>
          <div className="gal-kl-step-icon">
            <i className="fa-solid fa-envelope" aria-hidden={true} />
          </div>
          <div className="gal-kl-step-body">
            <div className="gal-kl-step-label">Hat Kunde E-Mail erhalten</div>
            {logEmailDone && g.client_log_email_received_at ? (
              <div className="gal-kl-step-time">{fmtClientLogStepTime(g.client_log_email_received_at)}</div>
            ) : null}
          </div>
        </div>

        <div
          className={`gal-kl-step gal-kl-step--readonly${logGalleryDone ? " gal-kl-step--done" : ""}${!logEmailDone ? " gal-kl-step--locked" : ""}`}
        >
          <div className={`gal-kl-status${logGalleryDone ? " gal-kl-status--done" : " gal-kl-status--pending"}`}>
            <i className={logGalleryDone ? "fa-solid fa-check" : "fa-solid fa-hourglass-half"} aria-hidden={true} />
          </div>
          <div className="gal-kl-step-icon">
            <i className="fa-solid fa-images" aria-hidden={true} />
          </div>
          <div className="gal-kl-step-body">
            <div className="gal-kl-step-label">Hat Kunde Galerie geöffnet</div>
            {logGalleryDone && g.client_log_gallery_opened_at ? (
              <div className="gal-kl-step-time">{fmtClientLogStepTime(g.client_log_gallery_opened_at)}</div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className={`gal-kl-step gal-kl-step--last${logFilesDone ? " gal-kl-step--done" : ""}${!logGalleryDone ? " gal-kl-step--locked" : ""}`}
          disabled={!logGalleryDone}
          aria-pressed={logFilesDone}
          onClick={() => void onClientLogStep3()}
        >
          <div className={`gal-kl-status${logFilesDone ? " gal-kl-status--done" : " gal-kl-status--pending"}`}>
            <i className={logFilesDone ? "fa-solid fa-check" : "fa-solid fa-hourglass-half"} aria-hidden={true} />
          </div>
          <div className="gal-kl-step-icon">
            <i className="fa-solid fa-download" aria-hidden={true} />
          </div>
          <div className="gal-kl-step-body">
            <div className="gal-kl-step-label">Hat Kunde die Dateien runtergeladen</div>
            {logFilesDone && g.client_log_files_downloaded_at ? (
              <div className="gal-kl-step-time">{fmtClientLogStepTime(g.client_log_files_downloaded_at)}</div>
            ) : null}
          </div>
        </button>

        <div className="gal-kl-progress-bar" aria-hidden={true}>
          <div className="gal-kl-progress-fill" style={{ width: `${logProgressPct}%` }} />
        </div>
      </article>

      <div className="gal-edit-save-bar">
        <div className={`gal-edit-toast${savedMsg ? " gal-edit-toast--show" : ""}`} role="status" aria-live="polite">
          {savedMsg ? (
            <>
              <IconCheck />
              <span>{savedMsg}</span>
            </>
          ) : null}
        </div>
        <button type="button" className="admin-btn admin-btn--outline gal-edit-save-bar__btn" onClick={() => setMailOpen(true)}>
          <IconMail />
          E-Mail an Kunden
        </button>
        <button type="button" className="admin-btn admin-btn--primary gal-edit-save-bar__btn" disabled={saving} onClick={() => void saveAll()}>
          <IconSave />
          {saving ? "Speichern…" : "Alles speichern"}
        </button>
      </div>

      {mailOpen && g ? (
        <ListingSendMailModal gallery={g} onClose={() => setMailOpen(false)} onRecordedSent={() => void load()} />
      ) : null}
      {revisionMailFeedback && g ? (
        <ListingFeedbackMailModal
          gallery={g}
          feedback={revisionMailFeedback}
          templateId={EMAIL_TEMPLATE_REVISION_DONE_ID}
          title="Revision behoben – E-Mail"
          onClose={() => setRevisionMailFeedback(null)}
        />
      ) : null}
      {rueckfrageFor && g ? (
        <ListingRueckfrageModal
          gallery={g}
          customerComment={rueckfrageFor}
          onClose={() => setRueckfrageFor(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
