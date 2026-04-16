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
import { Building2, Hash, User, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  adminGalleryImageUrl,
  browseGalleryNas,
  createGallery,
  deleteFeedback,
  displayNameForGalleryImage,
  EMAIL_TEMPLATE_REVISION_DONE_ID,
  getGallery,
  getGalleryNasContext,
  importGalleryFromNas,
  importImagesFromShare,
  publicGalleryDeepLink,
  publicGalleryUrl,
  reorderImages,
  setFeedbackResolved,
  updateGallery,
  updateImage,
} from "../../../api/listingAdmin";
import {
  getLinkMatterportBookingSearch,
  getToursByOrderNo,
  getToursAdminCustomerDetail,
  getToursAdminCustomersList,
} from "../../../api/toursAdmin";
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
  valueOverride,
  inputId,
  type = "text",
  placeholder,
  className = "gbe-input",
}: {
  syncKey: string;
  serverValue: string;
  draftRef: MutableRefObject<string>;
  valueOverride?: string;
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
  useEffect(() => {
    if (valueOverride === undefined) return;
    setV(valueOverride);
    draftRef.current = valueOverride;
  }, [valueOverride, draftRef]);
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

type GalleryCustomerOption = {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
};

type GalleryContactOption = {
  id: number;
  customer_id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
};

type GalleryOrderOption = {
  id: number;
  order_no: number;
  status: string;
  address: string;
  company: string;
  email: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  coreCustomerId: string | null;
  coreCompany: string;
  coreEmail: string;
  contacts: Array<{ name: string; email: string; tel: string }>;
};

function customerDisplayLabel(customer: GalleryCustomerOption) {
  return customer.company.trim() || customer.name.trim() || customer.email.trim() || `Kunde #${customer.id}`;
}

function customerAddressLine(customer: GalleryCustomerOption) {
  return [customer.street, [customer.zip, customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function contactDisplayLabel(contact: GalleryContactOption) {
  return contact.name.trim() || contact.email.trim() || `Kontakt #${contact.id}`;
}

function orderDisplayLabel(order: GalleryOrderOption) {
  const main = order.company.trim() || order.contactName.trim() || order.email.trim() || "Bestellung";
  const address = order.address.trim();
  return `#${order.order_no} · ${main}${address ? ` · ${address}` : ""}`;
}

const ORDER_CONTACT_SENTINEL_ID = -1;

function buildOrderContactOption(order: GalleryOrderOption, customerId: number): GalleryContactOption | null {
  const name = order.contactName.trim();
  const email = order.contactEmail.trim();
  const phone = order.contactPhone.trim();
  if (!name && !email && !phone) return null;
  return {
    id: ORDER_CONTACT_SENTINEL_ID,
    customer_id: customerId,
    name: name || email || "Bestell-Kontakt",
    email,
    phone,
    role: "aus Bestellung",
  };
}

function normalizeCustomerOption(raw: unknown): GalleryCustomerOption | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r) return null;
  const id = Number(r.id);
  if (!Number.isFinite(id) || id < 1) return null;
  return {
    id,
    name: String(r.name || ""),
    company: String(r.company || ""),
    email: String(r.email || ""),
    phone: String(r.phone || ""),
    street: String(r.street || ""),
    zip: String(r.zip || ""),
    city: String(r.city || ""),
  };
}

function normalizeContactOption(raw: unknown): GalleryContactOption | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r) return null;
  const id = Number(r.id);
  const customerId = Number(r.customer_id);
  if (!Number.isFinite(id) || id < 1 || !Number.isFinite(customerId) || customerId < 1) return null;
  return {
    id,
    customer_id: customerId,
    name: String(r.name || ""),
    email: String(r.email || ""),
    phone: String(r.phone || ""),
    role: String(r.role || ""),
  };
}

function normalizeOrderOption(raw: unknown): GalleryOrderOption | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r) return null;
  const orderNo = Number(r.order_no);
  if (!Number.isFinite(orderNo) || orderNo < 1) return null;
  return {
    id: Number(r.id || 0),
    order_no: orderNo,
    status: String(r.status || ""),
    address: String(r.address || ""),
    company: String(r.company || ""),
    email: String(r.email || ""),
    contactName: String(r.contactName || ""),
    contactEmail: String(r.contactEmail || ""),
    contactPhone: String(r.contactPhone || ""),
    coreCustomerId: r.coreCustomerId == null || String(r.coreCustomerId).trim() === "" ? null : String(r.coreCustomerId),
    coreCompany: String(r.coreCompany || ""),
    coreEmail: String(r.coreEmail || ""),
    contacts: Array.isArray(r.contacts)
      ? r.contacts
          .map((contact) => {
            const c = contact && typeof contact === "object" ? (contact as Record<string, unknown>) : null;
            if (!c) return null;
            return {
              name: String(c.name || ""),
              email: String(c.email || ""),
              tel: String(c.tel || ""),
            };
          })
          .filter((contact): contact is { name: string; email: string; tel: string } => Boolean(contact))
      : [],
  };
}

function GalleryAutocompleteField<T>({
  inputId,
  value,
  onChange,
  options,
  loading,
  placeholder,
  emptyText,
  disabled,
  minQueryLength = 2,
  getOptionKey,
  renderOption,
  onSelect,
}: {
  inputId: string;
  value: string;
  onChange: (value: string) => void;
  options: T[];
  loading?: boolean;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  minQueryLength?: number;
  getOptionKey: (option: T, index: number) => string;
  renderOption: (option: T) => ReactNode;
  onSelect: (option: T) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const trimmed = value.trim();
  const hasEnoughChars = trimmed.length >= minQueryLength;
  const showOptions = open && hasEnoughChars && options.length > 0;
  const showEmpty = open && hasEnoughChars && !loading && options.length === 0 && Boolean(emptyText);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={inputId}
        type="text"
        className="gbe-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showOptions}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
            return;
          }
          if (!showOptions) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            const next = options[activeIndex];
            if (next) {
              onSelect(next);
              setOpen(false);
              setActiveIndex(-1);
            }
          }
        }}
      />
      {loading && hasEnoughChars ? (
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-zinc-800/90 px-2 py-1 text-[11px] text-zinc-200">
          Suche...
        </div>
      ) : null}
      {showOptions ? (
        <ul className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-1 shadow-xl">
          {options.map((option, index) => (
            <li
              key={getOptionKey(option, index)}
              role="option"
              aria-selected={activeIndex === index}
              className={`cursor-pointer rounded-md px-3 py-2 text-sm ${
                activeIndex === index ? "bg-[var(--surface-raised)]" : "hover:bg-[var(--surface-raised)]/70"
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(option);
                setOpen(false);
                setActiveIndex(-1);
              }}
            >
              {renderOption(option)}
            </li>
          ))}
        </ul>
      ) : null}
      {showEmpty ? (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-subtle)] shadow-xl">
          {emptyText}
        </div>
      ) : null}
    </div>
  );
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "offen",
  paused: "pausiert",
  confirmed: "bestätigt",
  completed: "abgeschlossen",
  done: "erledigt",
  cancelled: "storniert",
  archived: "archiviert",
};

function OrderStatusBadge({ status }: { status?: string | null }) {
  const key = (status || "").trim().toLowerCase();
  if (!key) return null;
  const label = ORDER_STATUS_LABELS[key] || key;
  const variant = ORDER_STATUS_LABELS[key] ? key : "default";
  return <span className={`gbe-order-status-badge gbe-order-status-badge--${variant}`}>{label}</span>;
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

  const thumbUrl = img.source_type === "nas_local" ? adminGalleryImageUrl(img.gallery_id, img.id) : img.remote_src ?? "";

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
  const [assignmentAutofillMsg, setAssignmentAutofillMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<GalleryStatus>("active");
  const titleDraftRef = useRef("");
  const addressDraftRef = useRef("");
  const clientEmailDraftRef = useRef("");
  const cloudDraftRef = useRef("");
  const matterportDraftRef = useRef("");
  const lastSelectedOrderRef = useRef<GalleryOrderOption | null>(null);
  const [addressInput, setAddressInput] = useState("");
  const [clientEmailInput, setClientEmailInput] = useState("");
  const [matterportInput, setMatterportInput] = useState("");
  const [cloudInput, setCloudInput] = useState<string | undefined>(undefined);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerContactId, setCustomerContactId] = useState<number | null>(null);
  const [bookingOrderNo, setBookingOrderNo] = useState<number | null>(null);
  const [customerInput, setCustomerInput] = useState("");
  const [contactInput, setContactInput] = useState("");
  const [orderInput, setOrderInput] = useState("");
  const [customerOptions, setCustomerOptions] = useState<GalleryCustomerOption[]>([]);
  const [contactOptions, setContactOptions] = useState<GalleryContactOption[]>([]);
  const [orderOptions, setOrderOptions] = useState<GalleryOrderOption[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [orderSearchLoading, setOrderSearchLoading] = useState(false);
  const [nasHealth, setNasHealth] = useState<Array<{ key: string; path: string; ok: boolean; mounted: boolean | null; error?: string }>>([]);
  const [nasSuggestions, setNasSuggestions] = useState<
    Array<{
      folderType: "raw_material" | "customer_folder";
      rootKind: "customer" | "raw";
      relativePath: string;
      displayName: string;
      companyName: string;
      status: string;
      exists: boolean;
      mediaSummary: { images: number; floorPlans: number; hasVideo: boolean };
      nextcloudShareUrl: string | null;
    }>
  >([]);
  const [nasRootKind, setNasRootKind] = useState<"customer" | "raw">("customer");
  const [nasRelativePath, setNasRelativePath] = useState("");
  const [nasEntries, setNasEntries] = useState<Array<{ name: string; relativePath: string }>>([]);
  const [nasParentPath, setNasParentPath] = useState<string | null>(null);
  const [nasSummary, setNasSummary] = useState<{ images: number; floorPlans: number; hasVideo: boolean }>({
    images: 0,
    floorPlans: 0,
    hasVideo: false,
  });
  const [nasLoading, setNasLoading] = useState(false);
  const [nasImporting, setNasImporting] = useState(false);
  const [nasMsg, setNasMsg] = useState<string | null>(null);
  const [nasError, setNasError] = useState<string | null>(null);
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
      setCustomerId(row.customer_id ?? null);
      setCustomerContactId(row.customer_contact_id ?? null);
      setBookingOrderNo(row.booking_order_no ?? null);
      setAddressInput(row.address ?? "");
      setClientEmailInput(row.client_email ?? "");
      setMatterportInput(row.matterport_input ?? "");
      setCustomerInput(row.client_name ?? "");
      setContactInput(row.client_contact ?? "");
      setOrderInput(row.booking_order_no != null ? String(row.booking_order_no) : "");
      setImages(ims);
      setFeedback(fb);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadNasBrowser = useCallback(
    async (rootKind: "customer" | "raw", relativePath: string) => {
      if (!id || id === "new") return;
      setNasLoading(true);
      setNasError(null);
      try {
        const browser = await browseGalleryNas(id, { rootKind, relativePath });
        setNasRootKind(browser.rootKind);
        setNasRelativePath(browser.currentRelativePath);
        setNasParentPath(browser.parentRelativePath);
        setNasEntries(browser.entries);
        setNasSummary(browser.mediaSummary);
      } catch (e) {
        setNasEntries([]);
        setNasSummary({ images: 0, floorPlans: 0, hasVideo: false });
        const raw = e instanceof Error ? e.message : "NAS-Browser konnte nicht geladen werden.";
        const isPermission = /EACCES|permission denied|not found|nicht gefunden|assertRoot/i.test(raw);
        setNasError(
          isPermission
            ? `NAS-Root nicht erreichbar. Bitte auf der VPS die Umgebungsvariablen BOOKING_UPLOAD_CUSTOMER_ROOT und BOOKING_UPLOAD_RAW_ROOT korrekt setzen und die NAS-Mounts prüfen.`
            : raw,
        );
      } finally {
        setNasLoading(false);
      }
    },
    [id],
  );

  const loadNasContext = useCallback(async () => {
    if (!id || id === "new") return;
    try {
      const context = await getGalleryNasContext(id);
      setNasHealth(context.storageHealth);
      setNasSuggestions(context.suggestions);
      const nextRootKind = context.currentSource.storage_root_kind ?? context.suggestions[0]?.rootKind ?? "customer";
      const nextRelativePath = context.currentSource.storage_relative_path ?? context.suggestions[0]?.relativePath ?? "";
      const healthKey = nextRootKind === "raw" ? "rawRoot" : "customerRoot";
      const rootOk = context.storageHealth.find((h) => h.key === healthKey)?.ok === true;
      if (rootOk) {
        await loadNasBrowser(nextRootKind, nextRelativePath);
      }
    } catch (e) {
      setNasHealth([]);
      setNasSuggestions([]);
      setNasError(e instanceof Error ? e.message : "NAS-Kontext konnte nicht geladen werden.");
    }
  }, [id, loadNasBrowser]);

  useEffect(() => {
    void loadNasContext();
  }, [loadNasContext, g?.updated_at]);

  useEffect(() => {
    const query = customerInput.trim();
    if (query.length < 1) {
      setCustomerOptions([]);
      setCustomerSearchLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const res = await getToursAdminCustomersList(`q=${encodeURIComponent(query)}`);
        if (cancelled) return;
        const rawRows = Array.isArray((res as { customers?: unknown[] }).customers)
          ? ((res as { customers?: unknown[] }).customers ?? [])
          : [];
        setCustomerOptions(rawRows.map(normalizeCustomerOption).filter((row): row is GalleryCustomerOption => Boolean(row)));
      } catch {
        if (!cancelled) setCustomerOptions([]);
      } finally {
        if (!cancelled) setCustomerSearchLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerInput]);

  useEffect(() => {
    if (customerId == null) {
      setContactOptions([]);
      if (customerContactId != null) setCustomerContactId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const detail = await getToursAdminCustomerDetail(String(customerId));
        if (cancelled) return;
        const customer = normalizeCustomerOption((detail as { customer?: unknown }).customer);
        const contactsRaw = Array.isArray((detail as { contacts?: unknown[] }).contacts)
          ? ((detail as { contacts?: unknown[] }).contacts ?? [])
          : [];
        const nextContacts = contactsRaw.map(normalizeContactOption).filter((row): row is GalleryContactOption => Boolean(row));
        let mergedContacts = nextContacts;
        if (nextContacts.length === 0) {
          const lastOrder = lastSelectedOrderRef.current;
          if (lastOrder && Number(lastOrder.coreCustomerId) === customerId) {
            const fallback = buildOrderContactOption(lastOrder, customerId);
            if (fallback) mergedContacts = [fallback];
          }
        }
        setContactOptions(mergedContacts);
        if (customer) {
          setCustomerInput((prev) => (prev.trim() ? prev : customerDisplayLabel(customer)));
          if (!clientEmailDraftRef.current.trim() && customer.email.trim()) {
            setClientEmailInput(customer.email.trim());
          }
          if (!addressDraftRef.current.trim()) {
            const nextAddress = customerAddressLine(customer);
            if (nextAddress) setAddressInput(nextAddress);
          }
        }
      } catch {
        if (!cancelled) setContactOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerContactId, customerId]);

  useEffect(() => {
    const query = orderInput.trim();
    if (query.length < 1) {
      setOrderOptions([]);
      setOrderSearchLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setOrderSearchLoading(true);
      try {
        const res = await getLinkMatterportBookingSearch(query);
        if (cancelled) return;
        const rawRows = Array.isArray(res.orders) ? res.orders : [];
        setOrderOptions(rawRows.map(normalizeOrderOption).filter((row): row is GalleryOrderOption => Boolean(row)));
      } catch {
        if (!cancelled) setOrderOptions([]);
      } finally {
        if (!cancelled) setOrderSearchLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [orderInput]);

  const handleSelectCustomer = useCallback((customer: GalleryCustomerOption) => {
    const label = customerDisplayLabel(customer);
    setCustomerId(customer.id);
    setCustomerInput(label);
    setCustomerContactId(null);
    setContactInput("");
    if (customer.email.trim()) setClientEmailInput(customer.email.trim());
    const nextAddress = customerAddressLine(customer);
    if (nextAddress) setAddressInput(nextAddress);
  }, []);

  const handleSelectContact = useCallback((contact: GalleryContactOption) => {
    setCustomerContactId(contact.id);
    setContactInput(contactDisplayLabel(contact));
    if (contact.email.trim()) setClientEmailInput(contact.email.trim());
  }, []);

  const handleSelectOrder = useCallback(
    async (order: GalleryOrderOption) => {
      lastSelectedOrderRef.current = order;
      setBookingOrderNo(order.order_no);
      setOrderInput(orderDisplayLabel(order));
      if (order.address.trim()) setAddressInput(order.address.trim());
      if (order.contactEmail.trim()) setClientEmailInput(order.contactEmail.trim());
      else if (order.email.trim()) setClientEmailInput(order.email.trim());

      const nextCustomerLabel =
        order.coreCompany.trim() || order.company.trim() || order.contactName.trim() || order.coreEmail.trim() || order.email.trim();
      let parsedCustomerId: number | null = null;
      if (order.coreCustomerId) {
        const parsed = Number(order.coreCustomerId);
        if (Number.isFinite(parsed) && parsed > 0) {
          parsedCustomerId = parsed;
          setCustomerId(parsed);
          if (nextCustomerLabel) setCustomerInput(nextCustomerLabel);
        }
      } else if (nextCustomerLabel) {
        setCustomerId(null);
        setCustomerInput(nextCustomerLabel);
      }

      const nextContactLabel = order.contactName.trim();
      if (nextContactLabel) setContactInput(nextContactLabel);

      if (parsedCustomerId != null) {
        try {
          const detail = await getToursAdminCustomerDetail(order.coreCustomerId!);
          const contactsRaw = Array.isArray((detail as { contacts?: unknown[] }).contacts)
            ? ((detail as { contacts?: unknown[] }).contacts ?? [])
            : [];
          const nextContacts = contactsRaw.map(normalizeContactOption).filter((row): row is GalleryContactOption => Boolean(row));
          const match = nextContacts.find((contact) => {
            const contactName = contact.name.trim().toLowerCase();
            const orderName = order.contactName.trim().toLowerCase();
            const contactEmail = contact.email.trim().toLowerCase();
            const orderEmail = order.contactEmail.trim().toLowerCase();
            return Boolean(
              (orderName && contactName === orderName) ||
                (orderEmail && contactEmail && contactEmail === orderEmail),
            );
          });
          if (match) {
            setContactOptions(nextContacts);
            setCustomerContactId(match.id);
            setContactInput(contactDisplayLabel(match));
          } else if (nextContacts.length === 0) {
            const fallback = buildOrderContactOption(order, parsedCustomerId);
            if (fallback) {
              setContactOptions([fallback]);
              setCustomerContactId(ORDER_CONTACT_SENTINEL_ID);
              setContactInput(fallback.name);
            } else {
              setContactOptions([]);
              setCustomerContactId(null);
            }
          } else {
            setContactOptions(nextContacts);
            setCustomerContactId(null);
          }
        } catch {
          setCustomerContactId(null);
        }
      } else {
        setCustomerContactId(null);
      }

      try {
        const linkedTours = await getToursByOrderNo(order.order_no);
        const tourWithMatterport = (linkedTours.tours || []).find(
          (tour) => String(tour.tourUrl || "").trim() || String(tour.matterportSpaceId || "").trim(),
        );
        if (tourWithMatterport) {
          const nextMatterport = String(tourWithMatterport.tourUrl || "").trim() || String(tourWithMatterport.matterportSpaceId || "").trim();
          if (nextMatterport) setMatterportInput(nextMatterport);
        }
      } catch {
        // Matterport-Autofill ist optional; Bestellungswahl soll trotzdem funktionieren.
      }

      const autofillParts = ["Kunde", "Kontakt", "Adresse"];
      if (id) {
        try {
          const context = await getGalleryNasContext(id, order.order_no);
          setNasHealth(context.storageHealth);
          setNasSuggestions(context.suggestions);
          const customerSuggestion = context.suggestions.find((s) => s.folderType === "customer_folder");
          if (customerSuggestion) {
            autofillParts.push("Kundenordner");
            const shareUrl = (customerSuggestion.nextcloudShareUrl || "").trim();
            if (shareUrl) {
              setCloudInput(shareUrl);
              autofillParts.push("Freigabe-Link");
            }
          }
        } catch {
          // Ordner-/Share-Autofill ist optional.
        }
      }

      setAssignmentAutofillMsg(`${autofillParts.join(", ")} aus Bestellung übernommen.`);
    },
    [id],
  );

  useEffect(() => {
    if (!assignmentAutofillMsg) return;
    const timer = window.setTimeout(() => setAssignmentAutofillMsg(null), 4000);
    return () => window.clearTimeout(timer);
  }, [assignmentAutofillMsg]);

  const importNasSelection = useCallback(
    async (rootKind: "customer" | "raw", relativePath: string, storageSourceType: "order_folder" | "nas_browser") => {
      if (!id) return;
      setNasImporting(true);
      setNasMsg(null);
      setNasError(null);
      try {
        const result = await importGalleryFromNas(id, {
          rootKind,
          relativePath,
          storageSourceType,
        });
        const parts = [`${result.added} Bild(er)`];
        if (result.floorPlans > 0) parts.push(`${result.floorPlans} Grundriss(e)`);
        if (result.hasVideo) parts.push("1 Video");
        setNasMsg(`NAS-Import erfolgreich: ${parts.join(", ")}.`);
        await load();
      } catch (e) {
        setNasError(e instanceof Error ? e.message : "NAS-Import fehlgeschlagen.");
      } finally {
        setNasImporting(false);
      }
    },
    [id, load],
  );

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
    if (!customerId) {
      alert("Bitte zuerst einen Kunden aus der Liste auswählen und verknüpfen.");
      return;
    }
    setSavedMsg(null);
    const prevCloud = (g.cloud_share_url ?? "").trim();
    const nextCloud = cloudDraftRef.current.trim();
    const runImport = Boolean(nextCloud && nextCloud !== prevCloud);

    setSaving(true);
    try {
      const persistedContactId =
        customerContactId === ORDER_CONTACT_SENTINEL_ID ? null : customerContactId;
      await updateGallery(id, {
        title: titleDraftRef.current.trim() || "Ohne Titel",
        address: addressDraftRef.current.trim() || null,
        customer_id: customerId,
        customer_contact_id: persistedContactId,
        booking_order_no: bookingOrderNo,
        client_name: customerInput.trim() || null,
        client_contact: contactInput.trim() || null,
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
          const parts = [`${res.added} Bild(er)`];
          if (res.floorPlans > 0) parts.push(`${res.floorPlans} Grundriss(e)`);
          if (res.hasVideo) parts.push("1 Video");
          msg = `Gespeichert. ${parts.join(", ")} importiert.`;
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

        <section className="gbe-card gbe-card--assignment">
          <h2 className="gbe-card-label">Zuweisung</h2>
          <p className="gbe-card-hint">
            Bestellung auswählen füllt Kunde, Kontakt und Adresse automatisch aus.
          </p>
          <div className="gbe-field">
            <label htmlFor="gal-edit-order">Bestellung</label>
            <GalleryAutocompleteField
              inputId="gal-edit-order"
              value={orderInput}
              onChange={(value) => {
                setOrderInput(value);
                setBookingOrderNo(null);
              }}
              options={orderOptions}
              loading={orderSearchLoading}
              minQueryLength={1}
              placeholder="Bestellnummer, Kunde oder Adresse"
              emptyText="Keine passende Bestellung gefunden."
              getOptionKey={(order) => String(order.order_no)}
              renderOption={(order) => (
                <div className="gbe-autocomplete-option">
                  <Hash className="gbe-autocomplete-option-icon" aria-hidden="true" />
                  <div className="gbe-autocomplete-option-body">
                    <div className="gbe-autocomplete-option-title">
                      <span className="font-semibold text-[var(--text-main)]">#{order.order_no}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="gbe-autocomplete-option-sub">
                      {[order.company || order.contactName, order.address].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                </div>
              )}
              onSelect={(order) => void handleSelectOrder(order)}
            />
            {bookingOrderNo ? (
              <div className="gbe-link-chip gbe-link-chip--order">
                <Hash className="gbe-link-chip-icon" aria-hidden="true" />
                <span className="gbe-link-chip-label">Bestellung #{bookingOrderNo}</span>
                <button
                  type="button"
                  className="gbe-link-chip-remove"
                  aria-label="Verknüpfung zur Bestellung entfernen"
                  onClick={() => {
                    lastSelectedOrderRef.current = null;
                    setBookingOrderNo(null);
                    setOrderInput("");
                  }}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="gbe-two-col">
            <div className="gbe-field">
              <label htmlFor="gal-edit-client">Kunde <span className="text-rose-500">*</span></label>
              <GalleryAutocompleteField
                inputId="gal-edit-client"
                value={customerInput}
                onChange={(value) => {
                  setCustomerInput(value);
                  setCustomerId(null);
                  setCustomerContactId(null);
                  setContactInput("");
                }}
                options={customerOptions}
                loading={customerSearchLoading}
                placeholder="Firma, Kunde, E-Mail oder Telefon"
                emptyText="Keine passenden Kunden gefunden."
                minQueryLength={1}
                getOptionKey={(customer) => String(customer.id)}
                renderOption={(customer) => (
                  <div className="gbe-autocomplete-option">
                    <Building2 className="gbe-autocomplete-option-icon" aria-hidden="true" />
                    <div className="gbe-autocomplete-option-body">
                      <div className="gbe-autocomplete-option-title font-semibold text-[var(--text-main)]">
                        {customerDisplayLabel(customer)}
                      </div>
                      <div className="gbe-autocomplete-option-sub">
                        {[customer.email, customerAddressLine(customer)].filter(Boolean).join(" · ") || `Kunde #${customer.id}`}
                      </div>
                    </div>
                  </div>
                )}
                onSelect={handleSelectCustomer}
              />
              {customerId ? (
                <div className="gbe-link-chip gbe-link-chip--customer">
                  <Building2 className="gbe-link-chip-icon" aria-hidden="true" />
                  <span className="gbe-link-chip-label">{customerInput || `Kunde #${customerId}`}</span>
                  <span className="gbe-link-chip-id">#{customerId}</span>
                  <button
                    type="button"
                    className="gbe-link-chip-remove"
                    aria-label="Verknüpfung zum Kunden entfernen"
                    onClick={() => {
                      setCustomerId(null);
                      setCustomerInput("");
                      setCustomerContactId(null);
                      setContactInput("");
                    }}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ) : customerInput.trim() ? (
                <p className="gbe-field-hint text-rose-600">
                  Kein Kunde verknüpft — bitte aus der Vorschlagsliste wählen.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setCustomerInput("");
                      setCustomerContactId(null);
                      setContactInput("");
                    }}
                  >
                    Leeren
                  </button>
                </p>
              ) : (
                <p className="gbe-field-hint text-rose-500">Pflichtfeld — Kunde muss verknüpft sein.</p>
              )}
            </div>
            <div className="gbe-field">
              <label htmlFor="gal-edit-contact">Kontakt</label>
              <select
                id="gal-edit-contact"
                className="gbe-input"
                disabled={!customerId}
                value={customerContactId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setCustomerContactId(null);
                    setContactInput("");
                    return;
                  }
                  const contact = contactOptions.find((c) => String(c.id) === val);
                  if (contact) handleSelectContact(contact);
                }}
              >
                <option value="">{customerId ? "— Kontakt wählen —" : "Zuerst Kunde wählen"}</option>
                {contactOptions.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contactDisplayLabel(contact)}
                    {contact.email ? ` · ${contact.email}` : ""}
                    {contact.role ? ` · ${contact.role}` : ""}
                  </option>
                ))}
              </select>
              {customerContactId != null ? (
                <div className="gbe-link-chip gbe-link-chip--contact">
                  <User className="gbe-link-chip-icon" aria-hidden="true" />
                  <span className="gbe-link-chip-label">
                    {contactInput || (customerContactId === ORDER_CONTACT_SENTINEL_ID ? "Bestell-Kontakt" : `Kontakt #${customerContactId}`)}
                  </span>
                  <span className="gbe-link-chip-id">
                    {customerContactId === ORDER_CONTACT_SENTINEL_ID ? "aus Bestellung" : `#${customerContactId}`}
                  </span>
                  <button
                    type="button"
                    className="gbe-link-chip-remove"
                    aria-label="Verknüpfung zum Kontakt entfernen"
                    onClick={() => {
                      lastSelectedOrderRef.current = null;
                      setCustomerContactId(null);
                      setContactInput("");
                    }}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {assignmentAutofillMsg ? (
            <div className="gbe-autofill-flash" role="status">{assignmentAutofillMsg}</div>
          ) : null}
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
          <div className="gbe-field">
            <label htmlFor="gal-edit-email">E-Mail des Kunden</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.client_email ?? ""}
              valueOverride={clientEmailInput}
              draftRef={clientEmailDraftRef}
              inputId="gal-edit-email"
              type="email"
              placeholder="kunde@beispiel.ch"
            />
          </div>
          <div className="gbe-field">
            <label htmlFor="gal-edit-addr">Adresse</label>
            <EditorDraftField
              syncKey={g.updated_at}
              serverValue={g.address ?? ""}
              valueOverride={addressInput}
              draftRef={addressDraftRef}
              inputId="gal-edit-addr"
              placeholder="z. B. Musterstrasse 1, 8000 Zürich"
            />
          </div>
          <div className="gbe-divider" />
          <GalleryBildauswahlStatusDropdown
            status={status}
            onStatusChange={(next) => {
              setStatus(next);
              if (!id || next === status) return;
              void (async () => {
                try {
                  await updateGallery(id, { status: next });
                  setSavedMsg(next === "active" ? "Galerie aktiviert." : "Galerie deaktiviert.");
                  window.setTimeout(() => setSavedMsg(null), 4000);
                  await load();
                } catch (err) {
                  setStatus(status);
                  alert(err instanceof Error ? err.message : "Status konnte nicht gespeichert werden.");
                }
              })();
            }}
          />
        </section>

        <section className="gbe-card">
          <h2 className="gbe-card-label">Freigabe &amp; 3D-Rundgang</h2>
          <div className="gbe-two-col">
            <div className="gbe-field">
              <label htmlFor="gal-edit-cloud">Freigabe-Link (Propus Cloud)</label>
              <EditorDraftField
                syncKey={g.updated_at}
                serverValue={g.cloud_share_url ?? ""}
                valueOverride={cloudInput}
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
                valueOverride={matterportInput}
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
            <h2 className="gbe-card-label">NAS-Import</h2>
            <span className="gbe-section-meta">
              {g?.storage_source_type === "order_folder"
                ? "Aktive Quelle: Bestellordner"
                : g?.storage_source_type === "nas_browser"
                  ? "Aktive Quelle: NAS-Browser"
                  : "Noch keine NAS-Quelle aktiv"}
            </span>
          </div>

          <div className="gbe-field">
            <label>VPS-Storage-Health</label>
            <div className="flex flex-wrap gap-2">
              {nasHealth.filter((entry) => entry.key !== "stagingRoot").map((entry) => (
                <div
                  key={entry.key}
                  className={`rounded-[12px] border px-3 py-2 text-xs ${
                    entry.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-700"
                  }`}
                  title={entry.error || entry.path}
                >
                  <div className="font-semibold">{entry.key}</div>
                  <div>{entry.ok ? "bereit" : "fehlt"}</div>
                  <div>{entry.mounted == null ? "Mount: n/a" : entry.mounted ? "Mount: ja" : "Mount: nein"}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="gbe-divider" />

          <div className="gbe-field">
            <label>Bestellordner-Vorschläge</label>
            {(() => {
              const visibleNasSuggestions = nasSuggestions.filter((item) => item.folderType !== "raw_material");
              if (bookingOrderNo == null) {
                return (
                  <p className="gbe-field-hint">Nach dem Speichern einer verknüpften Bestellung erscheinen hier die vorgeschlagenen NAS-Ordner.</p>
                );
              }
              if (visibleNasSuggestions.length === 0) {
                return (
                  <p className="gbe-field-hint">Für diese Bestellung wurden noch keine NAS-Vorschläge gefunden.</p>
                );
              }
              return (
                <div className="space-y-3">
                  {visibleNasSuggestions.map((item) => (
                    <div key={`${item.folderType}:${item.relativePath}`} className="rounded-[16px] border border-[var(--line)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[var(--text-main)]">{item.displayName}</div>
                          <div className="text-xs text-[var(--text-subtle)]">
                            Kundenordner · {item.relativePath}
                          </div>
                          <div className="mt-1 text-xs text-[var(--text-subtle)]">
                            {item.mediaSummary.images} Bilder · {item.mediaSummary.floorPlans} Grundrisse ·{" "}
                            {item.mediaSummary.hasVideo ? "mit Video" : "ohne Video"}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="admin-btn admin-btn--outline"
                          disabled={!item.exists || nasImporting}
                          onClick={() => void importNasSelection(item.rootKind, item.relativePath, "order_folder")}
                        >
                          {nasImporting ? "Import läuft …" : "Diesen Ordner importieren"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {(() => {
            const anyRootOk = nasHealth.some((h) => h.key !== "stagingRoot" && h.ok);
            const selectedRootOk = nasHealth.find((h) => h.key === (nasRootKind === "raw" ? "rawRoot" : "customerRoot"))?.ok === true;
            if (nasHealth.length > 0 && !anyRootOk) {
              return (
                <p className="mt-2 text-sm text-amber-700">
                  Kein NAS-Root verfügbar. Bitte auf der VPS die Umgebungsvariablen{" "}
                  <code>BOOKING_UPLOAD_CUSTOMER_ROOT</code> und <code>BOOKING_UPLOAD_RAW_ROOT</code> prüfen und
                  sicherstellen, dass die NAS-Mounts aktiv sind.
                </p>
              );
            }

            // Breadcrumb-Segmente aus dem aktuellen Pfad
            const pathSegments = nasRelativePath
              ? nasRelativePath.split("/").filter(Boolean)
              : [];

            return (
              <>
                <div className="gbe-divider" />

                {/* File-Browser Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Root-Auswahl */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">Root:</span>
                    <div className="flex gap-1">
                      {(["customer", "raw"] as const).map((kind) => {
                        const hKey = kind === "raw" ? "rawRoot" : "customerRoot";
                        const ok = nasHealth.find((h) => h.key === hKey)?.ok === true;
                        return (
                          <button
                            key={kind}
                            type="button"
                            disabled={!ok}
                            onClick={() => {
                              if (ok) void loadNasBrowser(kind, "");
                              else { setNasRootKind(kind); setNasEntries([]); }
                            }}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              nasRootKind === kind
                                ? "bg-[var(--accent)] text-white"
                                : ok
                                  ? "bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-[var(--line)]"
                                  : "cursor-not-allowed opacity-40 bg-[var(--surface-raised)] text-[var(--text-subtle)]"
                            }`}
                          >
                            {kind === "customer" ? "📁 Kunden" : "📂 Raw"}{!ok ? " ✗" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Import-Button + Summary */}
                  {nasRelativePath && selectedRootOk && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      disabled={nasImporting || nasLoading}
                      onClick={() => void importNasSelection(nasRootKind, nasRelativePath, "nas_browser")}
                    >
                      {nasImporting ? (
                        <><i className="fa-solid fa-spinner fa-spin mr-1.5" />Import läuft …</>
                      ) : (
                        <><i className="fa-solid fa-file-import mr-1.5" />Diesen Ordner importieren</>
                      )}
                    </button>
                  )}
                </div>

                {/* File-Browser Box */}
                <div className="mt-3 overflow-hidden rounded-[16px] border border-[var(--line)]">
                  {/* Breadcrumb-Leiste */}
                  <div className="flex items-center gap-0 border-b border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm overflow-x-auto">
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--line)] shrink-0"
                      onClick={() => void loadNasBrowser(nasRootKind, "")}
                    >
                      <i className="fa-solid fa-house text-[10px]" />
                      {nasRootKind === "customer" ? "Kunden-Root" : "Raw-Root"}
                    </button>
                    {pathSegments.map((seg, idx) => {
                      const segPath = pathSegments.slice(0, idx + 1).join("/");
                      const isLast = idx === pathSegments.length - 1;
                      return (
                        <span key={segPath} className="flex items-center shrink-0">
                          <span className="mx-1 text-[var(--text-subtle)]">/</span>
                          {isLast ? (
                            <span className="rounded px-2 py-1 text-xs font-semibold text-[var(--text-main)]">{seg}</span>
                          ) : (
                            <button
                              type="button"
                              className="rounded px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--line)]"
                              onClick={() => void loadNasBrowser(nasRootKind, segPath)}
                            >
                              {seg}
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {/* Ordner-Inhalt */}
                  <div className="max-h-72 overflow-y-auto">
                    {/* Zurück-Zeile */}
                    {nasParentPath != null && selectedRootOk && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 text-left text-sm hover:bg-[var(--surface-raised)] transition"
                        onClick={() => void loadNasBrowser(nasRootKind, nasParentPath)}
                      >
                        <span className="text-base">↩</span>
                        <span className="text-[var(--text-subtle)] italic">..</span>
                      </button>
                    )}

                    {!selectedRootOk ? (
                      <div className="px-4 py-6 text-sm text-[var(--text-subtle)]">Root nicht verfügbar.</div>
                    ) : nasLoading ? (
                      <div className="flex items-center gap-2 px-4 py-6 text-sm text-[var(--text-subtle)]">
                        <i className="fa-solid fa-spinner fa-spin" /> Lädt …
                      </div>
                    ) : nasEntries.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-[var(--text-subtle)]">
                        Keine Unterordner — dieser Ordner kann direkt importiert werden.
                      </div>
                    ) : (
                      nasEntries.map((entry, idx) => (
                        <button
                          key={entry.relativePath}
                          type="button"
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--surface-raised)] transition ${
                            idx < nasEntries.length - 1 ? "border-b border-[var(--line)]" : ""
                          }`}
                          onClick={() => void loadNasBrowser(nasRootKind, entry.relativePath)}
                        >
                          <i className="fa-solid fa-folder text-[var(--accent)] w-4 shrink-0" />
                          <span className="flex-1 truncate font-medium text-[var(--text-main)]">{entry.name}</span>
                          <i className="fa-solid fa-chevron-right text-[10px] text-[var(--text-subtle)] shrink-0" />
                        </button>
                      ))
                    )}
                  </div>

                  {/* Footer mit Medien-Summary */}
                  {nasRelativePath && selectedRootOk && (
                    <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2">
                      <span className="text-xs text-[var(--text-subtle)]">
                        <i className="fa-regular fa-image mr-1" />{nasSummary.images} Bilder
                        <span className="mx-2">·</span>
                        <i className="fa-regular fa-file-pdf mr-1" />{nasSummary.floorPlans} Grundrisse
                        {nasSummary.hasVideo && (
                          <><span className="mx-2">·</span><i className="fa-solid fa-video mr-1" />Video</>
                        )}
                      </span>
                      <span className="text-xs text-[var(--text-subtle)]">{nasRelativePath}</span>
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {nasMsg ? <p className="mt-3 text-sm text-emerald-700">{nasMsg}</p> : null}
          {nasError ? <p className="mt-3 text-sm text-rose-700">{nasError}</p> : null}
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
