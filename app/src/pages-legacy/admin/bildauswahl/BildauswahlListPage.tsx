import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LayoutGrid, Table2, Images, CheckCircle2, Clock, MessageSquareWarning, Package, ArrowRight } from "lucide-react";
import { bulkDeleteGalleries, deleteGallery, listGalleries, publicGalleryUrl } from "../../../api/bildauswahlAdmin";
import { pathBildauswahlAdmin } from "../../../components/bildauswahl/paths";
import type { GalleryListRow } from "../../../components/listing/types";
import { HandoffGalleryCards } from "../../../components/listing/HandoffGalleryCards";
import { BildauswahlDeleteConfirmModal } from "./BildauswahlDeleteConfirmModal";

/** Ein Chip: Versand (Offen/Versendet) oder Listing (Aktiv/Deaktiviert), nicht kombinierbar. */
type ListingsQuickFilter =
  | "all"
  | "delivery_open"
  | "delivery_sent"
  | "listing_active"
  | "listing_inactive";
type SortOrder = "newest" | "oldest" | "alphabetical";

const LISTINGS_FILTER_OPTIONS = [
  ["all", "Alle"],
  ["delivery_open", "Offen"],
  ["delivery_sent", "Versendet"],
  ["listing_active", "Aktiv"],
  ["listing_inactive", "Deaktiviert"],
] as const satisfies readonly (readonly [ListingsQuickFilter, string])[];

const LISTINGS_SORT_OPTIONS: readonly { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "alphabetical", label: "Alphabetisch" },
];

function fmtDateShort(iso: string) {
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(iso));
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

export function BildauswahlListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GalleryListRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<ListingsQuickFilter>("all");
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
      const { rows: data } = await listGalleries();
      setRows(data);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = filterDropdownRef.current;
      if (el && !el.contains(e.target as Node)) {
        setFilterMenuOpen(false);
      }
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
    if (quickFilter === "delivery_open") {
      list = list.filter((g) => g.client_delivery_status === "open");
    } else if (quickFilter === "delivery_sent") {
      list = list.filter((g) => g.client_delivery_status === "sent");
    } else if (quickFilter === "listing_active") {
      list = list.filter((g) => g.status === "active");
    } else if (quickFilter === "listing_inactive") {
      list = list.filter((g) => g.status === "inactive");
    }
    const sorted = [...list].sort((a, b) => {
      if (sortOrder === "alphabetical") {
        return a.title.localeCompare(b.title, "de", { sensitivity: "base" });
      }
      if (sortOrder === "newest") {
        return b.updated_at.localeCompare(a.updated_at);
      }
      return a.updated_at.localeCompare(b.updated_at);
    });
    return sorted;
  }, [rows, search, quickFilter, sortOrder]);

  // IDs aufräumen, die nach Filter/Search nicht mehr sichtbar sind.
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
      if (allSelected) {
        visibleRows.forEach((r) => next.delete(r.id));
      } else {
        visibleRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }, [visibleRows]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkBusy(true);
    try {
      const result = await bulkDeleteGalleries(ids);
      if (result.failed.length > 0) {
        const msg = result.failed
          .map((f) => `${f.id.slice(0, 8)}…: ${f.error}`)
          .slice(0, 3)
          .join("\n");
        const more = result.failed.length > 3 ? `\n… und ${result.failed.length - 3} weitere Fehler.` : "";
        alert(
          `${result.deleted.length} gelöscht, ${result.failed.length} fehlgeschlagen.\n\n${msg}${more}`,
        );
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

  async function onCopyMagicLink(g: GalleryListRow) {
    const url = publicGalleryUrl(g);
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopyFlashId(g.id);
      window.setTimeout(() => {
        setCopyFlashId((id) => (id === g.id ? null : id));
      }, 2000);
    } else {
      window.alert(`Link konnte nicht kopiert werden. Manuell markieren:\n\n${url}`);
    }
  }

  async function confirmDeleteGallery() {
    if (!deleteTarget) return;
    const g = deleteTarget;
    setDeleteTarget(null);
    setBusyId(g.id);
    try {
      await deleteGallery(g.id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setBusyId(null);
    }
  }

  const kpiCounts = {
    total: rows.length,
    active: rows.filter((g) => g.status === "active").length,
    inactive: rows.filter((g) => g.status === "inactive").length,
    deliveryOpen: rows.filter((g) => g.client_delivery_status === "open").length,
    deliverySent: rows.filter((g) => g.client_delivery_status === "sent").length,
    feedbackOpen: rows.reduce((acc, g) => acc + (g.feedback_count || 0), 0),
  };

  return (
    <>
      <div className="padmin-shell admin-content gal-admin-listings-page">
        <header className="pad-page-header">
          <div className="pad-ph-top">
            <div style={{ minWidth: 0 }}>
              <div className="pad-eyebrow">Modul</div>
              <h1 className="pad-h1">
                Bildauswahl{" "}
                {kpiCounts.total > 0 ? (
                  <span className="num">{kpiCounts.total}</span>
                ) : null}
              </h1>
              <div className="pad-ph-sub" style={{ maxWidth: 560 }}>
                Bilder vom NAS importieren, dem Kunden zur Auswahl schicken — markiert wird in den drei Stufen «Bearbeiten», «Staging», «Retusche».
              </div>
            </div>
            <div className="pad-ph-actions">
              <Link
                to={pathBildauswahlAdmin("new")}
                className="admin-btn admin-btn--primary"
              >
                + Neue Bildauswahl
              </Link>
            </div>
          </div>

          {rows.length > 0 ? (
            <div className="pad-kpis">
              <div className="pad-kpi">
                <div className="pad-kpi-label">
                  <Images className="h-3 w-3 inline-block mr-1 -mt-0.5" aria-hidden />
                  Galerien
                </div>
                <div className="pad-kpi-value">{kpiCounts.total}</div>
              </div>
              <div className="pad-kpi">
                <div className="pad-kpi-label">
                  <CheckCircle2 className="h-3 w-3 inline-block mr-1 -mt-0.5" aria-hidden />
                  Aktiv
                </div>
                <div className="pad-kpi-value">{kpiCounts.active}</div>
                {kpiCounts.inactive > 0 ? (
                  <div className="pad-kpi-trend">{kpiCounts.inactive} inaktiv</div>
                ) : null}
              </div>
              <div className={`pad-kpi${kpiCounts.deliveryOpen > 0 ? " is-warn" : ""}`}>
                <div className="pad-kpi-label">
                  <Clock className="h-3 w-3 inline-block mr-1 -mt-0.5" aria-hidden />
                  Lieferung offen
                </div>
                <div className="pad-kpi-value">{kpiCounts.deliveryOpen}</div>
                {kpiCounts.deliverySent > 0 ? (
                  <div className="pad-kpi-trend">{kpiCounts.deliverySent} versandt</div>
                ) : null}
              </div>
              <div className={`pad-kpi${kpiCounts.feedbackOpen > 0 ? " is-gold" : ""}`}>
                <div className="pad-kpi-label">
                  <MessageSquareWarning className="h-3 w-3 inline-block mr-1 -mt-0.5" aria-hidden />
                  Offene Rev.
                </div>
                <div className={`pad-kpi-value${kpiCounts.feedbackOpen > 0 ? " is-gold" : ""}`}>
                  {kpiCounts.feedbackOpen}
                </div>
              </div>
            </div>
          ) : null}
        </header>
        {loadErr ? <p className="admin-msg admin-msg--err">{loadErr}</p> : null}

        {rows.length > 0 && rows.length < 3 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--pad-border-soft, #F0EBDF)",
              background: "linear-gradient(180deg, var(--gold-50, #FBF7EE), transparent 80%)",
              fontSize: 13,
              color: "var(--ink-2, #3C3B38)",
              margin: "16px 0 4px",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "rgba(184,142,32,0.12)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gold-700, #7A5E10)",
                flexShrink: 0,
              }}
            >
              <Package className="h-4 w-4" aria-hidden />
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
              <strong style={{ color: "var(--ink, #141413)" }}>Tipp:</strong> Bildauswahl direkt aus einer Bestellung anlegen — Kunde, Adresse und Bestell-Nr. werden automatisch übernommen.
            </div>
            <Link
              to="/orders"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--pad-border, #EAE6DD)",
                background: "#fff",
                color: "var(--ink, #141413)",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
                flexShrink: 0,
              }}
            >
              Zu Bestellungen <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        ) : null}

        <div className="gal-admin-listings-shell">
        <div className="gal-admin-listings-toolbar">
          <div className="gal-admin-listings-search-wrap">
            <label htmlFor="gal-listings-search" className="gal-admin-visually-hidden">
              Suche
            </label>
            <input
              id="gal-listings-search"
              type="search"
              className="gal-admin-listings-search"
              placeholder="Suche: Titel, Adresse, Kunde, E-Mail, Link-Code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="gal-admin-listings-filters">
            <div className="gal-admin-filter-dropdown" ref={filterDropdownRef}>
              <button
                type="button"
                className="gal-admin-filter-dropdown__trigger"
                aria-expanded={filterMenuOpen}
                aria-haspopup="dialog"
                aria-controls="gal-listings-filter-panel"
                id="gal-listings-filter-trigger"
                onClick={() => setFilterMenuOpen((o) => !o)}
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
                <span>Filter</span>
                <svg
                  className={
                    "gal-admin-filter-dropdown__chevron" + (filterMenuOpen ? " gal-admin-filter-dropdown__chevron--open" : "")
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
              {filterMenuOpen ? (
                <div
                  className="gal-admin-filter-dropdown__panel"
                  id="gal-listings-filter-panel"
                  role="dialog"
                  aria-label="Filter"
                >
                  <div className="gal-admin-filter-dropdown__section">
                    <p className="gal-admin-filter-dropdown__section-title" id="gal-listings-anzeige-label">
                      Anzeige
                    </p>
                    <div
                      className="gal-admin-filter-dropdown__options"
                      role="radiogroup"
                      aria-labelledby="gal-listings-anzeige-label"
                    >
                      {LISTINGS_FILTER_OPTIONS.map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={quickFilter === v}
                          className={
                            "gal-admin-filter-dropdown__option" +
                            (quickFilter === v ? " gal-admin-filter-dropdown__option--active" : "")
                          }
                          onClick={() => {
                            setQuickFilter(v);
                            setFilterMenuOpen(false);
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
                  <div className="gal-admin-filter-dropdown__section gal-admin-filter-dropdown__section--sort">
                    <p className="gal-admin-filter-dropdown__section-title" id="gal-listings-sort-label">
                      Sortierung
                    </p>
                    <div
                      className="gal-admin-filter-dropdown__options"
                      role="radiogroup"
                      aria-labelledby="gal-listings-sort-label"
                    >
                      {LISTINGS_SORT_OPTIONS.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={sortOrder === value}
                          className={
                            "gal-admin-filter-dropdown__option" +
                            (sortOrder === value ? " gal-admin-filter-dropdown__option--active" : "")
                          }
                          onClick={() => {
                            setSortOrder(value);
                            setFilterMenuOpen(false);
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
            <div className="flex items-center" style={{ marginLeft: "auto" }}>
              <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5" style={{ background: "var(--paper-strip)" } as CSSProperties}>
                <button
                  type="button"
                  onClick={() => setListLayout("cards")}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${listLayout === "cards" ? "bg-white shadow-sm text-[var(--ink)]" : "text-[var(--fg-3)]"}`}
                  title="Kachelansicht"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setListLayout("table")}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${listLayout === "table" ? "bg-white shadow-sm text-[var(--ink)]" : "text-[var(--fg-3)]"}`}
                  title="Tabelle"
                >
                  <Table2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 ? (
          <div
            className="gal-admin-bulk-bar"
            role="region"
            aria-label="Mehrfachaktionen"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              margin: "0 0 12px 0",
              background: "var(--paper-strip, #f5f5f4)",
              border: "1px solid var(--border, #d6d3d1)",
              borderRadius: 8,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {selectedIds.size} ausgewählt
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="admin-btn admin-btn--outline"
              onClick={clearSelection}
              disabled={bulkBusy}
            >
              Auswahl aufheben
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--danger"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkBusy}
            >
              <i className="fa-solid fa-trash-can" aria-hidden style={{ marginRight: 6 }} />
              {bulkBusy ? "Lösche…" : `${selectedIds.size} Bildauswahl${selectedIds.size === 1 ? "" : "en"} löschen`}
            </button>
          </div>
        ) : null}

        {listLayout === "cards" ? (
          visibleRows.length > 0 ? (
            <HandoffGalleryCards
              rows={visibleRows}
              variant="listing"
              buildEditHref={(id) => pathBildauswahlAdmin(id)}
              onCopyLink={(g) => void onCopyMagicLink(g as GalleryListRow)}
              onDelete={(g) => setDeleteTarget(g as GalleryListRow)}
              copyFlashId={copyFlashId}
              busyId={busyId}
              fmtDateShort={fmtDateShort}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              thumbApiBase="/api/tours/admin/bildauswahl"
            />
          ) : (
            <p className="admin-table-empty" style={{ border: 0, padding: "2rem" }}>
              {rows.length === 0 && !loadErr ? "Noch keine Galerie angelegt." : !loadErr ? "Keine Bildauswahl für die aktuellen Filter." : null}
            </p>
          )
        ) : null}

        {listLayout === "table" ? (
        <div className="admin-table-wrap gal-admin-listings-table gal-admin-listings-table--flat data-table-wrap">
          <table className="admin-table gal-admin-listings-tbl dt">
            <thead>
              <tr>
                <th scope="col" style={{ width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    aria-label={allVisibleSelected ? "Alle abwählen" : "Alle markieren"}
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                    }}
                    onChange={toggleSelectAllVisible}
                    style={{ cursor: visibleRows.length > 0 ? "pointer" : "default" }}
                    disabled={visibleRows.length === 0}
                  />
                </th>
                <th className="gal-admin-listings-tbl__col-title" scope="col">
                  Titel
                </th>
                <th className="gal-admin-listings-tbl__col-client" scope="col">
                  Kunde
                </th>
                <th className="gal-admin-listings-tbl__col-ship" scope="col">
                  Versand
                </th>
                <th className="gal-admin-listings-tbl__col-pub" scope="col">
                  Öffentlich
                </th>
                <th className="gal-admin-listings-tbl__col-img" scope="col">
                  Bilder
                </th>
                <th className="gal-admin-listings-tbl__col-rev" scope="col">
                  Revisionen
                </th>
                <th className="gal-admin-listings-tbl__col-upd" scope="col">
                  Aktualisiert
                </th>
                <th className="admin-table__actions gal-admin-listings-tbl__col-actions" scope="col">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((g) => (
                <tr key={g.id} className={selectedIds.has(g.id) ? "is-selected" : undefined}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      aria-label={`«${g.title}» auswählen`}
                      checked={selectedIds.has(g.id)}
                      onChange={() => toggleSelect(g.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td>
                    <p className="gal-admin-listings-title-line">
                      <Link to={pathBildauswahlAdmin(g.id)} className="gal-admin-listings-title-link">
                        {g.title}
                      </Link>
                    </p>
                    {g.address?.trim() ? (
                      <p className="gal-admin-listings-title-addr">{g.address.trim()}</p>
                    ) : null}
                  </td>
                  <td className="gal-admin-listings-col-muted">{g.client_name || "—"}</td>
                  <td>
                    <span
                      className={
                        "gal-admin-listing-pill gal-admin-badge" +
                        (g.client_delivery_status === "sent"
                          ? " gal-admin-badge--delivery-sent"
                          : " gal-admin-badge--delivery-open")
                      }
                    >
                      {g.client_delivery_status === "sent" ? "Versendet" : "Offen"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        "gal-admin-listing-pill gal-admin-badge" +
                        (g.status === "active" ? " gal-admin-badge--ok" : " gal-admin-badge--off")
                      }
                    >
                      {g.status === "active" ? "Aktiv" : "Deaktiviert"}
                    </span>
                  </td>
                  <td className="gal-admin-count-cell">
                    <span
                      className="gal-admin-listing-num gal-admin-listing-num--bilder"
                      title="Anzahl Bilder"
                      aria-label={`${g.image_count} Bilder`}
                    >
                      {g.image_count}
                    </span>
                  </td>
                  <td className="gal-admin-revision-cell">
                    <span
                      className={
                        "gal-admin-listing-num" +
                        (g.feedback_count > 0 ? " gal-admin-listing-num--revision" : " gal-admin-listing-num--muted")
                      }
                      title="Offene Revisionen (noch nicht behoben)"
                      aria-label={`${g.feedback_count} offene Revisionen`}
                    >
                      {g.feedback_count}
                    </span>
                  </td>
                  <td className="gal-admin-listings-col-date">{fmtDateShort(g.updated_at)}</td>
                  <td className="admin-table__actions">
                    <div className="gal-admin-listings-actions gal-admin-listings-actions--end">
                      <button
                        type="button"
                        className="gal-admin-listing-icon-btn"
                        title={copyFlashId === g.id ? "Kopiert" : "Link kopieren"}
                        aria-label={copyFlashId === g.id ? "Kopiert" : "Link kopieren"}
                        onClick={() => void onCopyMagicLink(g)}
                      >
                        <i
                          className={
                            copyFlashId === g.id
                              ? "fa-solid fa-check gal-admin-listing-icon-btn__fa"
                              : "fa-solid fa-globe gal-admin-listing-icon-btn__fa"
                          }
                          aria-hidden={true}
                        />
                      </button>
                      <button
                        type="button"
                        className="gal-admin-listing-icon-btn"
                        title="Bearbeiten"
                        aria-label="Bearbeiten"
                        onClick={() => navigate(pathBildauswahlAdmin(g.id))}
                      >
                        <i className="fa-solid fa-pen-to-square gal-admin-listing-icon-btn__fa" aria-hidden={true} />
                      </button>
                      <button
                        type="button"
                        className="gal-admin-listing-icon-btn gal-admin-listing-icon-btn--danger"
                        title="Löschen"
                        aria-label="Löschen"
                        disabled={busyId === g.id}
                        onClick={() => setDeleteTarget(g)}
                      >
                        <i className="fa-solid fa-trash-can gal-admin-listing-icon-btn__fa" aria-hidden={true} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loadErr ? (
            <p className="admin-table-empty">Noch keine Galerie angelegt.</p>
          ) : visibleRows.length === 0 && !loadErr ? (
            <p className="admin-table-empty">Keine Bildauswahl für die aktuellen Filter.</p>
          ) : null}
        </div>
        ) : null}
        </div>
      </div>

      <BildauswahlDeleteConfirmModal
        gallery={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteGallery()}
      />

      <BildauswahlDeleteConfirmModal
        galleries={bulkDeleteOpen ? selectedRows : []}
        onClose={() => (bulkBusy ? null : setBulkDeleteOpen(false))}
        onConfirm={() => void confirmBulkDelete()}
      />
    </>
  );
}

