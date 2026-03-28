import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, FolderOpen, HardDrive, ImageIcon, RefreshCw, Search } from "lucide-react";
import {
  archiveOrderStorageFolder,
  getOrderStorageSummary,
  getOrders,
  linkOrderStorageFolder,
  provisionOrderStorage,
  type Order,
  type OrderFolderType,
  type OrderStorageSummaryResponse,
} from "../api/orders";
import { UploadTool } from "../components/orders/UploadTool";
import { normalizeStatusKey } from "../lib/status";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

function formatFolderLabel(folderType: "raw_material" | "customer_folder") {
  return folderType === "raw_material" ? "Rohmaterial" : "Kundenordner";
}

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
    if (!orderNo) {
      setSummary(null);
      return;
    }
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

  async function handleLink(folderType: "raw_material" | "customer_folder") {
    if (!selectedOrderNo) return;
    const relativePath = String(linkInputs[folderType] || "").trim();
    if (!relativePath) return;
    setLoadingSummary(true);
    try {
      await linkOrderStorageFolder(token, selectedOrderNo, { folderType, relativePath });
      await loadSummary(selectedOrderNo);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">Upload</h1>
          <p className="text-slate-600 dark:text-zinc-400">
            Auftrag suchen, NAS-Ordner verwalten und Uploads zuerst lokal auf der VPS stagen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadSummary(selectedOrderNo)}
          disabled={!selectedOrderNo || loadingSummary}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <RefreshCw className={`h-4 w-4 ${loadingSummary ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-zinc-200">Auftrag suchen</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Auftragsnummer, Kunde oder Strasse"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
            {query.trim()
              ? "Suchtreffer"
              : "Ohne Suche werden die letzten 5 Aufträge in Bearbeitung angezeigt."}
          </p>

          <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto">
            {loadingOrders ? (
              <p className="text-sm text-slate-500 dark:text-zinc-400">Aufträge laden...</p>
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
                        ? "border-[#C5A059] bg-amber-50/80 dark:bg-amber-950/20"
                        : "border-slate-200 bg-slate-50/60 hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100">#{order.orderNo}</span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {order.status || "-"}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-zinc-200">{order.address || "-"}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                      {order.customerName || order.customerEmail || "Ohne Kunde"}
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                {query.trim() ? "Keine passenden Aufträge gefunden." : "Keine Aufträge in Bearbeitung gefunden."}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-6">
          {selectedOrder ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">Ausgewählter Auftrag</p>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-zinc-100">#{selectedOrder.orderNo}</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">{selectedOrder.address || "-"}</p>
                    <p className="text-sm text-slate-500 dark:text-zinc-400">{selectedOrder.customerName || selectedOrder.customerEmail || "Ohne Kunde"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleProvision}
                    disabled={loadingSummary}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#C5A059] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#B39049] disabled:opacity-50"
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

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {(summary?.roots || []).map((root) => (
                    <div key={root.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{root.key}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400 break-all">{root.path}</div>
                      <div className={`mt-2 text-xs font-semibold ${root.ok ? "text-emerald-600" : "text-red-500"}`}>
                        {root.ok ? "OK" : root.error || "Fehler"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {(summary?.folders || []).map((folder) => (
                  <div key={folder.folderType} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{formatFolderLabel(folder.folderType)}</h3>
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">{folder.status}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleArchive(folder.folderType)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 dark:border-zinc-700 dark:text-zinc-100"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archiviert löschen
                      </button>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="text-slate-600 dark:text-zinc-300">{folder.displayName}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400 break-all">{folder.relativePath}</div>
                      {folder.lastError ? <div className="text-xs text-red-500">{folder.lastError}</div> : null}
                    </div>
                    <div className="mt-4 space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                        Bestehenden Ordner verknüpfen
                      </label>
                      <input
                        value={linkInputs[folder.folderType] || ""}
                        onChange={(event) =>
                          setLinkInputs((current) => ({ ...current, [folder.folderType]: event.target.value }))
                        }
                        placeholder={folder.folderType === "raw_material" ? "PLZ Ort, Strasse Nr #Auftragsnummer" : "Firma/PLZ Ort, Strasse Nr #Auftragsnummer"}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleLink(folder.folderType)}
                        disabled={loadingSummary}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-zinc-700 dark:text-zinc-100"
                      >
                        Verknüpfen
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {selectedFolderType ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderType(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 dark:border-zinc-700 dark:text-zinc-300"
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
                    onChanged={async () => {
                      await loadSummary(selectedOrderNo);
                    }}
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="mb-6 text-center text-xl font-bold text-slate-900 dark:text-zinc-100">
                    {t(lang, "upload.folderType.chooseTitle")}
                  </h3>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderType("raw_material")}
                      className="group flex w-64 flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 py-8 transition hover:border-[#C5A059] hover:bg-amber-50/50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-[#C5A059] dark:hover:bg-amber-950/20"
                    >
                      <ImageIcon className="h-10 w-10 text-slate-400 transition group-hover:text-[#C5A059] dark:text-zinc-500" />
                      <span className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                        {t(lang, "upload.folderType.rawMaterialButton")}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        Unbearbeitete Bilder & Videos
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFolderType("customer_folder")}
                      className="group flex w-64 flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 py-8 transition hover:border-[#C5A059] hover:bg-amber-50/50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-[#C5A059] dark:hover:bg-amber-950/20"
                    >
                      <FolderOpen className="h-10 w-10 text-slate-400 transition group-hover:text-[#C5A059] dark:text-zinc-500" />
                      <span className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                        {t(lang, "upload.folderType.customerFolderButton")}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        Finale Lieferung an den Kunden
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-10 text-center text-sm text-slate-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              Auftrag links auswählen, um Upload und NAS-Verwaltung zu öffnen.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
