import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { pathSelektoAdmin as pathListingAdmin } from "../../lib/selekto/paths";
import { deleteGallery, listGalleries, publicGalleryUrl, type GalleryListRow } from "../../lib/selekto/galleryApi";
import { SelektoDeleteConfirmModal } from "./SelektoDeleteConfirmModal";

/** Ein Chip: Versand, Auswahl-Status (Kunden-Log), Listing — jeweils exklusiv in der Gruppe «Anzeige». */
type ListingsQuickFilter =
  | "all"
  | "delivery_open"
  | "delivery_sent"
  | "picdrop_open"
  | "picdrop_confirmed"
  | "listing_active"
  | "listing_inactive";
type SortOrder = "newest" | "oldest" | "alphabetical";

const LISTINGS_FILTER_OPTIONS = [
  ["all", "Alle"],
  ["delivery_open", "Versand offen"],
  ["delivery_sent", "Versand versendet"],
  ["picdrop_open", "Auswahl offen"],
  ["picdrop_confirmed", "Auswahl bestätigt"],
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

export function SelektoListPage() {
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

  const refresh = useCallback(async () => {
    setLoadErr(null);
    try {
      setRows(await listGalleries());
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
    } else if (quickFilter === "picdrop_open") {
      list = list.filter((g) => !g.client_log_files_downloaded_at);
    } else if (quickFilter === "picdrop_confirmed") {
      list = list.filter((g) => Boolean(g.client_log_files_downloaded_at));
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

  async function onCopyMagicLink(g: GalleryListRow) {
    const url = publicGalleryUrl(g.slug);
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

  return (
    <>
      <div className="padmin-shell admin-content gal-admin-listings-page">
        <header className="pad-page-header">
          <div className="pad-ph-top">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="pad-eyebrow">Bildauswahl · Backpanel</div>
              <h1 className="pad-h1">Bildauswahlen</h1>
              <div className="pad-ph-sub">
                Hier verwalten Sie alle Picdrop-Bildauswahlen: Freigabe aus der Propus Cloud, Kundenlink, Versand und
                Rückmeldungen — übersichtlich an einem Ort.
              </div>
            </div>
          </div>
        </header>
        {loadErr ? <p className="admin-msg admin-msg--err">{loadErr}</p> : null}

        <div className="gal-admin-listings-shell">
          <div className="gal-admin-listings-shell__head">
            <div className="gal-admin-listings-shell__titles" style={{ display: "none" }}>
              <p className="admin-section-title admin-section-title--accent">Backpanel</p>
              <h1 className="gal-admin-listings-shell__h1">Bildauswahlen</h1>
              <p className="admin-lead">
                Hier verwalten Sie alle Picdrop-Bildauswahlen: Freigabe aus der Propus Cloud, Kundenlink, Versand und
                Rückmeldungen — übersichtlich an einem Ort.
              </p>
            </div>
            <Link to={pathListingAdmin("galleries/new")} className="admin-btn admin-btn--outline gal-admin-btn-new-listing">
              + Neue Auswahl
            </Link>
          </div>

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
          </div>
        </div>

        <div className="admin-table-wrap gal-admin-listings-table gal-admin-listings-table--flat">
          <table className="admin-table gal-admin-listings-tbl">
            <thead>
              <tr>
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
                <th className="gal-admin-listings-tbl__col-sel" scope="col">
                  Auswahl
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
                <tr key={g.id}>
                  <td>
                    <p className="gal-admin-listings-title-line">
                      <Link to={pathListingAdmin(`galleries/${g.id}`)} className="gal-admin-listings-title-link">
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
                  <td className="gal-admin-selected-cell">
                    {g.client_log_files_downloaded_at ? (
                      <span
                        className="gal-admin-listing-pill gal-admin-badge gal-admin-badge--picdrop-confirmed"
                        title="Kunde hat die Auswahl bestätigt (Kunden-Log)"
                      >
                        Bestätigt
                      </span>
                    ) : g.picdrop_selected_count > 0 ? (
                      <span
                        className="gal-admin-listing-num gal-admin-listing-num--selected"
                        title="Entwurf mit Auswahl vorhanden, noch nicht bestätigt"
                        aria-label={`${g.picdrop_selected_count} Bilder im Entwurf, noch nicht bestätigt`}
                      >
                        {g.picdrop_selected_count}
                      </span>
                    ) : (
                      <span
                        className="gal-admin-listing-pill gal-admin-badge gal-admin-badge--picdrop-open"
                        title="Auswahl noch nicht bestätigt"
                      >
                        Offen
                      </span>
                    )}
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
                        onClick={() => navigate(pathListingAdmin(`galleries/${g.id}`))}
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
            <p className="admin-table-empty">Noch keine Auswahl angelegt.</p>
          ) : visibleRows.length === 0 && !loadErr ? (
            <p className="admin-table-empty">Keine Auswahlen für die aktuellen Filter.</p>
          ) : null}
        </div>
        </div>
      </div>

      <SelektoDeleteConfirmModal
        gallery={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteGallery()}
      />
    </>
  );
}
