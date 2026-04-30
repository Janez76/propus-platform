"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ChevronRight,
  Check,
  Copy,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  HardDrive,
  House,
  ImageIcon,
  Link2,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import {
  archiveOrderStorageFolder,
  browseAdminStorage,
  generateNextcloudShare,
  generateWebsizeRebuild,
  getOrderStorageSummary,
  getOrderUploads,
  linkOrderStorageFolder,
  moveRawMaterialToCustomerFolder,
  provisionOrderStorage,
  type OrderFolderType,
  type OrderStorageSummaryResponse,
  type OrderUploadTreeNode,
  type StorageBrowseEntry,
} from "../../api/orders";
import { UploadTool } from "./UploadTool";
import { useAuthStore } from "../../store/authStore";

function formatFolderLabel(folderType: "raw_material" | "customer_folder") {
  return folderType === "raw_material" ? "Rohmaterial" : "Kundenordner";
}

function folderTypeToRootKind(folderType: "raw_material" | "customer_folder"): "customer" | "raw" {
  return folderType === "raw_material" ? "raw" : "customer";
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type StatusMeta = { label: string; className: string };
function getFolderStatusMeta(status: string, exists: boolean): StatusMeta {
  if (status === "ready" && exists)  return { label: "Automatisch erstellt", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" };
  if (status === "ready" && !exists) return { label: "Ordner fehlt",         className: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400" };
  if (status === "linked")           return { label: "Manuell verknüpft",    className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" };
  if (status === "failed")           return { label: "Fehler",               className: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400" };
  if (status === "archived")         return { label: "Archiviert",           className: "bg-[var(--surface-raised)] text-[var(--text-subtle)]" };
  return { label: "Keine Verknüpfung", className: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400" };
}

function TreeNode({ node, depth = 0 }: { node: OrderUploadTreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  if (node.type === "file") {
    return (
      <div style={{ paddingLeft: `${depth * 14 + 4}px` }} className="flex items-center gap-2 py-0.5 text-xs text-[var(--ink-2)]">
        <File className="h-3 w-3 shrink-0 text-[var(--ink-3)]" />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-[var(--ink-3)]">{formatBytes(node.size ?? 0)}</span>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        className="flex w-full items-center gap-2 py-0.5 text-left text-xs font-medium text-[var(--ink-1)] hover:text-[var(--gold-600)]"
      >
        {open ? <FolderOpen className="h-3 w-3 shrink-0 text-[var(--gold-600)]" /> : <Folder className="h-3 w-3 shrink-0 text-[var(--ink-3)]" />}
        <span className="truncate">{node.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-[var(--ink-3)]">{node.children?.length ?? 0}</span>
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

type Props = {
  orderNo: string;
  orderAddress?: string;
};

export function OrderStoragePanel({ orderNo, orderAddress }: Props) {
  const token = useAuthStore((s) => s.token);
  const [summary, setSummary] = useState<OrderStorageSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");
  const [selectedFolderType, setSelectedFolderType] = useState<OrderFolderType | null>(null);
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({
    raw_material: "",
    customer_folder: "",
  });
  const [renameOn, setRenameOn] = useState<Record<string, boolean>>({
    raw_material: false,
    customer_folder: false,
  });
  const [renameWarnings, setRenameWarnings] = useState<Record<string, string>>({});

  const [generatingShare, setGeneratingShare] = useState(false);
  const [shareError, setShareError] = useState("");
  const [copiedShare, setCopiedShare] = useState(false);

  const [generatingWebsite, setGeneratingWebsite] = useState(false);
  const [websiteError, setWebsiteError] = useState("");
  const [websiteSuccess, setWebsiteSuccess] = useState(false);

  const [contentModal, setContentModal] = useState<{
    folderType: "raw_material" | "customer_folder";
    displayName: string;
    loading: boolean;
    tree: OrderUploadTreeNode[];
    error: string;
  } | null>(null);

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

  const loadSummary = useCallback(async () => {
    if (!orderNo || !token) return;
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
  }, [orderNo, token]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  async function handleGenerateWebsite() {
    if (!orderNo || !token) return;
    setGeneratingWebsite(true);
    setWebsiteError("");
    setWebsiteSuccess(false);
    try {
      await generateWebsizeRebuild(token, orderNo);
      setWebsiteSuccess(true);
      setTimeout(() => setWebsiteSuccess(false), 4000);
    } catch (err) {
      setWebsiteError(err instanceof Error ? err.message : "Website-Generierung fehlgeschlagen");
    } finally {
      setGeneratingWebsite(false);
    }
  }

  async function handleGenerateShare() {
    if (!orderNo || !token) return;
    setGeneratingShare(true);
    setShareError("");
    try {
      await generateNextcloudShare(token, orderNo);
      await loadSummary();
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

  async function openContentModal(folderType: "raw_material" | "customer_folder", displayName: string) {
    if (!token) return;
    setContentModal({ folderType, displayName, loading: true, tree: [], error: "" });
    try {
      const result = await getOrderUploads(token, orderNo, folderType);
      setContentModal({ folderType, displayName, loading: false, tree: result.tree ?? [], error: "" });
    } catch (err) {
      setContentModal({ folderType, displayName, loading: false, tree: [], error: err instanceof Error ? err.message : "Fehler beim Laden" });
    }
  }

  const browseFolder = useCallback(
    async (folderType: "raw_material" | "customer_folder", relativePath: string) => {
      if (!token) return;
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
    if (!orderNo || !token) return;
    setLoadingSummary(true);
    try {
      await provisionOrderStorage(token, orderNo);
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ordner konnten nicht erstellt werden");
      setLoadingSummary(false);
    }
  }

  async function handleLink(folderType: "raw_material" | "customer_folder", relativePath?: string) {
    if (!orderNo || !token) return;
    const linkPath = relativePath ?? String(linkInputs[folderType] || "").trim();
    if (!linkPath) return;
    setLoadingSummary(true);
    setRenameWarnings((cur) => ({ ...cur, [folderType]: "" }));
    try {
      const result = await linkOrderStorageFolder(token, orderNo, {
        folderType,
        relativePath: linkPath,
        rename: renameOn[folderType] ?? false,
      });
      if (result.renameWarning) {
        setRenameWarnings((cur) => ({ ...cur, [folderType]: result.renameWarning ?? "" }));
      }
      await loadSummary();
      setBrowserState(folderType, { open: false, relativePath: "", entries: [], parentPath: null });
      setLinkInputs((cur) => ({ ...cur, [folderType]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ordner konnte nicht verknüpft werden");
      setLoadingSummary(false);
    }
  }

  async function handleArchive(folderType: "raw_material" | "customer_folder") {
    if (!orderNo || !token) return;
    if (!window.confirm(`${formatFolderLabel(folderType)} archiviert löschen?`)) return;
    setLoadingSummary(true);
    try {
      await archiveOrderStorageFolder(token, orderNo, folderType);
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ordner konnte nicht archiviert werden");
      setLoadingSummary(false);
    }
  }

  async function handleMoveRawToCustomerFolder() {
    if (!orderNo || !token) return;
    if (!window.confirm("Rohmaterial in den Kundenordner unter Unbearbeitete verschieben?")) return;
    setLoadingSummary(true);
    try {
      await moveRawMaterialToCustomerFolder(token, orderNo);
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rohmaterial konnte nicht verschoben werden");
      setLoadingSummary(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-6 text-center text-sm text-[var(--ink-3)]">
        Bitte anmelden um fortzufahren.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header mit Aktionen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink-1)]">Dateiverwaltung #{orderNo}</h2>
          {orderAddress && <p className="text-sm text-[var(--ink-2)]">{orderAddress}</p>}
          <p className="text-xs text-[var(--ink-3)]">NAS-Ordner verwalten und Dateien hochladen</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleProvision}
            disabled={loadingSummary}
            className="bd-btn-primary inline-flex items-center gap-2"
          >
            <HardDrive className="h-4 w-4" />
            Ordner automatisch erstellen
          </button>
          <button
            type="button"
            onClick={loadSummary}
            disabled={loadingSummary}
            className="bd-btn-outline-gold inline-flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loadingSummary ? "animate-spin" : ""}`} />
            Aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* NAS Health Status */}
      {summary?.roots && summary.roots.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.roots.filter((r) => r.key !== "stagingRoot").map((root) => {
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
                className={`rounded-lg border p-3 ${root.ok ? "border-[var(--border)] bg-[var(--paper)]" : "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"}`}
              >
                <div className="text-sm font-semibold text-[var(--ink-1)]">{root.key}</div>
                <div className="mt-1 text-xs text-[var(--ink-3)] break-all font-mono">{root.path}</div>
                <div className={`mt-1.5 text-xs font-semibold ${root.ok ? "text-emerald-600" : "text-red-500"}`}>
                  {root.ok ? "✓ OK" : `✗ ${friendlyError}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ordner-Karten */}
      <div className="grid gap-4 lg:grid-cols-2">
        {(summary?.folders || []).map((folder) => {
          const ft = folder.folderType as "raw_material" | "customer_folder";
          const browser = browsers[ft] ?? defaultBrowserState();
          const rootOk = summary?.roots?.find(
            (r) => r.key === (ft === "raw_material" ? "rawRoot" : "customerRoot")
          )?.ok === true;
          const pathSegments = browser.relativePath ? browser.relativePath.split("/").filter(Boolean) : [];
          const statusMeta = getFolderStatusMeta(folder.status, folder.exists);

          return (
            <div key={ft} className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--ink-1)]">{formatFolderLabel(ft)}</h3>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {folder.exists && (
                    <button
                      type="button"
                      onClick={() => void openContentModal(ft, folder.displayName)}
                      className="bd-btn-ghost text-xs"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Inhalt
                    </button>
                  )}
                  {ft === "raw_material" ? (
                    <button
                      type="button"
                      onClick={() => void handleMoveRawToCustomerFolder()}
                      disabled={loadingSummary}
                      className="bd-btn-ghost text-xs"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Verschieben nach Kundenordner unbearbeitet
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleArchive(ft)}
                      className="bd-btn-ghost text-xs"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archivieren
                    </button>
                  )}
                  {ft === "customer_folder" && folder.exists && (
                    <button
                      type="button"
                      onClick={() => void handleGenerateWebsite()}
                      disabled={generatingWebsite}
                      className="bd-btn-outline-gold text-xs"
                    >
                      {generatingWebsite
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : websiteSuccess
                          ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                          : <ImageIcon className="h-3.5 w-3.5" />}
                      {websiteSuccess ? "Gestartet!" : "Websize"}
                    </button>
                  )}
                </div>
              </div>
              {ft === "customer_folder" && websiteError && (
                <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
                  {websiteError}
                </div>
              )}

              <div className="mt-3 space-y-1 text-sm">
                <div className="text-[var(--ink-2)]">{folder.displayName}</div>
                <div className="text-xs text-[var(--ink-3)] break-all font-mono">{folder.relativePath}</div>
                {folder.lastError && (
                  <div className="text-xs text-red-500">
                    {/EACCES|permission denied/i.test(folder.lastError)
                      ? "Kein Zugriff auf den NAS-Ordner – Mount prüfen"
                      : /ENOENT|no such file/i.test(folder.lastError)
                        ? "Ordner nicht gefunden – NAS-Mount prüfen"
                        : folder.lastError}
                  </div>
                )}
              </div>

              {/* Nextcloud-Freigabelink (nur für Kundenordner) */}
              {ft === "customer_folder" && (
                <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                    <Link2 className="h-3.5 w-3.5" />
                    Nextcloud-Freigabelink
                  </p>
                  {folder.nextcloudShareUrl ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-2)] font-mono">
                          {folder.nextcloudShareUrl}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyShare(folder.nextcloudShareUrl!)}
                          title="Link kopieren"
                          className="shrink-0 rounded p-1 text-[var(--ink-3)] transition hover:text-[var(--ink-1)]"
                        >
                          {copiedShare ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <a
                          href={folder.nextcloudShareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Link öffnen"
                          className="shrink-0 rounded p-1 text-[var(--ink-3)] transition hover:text-[var(--ink-1)]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      {shareError && <p className="text-xs text-red-500">{shareError}</p>}
                      <button
                        type="button"
                        onClick={() => void handleGenerateShare()}
                        disabled={generatingShare}
                        className="text-xs text-[var(--ink-3)] underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        {generatingShare ? "Erneuern..." : "Link erneuern"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--ink-3)]">Noch kein Freigabelink vorhanden.</p>
                      {shareError && <p className="text-xs text-red-500">{shareError}</p>}
                      {!folder.exists && (
                        <p className="text-xs text-[var(--ink-2)]">Ordner wird bei Bedarf automatisch erstellt.</p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleGenerateShare()}
                        disabled={generatingShare}
                        className="bd-btn-outline-gold text-xs"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {generatingShare ? "Wird erstellt..." : "Nextcloud-Link generieren"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Ordner verknüpfen */}
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                    Bestehenden Ordner verknüpfen
                  </p>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={renameOn[ft] ?? false}
                      onChange={(e) => setRenameOn((cur) => ({ ...cur, [ft]: e.target.checked }))}
                      className="h-3.5 w-3.5 accent-[var(--gold-500)]"
                    />
                    Umbenennen
                  </label>
                </div>

                {renameOn[ft] && (
                  <div className="rounded-md border border-[var(--gold-300)]/30 bg-[var(--gold-50)]/50 px-3 py-2 text-xs text-[var(--ink-2)]">
                    Ordner wird umbenannt zu:{" "}
                    <span className="font-mono font-semibold text-[var(--ink-1)]">{folder.displayName}</span>
                  </div>
                )}

                {renameWarnings[ft] && (
                  <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400">
                    ⚠ {renameWarnings[ft]}
                  </div>
                )}

                {/* NAS-File-Browser */}
                {rootOk ? (
                  <div className="rounded-md border border-[var(--border)]">
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                      <span className="text-xs font-medium text-[var(--ink-2)]">
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
                        className={`text-xs font-semibold transition ${browser.open ? "text-[var(--gold-600)]" : "text-[var(--ink-3)] hover:text-[var(--ink-1)]"}`}
                      >
                        {browser.open ? "Schließen" : "Öffnen"}
                      </button>
                    </div>

                    {browser.open && (
                      <>
                        <div className="flex items-center gap-0 overflow-x-auto border-b border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void browseFolder(ft, "")}
                            className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[var(--gold-600)] hover:bg-[var(--gold-50)]"
                          >
                            <House className="h-3 w-3" />
                            {ft === "raw_material" ? "Raw-Root" : "Kunden-Root"}
                          </button>
                          {pathSegments.map((seg, idx) => {
                            const segPath = pathSegments.slice(0, idx + 1).join("/");
                            const isLast = idx === pathSegments.length - 1;
                            return (
                              <span key={segPath} className="flex shrink-0 items-center">
                                <ChevronRight className="h-3 w-3 text-[var(--ink-3)]" />
                                {isLast ? (
                                  <span className="rounded px-2 py-1 text-xs font-semibold text-[var(--ink-1)]">{seg}</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="rounded px-2 py-1 text-xs font-semibold text-[var(--gold-600)] hover:bg-[var(--gold-50)]"
                                    onClick={() => void browseFolder(ft, segPath)}
                                  >
                                    {seg}
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>

                        <div className="max-h-48 overflow-y-auto">
                          {browser.parentPath != null && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 text-left text-sm hover:bg-[var(--paper-strip)] transition"
                              onClick={() => void browseFolder(ft, browser.parentPath ?? "")}
                            >
                              <span className="text-[var(--ink-3)]">↩</span>
                              <span className="italic text-[var(--ink-3)]">..</span>
                            </button>
                          )}
                          {browser.loading ? (
                            <div className="flex items-center gap-2 px-4 py-5 text-sm text-[var(--ink-3)]">
                              <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
                            </div>
                          ) : browser.error ? (
                            <div className="px-4 py-4 text-xs text-red-500">{browser.error}</div>
                          ) : browser.entries.length === 0 ? (
                            <div className="px-4 py-5 text-sm text-[var(--ink-3)]">
                              Keine Unterordner – dieser Ordner kann direkt verknüpft werden.
                            </div>
                          ) : (
                            browser.entries.map((entry, idx) => (
                              <button
                                key={entry.relativePath}
                                type="button"
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--paper-strip)] transition ${idx < browser.entries.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                                onClick={() => void browseFolder(ft, entry.relativePath)}
                              >
                                <FolderOpen className="h-4 w-4 shrink-0 text-[var(--gold-600)]" />
                                <span className="flex-1 truncate font-medium text-[var(--ink-1)]">{entry.name}</span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
                              </button>
                            ))
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--paper-strip)] px-4 py-2.5">
                          <span className="truncate text-xs text-[var(--ink-3)]">
                            {browser.relativePath || (ft === "raw_material" ? "Raw-Root" : "Kunden-Root")}
                          </span>
                          <button
                            type="button"
                            disabled={loadingSummary}
                            onClick={() => void handleLink(ft, browser.relativePath)}
                            className="ml-3 shrink-0 bd-btn-primary text-xs"
                          >
                            <HardDrive className="h-3.5 w-3.5" />
                            Diesen Ordner verknüpfen
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400">
                    <span className="mt-px shrink-0">⚠</span>
                    <span>NAS nicht erreichbar – Ordner nur manuell per Pfad verknüpfbar (siehe unten).</span>
                  </div>
                )}

                {/* Manuell per Pfad */}
                <div className="rounded-md border border-[var(--border)] bg-[var(--paper-strip)] p-3">
                  <p className="mb-2 text-xs font-medium text-[var(--ink-2)]">
                    <HardDrive className="mr-1 inline h-3.5 w-3.5" />
                    Pfad manuell eingeben
                  </p>
                  <p className="mb-2 text-[10px] text-[var(--ink-3)]">
                    Relativer Pfad ab {ft === "raw_material" ? "Raw-Root" : "Kunden-Root"}, z.B.{" "}
                    <span className="font-mono">{ft === "raw_material" ? "8000 Zürich, Musterstrasse 1 #1234" : "Musterfirma/8000 Zürich, Musterstrasse 1 #1234"}</span>
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={linkInputs[ft] || ""}
                      onChange={(event) => setLinkInputs((current) => ({ ...current, [ft]: event.target.value }))}
                      placeholder={ft === "raw_material" ? "PLZ Ort, Strasse Nr #Auftragsnummer" : "Firma/PLZ Ort, Strasse Nr #Auftragsnummer"}
                      className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink-1)] outline-none transition focus:border-[var(--gold-500)] focus:ring-2 focus:ring-[var(--gold-500)]/20"
                    />
                    <button
                      type="button"
                      onClick={() => void handleLink(ft)}
                      disabled={loadingSummary || !linkInputs[ft]?.trim()}
                      className="shrink-0 bd-btn-primary text-sm disabled:opacity-40"
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
              className="bd-btn-ghost text-xs"
            >
              ← Ordner-Typ wählen
            </button>
          </div>
          <UploadTool
            key={`${orderNo}-${selectedFolderType}`}
            token={token}
            orderNo={orderNo}
            folderType={selectedFolderType}
            embedded
            onChanged={loadSummary}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-6">
          <h3 className="mb-4 text-center text-lg font-semibold text-[var(--ink-1)]">
            Upload-Ziel wählen
          </h3>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setSelectedFolderType("raw_material")}
              className="group flex w-56 flex-col items-center gap-3 rounded-lg border-2 border-[var(--border)] bg-[var(--paper)] px-6 py-6 transition hover:border-[var(--gold-500)] hover:bg-[var(--gold-50)]"
            >
              <ImageIcon className="h-8 w-8 text-[var(--ink-3)] transition group-hover:text-[var(--gold-600)]" />
              <span className="text-base font-semibold text-[var(--ink-1)]">Rohmaterial</span>
              <span className="text-xs text-[var(--ink-3)]">Unbearbeitete Bilder & Videos</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFolderType("customer_folder")}
              className="group flex w-56 flex-col items-center gap-3 rounded-lg border-2 border-[var(--border)] bg-[var(--paper)] px-6 py-6 transition hover:border-[var(--gold-500)] hover:bg-[var(--gold-50)]"
            >
              <FolderOpen className="h-8 w-8 text-[var(--ink-3)] transition group-hover:text-[var(--gold-600)]" />
              <span className="text-base font-semibold text-[var(--ink-1)]">Kundenordner</span>
              <span className="text-xs text-[var(--ink-3)]">Finale Lieferung an den Kunden</span>
            </button>
          </div>
        </div>
      )}

      {/* Ordner-Inhalt Modal */}
      {contentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-[var(--border)] bg-[var(--paper)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-xs text-[var(--ink-3)]">Ordner-Inhalt</p>
                <h3 className="text-sm font-semibold text-[var(--ink-1)]">{contentModal.displayName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setContentModal(null)}
                className="rounded-md p-1.5 text-[var(--ink-3)] transition hover:bg-[var(--paper-strip)] hover:text-[var(--ink-1)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {contentModal.loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-[var(--ink-3)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Ordner wird geladen …
                </div>
              ) : contentModal.error ? (
                <div className="py-6 text-sm text-red-500">{contentModal.error}</div>
              ) : contentModal.tree.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--ink-3)]">Ordner ist leer.</div>
              ) : (
                <div className="space-y-0.5">
                  {contentModal.tree.map((node) => (
                    <TreeNode key={node.relativePath} node={node} depth={0} />
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)] px-5 py-3 text-right">
              <button
                type="button"
                onClick={() => setContentModal(null)}
                className="bd-btn-ghost"
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
