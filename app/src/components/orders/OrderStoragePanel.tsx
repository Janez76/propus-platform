"use client";

/**
 * OrderStoragePanel — Dateien-Tab eines Auftrags.
 *
 * Rendert dieselbe Layout-Logik wie die /upload-Seite, nur ohne die linke
 * Auftragsliste — der Auftrag ist via Prop fest vorgegeben. Theme-aware
 * (light/dark) ueber die geteilten --up-*-Tokens in uploads-page.css.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronDown,
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
import { UploadModalForm } from "./UploadModalForm";
import { useAuthStore } from "../../store/authStore";
import "../../styles/uploads-page.css";

type AllFolderType = "raw_material" | "customer_folder" | "selection";

function formatFolderLabel(folderType: AllFolderType): string {
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

const FOLDER_TYPE_ICON: Record<AllFolderType, string> = {
  raw_material: "fa-solid fa-box-archive",
  selection: "fa-solid fa-images",
  customer_folder: "fa-solid fa-folder-tree",
};

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
      <div style={{ paddingLeft: `${depth * 14 + 4}px` }} className="flex items-center gap-2 py-0.5 text-xs text-[var(--up-ink-2)]">
        <File className="h-3 w-3 shrink-0 text-[var(--up-ink-3)]" />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-[var(--up-ink-3)]">{formatBytes(node.size ?? 0)}</span>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        className="flex w-full items-center gap-2 py-0.5 text-left text-xs text-[var(--up-ink-1)] hover:text-[var(--up-gold)]"
      >
        <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <Folder className="h-3 w-3 shrink-0 text-[var(--up-ink-3)]" />
        <span className="truncate">{node.name}</span>
      </button>
      {open ? (
        <div>
          {(node.children ?? []).map((child) => (
            <TreeNode key={`${child.relativePath}-${child.name}`} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
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
  const [moveNotice, setMoveNotice] = useState("");
  const [selectedFolderType, setSelectedFolderType] = useState<OrderFolderType | null>(null);
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

  const [contentModal, setContentModal] = useState<{
    folderType: AllFolderType;
    displayName: string;
    loading: boolean;
    tree: OrderUploadTreeNode[];
    error: string;
  } | null>(null);

  const [browsers, setBrowsers] = useState<Record<string, NasBrowserState>>({
    raw_material: defaultBrowserState(),
    customer_folder: defaultBrowserState(),
    selection: defaultBrowserState(),
  });

  // Folder-Accordion: alles eingeklappt by default.
  const [expandedFolders, setExpandedFolders] = useState<Set<AllFolderType>>(() => new Set());
  const toggleFolderExpanded = useCallback((ft: AllFolderType) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(ft)) next.delete(ft);
      else next.add(ft);
      return next;
    });
  }, []);

  // Mount-Status: collapsible, auto-open bei Fehler.
  const [mountsExpanded, setMountsExpanded] = useState(false);

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

  // Upload-Popup: ESC schliesst, Body-Scroll lock waehrend offen.
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

  async function openContentModal(folderType: AllFolderType, displayName: string) {
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
    async (folderType: AllFolderType, relativePath: string) => {
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

  async function handleLink(folderType: AllFolderType, relativePath?: string) {
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

  async function handleArchive(folderType: AllFolderType) {
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
    setMoveNotice("");
    try {
      const result = await moveRawMaterialToCustomerFolder(token, orderNo);
      if (result.alreadyRunning) {
        setMoveNotice("Rohmaterial-Transfer läuft bereits im Hintergrund. Bitte in Kürze aktualisieren.");
      } else if (result.queued) {
        setMoveNotice("Rohmaterial-Transfer wurde im Hintergrund gestartet. Die Seite bleibt bedienbar; Fortschritt per Aktualisieren prüfen.");
      }
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rohmaterial konnte nicht verschoben werden");
      setLoadingSummary(false);
    }
  }

  const customerFolderExists = useMemo(
    () => (summary?.folders || []).some((f) => f.folderType === "customer_folder" && f.exists),
    [summary],
  );

  if (!token) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-6 text-center text-sm text-[var(--ink-3)]">
        Bitte anmelden um fortzufahren.
      </div>
    );
  }

  return (
    <div className="uploads-page-v2">
      <div className="uppv-main" style={{ padding: "0" }}>

        {/* Summary-Header mit Aktionen */}
        <section className="uppv-summary">
          <div className="uppv-summary-row">
            <div className="uppv-summary-left">
              <span className="uppv-summary-label">Dateien</span>
              <div className="uppv-summary-num">#{orderNo}</div>
              <div className="uppv-summary-addr">{orderAddress || "—"}</div>
              <div className="uppv-summary-customer">Uploade hier direkt das Material in den richtigen Bestellordner.</div>
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
              {customerFolderExists ? (
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
              ) : null}
              <button
                type="button"
                onClick={() => loadSummary()}
                disabled={loadingSummary}
                className="uppv-ghost-btn"
                style={{ alignSelf: "stretch", justifyContent: "center" }}
              >
                <RefreshCw className={`h-4 w-4 ${loadingSummary ? "animate-spin" : ""}`} aria-hidden />
                Aktualisieren
              </button>
            </div>
          </div>

          {error ? <div className="uppv-error-banner">{error}</div> : null}
          {websiteError ? <div className="uppv-error-banner" style={{ marginTop: 8 }}>{websiteError}</div> : null}
          {moveNotice ? (
            <div className="uppv-error-banner" style={{ marginTop: 8, background: "var(--up-status-pending-bg)", borderColor: "var(--up-gold-line)", color: "var(--up-status-pending-fg)" }}>
              {moveNotice}
            </div>
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
                        <div key={root.key} className={`uppv-status-card${root.ok ? "" : " is-err"}`}>
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
                          {!root.ok && <div className="uppv-status-card-msg">{friendlyError}</div>}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })()}
        </section>

        {/* Folder-Accordion */}
        <section className="uppv-folder-grid">
          {(summary?.folders || []).map((folder) => {
            const ft = folder.folderType as AllFolderType;
            const browser = browsers[ft] ?? defaultBrowserState();
            const rootOk = summary?.roots?.find((r) => r.key === folderTypeToRootSummaryKey(ft))?.ok === true;
            const pathSegments = browser.relativePath ? browser.relativePath.split("/").filter(Boolean) : [];
            const isOpen = expandedFolders.has(ft);

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

            return (
              <article key={ft} className={`uppv-folder-card${isOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="uppv-folder-head"
                  onClick={() => toggleFolderExpanded(ft)}
                  aria-expanded={isOpen}
                >
                  <span className="uppv-folder-name">
                    <i className={FOLDER_TYPE_ICON[ft]} aria-hidden />
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
                      {folder.exists ? (
                        <button
                          type="button"
                          onClick={() => void openContentModal(ft, folder.displayName)}
                          className="uppv-action-btn"
                        >
                          <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Inhalt anzeigen
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleArchive(ft)}
                        className="uppv-action-btn is-danger"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden /> Archiviert löschen
                      </button>
                      {ft === "raw_material" && folder.exists ? (
                        <button
                          type="button"
                          onClick={() => void handleMoveRawToCustomerFolder()}
                          className="uppv-action-btn"
                        >
                          <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Verschieben nach Kundenordner
                        </button>
                      ) : null}
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

                    {ft === "customer_folder" ? (
                      <div className="uppv-cloud-block">
                        <span className="uppv-cloud-label">
                          <Link2 className="h-3.5 w-3.5" aria-hidden /> Nextcloud-Freigabelink
                        </span>
                        {folder.nextcloudShareUrl ? (
                          <>
                            <div className="uppv-cloud-row">
                              <input className="uppv-cloud-input" value={folder.nextcloudShareUrl} readOnly />
                              <button
                                type="button"
                                className="uppv-cloud-icon-btn"
                                onClick={() => handleCopyShare(folder.nextcloudShareUrl!)}
                                title="Link kopieren"
                                aria-label="Link kopieren"
                              >
                                {copiedShare ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
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
                            {shareError ? <div className="uppv-cloud-err">{shareError}</div> : null}
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
                            {shareError ? <div className="uppv-cloud-err">{shareError}</div> : null}
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
                    ) : null}

                    <div className="uppv-link-section">
                      <div className="uppv-link-head">
                        <span className="uppv-link-label">Bestehenden Ordner verknüpfen</span>
                        <label className="uppv-rename-check">
                          <input
                            type="checkbox"
                            checked={renameOn[ft] ?? false}
                            onChange={(e) => setRenameOn((cur) => ({ ...cur, [ft]: e.target.checked }))}
                          />
                          Ordner umbenennen
                        </label>
                      </div>

                      {renameOn[ft] ? (
                        <div className="uppv-rename-warn">
                          Ordner wird umbenannt zu: <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{folder.displayName}</strong>
                        </div>
                      ) : null}
                      {renameWarnings[ft] ? <div className="uppv-rename-warn">⚠ {renameWarnings[ft]}</div> : null}

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
                                <Folder className="h-4 w-4" aria-hidden /> NAS durchsuchen
                              </span>
                              <span className="uppv-browse-right">{browser.open ? "Schließen" : "Öffnen"}</span>
                            </button>
                          </div>

                          {browser.open ? (
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
                                {browser.parentPath != null ? (
                                  <button
                                    type="button"
                                    className="uppv-browse-entry is-up"
                                    onClick={() => void browseFolder(ft, browser.parentPath ?? "")}
                                  >
                                    ↩ ..
                                  </button>
                                ) : null}
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
                          ) : null}
                        </>
                      ) : (
                        <div className="uppv-rename-warn">
                          ⚠ NAS nicht erreichbar – Ordner nur manuell per Pfad verknüpfbar (siehe unten).
                        </div>
                      )}

                      <div className="uppv-manual-row">
                        <input
                          type="text"
                          className="uppv-manual-input"
                          value={linkInputs[ft] || ""}
                          onChange={(event) => setLinkInputs((current) => ({ ...current, [ft]: event.target.value }))}
                          placeholder={
                            ft === "raw_material" ? "PLZ Ort, Strasse Nr #Auftrag"
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
                          {ft === "raw_material" ? "/booking_upload_raw" : ft === "selection" ? "Selection-Root" : "/booking_upload_customer"}
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

        {/* Chooser-Karten "Wo willst du hochladen?" */}
        <div className="uppv-summary" style={{ textAlign: "center" }}>
          <h3 className="uppv-summary-label" style={{ marginBottom: 18 }}>Wo willst du hochladen?</h3>
          <div className="uppv-chooser-grid">
            <button
              type="button"
              onClick={() => setSelectedFolderType("raw_material")}
              className="uppv-chooser-card"
            >
              <i className={FOLDER_TYPE_ICON.raw_material} style={{ fontSize: 28, color: "#9a8456" }} aria-hidden />
              <span className="uppv-chooser-title">Rohmaterial</span>
              <span className="uppv-chooser-sub">Unbearbeitete Bilder &amp; Videos</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFolderType("selection")}
              className="uppv-chooser-card"
            >
              <i className={FOLDER_TYPE_ICON.selection} style={{ fontSize: 28, color: "#8a6ba0" }} aria-hidden />
              <span className="uppv-chooser-title">Zur Auswahl</span>
              <span className="uppv-chooser-sub">Bilder, die dem Kunden zur Auswahl gehen</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFolderType("customer_folder")}
              className="uppv-chooser-card"
            >
              <i className={FOLDER_TYPE_ICON.customer_folder} style={{ fontSize: 28, color: "var(--up-gold)" }} aria-hidden />
              <span className="uppv-chooser-title">Kundenordner</span>
              <span className="uppv-chooser-sub">Finale Lieferung an den Kunden</span>
            </button>
          </div>
        </div>
      </div>

      {/* Upload-Popup */}
      {selectedFolderType ? (
        <div
          className="uppv-upload-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="osp-upload-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedFolderType(null);
          }}
          tabIndex={-1}
        >
          <div className="uppv-upload-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="uppv-upload-modal-head">
              <div className="uppv-upload-modal-title" id="osp-upload-modal-title">
                <span className="uppv-up-eyebrow">Upload</span>
                <span className="uppv-up-num">#{orderNo}</span>
                <span className="uppv-up-sep">·</span>
                <span className="uppv-up-target">{formatFolderLabel(selectedFolderType as AllFolderType)}</span>
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

            <div className="uppv-upload-titleblock">
              <div className="uppv-upload-titleblock-icon">
                <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
              </div>
              <div className="uppv-upload-titleblock-text">
                <div className="uppv-upload-titleblock-headline">
                  <span className="uppv-upload-titleblock-label">Upload</span>
                  <span className="uppv-upload-titleblock-num">#{orderNo}</span>
                </div>
                <div className="uppv-upload-titleblock-sub">
                  <span>{orderAddress || "—"}</span>
                  <ChevronRight className="uppv-upload-titleblock-arrow h-3 w-3" aria-hidden />
                  <strong>{formatFolderLabel(selectedFolderType as AllFolderType)}</strong>
                </div>
              </div>
            </div>

            <div className="uppv-upload-modal-body">
              <UploadModalForm
                key={`${orderNo}-${selectedFolderType}`}
                token={token}
                orderNo={orderNo}
                folderType={selectedFolderType}
                address={orderAddress}
                batches={summary?.batches ?? []}
                onChanged={async () => { await loadSummary(); }}
                onClose={() => setSelectedFolderType(null)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Ordner-Inhalt Modal */}
      {contentModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--up-line)] bg-[var(--up-card)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--up-line)] px-5 py-4">
              <div>
                <p className="text-xs text-[var(--up-ink-3)]">Ordner-Inhalt</p>
                <h3 className="text-sm font-semibold text-[var(--up-ink)]">{contentModal.displayName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setContentModal(null)}
                className="rounded-lg p-1.5 text-[var(--up-ink-3)] transition hover:bg-[var(--up-paper-soft)] hover:text-[var(--up-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {contentModal.loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-[var(--up-ink-3)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Ordner wird geladen …
                </div>
              ) : contentModal.error ? (
                <div className="py-6 text-sm text-[var(--up-rust)]">{contentModal.error}</div>
              ) : contentModal.tree.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--up-ink-3)]">Ordner ist leer.</div>
              ) : (
                <div className="space-y-0.5">
                  {contentModal.tree.map((node) => (
                    <TreeNode key={node.relativePath} node={node} depth={0} />
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-[var(--up-line)] px-5 py-3 text-right">
              <button
                type="button"
                onClick={() => setContentModal(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--up-line)] px-4 py-2 text-sm font-medium text-[var(--up-ink)] transition hover:bg-[var(--up-paper-soft)]"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
