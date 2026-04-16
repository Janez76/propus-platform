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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { pathSelektoAdmin as pathListingAdmin } from "../../lib/selekto/paths";
import { SelektoFeedbackMailModal } from "./SelektoFeedbackMailModal";
import { SelektoRueckfrageModal } from "./SelektoRueckfrageModal";
import { SelektoSendMailModal } from "./SelektoSendMailModal";
import "../../styles/selekto/gallery-bildauswahl-editor.css";
import {
  displayNameForGalleryImage,
  EMAIL_TEMPLATE_REVISION_DONE_ID,
  getGallery,
  importGalleryImagesFromPropusShare,
  listGalleryFeedback,
  listGalleryImages,
  publicGalleryDeepLink,
  publicGalleryUrl,
  reorderImages,
  setGalleryFeedbackResolved,
  updateGallery,
  updateImage,
} from "../../lib/selekto/galleryApi";
import type { ClientGalleryRow, GalleryFeedbackRow, GalleryImageRow, GalleryStatus } from "../../lib/selekto/types";

const LISTING_STATUS_FILTER_OPTIONS: { value: GalleryStatus; label: string }[] = [
  { value: "active", label: "aktiv" },
  { value: "inactive", label: "deaktiviert" },
];

type WatermarkToggle = "on" | "off";

const WATERMARK_TOGGLE_OPTIONS: { value: WatermarkToggle; label: string }[] = [
  { value: "on", label: "aktiv" },
  { value: "off", label: "deaktiviert" },
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

const PICDROP_FLAG_LABEL_DE: Record<string, string> = {
  bearbeiten: "Bearbeiten",
  staging: "Staging",
  retusche: "Retusche",
};

function picdropFlagLabelsFromJson(json: string | null): string[] {
  if (!json?.trim()) return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    const allow = new Set(["bearbeiten", "staging", "retusche"]);
    return v
      .filter((x): x is string => typeof x === "string" && allow.has(x))
      .map((k) => PICDROP_FLAG_LABEL_DE[k] ?? k);
  } catch {
    return [];
  }
}

/** Fließtext für Zwischenablage: je Eintrag Dateiname / Gewählt / Kommentar, Leerzeile dazwischen. */
function buildFeedbackExportPlainText(rows: GalleryFeedbackRow[]): string {
  const blocks: string[] = [];
  for (const r of rows) {
    if (r.author === "office") {
      blocks.push(`Büro · Rückfrage · ${String(r.asset_label || "—").trim()}`);
      blocks.push(`Text: ${(r.body || "").trim() || "—"}`);
      blocks.push("");
      continue;
    }
    const gew = picdropFlagLabelsFromJson(r.selection_flags_json);
    const gewStr = gew.length > 0 ? gew.join(", ") : "—";
    blocks.push(String(r.asset_label || "—").trim());
    blocks.push(`Gewählt: ${gewStr}`);
    blocks.push(`Kommentar: ${(r.body || "").trim() || "—"}`);
    blocks.push("");
  }
  return blocks.join("\n").replace(/\n+$/u, "");
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

/** Status- und Wasserzeichen-Dropdowns im Stil bildauswahl-backpanel.html */
function GalleryBildauswahlLabeledDropdown<V extends string>({
  fieldLabel,
  value,
  options,
  onChange,
  menuId,
  triggerId,
}: {
  fieldLabel: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  menuId: string;
  triggerId: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const labelId = `${triggerId}-label`;

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

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="gbe-field" style={{ marginBottom: 0 }}>
      <label id={labelId} htmlFor={triggerId}>
        {fieldLabel}
      </label>
      <div className="gbe-dd-wrap" ref={dropdownRef}>
        <button
          type="button"
          id={triggerId}
          className="gbe-dd-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          aria-controls={menuId}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <div className="gbe-dd-trigger-left">
            <div className="gbe-dd-filter-icon" aria-hidden={true}>
              <i className="fa-solid fa-sliders" />
            </div>
            <div className="gbe-dd-sep-v" />
            <span className="gbe-dd-selected">{selectedLabel}</span>
          </div>
          <i className={"fa-solid fa-chevron-down gbe-dd-chevron" + (menuOpen ? " gbe-open" : "")} />
        </button>
        <div
          id={menuId}
          className={"gbe-dd-menu" + (menuOpen ? " gbe-show" : "")}
          role="listbox"
          aria-labelledby={labelId}
        >
          {options.map(({ value: v, label: lbl }) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={value === v}
              className={"gbe-dd-item" + (value === v ? " gbe-active" : "")}
              onClick={() => {
                onChange(v);
                setMenuOpen(false);
              }}
            >
              <span>{lbl}</span>
              {value === v ? (
                <i className="fa-solid fa-check" style={{ fontSize: 12, color: "#185fa5" }} aria-hidden={true} />
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GalleryBildauswahlStatusDropdown({
  status,
  onStatusChange,
}: {
  status: GalleryStatus;
  onStatusChange: (s: GalleryStatus) => void;
}) {
  return (
    <GalleryBildauswahlLabeledDropdown
      fieldLabel="Status"
      value={status}
      options={LISTING_STATUS_FILTER_OPTIONS}
      onChange={onStatusChange}
      menuId="gbe-status-menu"
      triggerId="gbe-status-trigger"
    />
  );
}

function GalleryWatermarkDropdown({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
}) {
  const value: WatermarkToggle = enabled ? "on" : "off";
  return (
    <GalleryBildauswahlLabeledDropdown
      fieldLabel="Anzeige"
      value={value}
      options={WATERMARK_TOGGLE_OPTIONS}
      onChange={(v) => onEnabledChange(v === "on")}
      menuId="gbe-watermark-menu"
      triggerId="gbe-watermark-trigger"
    />
  );
}

const SortableImageRow = memo(function SortableImageRow({
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
  const name = displayNameForGalleryImage(img);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`gal-edit-img-row${img.enabled ? "" : " gal-edit-img-row--dim"}`}
    >
      <button
        type="button"
        className="gal-edit-thumb-drag gal-edit-img-row__drag"
        {...attributes}
        {...listeners}
        aria-label="Reihenfolge ändern"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} />
        ))}
      </button>
      <span className="gal-edit-img-row__name" title={name}>
        {name}
      </span>
      <div className="gal-edit-img-row__actions">
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
  );
});

const GalleryImagesDndList = memo(function GalleryImagesDndList({
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
      <SortableContext items={imageIds} strategy={verticalListSortingStrategy}>
        <div className="gal-edit-img-list" role="list">
          {images.map((img) => (
            <SortableImageRow key={img.id} img={img} onToggle={onToggle} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
});

export function SelektoEditorPage() {
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
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const titleDraftRef = useRef("");
  const addressDraftRef = useRef("");
  const clientNameDraftRef = useRef("");
  const clientEmailDraftRef = useRef("");
  const cloudDraftRef = useRef("");
  const [mailOpen, setMailOpen] = useState(false);
  const [feedback, setFeedback] = useState<GalleryFeedbackRow[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [feedbackCopyOk, setFeedbackCopyOk] = useState(false);
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
      return publicGalleryUrl(g.slug);
    },
    [g],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const row = await getGallery(id);
      if (!row) {
        navigate(pathListingAdmin("galleries"), { replace: true });
        return;
      }
      setG(row);
      setStatus(row.status);
      setWatermarkEnabled(row.watermark_enabled !== false);
      const ims = await listGalleryImages(id);
      setImages(ims);
      setFeedback(await listGalleryFeedback(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Einmal speichern: Stammdaten, Freigabe-Link; bei neuer/geänderter Freigabe-URL Bilder einlesen. */
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
        matterport_input: null,
        watermark_enabled: watermarkEnabled,
      });

      let msg = "Gespeichert.";
      if (runImport) {
        const res = await importGalleryImagesFromPropusShare(id, nextCloud);
        if (res.ok) {
          msg = res.message;
        } else {
          alert(res.message);
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

  async function onReopenFeedback(fid: string) {
    setResolvingId(fid);
    try {
      await setGalleryFeedbackResolved(fid, false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setResolvingId(null);
    }
  }

  const onToggle = useCallback(
    async (imgId: string, enabled: boolean) => {
      setImages((prev) => prev.map((x) => (x.id === imgId ? { ...x, enabled } : x)));
      try {
        await updateImage(imgId, { enabled });
      } catch {
        await load();
      }
    },
    [load],
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

  /** Schritt 3: manuell setzen sobald Schritt 1 (E-Mail) erledigt — unabhängig von «Galerie geöffnet», falls der Log dort hängen bleibt. */
  async function onClientLogStep3() {
    if (!id || !g) return;
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
      <div className="gbe-page">
        <p className="admin-msg admin-msg--err">{err}</p>
        <Link to={pathListingAdmin("galleries")} className="admin-link">
          Zur Übersicht
        </Link>
      </div>
    );
  }
  if (!g) {
    return (
      <div className="gbe-page">
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

  const t = g.title.trim();
  const isNewListing =
    !t || t === "Ohne Titel" || t === "Neue Galerie" || t === "Neue Auswahl";
  const pageHeading = isNewListing ? "Bildauswahl erstellen" : "Auswahl bearbeiten";
  const crumbCurrent = isNewListing ? "Neue Auswahl" : g.title;

  return (
    <div className="gbe-page">
      <p className="gbe-breadcrumb">
        <Link to={pathListingAdmin("galleries")}>Auswahlen</Link>
        <span aria-hidden="true"> / </span>
        <span>{crumbCurrent}</span>
      </p>

      <header className="gbe-page-header">
        <h1 className="gbe-page-title">{pageHeading}</h1>
        <div className="gbe-header-actions">
          <button type="button" className="gbe-btn gbe-btn-outline" onClick={() => setMailOpen(true)}>
            <i className="fa-regular fa-envelope" aria-hidden={true} />
            E-Mail zur Auswahl
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
        <h2 className="gbe-card-label">Freigabe (Propus Cloud)</h2>
        <div className="gbe-field">
          <label htmlFor="gal-edit-cloud">Freigabe-Link</label>
          <EditorDraftField
            syncKey={g.updated_at}
            serverValue={g.cloud_share_url ?? ""}
            draftRef={cloudDraftRef}
            inputId="gal-edit-cloud"
            type="url"
            placeholder="https://…/s/…"
          />
          <p className="gbe-field-hint">
            Beim Speichern werden nur <strong>Bilder</strong> aus dem Freigabeordner übernommen (keine PDFs, Videos oder
            Matterport).
          </p>
        </div>
      </section>

      <section className="gbe-card">
        <h2 className="gbe-card-label">Wasserzeichen</h2>
        <GalleryWatermarkDropdown enabled={watermarkEnabled} onEnabledChange={setWatermarkEnabled} />
        <p className="gbe-field-hint">
          Bei <strong>aktiv</strong> erscheint das Propus-Wasserzeichen auf allen Bildern in der Kundenansicht und in der
          Vorschau.
        </p>
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
            Trage den <span className="gbe-gold">Freigabe-Link</span> oben ein und speichere — die Medien erscheinen
            dann in der Galerie. Reihenfolge und Sichtbarkeit unten anpassen.
          </div>
        </div>
        {images.length > 0 ? (
          <GalleryImagesDndList images={images} onToggle={onToggle} onDragEnd={onDragEnd} />
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
          <p className="gal-edit-fb-empty">Noch kein Feedback aus der Kunden-Bildauswahl.</p>
        ) : (
          <div className="gal-edit-fb-list">
            {sortedFeedback.map((r) => {
              const gewaehltLabels = picdropFlagLabelsFromJson(r.selection_flags_json);
              return (
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
                        title="Kundenansicht mit diesem Bild öffnen"
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
                {r.author === "office" ? (
                  <p className="gal-edit-fb-text">{r.body}</p>
                ) : (
                  <div className="gal-edit-fb-body">
                    <p className="gal-edit-fb-line">
                      <span className="gal-edit-fb-k">Gewählt:</span>{" "}
                      {gewaehltLabels.length > 0 ? gewaehltLabels.join(", ") : "—"}
                    </p>
                    <p className="gal-edit-fb-line">
                      <span className="gal-edit-fb-k">Kommentar:</span> {r.body.trim() ? r.body.trim() : "-"}
                    </p>
                  </div>
                )}
                {r.author !== "office" ? (
                  <div className="gal-edit-fb-actions">
                    {r.resolved_at ? (
                      <>
                        <button
                          type="button"
                          className="gal-edit-fb-btn"
                          title={
                            g?.client_email?.trim()
                              ? undefined
                              : "Ohne E-Mail: Vorschau trotzdem möglich; Versand über «E-Mail öffnen» erst nach Eintrag der Kunden-E-Mail bei dieser Auswahl."
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
                          {resolvingId === r.id ? "…" : "Wieder öffnen"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="gal-edit-fb-btn"
                        title={
                          g?.client_email?.trim()
                            ? undefined
                            : "Auch ohne Kunden-E-Mail: Rückfrage wird in der Auswahl gespeichert. E-Mail bitte später ergänzen oder manuell senden."
                        }
                        onClick={() => setRueckfrageFor(r)}
                      >
                        Rückfrage
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
            })}
          </div>
        )}
        {feedback.length > 0 ? (
          <div className="gal-edit-fb-copy-row">
            <button
              type="button"
              className="gal-edit-fb-btn"
              onClick={() => {
                const text = buildFeedbackExportPlainText(sortedFeedback);
                void navigator.clipboard.writeText(text).then(
                  () => {
                    setFeedbackCopyOk(true);
                    window.setTimeout(() => setFeedbackCopyOk(false), 2000);
                  },
                  () => alert("In die Zwischenablage kopieren ist fehlgeschlagen."),
                );
              }}
            >
              Gesamtes Feedback kopieren
            </button>
            {feedbackCopyOk ? <span className="gal-edit-fb-copy-ok">Kopiert.</span> : null}
          </div>
        ) : null}
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
          className={`gbe-step${logFilesDone ? " gbe-done-state" : ""}${!logEmailDone ? " gbe-step--locked" : ""}`}
          disabled={!logEmailDone}
          aria-pressed={logFilesDone}
          aria-label="Auswahl bestätigt"
          onClick={() => void onClientLogStep3()}
        >
          <div className={`gbe-status${logFilesDone ? " gbe-done" : " gbe-pending"}`}>
            <i className={logFilesDone ? "fa-solid fa-check" : "fa-solid fa-hourglass-half"} aria-hidden={true} />
          </div>
          <div className={`gbe-step-icon${logFilesDone ? " gbe-done" : " gbe-pending"}`}>
            <i className="fa-solid fa-circle-check" aria-hidden={true} />
          </div>
          <div className="gbe-step-body">
            <div className="gbe-step-label">Kunde hat die Auswahl bestätigt</div>
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
          E-Mail zur Auswahl
        </button>
        <button type="button" className="gbe-btn gbe-btn-primary" disabled={saving} onClick={() => void saveAll()}>
          <i className="fa-solid fa-floppy-disk" aria-hidden={true} />
          {saving ? "Speichern…" : "Speichern"}
        </button>
      </div>

      {mailOpen && g ? (
        <SelektoSendMailModal gallery={g} onClose={() => setMailOpen(false)} onRecordedSent={() => void load()} />
      ) : null}
      {revisionMailFeedback && g ? (
        <SelektoFeedbackMailModal
          gallery={g}
          feedback={revisionMailFeedback}
          templateId={EMAIL_TEMPLATE_REVISION_DONE_ID}
          title="Revision behoben – E-Mail"
          onClose={() => setRevisionMailFeedback(null)}
        />
      ) : null}
      {rueckfrageFor && g ? (
        <SelektoRueckfrageModal
          gallery={g}
          customerComment={rueckfrageFor}
          onClose={() => setRueckfrageFor(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
