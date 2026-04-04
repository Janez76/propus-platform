import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, ChevronRight, FolderOpen, HardDrive, House, ImageIcon, Loader2, RefreshCw, Search } from "lucide-react";
import {
  archiveOrderStorageFolder,
  browseAdminStorage,
  getOrderStorageSummary,
  getOrders,
  linkOrderStorageFolder,
  provisionOrderStorage,
  type Order,
  type OrderFolderType,
  type OrderStorageSummaryResponse,
  type StorageBrowseEntry,
} from "../api/orders";
import { UploadTool } from "../components/orders/UploadTool";
import { normalizeStatusKey } from "../lib/status";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

function formatFolderLabel(folderType: "raw_material" | "customer_folder") {
  return folderType === "raw_material" ? "Rohmaterial" : "Kundenordner";
}

function folderTypeToRootKind(folderType: "raw_material" | "customer_folder"): "customer" | "raw" {
  return folderType === "raw_material" ? "raw" : "customer";
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
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [selectedOrderNo, setSelectedOrderNo] = useState<string>("");
  const [selectedFolderType, setSelectedFolderType] = useState<OrderFolderType | null>(null);
  const [summary, setSummary] = useState<OrderStorageSummaryResponse | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({
    raw_material: "",
    customer_folder: "",
  });
  const [renameOn, setRenameOn] = useState<Record<string, boolean>>({
    raw_material: false,
    customer_folder: false,
  });
  const [renameWarnings, setRenameWarnings] = useState<Record<string, string>>({});

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
    async (folderType: "raw_material" | "customer_folder", relativePath: string) => {
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

  async function handleLink(folderType: "raw_material" | "customer_folder", relativePath?: string) {
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

  async function handleArchive(folderType: "raw_material" | "customer_folder") {
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
    const sortedOrders = [...orders].sort((a, b) => Number(b.orderNo || 0) - Number(a.orderNo || 0));
    if (!normalized) {
      return sortedOrders
        .filter((order) => {
          const status = normalizeStatusKey(order.status);
          return status === "pending" || status === "provisional" || status === "confirmed" || status === "paused";
        })
        .slice(0, 5);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-main)]">Upload</h1>
          <p className="text-[var(--text-subtle)]">
            Auftrag suchen, NAS-Ordner verwalten und Uploads zuerst lokal auf der VPS stagen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadSummary(selectedOrderNo)}
          disabled={!selectedOrderNo || loadingSummary}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-main)] shadow-sm transition hover:bg-[var(--surface-raised)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loadingSummary ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* Auftragssuche */}
        <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-[var(--text-muted)]">Auftrag suchen</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Auftragsnummer, Kunde oder Strasse"
              className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-subtle)]">
            {query.trim() ? "Suchtreffer" : "Ohne Suche werden die letzten 5 Aufträge in Bearbeitung angezeigt."}
          </p>
          <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto">
            {loadingOrders ? (
              <p className="text-sm text-[var(--text-subtle)]">Aufträge laden...</p>
            ) : visibleOrders.length > 0 ? (
              visibleOrders.map((order) => {
                const isActive = String(order.orderNo) === selectedOrderNo;
                return (
                  <button
                    key={order.orderNo}
                    type="button"
                    onClick={() => { setSelectedOrderNo(String(order.orderNo)); setSelectedFolderType(null); }}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isActive
                        ? "border-[var(--accent)] bg-amber-50/80 dark:bg-amber-950/20"
                        : "border-[var(--border-soft)] bg-[var(--surface)] hover:bg-[var(--surface-raised)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[var(--text-main)]">#{order.orderNo}</span>
                      <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                        {order.status || "-"}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-[var(--text-muted)]">{order.address || "-"}</div>
                    <div className="mt-1 text-xs text-[var(--text-subtle)]">
                      {order.customerName || order.customerEmail || "Ohne Kunde"}
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-[var(--text-subtle)]">
                {query.trim() ? "Keine passenden Aufträge gefunden." : "Keine Aufträge in Bearbeitung gefunden."}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-6">
          {selectedOrder ? (
            <>
              {/* Auftrag-Header + Storage-Health */}
              <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-subtle)]">Ausgewählter Auftrag</p>
                    <h2 className="mt-1 text-2xl font-semibold text-[var(--text-main)]">#{selectedOrder.orderNo}</h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{selectedOrder.address || "-"}</p>
                    <p className="text-sm text-[var(--text-subtle)]">{selectedOrder.customerName || selectedOrder.customerEmail || "Ohne Kunde"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleProvision}
                    disabled={loadingSummary}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    <HardDrive className="h-4 w-4" />
                    Ordner automatisch erstellen
                  </button>
                </div>

                {error ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {(summary?.roots || []).filter((r) => r.key !== "stagingRoot").map((root) => {
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
                        className={`rounded-xl border p-3 border-[var(--border-soft)] ${root.ok ? "bg-[var(--surface)]" : "bg-red-50/60 dark:bg-red-950/20"}`}
                      >
                        <div className="text-sm font-semibold text-[var(--text-main)]">{root.key}</div>
                        <div className="mt-1 text-xs text-[var(--text-subtle)] break-all">{root.path}</div>
                        <div className={`mt-1.5 text-xs font-semibold ${root.ok ? "text-emerald-600" : "text-red-500"}`}>
                          {root.ok ? "✓ OK" : `✗ ${friendlyError}`}
                        </div>
                        {!root.ok && (isPermission || isNotFound) && (
                          <div className="mt-1 text-[10px] text-[var(--text-subtle)]">
                            Umgebungsvariable und NAS-Mount auf der VPS prüfen
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ordner-Karten */}
              <div className="grid gap-4 xl:grid-cols-2">
                {(summary?.folders || []).map((folder) => {
                  const ft = folder.folderType as "raw_material" | "customer_folder";
                  const browser = browsers[ft] ?? defaultBrowserState();
                  const rootOk = summary?.roots?.find(
                    (r) => r.key === (ft === "raw_material" ? "rawRoot" : "customerRoot")
                  )?.ok === true;

                  // Breadcrumb-Segmente
                  const pathSegments = browser.relativePath
                    ? browser.relativePath.split("/").filter(Boolean)
                    : [];

                  return (
                    <div key={ft} className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-[var(--text-main)]">{formatFolderLabel(ft)}</h3>
                          <p className="mt-1 text-xs uppercase tracking-wide text-[var(--text-subtle)]">{folder.status}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleArchive(ft)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] transition hover:bg-[var(--surface-raised)]"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archiviert löschen
                        </button>
                      </div>

                      <div className="mt-3 space-y-1 text-sm">
                        <div className="text-[var(--text-muted)]">{folder.displayName}</div>
                        <div className="text-xs text-[var(--text-subtle)] break-all">{folder.relativePath}</div>
                        {folder.lastError ? (
                          <div className="text-xs text-red-500">
                            {/EACCES|permission denied/i.test(folder.lastError)
                              ? "Kein Zugriff auf den NAS-Ordner – Mount prüfen"
                              : /ENOENT|no such file/i.test(folder.lastError)
                                ? "Ordner nicht gefunden – NAS-Mount prüfen"
                                : folder.lastError}
                          </div>
                        ) : null}
                      </div>

                      {/* Ordner verknüpfen */}
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                            Bestehenden Ordner verknüpfen
                          </p>
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <input
                              type="checkbox"
                              checked={renameOn[ft] ?? false}
                              onChange={(e) =>
                                setRenameOn((cur) => ({ ...cur, [ft]: e.target.checked }))
                              }
                              className="h-3.5 w-3.5 accent-[var(--accent)]"
                            />
                            Ordner umbenennen
                          </label>
                        </div>

                        {/* Vorschau Zielname wenn Umbenennung aktiv */}
                        {renameOn[ft] && (
                          <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 text-xs text-[var(--text-muted)]">
                            Ordner wird umbenannt zu:{" "}
                            <span className="font-mono font-semibold text-[var(--text-main)]">
                              {folder.displayName}
                            </span>
                          </div>
                        )}

                        {/* Warnung nach Umbenennung (z.B. Ziel existiert bereits) */}
                        {renameWarnings[ft] && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400">
                            ⚠ {renameWarnings[ft]}
                          </div>
                        )}

                        {/* Option A: NAS-File-Browser (nur wenn Root erreichbar) */}
                        {rootOk ? (
                          <div className="rounded-xl border border-[var(--border-soft)]">
                            <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-3 py-2">
                              <span className="text-xs font-medium text-[var(--text-muted)]">
                                <FolderOpen className="mr-1 inline h-3.5 w-3.5" />
                                NAS durchsuchen
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextOpen = !browser.open;
                                  setBrowserState(ft, { open: nextOpen, error: "" });
                                  if (nextOpen && browser.entries.length === 0) {
                                    void browseFolder(ft, "");
                                  }
                                }}
                                className={`text-xs font-semibold transition ${
                                  browser.open ? "text-[var(--accent)]" : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                                }`}
                              >
                                {browser.open ? "Schließen" : "Öffnen"}
                              </button>
                            </div>

                            {browser.open && (
                              <>
                                {/* Breadcrumb */}
                                <div className="flex items-center gap-0 overflow-x-auto border-b border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => void browseFolder(ft, "")}
                                    className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--line)]"
                                  >
                                    <House className="h-3 w-3" />
                                    {ft === "raw_material" ? "Raw-Root" : "Kunden-Root"}
                                  </button>
                                  {pathSegments.map((seg, idx) => {
                                    const segPath = pathSegments.slice(0, idx + 1).join("/");
                                    const isLast = idx === pathSegments.length - 1;
                                    return (
                                      <span key={segPath} className="flex shrink-0 items-center">
                                        <ChevronRight className="h-3 w-3 text-[var(--text-subtle)]" />
                                        {isLast ? (
                                          <span className="rounded px-2 py-1 text-xs font-semibold text-[var(--text-main)]">{seg}</span>
                                        ) : (
                                          <button
                                            type="button"
                                            className="rounded px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--line)]"
                                            onClick={() => void browseFolder(ft, segPath)}
                                          >
                                            {seg}
                                          </button>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>

                                {/* Ordner-Liste */}
                                <div className="max-h-56 overflow-y-auto">
                                  {browser.parentPath != null && (
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-3 border-b border-[var(--border-soft)] px-4 py-2.5 text-left text-sm hover:bg-[var(--surface-raised)] transition"
                                      onClick={() => void browseFolder(ft, browser.parentPath ?? "")}
                                    >
                                      <span className="text-[var(--text-subtle)]">↩</span>
                                      <span className="italic text-[var(--text-subtle)]">..</span>
                                    </button>
                                  )}
                                  {browser.loading ? (
                                    <div className="flex items-center gap-2 px-4 py-5 text-sm text-[var(--text-subtle)]">
                                      <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
                                    </div>
                                  ) : browser.error ? (
                                    <div className="px-4 py-4 text-xs text-red-500">{browser.error}</div>
                                  ) : browser.entries.length === 0 ? (
                                    <div className="px-4 py-5 text-sm text-[var(--text-subtle)]">
                                      Keine Unterordner – dieser Ordner kann direkt verknüpft werden.
                                    </div>
                                  ) : (
                                    browser.entries.map((entry, idx) => (
                                      <button
                                        key={entry.relativePath}
                                        type="button"
                                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--surface-raised)] transition ${
                                          idx < browser.entries.length - 1 ? "border-b border-[var(--border-soft)]" : ""
                                        }`}
                                        onClick={() => void browseFolder(ft, entry.relativePath)}
                                      >
                                        <FolderOpen className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                                        <span className="flex-1 truncate font-medium text-[var(--text-main)]">{entry.name}</span>
                                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)]" />
                                      </button>
                                    ))
                                  )}
                                </div>

                                {/* Footer: aktuellen Ordner verknüpfen */}
                                <div className="flex items-center justify-between border-t border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-2.5">
                                  <span className="truncate text-xs text-[var(--text-subtle)]">
                                    {browser.relativePath || (ft === "raw_material" ? "Raw-Root" : "Kunden-Root")}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={loadingSummary}
                                    onClick={() => void handleLink(ft, browser.relativePath)}
                                    className="ml-3 shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                                  >
                                    <HardDrive className="h-3.5 w-3.5" />
                                    Diesen Ordner verknüpfen
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400">
                            <span className="mt-px shrink-0">⚠</span>
                            <span>NAS nicht erreichbar – Ordner nur manuell per Pfad verknüpfbar (siehe unten).</span>
                          </div>
                        )}

                        {/* Option B: Manuell per Pfad (immer sichtbar) */}
                        <div className="rounded-xl border border-[var(--border-soft)] p-3">
                          <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                            <HardDrive className="mr-1 inline h-3.5 w-3.5" />
                            Pfad manuell eingeben
                          </p>
                          <p className="mb-2 text-[10px] text-[var(--text-subtle)]">
                            Relativer Pfad ab {ft === "raw_material" ? "Raw-Root" : "Kunden-Root"}, z.B.{" "}
                            <span className="font-mono">{ft === "raw_material" ? "8000 Zürich, Musterstrasse 1 #1234" : "Musterfirma/8000 Zürich, Musterstrasse 1 #1234"}</span>
                          </p>
                          <div className="flex gap-2">
                            <input
                              value={linkInputs[ft] || ""}
                              onChange={(event) =>
                                setLinkInputs((current) => ({ ...current, [ft]: event.target.value }))
                              }
                              placeholder={ft === "raw_material" ? "PLZ Ort, Strasse Nr #Auftragsnummer" : "Firma/PLZ Ort, Strasse Nr #Auftragsnummer"}
                              className="min-w-0 flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                            />
                            <button
                              type="button"
                              onClick={() => void handleLink(ft)}
                              disabled={loadingSummary || !linkInputs[ft]?.trim()}
                              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
                            >
                              Verknüpfen
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Upload-Tool */}
              {selectedFolderType ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderType(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)]"
                    >
                      ← {t(lang, "upload.folderType.chooseTitle")}
                    </button>
                  </div>
                  <UploadTool
                    key={`${selectedOrderNo}-${selectedFolderType}`}
                    token={token}
                    orderNo={selectedOrderNo}
                    folderType={selectedFolderType}
                    embedded
                    onChanged={async () => { await loadSummary(selectedOrderNo); }}
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-8 shadow-sm">
                  <h3 className="mb-6 text-center text-xl font-bold text-[var(--text-main)]">
                    {t(lang, "upload.folderType.chooseTitle")}
                  </h3>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderType("raw_material")}
                      className="group flex w-64 flex-col items-center gap-3 rounded-2xl border-2 border-[var(--border-soft)] bg-[var(--surface)] px-6 py-8 transition hover:border-[var(--accent)] hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                    >
                      <ImageIcon className="h-10 w-10 text-[var(--text-subtle)] transition group-hover:text-[var(--accent)]" />
                      <span className="text-lg font-semibold text-[var(--text-main)]">
                        {t(lang, "upload.folderType.rawMaterialButton")}
                      </span>
                      <span className="text-xs text-[var(--text-subtle)]">Unbearbeitete Bilder & Videos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFolderType("customer_folder")}
                      className="group flex w-64 flex-col items-center gap-3 rounded-2xl border-2 border-[var(--border-soft)] bg-[var(--surface)] px-6 py-8 transition hover:border-[var(--accent)] hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                    >
                      <FolderOpen className="h-10 w-10 text-[var(--text-subtle)] transition group-hover:text-[var(--accent)]" />
                      <span className="text-lg font-semibold text-[var(--text-main)]">
                        {t(lang, "upload.folderType.customerFolderButton")}
                      </span>
                      <span className="text-xs text-[var(--text-subtle)]">Finale Lieferung an den Kunden</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--surface)]/80 p-10 text-center text-sm text-[var(--text-subtle)] shadow-sm">
              Auftrag links auswählen, um Upload und NAS-Verwaltung zu öffnen.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
