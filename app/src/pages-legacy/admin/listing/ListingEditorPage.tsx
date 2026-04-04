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
  createGallery,
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
  className = "gbe-input",
}: {
  syncKey: string;
  serverValue: string;
  draftRef: MutableRefObject<string>;
  inputId: string;
  type?: "text" | "url" | "email";
  placeholder?: string;
  className?: string;
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
      className={className}
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

/** Status-Dropdown im Stil bildauswahl-backpanel.html */
function GalleryBildauswahlStatusDropdown({
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

  const label = LISTING_STATUS_FILTER_OPTIONS.find((o) => o.value === status)?.label ?? status;

  return (
    <div className="gbe-field" style={{ marginBottom: 0 }}>
      <label id="gbe-status-label" htmlFor="gbe-status-trigger">
        Status
      </label>
      <div className="gbe-dd-wrap" ref={dropdownRef}>
        <button
          type="button"
          id="gbe-status-trigger"
          className="gbe-dd-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          aria-controls="gbe-status-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <div className="gbe-dd-trigger-left">
            <div className="gbe-dd-filter-icon" aria-hidden={true}>
              <i className="fa-solid fa-sliders" />
            </div>
            <div className="gbe-dd-sep-v" />
            <span className="gbe-dd-selected">{label}</span>
          </div>
          <i className={"fa-solid fa-chevron-down gbe-dd-chevron" + (menuOpen ? " gbe-open" : "")} />
        </button>
        <div
          id="gbe-status-menu"
          className={"gbe-dd-menu" + (menuOpen ? " gbe-show" : "")}
          role="listbox"
          aria-labelledby="gbe-status-label"
        >
          {LISTING_STATUS_FILTER_OPTIONS.map(({ value: v, label: lbl }) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={status === v}
              className={"gbe-dd-item" + (status === v ? " gbe-active" : "")}
              onClick={() => {
                onStatusChange(v);
                setMenuOpen(false);
              }}
            >
              <span>{lbl}</span>
              {status === v ? (
                <i className="fa-solid fa-check" style={{ fontSize: 12, color: "#185fa5" }} aria-hidden={true} />
              ) : null}
            </button>
          ))}
        </div>
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
    if (!id || id === "new") return;
    setErr(null);
    try {
      const { gallery: row, images: ims, feedback: fb } = await getGallery(id);
      if (!row) {
        navigate(pathListingAdmin(), { replace: true });
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

  /** `/admin/listing/new` → Galerie anlegen und zur echten ID weiterleiten */
  useEffect(() => {
    if (id !== "new") return;
    let cancelled = false;
    setErr(null);
    (async () => {
      try {
        const { gallery } = await createGallery();
        if (cancelled) return;
        navigate(pathListingAdmin(gallery.id), { replace: true });
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Neue Galerie konnte nicht angelegt werden");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

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
      <div className="admin-content gbe-editor-outer">
        <div className="gbe-page">
          <p className="admin-msg admin-msg--err">{err}</p>
          <Link to={pathListingAdmin()} className="admin-link">
            Zur Übersicht
          </Link>
        </div>
      </div>
    );
  }
  if (!g) {
    return (
      <div className="admin-content gbe-editor-outer">
        <div className="gbe-page">
          <p className="admin-muted">Laden…</p>
        </div>
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

  const isNewListing = !g.title.trim() || g.title.trim() === "Ohne Titel";
  const pageHeading = isNewListing ? "Bildauswahl erstellen" : "Galerie bearbeiten";
  const crumbCurrent = isNewListing ? "Neues Listing" : g.title;

  return (
    <div className="admin-content gbe-editor-outer">
      <div className="gbe-page">
        <p className="gbe-breadcrumb">
          <Link to={pathListingAdmin()}>Bildauswahl</Link>
          <span aria-hidden="true"> / </span>
          <span>{crumbCurrent}</span>
        </p>

        <header className="gbe-page-header">
          <h1 className="gbe-page-title">{pageHeading}</h1>
          <div className="gbe-header-actions">
            <button type="button" className="gbe-btn gbe-btn-outline" onClick={() => setMailOpen(true)}>
              <i className="fa-regular fa-envelope" aria-hidden={true} />
              E-Mail an Kunden
            </button>
            <button type="button" className="gbe-btn gbe-btn-primary" disabled={saving} onClick={() => void saveAll()}>
              <i className="fa-solid fa-floppy-disk" aria-hidden={true} />
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </header>

        <section className="gbe-card">
          <h2 className="gbe-card-label">Kunden-Link</h2>
          <div className="gbe-link-box">
            <i className="fa-solid fa-link" aria-hidden={true} />
            <span className="gbe-link-url">{magicUrl}</span>
          </div>
          <div className="gbe-link-text-actions">
            <button type="button" onClick={() => void navigator.clipboard.writeText(magicUrl)}>
              Link kopieren
            </button>
            <span className="gbe-link-sep" aria-hidden="true">
              ·
            </span>
            <a href={magicUrl} target="_blank" rel="noreferrer">
              Galerie öffnen
            </a>
          </div>
        </section>

        <section className="gbe-card">
          <h2 className="gbe-card-label">Stammdaten</h2>
          <div className="gbe-field">
            <label htmlFor="gal-edit-title">Titel</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.title}
              draftRef={titleDraftRef}
              inputId="gal-edit-title"
              placeholder="z. B. EFH mit Ausblick"
            />
          </div>
          <div className="gbe-two-col">
            <div className="gbe-field">
              <label htmlFor="gal-edit-client">Kunde (optional)</label>
              <EditorDraftField
                syncKey={g.updated_at}
                serverValue={g.client_name ?? ""}
                draftRef={clientNameDraftRef}
                inputId="gal-edit-client"
              />
            </div>
            <div className="gbe-field">
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
          <div className="gbe-divider" />
          <div className="gbe-field">
            <label htmlFor="gal-edit-addr">Adresse</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.address ?? ""}
              draftRef={addressDraftRef}
              inputId="gal-edit-addr"
              placeholder="z. B. Musterstrasse 1, 8000 Zürich"
            />
          </div>
          <div className="gbe-divider" />
          <GalleryBildauswahlStatusDropdown status={status} onStatusChange={setStatus} />
        </section>

        <section className="gbe-card">
          <h2 className="gbe-card-label">Freigabe &amp; 3D-Rundgang</h2>
          <div className="gbe-two-col">
            <div className="gbe-field">
              <label htmlFor="gal-edit-cloud">Freigabe-Link (Propus Cloud)</label>
              <EditorDraftField
                syncKey={g.updated_at}
                serverValue={g.cloud_share_url ?? ""}
                draftRef={cloudDraftRef}
                inputId="gal-edit-cloud"
                type="url"
                placeholder="https://…/s/…"
              />
              <p className="gbe-field-hint">
                Bilder, PDF-Grundrisse und MP4-Video werden beim Speichern automatisch eingelesen.
              </p>
            </div>
            <div className="gbe-field">
              <label htmlFor="gal-edit-mp">Matterport (URL oder Modell-ID)</label>
              <EditorDraftField
                syncKey={g.updated_at}
                serverValue={g.matterport_input ?? ""}
                draftRef={matterportDraftRef}
                inputId="gal-edit-mp"
                placeholder="https://my.matterport.com/show/?m=…"
              />
              <p className="gbe-field-hint">Erscheint auf der Kunden-Galerie.</p>
            </div>
          </div>
        </section>

        <section className="gbe-card">
          <div className="gbe-section-head">
            <h2 className="gbe-card-label">Bilder in der Galerie</h2>
            <span className="gbe-section-meta">
              {imgVisible} sichtbar · {imgHidden} versteckt
            </span>
          </div>
          <div className="gbe-upload-zone" aria-hidden={true}>
            <i className="fa-solid fa-cloud-arrow-up" />
            <div className="gbe-upload-title">Bilder über Propus Cloud</div>
            <div className="gbe-upload-sub">
              Trage den <span className="gbe-gold">Freigabe-Link</span> oben ein und speichere — die Medien erscheinen dann
              in der Galerie. Reihenfolge und Sichtbarkeit unten anpassen.
            </div>
          </div>
          {images.length > 0 ? (
            <GalleryImagesDndGrid images={images} onToggle={onToggle} onDragEnd={onDragEnd} />
          ) : (
            <p className="gal-edit-empty">Noch keine Bilder in dieser Galerie.</p>
          )}
          <div className="gbe-stats-row">
            <div className="gbe-stat-box">
              <div className="gbe-stat-num">{images.length}</div>
              <div className="gbe-stat-lbl">Bilder total</div>
            </div>
            <div className="gbe-stat-box gbe-stat-b">
              <div className="gbe-stat-num">{imgVisible}</div>
              <div className="gbe-stat-lbl">Sichtbar</div>
            </div>
            <div className="gbe-stat-box gbe-stat-s">
              <div className="gbe-stat-num">{imgHidden}</div>
              <div className="gbe-stat-lbl">Versteckt</div>
            </div>
            <div className="gbe-stat-box gbe-stat-r">
              <div className="gbe-stat-num">{feedbackOpenCount}</div>
              <div className="gbe-stat-lbl">Feedback offen</div>
            </div>
          </div>
        </section>

        <section className="gbe-card gbe-fb-card gal-edit-fb-card">
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
      </section>

        <section className="gbe-card">
          <div className="gbe-log-header">
            <span className="gbe-log-title">Kunden Log</span>
            <span className="gbe-log-count" aria-live="polite">
              <span>{logDoneCount}</span>/3
            </span>
          </div>

          <div
            className={`gbe-step${logEmailDone ? " gbe-done-state" : ""}`}
            role="group"
            aria-label="E-Mail erhalten"
          >
            <div className={`gbe-status${logEmailDone ? " gbe-done" : " gbe-pending"}`}>
              <i className={logEmailDone ? "fa-solid fa-check" : "fa-solid fa-hourglass-half"} aria-hidden={true} />
            </div>
            <div className={`gbe-step-icon${logEmailDone ? " gbe-done" : " gbe-pending"}`}>
              <i className="fa-solid fa-envelope" aria-hidden={true} />
            </div>
            <div className="gbe-step-body">
              <div className="gbe-step-label">Kunde hat E-Mail erhalten</div>
              {logEmailDone && g.client_log_email_received_at ? (
                <div className="gbe-step-time">{fmtClientLogStepTime(g.client_log_email_received_at)}</div>
              ) : null}
            </div>
          </div>

          <div
            className={`gbe-step${logGalleryDone ? " gbe-done-state" : ""}${!logEmailDone ? " gbe-step--locked" : ""}`}
            role="group"
            aria-label="Galerie geöffnet"
          >
            <div className={`gbe-status${logGalleryDone ? " gbe-done" : " gbe-pending"}`}>
              <i className={logGalleryDone ? "fa-solid fa-check" : "fa-solid fa-hourglass-half"} aria-hidden={true} />
            </div>
            <div className={`gbe-step-icon${logGalleryDone ? " gbe-done" : " gbe-pending"}`}>
              <i className="fa-solid fa-images" aria-hidden={true} />
            </div>
            <div className="gbe-step-body">
              <div className="gbe-step-label">Kunde hat Galerie geöffnet</div>
              {logGalleryDone && g.client_log_gallery_opened_at ? (
                <div className="gbe-step-time">{fmtClientLogStepTime(g.client_log_gallery_opened_at)}</div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className={`gbe-step${logFilesDone ? " gbe-done-state" : ""}${!logGalleryDone ? " gbe-step--locked" : ""}`}
            disabled={!logGalleryDone}
            aria-pressed={logFilesDone}
            onClick={() => void onClientLogStep3()}
          >
            <div className={`gbe-status${logFilesDone ? " gbe-done" : " gbe-pending"}`}>
              <i className={logFilesDone ? "fa-solid fa-check" : "fa-solid fa-hourglass-half"} aria-hidden={true} />
            </div>
            <div className={`gbe-step-icon${logFilesDone ? " gbe-done" : " gbe-pending"}`}>
              <i className="fa-solid fa-download" aria-hidden={true} />
            </div>
            <div className="gbe-step-body">
              <div className="gbe-step-label">Kunde hat die Dateien runtergeladen</div>
              {logFilesDone && g.client_log_files_downloaded_at ? (
                <div className="gbe-step-time">{fmtClientLogStepTime(g.client_log_files_downloaded_at)}</div>
              ) : null}
            </div>
          </button>

          <div className="gbe-progress-wrap" aria-hidden={true}>
            <div className="gbe-progress-fill" style={{ width: `${logProgressPct}%` }} />
          </div>
        </section>

        <div className="gbe-save-bar">
          <div className={`gbe-toast${savedMsg ? " gbe-toast--show" : ""}`} role="status" aria-live="polite">
            {savedMsg ? (
              <>
                <i className="fa-solid fa-check" aria-hidden={true} />
                <span>{savedMsg}</span>
              </>
            ) : null}
          </div>
          <button type="button" className="gbe-btn gbe-btn-outline" onClick={() => setMailOpen(true)}>
            <i className="fa-regular fa-envelope" aria-hidden={true} />
            E-Mail an Kunden
          </button>
          <button type="button" className="gbe-btn gbe-btn-primary" disabled={saving} onClick={() => void saveAll()}>
            <i className="fa-solid fa-floppy-disk" aria-hidden={true} />
            {saving ? "Speichern…" : "Speichern"}
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
    </div>
  );
}
