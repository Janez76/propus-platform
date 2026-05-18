import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { GalleryListRow } from "./types";

/* =========================================================================
   Geteilte Listing-/Bildauswahl-Uebersicht im Apple-Look (propus-listings.html).
   Genutzt von ListingListPage und BildauswahlListPage.
   ========================================================================= */

type GalleryFilter = "all" | "active" | "sent" | "revisions" | "with_images" | "without_images";
type SortOrder = "newest" | "oldest" | "alphabetical";

const STATUS_FILTERS: readonly { value: GalleryFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "active", label: "Aktiv" },
  { value: "sent", label: "Versandt" },
  { value: "revisions", label: "Mit Revisionen" },
];
const CONTENT_FILTERS: readonly { value: GalleryFilter; label: string }[] = [
  { value: "with_images", label: "Mit Bildern" },
  { value: "without_images", label: "Ohne Bilder" },
];
const SORT_OPTIONS: readonly { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "alphabetical", label: "Alphabetisch" },
];

function fmtDateShort(iso: string) {
  try {
    return new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
function fmtDateLong(iso: string) {
  try {
    return new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function matchesFilter(g: GalleryListRow, filter: GalleryFilter): boolean {
  switch (filter) {
    case "active":
      return g.status === "active";
    case "sent":
      return g.client_delivery_status === "sent";
    case "revisions":
      return (g.feedback_count ?? 0) > 0;
    case "with_images":
      return (g.image_count ?? 0) > 0;
    case "without_images":
      return (g.image_count ?? 0) === 0;
    case "all":
    default:
      return true;
  }
}

export type GalleryOverviewModalArgs = {
  onClose: () => void;
  onConfirm: () => void;
};

export type GalleryOverviewPageProps = {
  pageTitle: string;
  /** Singular/Plural fuer Zaehler und Bulk-Texte, z. B. "Listing"/"Listings". */
  nounSingular: string;
  nounPlural: string;
  newButtonLabel: string;
  /** Baut die Admin-URL: ohne Argument die Uebersicht, mit Sub die Detail-/Neu-Seite. */
  buildAdminHref: (sub?: string) => string;
  /** API-Basis fuer Cover-Thumbnails. */
  thumbApiBase: string;
  api: {
    listGalleries: () => Promise<{ rows: GalleryListRow[] }>;
    deleteGallery: (id: string) => Promise<unknown>;
    bulkDeleteGalleries: (
      ids: string[],
    ) => Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }>;
    publicGalleryUrl: (g: GalleryListRow) => string;
  };
  renderDeleteModal: (args: GalleryOverviewModalArgs & { target: GalleryListRow | null }) => ReactNode;
  renderBulkDeleteModal: (args: GalleryOverviewModalArgs & { galleries: GalleryListRow[] }) => ReactNode;
  /** Optionaler Hinweis-Banner ueber der Toolbar (z. B. Bildauswahl-Tipp). */
  infoBanner?: (ctx: { total: number }) => ReactNode;
  emptyHint?: string;
};

export function GalleryOverviewPage({
  pageTitle,
  nounSingular,
  nounPlural,
  newButtonLabel,
  buildAdminHref,
  thumbApiBase,
  api,
  renderDeleteModal,
  renderBulkDeleteModal,
  infoBanner,
  emptyHint,
}: GalleryOverviewPageProps) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GalleryListRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [copyFlashId, setCopyFlashId] = useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<GalleryListRow | null>(null);
  const [listLayout, setListLayout] = useState<"cards" | "table">("cards");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoadErr(null);
    try {
      const { rows: data } = await api.listGalleries();
      setRows(data);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Apple-Look-Background fuer den AppShell-Wrapper — gleiche body-Klasse wie
  // OrdersPage (siehe index.css body.orders-route).
  useEffect(() => {
    document.body.classList.add("orders-route");
    return () => document.body.classList.remove("orders-route");
  }, []);

  useEffect(() => {
    if (!filterMenuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = filterDropdownRef.current;
      if (el && !el.contains(e.target as Node)) setFilterMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFilterMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterMenuOpen]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          (g.address ?? "").toLowerCase().includes(q) ||
          (g.client_name ?? "").toLowerCase().includes(q) ||
          (g.client_email ?? "").toLowerCase().includes(q) ||
          g.slug.toLowerCase().includes(q),
      );
    }
    if (filter !== "all") list = list.filter((g) => matchesFilter(g, filter));
    const sorted = [...list].sort((a, b) => {
      if (sortOrder === "alphabetical") {
        return a.title.localeCompare(b.title, "de", { sensitivity: "base" });
      }
      if (sortOrder === "newest") return b.updated_at.localeCompare(a.updated_at);
      return a.updated_at.localeCompare(b.updated_at);
    });
    return sorted;
  }, [rows, search, filter, sortOrder]);

  // Auswahl auf sichtbare Zeilen beschraenken.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(visibleRows.map((r) => r.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [visibleRows]);

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = visibleRows.some((r) => selectedIds.has(r.id));

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleRows.length > 0 && visibleRows.every((r) => next.has(r.id));
      if (allSelected) visibleRows.forEach((r) => next.delete(r.id));
      else visibleRows.forEach((r) => next.add(r.id));
      return next;
    });
  }, [visibleRows]);

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds]);

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkBusy(true);
    try {
      const result = await api.bulkDeleteGalleries(ids);
      if (result.failed.length > 0) {
        const msg = result.failed
          .map((f) => `${f.id.slice(0, 8)}…: ${f.error}`)
          .slice(0, 3)
          .join("\n");
        const more =
          result.failed.length > 3 ? `\n… und ${result.failed.length - 3} weitere Fehler.` : "";
        alert(`${result.deleted.length} gelöscht, ${result.failed.length} fehlgeschlagen.\n\n${msg}${more}`);
      }
      clearSelection();
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Massen-Löschen fehlgeschlagen");
    } finally {
      setBulkBusy(false);
      setBulkDeleteOpen(false);
    }
  }

  const onCopyMagicLink = useCallback(
    async (g: GalleryListRow) => {
      const url = api.publicGalleryUrl(g);
      const ok = await copyTextToClipboard(url);
      if (ok) {
        setCopyFlashId(g.id);
        window.setTimeout(() => {
          setCopyFlashId((id) => (id === g.id ? null : id));
        }, 2000);
      } else {
        window.alert(`Link konnte nicht kopiert werden. Manuell markieren:\n\n${url}`);
      }
    },
    [api],
  );

  async function confirmDeleteGallery() {
    if (!deleteTarget) return;
    const g = deleteTarget;
    setDeleteTarget(null);
    setBusyId(g.id);
    try {
      await api.deleteGallery(g.id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((g) => g.status === "active").length,
      sent: rows.filter((g) => g.client_delivery_status === "sent").length,
      revisions: rows.filter((g) => (g.feedback_count ?? 0) > 0).length,
      withImages: rows.filter((g) => (g.image_count ?? 0) > 0).length,
      withoutImages: rows.filter((g) => (g.image_count ?? 0) === 0).length,
    }),
    [rows],
  );
  const filterCount: Record<GalleryFilter, number> = {
    all: counts.total,
    active: counts.active,
    sent: counts.sent,
    revisions: counts.revisions,
    with_images: counts.withImages,
    without_images: counts.withoutImages,
  };

  const goEdit = useCallback((id: string) => navigate(buildAdminHref(id)), [navigate, buildAdminHref]);

  return (
    <div className="gov-shell">
      <div className="gov-page">
        {/* HEADER */}
        <header className="gov-header-card">
          <div className="gov-header-text">
            <div className="gov-header-meta">
              <span className="gov-meta-badge">Produktion</span>
              <span>
                · {counts.total} {counts.total === 1 ? nounSingular : nounPlural}
              </span>
            </div>
            <h1 className="gov-page-title">{pageTitle}</h1>
            <div className="gov-page-sub">
              <span>
                <strong>{counts.total}</strong> gesamt
              </span>
              <span className="gov-sub-sep">·</span>
              <span>
                <strong>{counts.active}</strong> aktiv
              </span>
              <span className="gov-sub-sep">·</span>
              <span>
                <strong>{counts.sent}</strong> versandt
              </span>
              {counts.revisions > 0 ? (
                <>
                  <span className="gov-sub-sep">·</span>
                  <span className="gov-sub-warn">
                    <strong>{counts.revisions}</strong> mit Revisionen
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="gov-header-actions">
            <Link to={buildAdminHref("new")} className="gov-primary-btn">
              <i className="fa-solid fa-plus" aria-hidden /> {newButtonLabel}
            </Link>
          </div>
        </header>

        {loadErr ? (
          <p className="gov-error" role="alert">
            {loadErr}
          </p>
        ) : null}

        {infoBanner?.({ total: counts.total })}

        {/* TOOLBAR */}
        <div className="gov-toolbar">
          <div className="gov-search-wrap">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input
              type="search"
              className="gov-search-input"
              placeholder="Titel, Adresse, Kunde, E-Mail, Link-Code …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              aria-label="Suche"
            />
          </div>

          <div
            className={"gov-dropdown" + (filterMenuOpen ? " gov-open" : "")}
            ref={filterDropdownRef}
          >
            <button
              type="button"
              className="gov-dd-trigger"
              aria-expanded={filterMenuOpen}
              aria-haspopup="menu"
              onClick={() => setFilterMenuOpen((o) => !o)}
            >
              <i className="fa-solid fa-sliders" aria-hidden />
              <span className="gov-dd-value">Filter</span>
              <i className="fa-solid fa-chevron-down gov-dd-chev" aria-hidden />
            </button>
            <div className="gov-dd-menu" role="menu">
              <div className="gov-dd-section">Status</div>
              {STATUS_FILTERS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={filter === opt.value}
                  className={"gov-dd-item" + (filter === opt.value ? " gov-selected" : "")}
                  onClick={() => setFilter(opt.value)}
                >
                  <i className="fa-solid fa-check gov-dd-check" aria-hidden />
                  {opt.label}
                  <span className="gov-dd-count">{filterCount[opt.value]}</span>
                </button>
              ))}
              <div className="gov-dd-divider" />
              <div className="gov-dd-section">Inhalt</div>
              {CONTENT_FILTERS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={filter === opt.value}
                  className={"gov-dd-item" + (filter === opt.value ? " gov-selected" : "")}
                  onClick={() => setFilter(opt.value)}
                >
                  <i className="fa-solid fa-check gov-dd-check" aria-hidden />
                  {opt.label}
                  <span className="gov-dd-count">{filterCount[opt.value]}</span>
                </button>
              ))}
              <div className="gov-dd-divider" />
              <div className="gov-dd-section">Sortierung</div>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sortOrder === opt.value}
                  className={"gov-dd-item" + (sortOrder === opt.value ? " gov-selected" : "")}
                  onClick={() => setSortOrder(opt.value)}
                >
                  <i className="fa-solid fa-check gov-dd-check" aria-hidden />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="gov-view-switch">
            <button
              type="button"
              className={"gov-view-btn" + (listLayout === "cards" ? " gov-active" : "")}
              onClick={() => setListLayout("cards")}
              title="Galerie"
              aria-label="Kachelansicht"
              aria-pressed={listLayout === "cards"}
            >
              <i className="fa-solid fa-grip" aria-hidden />
            </button>
            <button
              type="button"
              className={"gov-view-btn" + (listLayout === "table" ? " gov-active" : "")}
              onClick={() => setListLayout("table")}
              title="Liste"
              aria-label="Tabelle"
              aria-pressed={listLayout === "table"}
            >
              <i className="fa-solid fa-list" aria-hidden />
            </button>
          </div>
        </div>

        {/* BULK BAR */}
        {selectedIds.size > 0 ? (
          <div className="gov-bulk-bar" role="region" aria-label="Mehrfachaktionen">
            <span className="gov-bulk-count">{selectedIds.size} ausgewählt</span>
            <span className="gov-bulk-spacer" />
            <button
              type="button"
              className="gov-bulk-btn gov-bulk-btn--ghost"
              onClick={clearSelection}
              disabled={bulkBusy}
            >
              Auswahl aufheben
            </button>
            <button
              type="button"
              className="gov-bulk-btn gov-bulk-btn--danger"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkBusy}
            >
              <i className="fa-solid fa-trash" aria-hidden />
              {bulkBusy
                ? "Lösche…"
                : `${selectedIds.size} ${selectedIds.size === 1 ? nounSingular : nounPlural} löschen`}
            </button>
          </div>
        ) : null}

        {/* GRID VIEW */}
        {listLayout === "cards" ? (
          visibleRows.length > 0 ? (
            <div className="gov-grid">
              {visibleRows.map((g) => (
                <GalleryCard
                  key={g.id}
                  row={g}
                  thumbApiBase={thumbApiBase}
                  selected={selectedIds.has(g.id)}
                  copyFlash={copyFlashId === g.id}
                  busy={busyId === g.id}
                  onOpen={() => goEdit(g.id)}
                  onToggleSelect={() => toggleSelect(g.id)}
                  onCopyLink={() => void onCopyMagicLink(g)}
                  onDelete={() => setDeleteTarget(g)}
                />
              ))}
            </div>
          ) : (
            <div className="gov-table-card">
              <p className="gov-empty">
                {rows.length === 0 && !loadErr
                  ? emptyHint || "Noch keine Galerie angelegt."
                  : "Keine Treffer für die aktuellen Filter."}
              </p>
            </div>
          )
        ) : null}

        {/* LIST VIEW */}
        {listLayout === "table" ? (
          <div className="gov-table-card">
            <div className="gov-thead">
              <div className="gov-thead-check">
                <button
                  type="button"
                  className={
                    "gov-row-check" +
                    (allVisibleSelected ? " gov-checked" : someVisibleSelected ? " gov-indeterminate" : "")
                  }
                  onClick={toggleSelectAllVisible}
                  disabled={visibleRows.length === 0}
                  aria-label={allVisibleSelected ? "Alle abwählen" : "Alle markieren"}
                >
                  <i
                    className={allVisibleSelected ? "fa-solid fa-check" : "fa-solid fa-minus"}
                    aria-hidden
                  />
                </button>
              </div>
              <button
                type="button"
                className="gov-th gov-th--sortable"
                onClick={() => setSortOrder("alphabetical")}
              >
                Titel
                {sortOrder === "alphabetical" ? <i className="fa-solid fa-arrow-down" aria-hidden /> : null}
              </button>
              <div className="gov-th gov-col-kunde">Kunde</div>
              <div className="gov-th gov-center gov-col-versand">Versand</div>
              <div className="gov-th gov-center gov-col-pub">Öffentlich</div>
              <div className="gov-th gov-center">Bilder</div>
              <div className="gov-th gov-center gov-col-rev">Revisionen</div>
              <button
                type="button"
                className="gov-th gov-th--sortable gov-col-date"
                onClick={() => setSortOrder((s) => (s === "newest" ? "oldest" : "newest"))}
              >
                Aktualisiert
                {sortOrder === "newest" ? (
                  <i className="fa-solid fa-arrow-down" aria-hidden />
                ) : sortOrder === "oldest" ? (
                  <i className="fa-solid fa-arrow-up" aria-hidden />
                ) : null}
              </button>
              <div className="gov-th gov-right">Aktionen</div>
            </div>

            {visibleRows.map((g) => {
              const selected = selectedIds.has(g.id);
              return (
                <div
                  key={g.id}
                  className={"gov-row" + (selected ? " gov-selected" : "")}
                  onClick={() => goEdit(g.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") goEdit(g.id);
                  }}
                >
                  <div className="gov-row-check-wrap">
                    <button
                      type="button"
                      className={"gov-row-check" + (selected ? " gov-checked" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(g.id);
                      }}
                      aria-label={`«${g.title}» auswählen`}
                    >
                      <i className="fa-solid fa-check" aria-hidden />
                    </button>
                  </div>
                  <div className="gov-cell-title">
                    <div className={"gov-title-name" + (g.title.trim() ? "" : " gov-placeholder")}>
                      {g.title.trim() || "Ohne Titel"}
                    </div>
                    {g.address?.trim() ? <div className="gov-title-addr">{g.address.trim()}</div> : null}
                  </div>
                  <div className="gov-cell-kunde gov-col-kunde">{g.client_name || "—"}</div>
                  <div className="gov-cell-center gov-col-versand">
                    <span
                      className={
                        "gov-pill " +
                        (g.client_delivery_status === "sent" ? "gov-pill--sent" : "gov-pill--open")
                      }
                    >
                      {g.client_delivery_status === "sent" ? "Versandt" : "Offen"}
                    </span>
                  </div>
                  <div className="gov-cell-center gov-col-pub">
                    <span className={"gov-pill " + (g.status === "active" ? "gov-pill--aktiv" : "gov-pill--off")}>
                      {g.status === "active" ? "Aktiv" : "Deaktiviert"}
                    </span>
                  </div>
                  <div className="gov-cell-center">
                    <span className={"gov-cell-num" + ((g.image_count ?? 0) === 0 ? " gov-empty" : "")}>
                      {g.image_count ?? 0}
                    </span>
                  </div>
                  <div className="gov-cell-center gov-col-rev">
                    <span
                      className={
                        "gov-cell-num " + ((g.feedback_count ?? 0) > 0 ? "gov-rev" : "gov-rev-zero")
                      }
                    >
                      {g.feedback_count ?? 0}
                    </span>
                  </div>
                  <div className="gov-cell-date gov-col-date">{fmtDateLong(g.updated_at)}</div>
                  <div className="gov-cell-actions">
                    <button
                      type="button"
                      className="gov-row-action"
                      title={copyFlashId === g.id ? "Kopiert" : "Link kopieren"}
                      aria-label={copyFlashId === g.id ? "Kopiert" : "Link kopieren"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onCopyMagicLink(g);
                      }}
                    >
                      <i
                        className={copyFlashId === g.id ? "fa-solid fa-check" : "fa-solid fa-globe"}
                        aria-hidden
                      />
                    </button>
                    <button
                      type="button"
                      className="gov-row-action"
                      title="Bearbeiten"
                      aria-label="Bearbeiten"
                      onClick={(e) => {
                        e.stopPropagation();
                        goEdit(g.id);
                      }}
                    >
                      <i className="fa-solid fa-pen" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="gov-row-action gov-quick-danger"
                      title="Löschen"
                      aria-label="Löschen"
                      disabled={busyId === g.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(g);
                      }}
                    >
                      <i className="fa-solid fa-trash" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}

            {visibleRows.length === 0 ? (
              <p className="gov-empty">
                {rows.length === 0 && !loadErr
                  ? emptyHint || "Noch keine Galerie angelegt."
                  : "Keine Treffer für die aktuellen Filter."}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {renderDeleteModal({
        target: deleteTarget,
        onClose: () => setDeleteTarget(null),
        onConfirm: () => void confirmDeleteGallery(),
      })}
      {renderBulkDeleteModal({
        galleries: bulkDeleteOpen ? selectedRows : [],
        onClose: () => (bulkBusy ? undefined : setBulkDeleteOpen(false)),
        onConfirm: () => void confirmBulkDelete(),
      })}
    </div>
  );
}

/* ----- Karte (Grid) ----- */

type GalleryCardProps = {
  row: GalleryListRow;
  thumbApiBase: string;
  selected: boolean;
  copyFlash: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
};

const GalleryCard = memo(function GalleryCard({
  row,
  thumbApiBase,
  selected,
  copyFlash,
  busy,
  onOpen,
  onToggleSelect,
  onCopyLink,
  onDelete,
}: GalleryCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const coverSrc =
    row.cover_image_id && !imgFailed
      ? `${thumbApiBase}/${row.id}/images/${row.cover_image_id}/thumb?w=600`
      : null;
  const title = row.title?.trim() || "";
  const address = row.address?.trim() || "";
  const displayTitle = title || address || "Ohne Titel";
  const titleIsPlaceholder = !title && !address;
  const showAddressLine = Boolean(title && address);

  return (
    <article
      className={"gov-card" + (selected ? " gov-selected" : "")}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      <div className="gov-card-img">
        {coverSrc ? (
          <img src={coverSrc} alt="" loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="gov-card-img-empty" aria-hidden>
            <i className="fa-regular fa-image" />
            <span>Keine Vorschau</span>
          </div>
        )}
        <button
          type="button"
          className="gov-card-check"
          title={selected ? "Auswahl aufheben" : "Auswählen"}
          aria-label={`«${row.title}» auswählen`}
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
        >
          <i className="fa-solid fa-check" aria-hidden />
        </button>
        <div className="gov-card-quick">
          <button
            type="button"
            className="gov-quick-btn"
            title={copyFlash ? "Kopiert" : "Link kopieren"}
            aria-label={copyFlash ? "Kopiert" : "Link kopieren"}
            onClick={(e) => {
              e.stopPropagation();
              onCopyLink();
            }}
          >
            <i className={copyFlash ? "fa-solid fa-check" : "fa-solid fa-globe"} aria-hidden />
          </button>
          <button
            type="button"
            className="gov-quick-btn"
            title="Bearbeiten"
            aria-label="Bearbeiten"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            <i className="fa-solid fa-pen" aria-hidden />
          </button>
          <button
            type="button"
            className="gov-quick-btn gov-quick-danger"
            title="Löschen"
            aria-label="Löschen"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <i className="fa-solid fa-trash" aria-hidden />
          </button>
        </div>
      </div>
      <div className="gov-card-body">
        <div className={"gov-card-title" + (titleIsPlaceholder ? " gov-placeholder" : "")} title={displayTitle}>
          {displayTitle}
        </div>
        {showAddressLine ? <div className="gov-card-addr">{address}</div> : null}
        {row.client_name?.trim() ? <div className="gov-card-kunde">{row.client_name.trim()}</div> : null}
        <div className="gov-card-meta">
          <span
            className={
              "gov-pill " + (row.client_delivery_status === "sent" ? "gov-pill--sent" : "gov-pill--open")
            }
          >
            {row.client_delivery_status === "sent" ? "Versandt" : "Offen"}
          </span>
          <span className={"gov-pill " + (row.status === "active" ? "gov-pill--aktiv" : "gov-pill--off")}>
            {row.status === "active" ? "Aktiv" : "Deaktiviert"}
          </span>
          <span
            className={"gov-pill gov-pill--images" + ((row.image_count ?? 0) === 0 ? " gov-empty" : "")}
          >
            <i className="fa-regular fa-image" aria-hidden /> {row.image_count ?? 0}
          </span>
          {(row.feedback_count ?? 0) > 0 ? (
            <span className="gov-pill gov-pill--revisions">
              <i className="fa-solid fa-rotate" aria-hidden /> {row.feedback_count} Rev.
            </span>
          ) : null}
          <span className="gov-card-date">{fmtDateShort(row.updated_at)}</span>
        </div>
      </div>
    </article>
  );
});
