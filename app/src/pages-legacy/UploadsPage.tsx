import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, ChevronDown, ChevronRight, Check, Copy, ExternalLink, File, Folder, FolderOpen, HardDrive, House, ImageIcon, Link2, Loader2, RefreshCw, Search, X } from "lucide-react";
import "../styles/uploads-page.css";
import {
  archiveOrderStorageFolder,
  browseAdminStorage,
  generateNextcloudShare,
  generateWebsizeRebuild,
  getOrderStorageSummary,
  getOrderUploads,
  getOrders,
  linkOrderStorageFolder,
  provisionOrderStorage,
  type Order,
  type OrderFolderType,
  type OrderStorageSummaryResponse,
  type OrderUploadTreeNode,
  type StorageBrowseEntry,
} from "../api/orders";
import { UploadModalForm } from "../components/orders/UploadModalForm";
import { normalizeStatusKey } from "../lib/status";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

type AllFolderType = "raw_material" | "customer_folder" | "selection";

function formatFolderLabel(folderType: AllFolderType) {
  if (folderType === "raw_material") return "Rohmaterial";
  if (folderType === "selection") return "Zur Auswahl";
  return "Kundenordner";
}

function folderTypeToRootKind(folderType: AllFolderType): "customer" | "raw" | "selection" {
  if (folderType === "raw_material") return "raw";
  if (folderType === "selection") return "selection";
  return "customer";
}

function folderTypeToRootSummaryKey(folderType: AllFolderType): "rawRoot" | "customerRoot" | "selectionRoot" {
  if (folderType === "raw_material") return "rawRoot";
  if (folderType === "selection") return "selectionRoot";
  return "customerRoot";
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function TreeNode({ node, depth = 0 }: { node: OrderUploadTreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  if (node.type === "file") {
    return (
      <div style={{ paddingLeft: `${depth * 14 + 4}px` }} className="flex items-center gap-2 py-0.5 text-xs text-[var(--text-muted)]">
        <File className="h-3 w-3 shrink-0 text-[var(--text-subtle)]" />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-[var(--text-subtle)]">{formatBytes(node.size ?? 0)}</span>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        className="flex w-full items-center gap-2 py-0.5 text-left text-xs font-medium text-[var(--text-main)] hover:text-[var(--accent)]"
      >
        {open ? <FolderOpen className="h-3 w-3 shrink-0 text-[var(--accent)]" /> : <Folder className="h-3 w-3 shrink-0 text-[var(--text-subtle)]" />}
        <span className="truncate">{node.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-[var(--text-subtle)]">{node.children?.length ?? 0}</span>
      </button>
      {open && node.children?.map((child) => (
        <TreeNode key={child.relativePath} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

interface NasBrowserState {
  open: boolean;
  loading: boolean;
  relativePath: string;
  parentPath: string | null;
  entries: StorageBrowseEntry[];
  error: string;
}

const defaultBrowserState = (): NasBrowserState => ({
  open: false,
  loading: false,
  relativePath: "",
  parentPath: null,
  entries: [],
  error: "",
});

export function UploadsPage() {
  // Apple-Look-Background fuer den AppShell-Wrapper — gleiche body-Klasse
  // wie OrdersPage (siehe index.css body.orders-route).
  useEffect(() => {
    document.body.classList.add("orders-route");
    return () => document.body.classList.remove("orders-route");
  }, []);

  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [selectedOrderNo, setSelectedOrderNo] = useState<string>("");
  const [selectedFolderType, setSelectedFolderType] = useState<OrderFolderType | null>(null);

  /**
   * Welche Folder-Karten sind aufgeklappt. Default: alles eingeklappt —
   * nur Titel + Badge sichtbar, Klick auf den Head zeigt den vollen Inhalt.
   */
  const [expandedFolders, setExpandedFolders] = useState<Set<AllFolderType>>(() => new Set());
  const toggleFolderExpanded = useCallback((ft: AllFolderType) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(ft)) next.delete(ft);
      else next.add(ft);
      return next;
    });
  }, []);

  // Mount-Status (Root-Health) ist als Accordion eingeklappt; auto-open
  // sobald ein Root einen Fehler meldet, damit das Office den Hinweis sieht.
  const [mountsExpanded, setMountsExpanded] = useState(false);

  // Upload-Popup: ESC schliesst, Body-Scroll lock waehrend geoeffnet.
  useEffect(() => {
    if (!selectedFolderType) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedFolderType(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedFolderType]);
  const [summary, setSummary] = useState<OrderStorageSummaryResponse | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({
    raw_material: "",
    customer_folder: "",
    selection: "",
  });
  const [renameOn, setRenameOn] = useState<Record<string, boolean>>({
    raw_material: false,
    customer_folder: false,
    selection: false,
  });
  const [renameWarnings, setRenameWarnings] = useState<Record<string, string>>({});

  const [generatingShare, setGeneratingShare] = useState(false);
  const [shareError, setShareError] = useState("");
  const [copiedShare, setCopiedShare] = useState(false);

  const [generatingWebsite, setGeneratingWebsite] = useState(false);
  const [websiteError, setWebsiteError] = useState("");
  const [websiteSuccess, setWebsiteSuccess] = useState(false);

  async function handleGenerateWebsite() {
    if (!selectedOrderNo) return;
    setGeneratingWebsite(true);
    setWebsiteError("");
    setWebsiteSuccess(false);
    try {
      await generateWebsizeRebuild(token, selectedOrderNo);
      setWebsiteSuccess(true);
      setTimeout(() => setWebsiteSuccess(false), 4000);
    } catch (err) {
      setWebsiteError(err instanceof Error ? err.message : "Website-Generierung fehlgeschlagen");
    } finally {
      setGeneratingWebsite(false);
    }
  }

  async function handleGenerateShare() {
    if (!selectedOrderNo) return;
    setGeneratingShare(true);
    setShareError("");
    try {
      await generateNextcloudShare(token, selectedOrderNo);
      await loadSummary(selectedOrderNo);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Nextcloud-Link konnte nicht erstellt werden");
    } finally {
      setGeneratingShare(false);
    }
  }

  function handleCopyShare(url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    });
  }

  // Ordner-Inhalt Modal
  const [contentModal, setContentModal] = useState<{
    folderType: AllFolderType;
    displayName: string;
    loading: boolean;
    tree: OrderUploadTreeNode[];
    error: string;
  } | null>(null);

  async function openContentModal(folderType: AllFolderType, displayName: string) {
    setContentModal({ folderType, displayName, loading: true, tree: [], error: "" });
    try {
      const result = await getOrderUploads(token, selectedOrderNo, folderType);
      setContentModal({ folderType, displayName, loading: false, tree: result.tree ?? [], error: "" });
    } catch (err) {
      setContentModal({ folderType, displayName, loading: false, tree: [], error: err instanceof Error ? err.message : "Fehler beim Laden" });
    }
  }

  // NAS-Browser State pro Ordner-Karte
  const [browsers, setBrowsers] = useState<Record<string, NasBrowserState>>({
    raw_material: defaultBrowserState(),
    customer_folder: defaultBrowserState(),
  });

  const setBrowserState = useCallback(
    (folderType: string, patch: Partial<NasBrowserState>) =>
      setBrowsers((prev) => ({
        ...prev,
        [folderType]: { ...(prev[folderType] ?? defaultBrowserState()), ...patch },
      })),
    [],
  );

  useEffect(() => {
    if (!token) return;
    setLoadingOrders(true);
    getOrders(token)
      .then((items) => {
        const list = Array.isArray(items) ? items : [];
        setOrders(list);
        const paramOrder = searchParams.get("order");
        if (paramOrder && !selectedOrderNo) {
          const match = list.find((o) => String(o.orderNo) === paramOrder);
          if (match) {
            setSelectedOrderNo(paramOrder);
            setQuery(paramOrder);
            setSearchParams({}, { replace: true });
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Aufträge konnten nicht geladen werden"))
      .finally(() => setLoadingOrders(false));
  }, [token]);

  async function loadSummary(orderNo: string) {
    if (!orderNo) { setSummary(null); return; }
    setLoadingSummary(true);
    setError("");
    try {
      const nextSummary = await getOrderStorageSummary(token, orderNo);
      setSummary(nextSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Storage-Status konnte nicht geladen werden");
    } finally {
      setLoadingSummary(false);
    }
  }

  useEffect(() => {
    loadSummary(selectedOrderNo).catch(() => {});
  }, [selectedOrderNo]);

  const browseFolder = useCallback(
    async (folderType: AllFolderType, relativePath: string) => {
      const rootKind = folderTypeToRootKind(folderType);
      setBrowserState(folderType, { loading: true, error: "" });
      try {
        const result = await browseAdminStorage(token, rootKind, relativePath);
        setBrowserState(folderType, {
          loading: false,
          relativePath: result.currentRelativePath,
          parentPath: result.parentRelativePath,
          entries: result.entries,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Browser-Fehler";
        setBrowserState(folderType, { loading: false, error: msg });
      }
    },
    [token, setBrowserState],
  );

  async function handleProvision() {
    if (!selectedOrderNo) return;
    setLoadingSummary(true);
    try {
      await provisionOrderStorage(token, selectedOrderNo);
      await loadSummary(selectedOrderNo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ordner konnten nicht erstellt werden");
      setLoadingSummary(false);
    }
  }

  async function handleLink(folderType: AllFolderType, relativePath?: string) {
    if (!selectedOrderNo) return;
    const linkPath = relativePath ?? String(linkInputs[folderType] || "").trim();
    if (!linkPath) return;
    setLoadingSummary(true);
    setRenameWarnings((cur) => ({ ...cur, [folderType]: "" }));
    try {
      const result = await linkOrderStorageFolder(token, selectedOrderNo, {
        folderType,
        relativePath: linkPath,
        rename: renameOn[folderType] ?? false,
      });
      if (result.renameWarning) {
        setRenameWarnings((cur) => ({ ...cur, [folderType]: result.renameWarning ?? "" }));
      }
      await loadSummary(selectedOrderNo);
      // Browser schließen und Input leeren
      setBrowserState(folderType, { open: false, relativePath: "", entries: [], parentPath: null });
      setLinkInputs((cur) => ({ ...cur, [folderType]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ordner konnte nicht verknüpft werden");
      setLoadingSummary(false);
    }
  }

  async function handleArchive(folderType: AllFolderType) {
    if (!selectedOrderNo) return;
    if (!window.confirm(`${formatFolderLabel(folderType)} archiviert löschen?`)) return;
    setLoadingSummary(true);
    try {
      await archiveOrderStorageFolder(token, selectedOrderNo, folderType);
      await loadSummary(selectedOrderNo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ordner konnte nicht archiviert werden");
      setLoadingSummary(false);
    }
  }

  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    /**
     * Sortierung nach Naehe zum heutigen Tag: Auftraege deren Shooting-Datum
     * am wenigsten Zeit von "jetzt" entfernt ist, kommen oben (gerade gerade
     * geshootet ODER bald anstehend). Aeltere bzw. weit entfernte Shoots
     * sinken nach unten, Auftraege ohne Datum landen ganz unten.
     * Tiebreaker bei gleichem Datum: Auftragsnummer absteigend.
     */
    const now = Date.now();
    const distance = (iso: string | undefined | null): number => {
      if (!iso) return Number.POSITIVE_INFINITY;
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
      return Math.abs(t - now);
    };
    const sortedOrders = [...orders].sort((a, b) => {
      const diff = distance(a.appointmentDate) - distance(b.appointmentDate);
      if (diff !== 0) return diff;
      return Number(b.orderNo || 0) - Number(a.orderNo || 0);
    });
    if (!normalized) {
      return sortedOrders
        .filter((order) => {
          const status = normalizeStatusKey(order.status);
          return status === "pending" || status === "provisional" || status === "confirmed" || status === "paused";
        })
        .slice(0, 6);
    }
    return sortedOrders
      .filter((order) =>
        [order.orderNo, order.customerName, order.customerEmail, order.address]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 12);
  }, [orders, query]);

  const selectedOrder = useMemo(
    () => orders.find((item) => String(item.orderNo) === selectedOrderNo) || null,
    [orders, selectedOrderNo],
  );

  const folderTypeChipLabel = (ft: AllFolderType): { label: string; cls: string } => {
    if (ft === "selection") return { label: "Zur Auswahl", cls: "is-selection" };
    if (ft === "raw_material") return { label: "Rohmaterial", cls: "is-raw" };
    return { label: "Kundenordner", cls: "is-customer" };
  };

  const folderTypeIcon: Record<AllFolderType, string> = {
    raw_material: "fa-solid fa-box-archive",
    selection: "fa-solid fa-images",
    customer_folder: "fa-solid fa-folder-tree",
  };

  return (
    <div className="uploads-page-v2">
      <div className="uppv-page">

        <header className="uppv-page-header">
          <div className="uppv-page-header-text">
            <div className="uppv-eyebrow">Lieferung</div>
            <h1 className="uppv-page-title">Upload</h1>
            <p className="uppv-page-sub">
              Uploade hier direkt das Material in den richtigen Bestellordner.
            </p>
          </div>
          <button
            type="button"
            className="uppv-ghost-btn"
            onClick={() => loadSummary(selectedOrderNo)}
            disabled={!selectedOrderNo || loadingSummary}
          >
            <RefreshCw className={`h-4 w-4 ${loadingSummary ? "animate-spin" : ""}`} aria-hidden />
            Aktualisieren
          </button>
        </header>

        <div className="uppv-layout">
        {/* Auftragssuche (Rail) */}
        <aside className="uppv-rail">
          <div className="uppv-rail-head">
            <label className="uppv-rail-label" htmlFor="uppv-search">Auftrag suchen</label>
            <div className="uppv-search-wrap">
              <Search aria-hidden />
              <input
                id="uppv-search"
                type="text"
                className="uppv-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nummer, Kunde oder Strasse"
              />
            </div>
            {query.trim() ? <p className="uppv-search-hint">Suchtreffer</p> : null}
          </div>
          <div className="uppv-order-list">
            {loadingOrders ? (
              <div className="uppv-order-empty">Auftraege laden …</div>
            ) : visibleOrders.length > 0 ? (
              visibleOrders.map((order) => {
                const isActive = String(order.orderNo) === selectedOrderNo;
                // Shooting-Datum als kompaktes Pill statt Status — der Status
                // (Ausstehend/Bestaetigt) ist im Auftrags-Detail sichtbar; hier
                // hilft das Datum bei der visuellen Sortierung.
                const shootDate = order.appointmentDate
                  ? (() => {
                      try {
                        return new Intl.DateTimeFormat("de-CH", { dateStyle: "short" }).format(
                          new Date(order.appointmentDate),
                        );
                      } catch {
                        return order.appointmentDate.slice(0, 10);
                      }
                    })()
                  : null;
                return (
                  <button
                    key={order.orderNo}
                    type="button"
                    onClick={() => { setSelectedOrderNo(String(order.orderNo)); setSelectedFolderType(null); }}
                    className={`uppv-order-item${isActive ? " is-active" : ""}`}
                  >
                    <div className="uppv-order-item-head">
                      <span className="uppv-order-num">#{order.orderNo}</span>
                      <span className="uppv-order-date" title={order.appointmentDate || "Kein Shooting-Datum"}>
                        {shootDate ?? "—"}
                      </span>
                    </div>
                    <div className="uppv-order-addr">{order.address || "-"}</div>
                    <div className="uppv-order-customer">
                      {order.billing?.company?.trim()
                        || order.billing?.alt_company?.trim()
                        || order.customerName
                        || order.customerEmail
                        || "Ohne Kunde"}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="uppv-order-empty">
                {query.trim() ? "Keine passenden Auftraege gefunden." : "Keine Auftraege in Bearbeitung gefunden."}
              </div>
            )}
          </div>
        </aside>

        <main className="uppv-main">
          {selectedOrder ? (
            <>
              {/* Auftrag-Header + Storage-Health */}
              <section className="uppv-summary">
                <div className="uppv-summary-row">
                  <div className="uppv-summary-left">
                    <span className="uppv-summary-label">Ausgewählter Auftrag</span>
                    <div className="uppv-summary-num">#{selectedOrder.orderNo}</div>
                    <div className="uppv-summary-addr">{selectedOrder.address || "-"}</div>
                    <div className="uppv-summary-customer">
                      {selectedOrder.billing?.company?.trim()
                        || selectedOrder.billing?.alt_company?.trim()
                        || selectedOrder.customerName
                        || selectedOrder.customerEmail
                        || "Ohne Kunde"}
                    </div>
                  </div>
                  <div className="uppv-summary-actions">
                    <button
                      type="button"
                      onClick={handleProvision}
                      disabled={loadingSummary}
                      className="uppv-primary-btn"
                    >
                      <HardDrive className="h-4 w-4" aria-hidden />
                      Ordner erstellen
                    </button>
                    {(() => {
                      const customerFolder = (summary?.folders || []).find(
                        (f) => f.folderType === "customer_folder",
                      );
                      const canGenerate = customerFolder?.exists === true;
                      if (!canGenerate) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => void handleGenerateWebsite()}
                          disabled={generatingWebsite}
                          className="uppv-secondary-btn"
                        >
                          {generatingWebsite ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : websiteSuccess ? (
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {websiteSuccess ? "Websize gestartet!" : "Websize generieren"}
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {error ? (
                  <div className="uppv-error-banner">{error}</div>
                ) : null}
                {websiteError ? (
                  <div className="uppv-error-banner" style={{ marginTop: 8 }}>{websiteError}</div>
                ) : null}

                {(() => {
                  const roots = (summary?.roots || []).filter((r) => r.key !== "stagingRoot");
                  if (roots.length === 0) return null;
                  const okCount = roots.filter((r) => r.ok).length;
                  const errCount = roots.length - okCount;
                  const hasError = errCount > 0;
                  const isOpen = mountsExpanded || hasError;
                  return (
                    <div className={`uppv-mounts${isOpen ? " is-open" : ""}`}>
                      <button
                        type="button"
                        className="uppv-mounts-head"
                        onClick={() => setMountsExpanded((v) => !v)}
                        aria-expanded={isOpen}
                      >
                        <span className="uppv-mounts-title">
                          <i className="fa-solid fa-server" aria-hidden /> Mount-Status
                        </span>
                        <span className="uppv-mounts-head-right">
                          <span className={`uppv-mounts-badge${hasError ? " is-err" : " is-ok"}`}>
                            <i className={hasError ? "fa-solid fa-circle-xmark" : "fa-solid fa-circle-check"} aria-hidden />
                            {hasError
                              ? `${okCount}/${roots.length} OK · ${errCount} Fehler`
                              : `${okCount}/${roots.length} OK`}
                          </span>
                          <ChevronDown className="uppv-mounts-chev h-4 w-4" aria-hidden />
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="uppv-status-cards">
                          {roots.map((root) => {
                            const rawErr = root.error || "";
                            const isPermission = /EACCES|permission denied/i.test(rawErr);
                            const isNotFound = /ENOENT|no such file/i.test(rawErr);
                            const friendlyError = isPermission
                              ? "Kein Zugriff – NAS-Mount aktiv?"
                              : isNotFound
                                ? "Ordner nicht gefunden – NAS-Mount prüfen"
                                : rawErr || "Fehler";
                            return (
                              <div
                                key={root.key}
                                className={`uppv-status-card${root.ok ? "" : " is-err"}`}
                              >
                                <div className="uppv-status-card-head">
                                  <span className="uppv-status-card-name">{root.key}</span>
                                  {root.ok ? (
                                    <span className="uppv-status-card-ok">
                                      <i className="fa-solid fa-circle-check" aria-hidden /> OK
                                    </span>
                                  ) : (
                                    <span className="uppv-status-card-err">
                                      <i className="fa-solid fa-circle-xmark" aria-hidden /> Fehler
                                    </span>
                                  )}
                                </div>
                                <div className="uppv-status-card-path">{root.path}</div>
                                {!root.ok && (
                                  <div className="uppv-status-card-msg">{friendlyError}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </section>

              {/* Folder-Karten */}
              <section className="uppv-folder-grid">
                {(summary?.folders || []).map((folder) => {
                  const ft = folder.folderType as AllFolderType;
                  const browser = browsers[ft] ?? defaultBrowserState();
                  const rootOk = summary?.roots?.find(
                    (r) => r.key === folderTypeToRootSummaryKey(ft)
                  )?.ok === true;

                  // Breadcrumb-Segmente
                  const pathSegments = browser.relativePath
                    ? browser.relativePath.split("/").filter(Boolean)
                    : [];

                  const chip = folderTypeChipLabel(ft);
                  const badgeCls =
                    folder.status === "ready" && folder.exists ? "is-ok"
                    : folder.status === "linked" ? "is-linked"
                    : folder.status === "archived" ? "is-archived"
                    : folder.status === "failed" ? "is-err"
                    : "is-pending";
                  const badgeLabel =
                    folder.status === "ready" && folder.exists ? "Ordner erstellt"
                    : folder.status === "ready" && !folder.exists ? "Ordner fehlt"
                    : folder.status === "linked" ? "Manuell verknüpft"
                    : folder.status === "archived" ? "Archiviert"
                    : folder.status === "failed" ? "Fehler"
                    : "Keine Verknüpfung";
                  const cardCls = `uppv-folder-card ${chip.cls}`;

                  const isOpen = expandedFolders.has(ft);
                  return (
                    <article key={ft} className={`${cardCls}${isOpen ? " is-open" : ""}`}>
                      <button
                        type="button"
                        className="uppv-folder-head"
                        onClick={() => toggleFolderExpanded(ft)}
                        aria-expanded={isOpen}
                      >
                        <span className="uppv-folder-name">
                          <i className={folderTypeIcon[ft]} aria-hidden />
                          {formatFolderLabel(ft)}
                        </span>
                        <span className="uppv-folder-head-right">
                          <span className={`uppv-folder-badge ${badgeCls}`}>
                            <i className={
                              badgeCls === "is-ok" ? "fa-solid fa-circle-check"
                              : badgeCls === "is-err" ? "fa-solid fa-circle-xmark"
                              : "fa-solid fa-clock"
                            } aria-hidden />
                            {badgeLabel}
                          </span>
                          <ChevronDown className="uppv-folder-chev h-4 w-4" aria-hidden />
                        </span>
                      </button>

                      {!isOpen ? null : (
                      <div className="uppv-folder-content">
                      <div className="uppv-folder-actions">
                        {folder.exists && (
                          <button
                            type="button"
                            onClick={() => void openContentModal(ft, folder.displayName)}
                            className="uppv-action-btn"
                          >
                            <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                            Inhalt anzeigen
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleArchive(ft)}
                          className="uppv-action-btn is-danger"
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden />
                          Archiviert löschen
                        </button>
                      </div>

                      <div className="uppv-folder-addr-block">
                        <div className="uppv-folder-addr">{folder.displayName}</div>
                        <div className="uppv-folder-addr-sub">{folder.relativePath}</div>
                        {folder.lastError ? (
                          <div className="uppv-folder-err">
                            {/EACCES|permission denied/i.test(folder.lastError)
                              ? "Kein Zugriff auf den NAS-Ordner – Mount prüfen"
                              : /ENOENT|no such file/i.test(folder.lastError)
                                ? "Ordner nicht gefunden – NAS-Mount prüfen"
                                : folder.lastError}
                          </div>
                        ) : null}
                      </div>

                      {/* Nextcloud-Freigabelink (nur für Kundenordner) */}
                      {ft === "customer_folder" && (
                        <div className="uppv-cloud-block">
                          <span className="uppv-cloud-label">
                            <Link2 className="h-3.5 w-3.5" aria-hidden />
                            Nextcloud-Freigabelink
                          </span>
                          {folder.nextcloudShareUrl ? (
                            <>
                              <div className="uppv-cloud-row">
                                <input
                                  className="uppv-cloud-input"
                                  value={folder.nextcloudShareUrl}
                                  readOnly
                                />
                                <button
                                  type="button"
                                  className="uppv-cloud-icon-btn"
                                  onClick={() => handleCopyShare(folder.nextcloudShareUrl!)}
                                  title="Link kopieren"
                                  aria-label="Link kopieren"
                                >
                                  {copiedShare ? (
                                    <Check className="h-3.5 w-3.5" aria-hidden />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" aria-hidden />
                                  )}
                                </button>
                                <a
                                  href={folder.nextcloudShareUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Link öffnen"
                                  aria-label="Link öffnen"
                                  className="uppv-cloud-icon-btn"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                </a>
                              </div>
                              {shareError && <div className="uppv-cloud-err">{shareError}</div>}
                              <button
                                type="button"
                                onClick={() => void handleGenerateShare()}
                                disabled={generatingShare}
                                className="uppv-cloud-renew"
                              >
                                {generatingShare ? "Erneuern …" : "Link erneuern"}
                              </button>
                            </>
                          ) : (
                            <>
                              <p className="uppv-cloud-empty">Noch kein Freigabelink vorhanden.</p>
                              {shareError && <div className="uppv-cloud-err">{shareError}</div>}
                              <button
                                type="button"
                                onClick={() => void handleGenerateShare()}
                                disabled={generatingShare}
                                className="uppv-cloud-generate"
                              >
                                <Link2 className="h-3.5 w-3.5" aria-hidden />
                                {generatingShare ? "Wird erstellt …" : "Nextcloud-Link generieren"}
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Ordner verknüpfen */}
                      <div className="uppv-link-section">
                        <div className="uppv-link-head">
                          <span className="uppv-link-label">Bestehenden Ordner verknüpfen</span>
                          <label className="uppv-rename-check">
                            <input
                              type="checkbox"
                              checked={renameOn[ft] ?? false}
                              onChange={(e) =>
                                setRenameOn((cur) => ({ ...cur, [ft]: e.target.checked }))
                              }
                            />
                            Ordner umbenennen
                          </label>
                        </div>

                        {renameOn[ft] && (
                          <div className="uppv-rename-warn" style={{ background: "var(--up-gold-tint)", borderColor: "var(--up-gold-line)", color: "var(--up-gold-deep)" }}>
                            Ordner wird umbenannt zu: <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{folder.displayName}</strong>
                          </div>
                        )}
                        {renameWarnings[ft] && (
                          <div className="uppv-rename-warn">⚠ {renameWarnings[ft]}</div>
                        )}

                        {/* NAS-File-Browser (nur wenn Root erreichbar) */}
                        {rootOk ? (
                          <>
                            <div className="uppv-browse-row">
                              <button
                                type="button"
                                className="uppv-browse-btn"
                                onClick={() => {
                                  const nextOpen = !browser.open;
                                  setBrowserState(ft, { open: nextOpen, error: "" });
                                  if (nextOpen && browser.entries.length === 0) {
                                    void browseFolder(ft, "");
                                  }
                                }}
                              >
                                <span className="uppv-browse-icon">
                                  <Folder className="h-4 w-4" aria-hidden />
                                  NAS durchsuchen
                                </span>
                                <span className="uppv-browse-right">{browser.open ? "Schließen" : "Öffnen"}</span>
                              </button>
                            </div>

                            {browser.open && (
                              <div className="uppv-browse-panel">
                                <div className="uppv-browse-panel-bread">
                                  <button
                                    type="button"
                                    onClick={() => void browseFolder(ft, "")}
                                    className="uppv-browse-bread-btn"
                                  >
                                    <House className="inline h-3 w-3" aria-hidden />{" "}
                                    {ft === "raw_material" ? "Raw-Root" : ft === "selection" ? "Selection-Root" : "Kunden-Root"}
                                  </button>
                                  {pathSegments.map((seg, idx) => {
                                    const segPath = pathSegments.slice(0, idx + 1).join("/");
                                    const isLast = idx === pathSegments.length - 1;
                                    return (
                                      <span key={segPath} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <ChevronRight className="uppv-browse-bread-sep h-3 w-3" aria-hidden />
                                        {isLast ? (
                                          <span style={{ color: "var(--up-ink)" }}>{seg}</span>
                                        ) : (
                                          <button
                                            type="button"
                                            className="uppv-browse-bread-btn"
                                            onClick={() => void browseFolder(ft, segPath)}
                                          >
                                            {seg}
                                          </button>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                                <div className="uppv-browse-list">
                                  {browser.parentPath != null && (
                                    <button
                                      type="button"
                                      className="uppv-browse-entry is-up"
                                      onClick={() => void browseFolder(ft, browser.parentPath ?? "")}
                                    >
                                      ↩ ..
                                    </button>
                                  )}
                                  {browser.loading ? (
                                    <div className="uppv-browse-loading">
                                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lädt …
                                    </div>
                                  ) : browser.error ? (
                                    <div className="uppv-browse-empty" style={{ color: "var(--up-rust)" }}>{browser.error}</div>
                                  ) : browser.entries.length === 0 ? (
                                    <div className="uppv-browse-empty">
                                      Keine Unterordner – dieser Ordner kann direkt verknüpft werden.
                                    </div>
                                  ) : (
                                    browser.entries.map((entry) => (
                                      <button
                                        key={entry.relativePath}
                                        type="button"
                                        className="uppv-browse-entry"
                                        onClick={() => void browseFolder(ft, entry.relativePath)}
                                      >
                                        <FolderOpen className="h-4 w-4" aria-hidden />
                                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {entry.name}
                                        </span>
                                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                                      </button>
                                    ))
                                  )}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", borderTop: "1px solid var(--up-line-soft)", background: "var(--up-card)" }}>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "var(--up-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {browser.relativePath || (ft === "raw_material" ? "Raw-Root" : ft === "selection" ? "Selection-Root" : "Kunden-Root")}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={loadingSummary}
                                    onClick={() => void handleLink(ft, browser.relativePath)}
                                    className="uppv-manual-submit"
                                    style={{ padding: "6px 14px" }}
                                  >
                                    Diesen Ordner verknüpfen
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="uppv-rename-warn">
                            ⚠ NAS nicht erreichbar – Ordner nur manuell per Pfad verknüpfbar (siehe unten).
                          </div>
                        )}

                        {/* Manueller Pfad */}
                        <div className="uppv-manual-row">
                          <input
                            type="text"
                            className="uppv-manual-input"
                            value={linkInputs[ft] || ""}
                            onChange={(event) =>
                              setLinkInputs((current) => ({ ...current, [ft]: event.target.value }))
                            }
                            placeholder={
                              ft === "raw_material" ? "PLZ Ort, Strasse Nr #Auftrag"
                              : ft === "selection" ? "Firma/PLZ Ort, Strasse Nr #Auftrag"
                              : "Firma/PLZ Ort, Strasse Nr #Auftrag"
                            }
                          />
                          <button
                            type="button"
                            onClick={() => void handleLink(ft)}
                            disabled={loadingSummary || !linkInputs[ft]?.trim()}
                            className="uppv-manual-submit"
                          >
                            Verknüpfen
                          </button>
                        </div>
                        <p className="uppv-manual-hint">
                          <i className="fa-solid fa-info-circle" aria-hidden />
                          <span>
                            Pfad manuell eingeben — relativ ab{" "}
                            {ft === "raw_material" ? "/booking_upload_raw"
                              : ft === "selection" ? "Selection-Root"
                              : "/booking_upload_customer"}
                            , z.B. {ft === "raw_material"
                              ? "8000 Zürich, Musterstrasse 1 #220"
                              : "Musterfirma/8000 Zürich, Musterstrasse 1 #220"}
                          </span>
                        </p>
                      </div>
                      </div>
                      )}
                    </article>
                  );
                })}
              </section>

              {/* Chooser — Upload-Tool oeffnet sich als Modal-Popup (siehe unten). */}
              <div className="uppv-summary" style={{ textAlign: "center" }}>
                <h3 className="uppv-summary-label" style={{ marginBottom: 18 }}>
                  {t(lang, "upload.folderType.chooseTitle")}
                </h3>
                <div className="uppv-chooser-grid">
                  <button
                    type="button"
                    onClick={() => setSelectedFolderType("raw_material")}
                    className="uppv-chooser-card"
                  >
                    <i className={folderTypeIcon.raw_material} style={{ fontSize: 28, color: "#9a8456" }} aria-hidden />
                    <span className="uppv-chooser-title">Rohmaterial</span>
                    <span className="uppv-chooser-sub">Unbearbeitete Bilder &amp; Videos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFolderType("selection")}
                    className="uppv-chooser-card"
                  >
                    <i className={folderTypeIcon.selection} style={{ fontSize: 28, color: "#8a6ba0" }} aria-hidden />
                    <span className="uppv-chooser-title">Zur Auswahl</span>
                    <span className="uppv-chooser-sub">Bilder, die dem Kunden zur Auswahl gehen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFolderType("customer_folder")}
                    className="uppv-chooser-card"
                  >
                    <i className={folderTypeIcon.customer_folder} style={{ fontSize: 28, color: "var(--up-gold)" }} aria-hidden />
                    <span className="uppv-chooser-title">Kundenordner</span>
                    <span className="uppv-chooser-sub">Finale Lieferung an den Kunden</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="uppv-empty">
              Auftrag links auswählen, um Upload und NAS-Verwaltung zu öffnen.
            </div>
          )}
        </main>
      </div>
      </div>

      {/* Upload-Popup */}
      {selectedFolderType && selectedOrder && (
        <div
          className="uppv-upload-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="uppv-upload-modal-title"
          onClick={(e) => {
            // Backdrop-Klick schliesst — Klicks im Dialog stoppen via stopPropagation am Kind.
            if (e.target === e.currentTarget) setSelectedFolderType(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSelectedFolderType(null);
          }}
          tabIndex={-1}
        >
          <div className="uppv-upload-modal-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Kompakter Top-Header mit Eyebrow + Num + Sep + Target + Close */}
            <div className="uppv-upload-modal-head">
              <div className="uppv-upload-modal-title" id="uppv-upload-modal-title">
                <span className="uppv-up-eyebrow">Upload</span>
                <span className="uppv-up-num">#{selectedOrder.orderNo}</span>
                <span className="uppv-up-sep">·</span>
                <span className="uppv-up-target">
                  {formatFolderLabel(selectedFolderType as AllFolderType)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFolderType(null)}
                className="uppv-upload-modal-close"
                aria-label="Schließen"
                title="Schließen"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Title-Block mit gold-Ring-Icon + Adresse → Target Breadcrumb */}
            <div className="uppv-upload-titleblock">
              <div className="uppv-upload-titleblock-icon">
                <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
              </div>
              <div className="uppv-upload-titleblock-text">
                <div className="uppv-upload-titleblock-headline">
                  <span className="uppv-upload-titleblock-label">Upload</span>
                  <span className="uppv-upload-titleblock-num">#{selectedOrder.orderNo}</span>
                </div>
                <div className="uppv-upload-titleblock-sub">
                  <span>{selectedOrder.address || selectedOrder.customerName || "—"}</span>
                  <ChevronRight className="uppv-upload-titleblock-arrow h-3 w-3" aria-hidden />
                  <strong>{formatFolderLabel(selectedFolderType as AllFolderType)}</strong>
                </div>
              </div>
            </div>

            <div className="uppv-upload-modal-body">
              <UploadModalForm
                key={`${selectedOrderNo}-${selectedFolderType}`}
                token={token}
                orderNo={selectedOrderNo}
                folderType={selectedFolderType}
                address={selectedOrder.address}
                batches={summary?.batches ?? []}
                onChanged={async () => { await loadSummary(selectedOrderNo); }}
                onClose={() => setSelectedFolderType(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ordner-Inhalt Modal */}
      {contentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
              <div>
                <p className="text-xs text-[var(--text-subtle)]">Ordner-Inhalt</p>
                <h3 className="text-sm font-semibold text-[var(--text-main)]">{contentModal.displayName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setContentModal(null)}
                className="rounded-lg p-1.5 text-[var(--text-subtle)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {contentModal.loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-subtle)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Ordner wird geladen …
                </div>
              ) : contentModal.error ? (
                <div className="py-6 text-sm text-red-500">{contentModal.error}</div>
              ) : contentModal.tree.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--text-subtle)]">Ordner ist leer.</div>
              ) : (
                <div className="space-y-0.5">
                  {contentModal.tree.map((node) => (
                    <TreeNode key={node.relativePath} node={node} depth={0} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border-soft)] px-5 py-3 text-right">
              <button
                type="button"
                onClick={() => setContentModal(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] transition hover:bg-[var(--surface-raised)]"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
