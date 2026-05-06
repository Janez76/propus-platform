/**
 * Buchhaltungs-Pipeline-Übersicht & Approval-UI (Block 4 — propus-bookkeeper).
 *
 * Funktionen:
 *  - Status-Übersicht (Live-Counts vom Backend-Proxy)
 *  - Tab-Navigation zu allen Pipeline-Stages
 *  - Liste der Belege pro Status
 *  - Inline-Edit der Custom Fields (Lieferant, Datum, Betrag, Konten, ...)
 *  - 1-Klick Approve / Reject / Spam / Delete (mit/ohne bexio-Storno)
 *  - Bulk-Aktionen über Checkboxen
 *  - User-Korrektur wird in `core.bookkeeper_feedback` gespeichert für Few-Shot-Lerntag
 *
 * Backend: /api/admin/bookkeeper/* (booking/bookkeeper-routes.js)
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  BookOpenCheck, Sparkles, GitMerge, FileSearch, AlertTriangle, Trash, Trash2,
  CheckCircle, ExternalLink, RefreshCw, Save, X, Edit3, ArrowLeft, Eye,
  ChevronLeft, ChevronRight,
} from "lucide-react";

const PAPERLESS_BASE = "https://paperless.propus.ch";

type StatusKey = "pending"|"vorgeschlagen"|"approved"|"verbucht"|"fehler"|"spam"|"abgleich"|"duplikat";
type TabId = "overview" | StatusKey | "training";

interface BelegeRow {
  id: number;
  title: string;
  added: string;
  created: string;
  tags: number[];
  custom_fields: Record<string, unknown>;
}

interface Counts {
  pending: number; vorgeschlagen: number; approved: number; verbucht: number;
  fehler: number; spam: number; abgleich: number; duplikat: number;
}

const FIELD_LABELS: Record<number, { label: string; type: "text"|"number"|"date"|"select"; options?: string[] }> = {
  2:  { label: "Belegart", type: "select", options: ["quittung","lief_rechnung","bankauszug","spesenbeleg","gutschrift","sonstiges"] },
  3:  { label: "Beleg-Datum", type: "date" },
  4:  { label: "Beleg-Nr", type: "text" },
  5:  { label: "Lieferant", type: "text" },
  6:  { label: "Betrag (brutto)", type: "number" },
  7:  { label: "Währung", type: "text" },
  8:  { label: "MwSt gesamt", type: "number" },
  10: { label: "Soll-Konto", type: "text" },
  11: { label: "Haben-Konto", type: "text" },
  12: { label: "Buchungstext", type: "text" },
  13: { label: "Confidence", type: "number" },
  14: { label: "bexio-Buchungs-ID", type: "text" },
  15: { label: "Status", type: "select", options: ["pending","vorgeschlagen","manuell_pruefen","approved","verbucht","fehler","privat"] },
  16: { label: "Privat-Anteil CHF", type: "number" },
  17: { label: "Auftrag (Propus)", type: "text" },
  18: { label: "Notiz AI", type: "text" },
};

const TAB_DESC: Record<TabId, { title: string; help: string; icon: typeof BookOpenCheck; status?: StatusKey }> = {
  overview:    { title: "Übersicht", help: "Status-Counts pro Pipeline-Stage", icon: BookOpenCheck },
  pending:     { title: "Pending", help: "In Cascade-Queue, KI noch nicht durch", icon: RefreshCw, status: "pending" },
  vorgeschlagen: { title: "Approval-Queue", help: "Warten auf manuelle Freigabe → bexio-Push", icon: Sparkles, status: "vorgeschlagen" },
  approved:    { title: "Approved", help: "Freigegeben, Container pollt für bexio-Push", icon: CheckCircle, status: "approved" },
  verbucht:    { title: "Verbucht", help: "Erfolgreich in bexio gebucht", icon: CheckCircle, status: "verbucht" },
  duplikat:    { title: "Duplikate prüfen", help: "Mögliche Duplikate / Rechnung↔Mahnung", icon: GitMerge, status: "duplikat" },
  abgleich:    { title: "Bankauszüge", help: "Nur Referenz, keine bexio-Buchung", icon: FileSearch, status: "abgleich" },
  fehler:      { title: "Fehler", help: "Pipeline-Crash, manuell prüfen", icon: AlertTriangle, status: "fehler" },
  spam:        { title: "Spam", help: "Kein Beleg (Werbung, Marketing)", icon: Trash, status: "spam" },
  training:    { title: "KI-Training", help: "Sammlung User-Korrekturen — werden zu Few-Shot-Beispielen", icon: Sparkles },
};

const TAG_TO_STATUS: Record<number, string> = {
  476: "Pending",
  477: "Vorgeschlagen",
  478: "Approved",
  479: "Verbucht",
  480: "Fehler",
  482: "Spam",
  483: "Bankauszug",
  484: "Duplikat-Verdacht",
};

function statusFromTags(tags: number[]): string {
  for (const t of tags) {
    if (TAG_TO_STATUS[t]) return TAG_TO_STATUS[t];
  }
  return "—";
}

function parseRelatedIds(notizAi: unknown): number[] {
  if (notizAi == null) return [];
  const text = String(notizAi);
  const matches = text.match(/\b\d{2,}\b/g) || [];
  return Array.from(new Set(matches.map(Number))).filter((n) => Number.isFinite(n) && n > 0);
}

const PAPERLESS_VIEW_LINKS: Record<TabId, string> = {
  overview: `${PAPERLESS_BASE}/dashboard`,
  pending: `${PAPERLESS_BASE}/documents?tags__id__all=475,476`,
  vorgeschlagen: `${PAPERLESS_BASE}/documents?tags__id__all=475,477`,
  approved: `${PAPERLESS_BASE}/documents?tags__id__all=475,478`,
  verbucht: `${PAPERLESS_BASE}/documents?tags__id__all=475,479`,
  duplikat: `${PAPERLESS_BASE}/documents?tags__id__all=484`,
  abgleich: `${PAPERLESS_BASE}/documents?tags__id__all=475,483`,
  fehler: `${PAPERLESS_BASE}/documents?tags__id__all=475,480`,
  spam: `${PAPERLESS_BASE}/documents?tags__id__all=475,482`,
  training: `${PAPERLESS_BASE}/dashboard`,
};

export function AdminBookkeeperPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [docs, setDocs] = useState<BelegeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingFields, setEditingFields] = useState<Record<number, unknown>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<unknown[]>([]);
  const [feedbackDebug, setFeedbackDebug] = useState<{
    database_url_set?: boolean;
    pool_available?: boolean;
    table_exists?: boolean | null;
    migration_applied?: boolean | null;
    row_count?: number | null;
    last_row_at?: string | null;
    error?: string | null;
  } | null>(null);
  const [relatedDocs, setRelatedDocs] = useState<Record<number, BelegeRow[]>>({});
  const [duplicateReason, setDuplicateReason] = useState<Record<number, string>>({});
  const [duplicateBusyId, setDuplicateBusyId] = useState<number | null>(null);

  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const [tabScroll, setTabScroll] = useState({ left: false, right: false });
  const updateTabScroll = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setTabScroll((s) => (s.left === left && s.right === right ? s : { left, right }));
  }, []);
  useEffect(() => {
    updateTabScroll();
    const el = tabsScrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateTabScroll, { passive: true });
    window.addEventListener("resize", updateTabScroll);
    return () => {
      el.removeEventListener("scroll", updateTabScroll);
      window.removeEventListener("resize", updateTabScroll);
    };
  }, [updateTabScroll]);
  const scrollTabsBy = (delta: number) => {
    tabsScrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  const loadCounts = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/bookkeeper/counts", { credentials: "include" });
      if (r.status === 503) {
        setError("Backend nicht konfiguriert (PAPERLESS_BOOKKEEPER_TOKEN fehlt)");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setCounts(j.counts || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konnte Counts nicht laden");
    }
  }, []);

  const loadDocs = useCallback(async (status: StatusKey) => {
    setLoading(true); setError(null); setSelected(new Set());
    try {
      const r = await fetch(`/api/admin/bookkeeper/documents?status=${status}&limit=200`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setDocs(j.results || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste-Fehler");
    } finally { setLoading(false); }
  }, []);

  const loadFeedback = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [listRes, debugRes] = await Promise.all([
        fetch(`/api/admin/bookkeeper/feedback`, { credentials: "include" }),
        fetch(`/api/admin/bookkeeper/feedback/debug`, { credentials: "include" }),
      ]);
      const debugJson = await debugRes.json().catch(() => null);
      setFeedbackDebug(debugJson);

      if (listRes.ok) {
        const j = await listRes.json();
        setFeedback(j.results || []);
      } else {
        setFeedback([]);
        const txt = await listRes.text().catch(() => "");
        setError(`Feedback-Liste: HTTP ${listRes.status}${txt ? ` — ${txt.slice(0, 200)}` : ""}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feedback-Lade-Fehler");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadCounts(); }, [loadCounts]);

  useEffect(() => {
    const desc = TAB_DESC[activeTab];
    if (desc.status) void loadDocs(desc.status);
    else if (activeTab === "training") void loadFeedback();
    else setDocs([]);
  }, [activeTab, loadDocs, loadFeedback]);

  useEffect(() => {
    if (activeTab !== "duplikat") { setRelatedDocs({}); return; }
    if (docs.length === 0) { setRelatedDocs({}); return; }
    let cancelled = false;
    (async () => {
      const idsPerDoc = new Map<number, number[]>();
      const allIds = new Set<number>();
      for (const d of docs) {
        const cf = d.custom_fields as Record<string, unknown>;
        const ids = parseRelatedIds(cf[18]).filter((rid) => rid !== d.id);
        idsPerDoc.set(d.id, ids);
        ids.forEach((id) => allIds.add(id));
      }
      const cache: Record<number, BelegeRow | null> = {};
      await Promise.all(Array.from(allIds).map(async (rid) => {
        try {
          const r = await fetch(`/api/admin/bookkeeper/documents/${rid}`, { credentials: "include" });
          if (!r.ok) { cache[rid] = null; return; }
          const j = await r.json();
          const flatCf = (j.custom_fields || []).reduce(
            (acc: Record<string, unknown>, cf: { field: number; value: unknown }) => {
              acc[cf.field] = cf.value; return acc;
            }, {} as Record<string, unknown>);
          cache[rid] = {
            id: j.id, title: j.title, added: j.added, created: j.created,
            tags: j.tags || [], custom_fields: flatCf,
          };
        } catch { cache[rid] = null; }
      }));
      if (cancelled) return;
      const map: Record<number, BelegeRow[]> = {};
      for (const d of docs) {
        const ids = idsPerDoc.get(d.id) || [];
        map[d.id] = ids.map((rid) => cache[rid]).filter((x): x is BelegeRow => Boolean(x));
      }
      setRelatedDocs(map);
    })();
    return () => { cancelled = true; };
  }, [activeTab, docs]);

  const action = useCallback(async (key: string, fn: () => Promise<unknown>, refreshAfter = true) => {
    setBusyAction(key); setError(null);
    try {
      await fn();
      if (refreshAfter) {
        await loadCounts();
        const desc = TAB_DESC[activeTab];
        if (desc.status) await loadDocs(desc.status);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    } finally { setBusyAction(null); }
  }, [activeTab, loadCounts, loadDocs]);

  const approve = (id: number) => action(`approve-${id}`, async () => {
    const r = await fetch(`/api/admin/bookkeeper/documents/${id}/approve`, { method: "POST", credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
  const reject = (id: number) => action(`reject-${id}`, async () => {
    const r = await fetch(`/api/admin/bookkeeper/documents/${id}/reject`, { method: "POST", credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
  const markSpam = (id: number) => action(`spam-${id}`, async () => {
    const r = await fetch(`/api/admin/bookkeeper/documents/${id}/spam`, { method: "POST", credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
  const deleteDoc = (id: number, alsoBexio: boolean) => {
    const msg = alsoBexio ? "Beleg + bexio-Buchung wirklich löschen/stornieren?" : "Beleg in Paperless-Trash schieben?";
    if (!window.confirm(msg)) return;
    return action(`delete-${id}`, async () => {
      const r = await fetch(
        `/api/admin/bookkeeper/documents/${id}?also_bexio=${alsoBexio ? "1" : "0"}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    });
  };
  const submitDuplicateDecision = async (
    docId: number,
    isDuplicate: boolean,
    originalNotiz: string,
  ) => {
    const reason = (duplicateReason[docId] || "").trim();
    if (isDuplicate) {
      if (!window.confirm("Beleg als Duplikat bestätigen und in Paperless-Trash schieben?")) return;
    }
    setDuplicateBusyId(docId); setError(null);
    try {
      const fbRes = await fetch("/api/admin/bookkeeper/feedback", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: docId,
          field_id: 18,
          original_value: originalNotiz || null,
          corrected_value: isDuplicate ? "ist_duplikat" : "kein_duplikat",
          reason: reason || null,
        }),
      });
      if (!fbRes.ok) {
        const j = await fbRes.json().catch(() => ({}));
        throw new Error(`KI-Training-Feedback nicht gespeichert (HTTP ${fbRes.status}): ${j.error || ""}`);
      }
      if (isDuplicate) {
        const r = await fetch(`/api/admin/bookkeeper/documents/${docId}?also_bexio=0`, {
          method: "DELETE", credentials: "include",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } else {
        const r = await fetch(`/api/admin/bookkeeper/documents/${docId}/reject`, {
          method: "POST", credentials: "include",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }
      setDuplicateReason((m) => { const c = { ...m }; delete c[docId]; return c; });
      await loadCounts();
      await loadDocs("duplikat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    } finally { setDuplicateBusyId(null); }
  };

  const bulkApprove = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`${selected.size} Belege approven?`)) return;
    return action("bulk-approve", async () => {
      for (const id of selected) {
        await fetch(`/api/admin/bookkeeper/documents/${id}/approve`, { method: "POST", credentials: "include" });
      }
    });
  };
  const bulkRecascade = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`${selected.size} ausgewählte Belege zurück in Cascade-Queue?`)) return;
    return action("bulk-recascade", async () => {
      const r = await fetch(`/api/admin/bookkeeper/recascade-bulk`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_ids: Array.from(selected) }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json().catch(() => ({}));
      if (Array.isArray(data.failed) && data.failed.length > 0) {
        const ids = data.failed.map((f: { id: number }) => f.id).join(", ");
        throw new Error(`${data.migrated}/${selected.size} migriert. Fehler bei IDs: ${ids}`);
      }
    });
  };
  const recascade = () => {
    const desc = TAB_DESC[activeTab]; if (!desc.status) return;
    if (!window.confirm(`Alle ${desc.title}-Belege zurück in Cascade-Queue?`)) return;
    return action("recascade", async () => {
      const r = await fetch(`/api/admin/bookkeeper/recascade`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: desc.status }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    });
  };

  const startEdit = (doc: BelegeRow) => {
    setEditingId(doc.id);
    setEditingFields({ ...(doc.custom_fields as Record<number, unknown>) });
  };
  const cancelEdit = () => { setEditingId(null); setEditingFields({}); };
  const saveEdit = async (origDoc: BelegeRow) => {
    if (editingId === null) return;
    setBusyAction(`save-${editingId}`); setError(null);
    try {
      // 1) Compute diff vs original — sende nur geänderte Felder als feedback
      const orig = origDoc.custom_fields as Record<string, unknown>;
      const changed: Record<number, unknown> = {};
      for (const [k, v] of Object.entries(editingFields)) {
        if (orig[k] !== v) changed[Number(k)] = v;
      }

      // 2) Patch doc with merged values
      const patchRes = await fetch(`/api/admin/bookkeeper/documents/${editingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: editingFields }),
      });
      if (!patchRes.ok) throw new Error(`PATCH HTTP ${patchRes.status}`);

      // 3) For each changed field, send a feedback entry (für KI-Training)
      const failedFields: string[] = [];
      for (const [fidStr, newVal] of Object.entries(changed)) {
        const fid = Number(fidStr);
        const r = await fetch(`/api/admin/bookkeeper/feedback`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc_id: editingId,
            field_id: fid,
            original_value: orig[fidStr] ?? null,
            corrected_value: newVal,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          failedFields.push(`field_id=${fid} (HTTP ${r.status}${j.error ? `: ${j.error}` : ""})`);
        }
      }
      if (failedFields.length > 0) {
        throw new Error(`KI-Training-Feedback nicht gespeichert: ${failedFields.join("; ")}`);
      }

      cancelEdit();
      const desc = TAB_DESC[activeTab];
      if (desc.status) await loadDocs(desc.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally { setBusyAction(null); }
  };

  const desc = TAB_DESC[activeTab];
  const TabIcon = desc.icon;

  return (
    <div className="p-3 sm:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <BookOpenCheck className="w-6 h-6 sm:w-7 sm:h-7 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-semibold leading-tight">Buchhaltung — KI-Cascade</h1>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1">
              Sonnet 4.6 → Opus 4.7 (Eskalation ab confidence&lt;95) · Vision-Cross-Check · Container auf NAS
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {desc.status && desc.status !== "pending" && (
            <button onClick={recascade} disabled={busyAction !== null}
              className="text-sm px-3 py-1.5 border rounded-md hover:bg-amber-50 disabled:opacity-50">
              <RefreshCw className="inline w-4 h-4 mr-1" /> Re-Cascade
            </button>
          )}
          <button onClick={() => void loadCounts()} disabled={loading}
            className="text-sm px-3 py-1.5 border rounded-md hover:bg-neutral-50 disabled:opacity-50">
            <RefreshCw className={loading ? "inline w-4 h-4 animate-spin mr-1" : "inline w-4 h-4 mr-1"} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs — horizontal scrollbar mit Chevron-Buttons */}
      <div className="relative mb-6 border-b">
        {tabScroll.left && (
          <button
            type="button"
            aria-label="Tabs nach links scrollen"
            onClick={() => scrollTabsBy(-200)}
            className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-1 bg-linear-to-r from-white via-white to-transparent"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-600 hover:text-neutral-900" />
          </button>
        )}
        {tabScroll.right && (
          <button
            type="button"
            aria-label="Tabs nach rechts scrollen"
            onClick={() => scrollTabsBy(200)}
            className="absolute right-0 top-0 bottom-0 z-10 flex items-center px-1 bg-linear-to-l from-white via-white to-transparent"
          >
            <ChevronRight className="w-5 h-5 text-neutral-600 hover:text-neutral-900" />
          </button>
        )}
        <div
          ref={tabsScrollRef}
          className="flex gap-1 overflow-x-auto bookkeeper-tabs-scroll [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {(Object.keys(TAB_DESC) as TabId[]).map((id) => {
            const t = TAB_DESC[id];
            const Icon = t.icon;
            const isActive = id === activeTab;
            const c = t.status && counts ? counts[t.status] : undefined;
            return (
              <button key={id} onClick={() => setActiveTab(id)}
                className={"flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition " +
                  (isActive ? "border-amber-700 text-amber-800" : "border-transparent text-neutral-600 hover:text-neutral-900")}>
                <Icon className="w-4 h-4" />
                {t.title}
                {typeof c === "number" && c > 0 && (
                  <span className="ml-1 text-xs bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded">{c}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Help-Banner */}
      <div className="flex items-start gap-3 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-md mb-4">
        <TabIcon className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-amber-900">{desc.title}</div>
          <p className="text-sm text-amber-800 mt-1">{desc.help}</p>
        </div>
        <a href={PAPERLESS_VIEW_LINKS[activeTab]} target="_blank" rel="noopener noreferrer"
          aria-label="Paperless"
          className="flex items-center gap-1 text-sm text-amber-800 hover:underline flex-shrink-0 whitespace-nowrap">
          <ExternalLink className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Paperless</span>
        </a>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 mb-4">{error}</div>
      )}

      {/* Overview-Cards */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ["pending", "Pending", "bg-blue-50 text-blue-900"],
            ["vorgeschlagen", "Vorgeschlagen", "bg-yellow-50 text-yellow-900"],
            ["approved", "Approved", "bg-green-50 text-green-900"],
            ["verbucht", "Verbucht (bexio)", "bg-emerald-100 text-emerald-900"],
            ["abgleich", "Bankauszüge", "bg-cyan-50 text-cyan-900"],
            ["duplikat", "Duplikate", "bg-orange-50 text-orange-900"],
            ["fehler", "Fehler", "bg-red-50 text-red-900"],
            ["spam", "Spam", "bg-neutral-100 text-neutral-700"],
          ] as Array<[StatusKey, string, string]>).map(([key, label, cls]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={"p-4 rounded-md border text-left hover:ring-2 ring-amber-300 transition " + cls}>
              <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
              <div className="text-2xl font-semibold mt-1">{counts ? counts[key] : "—"}</div>
            </button>
          ))}
        </div>
      )}

      {/* Liste */}
      {desc.status && (
        <>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap p-3 bg-amber-100 border border-amber-300 rounded-md mb-3 sticky top-0 z-10">
              <span className="text-sm font-medium">{selected.size} ausgewählt</span>
              <button onClick={bulkApprove} disabled={busyAction !== null}
                className="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                <CheckCircle className="inline w-4 h-4 mr-1" /> Bulk-Approve
              </button>
              <button onClick={bulkRecascade} disabled={busyAction !== null}
                className="text-sm px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                title="Ausgewählte Belege zurück in die Cascade-Queue (pending)">
                <RefreshCw className="inline w-4 h-4 mr-1" /> Bulk-Re-Cascade
              </button>
              <button onClick={() => setSelected(new Set())}
                className="text-sm px-3 py-1 border rounded hover:bg-neutral-50">Auswahl aufheben</button>
            </div>
          )}

          <div className="bg-white border rounded-md overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="p-2 w-8">
                    <input type="checkbox"
                      checked={selected.size > 0 && selected.size === docs.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(docs.map((d) => d.id)) : new Set())} />
                  </th>
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">Datum</th>
                  <th className="p-2 text-left">Lieferant</th>
                  <th className="p-2 text-right">Betrag</th>
                  <th className="p-2 text-left">Soll/Haben</th>
                  <th className="p-2 text-right">Conf</th>
                  <th className="p-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 && !loading && (
                  <tr><td colSpan={8} className="p-6 text-center text-neutral-500">Keine Belege in diesem Status</td></tr>
                )}
                {docs.map((d) => {
                  const cf = d.custom_fields as Record<string, unknown>;
                  const isEditing = editingId === d.id;
                  return (
                    <>
                      <tr key={d.id} className="border-t hover:bg-neutral-50">
                        <td className="p-2">
                          <input type="checkbox" checked={selected.has(d.id)}
                            onChange={(e) => {
                              const s = new Set(selected);
                              if (e.target.checked) s.add(d.id); else s.delete(d.id);
                              setSelected(s);
                            }} />
                        </td>
                        <td className="p-2 font-mono text-xs">
                          <a href={`${PAPERLESS_BASE}/documents/${d.id}/details`} target="_blank" rel="noopener noreferrer"
                            className="text-amber-700 hover:underline">#{d.id}</a>
                        </td>
                        <td className="p-2 whitespace-nowrap">{(cf[3] as string) || "—"}</td>
                        <td className="p-2 truncate max-w-[200px] sm:max-w-xs" title={(cf[5] as string) || ""}>{(cf[5] as string) || "—"}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {cf[6] != null ? `${String(cf[6])} ${String(cf[7] ?? "")}` : "—"}
                        </td>
                        <td className="p-2 text-xs font-mono">{String(cf[10] ?? "?")} / {String(cf[11] ?? "?")}</td>
                        <td className="p-2 text-right">
                          <span className={
                            "px-1.5 py-0.5 rounded text-xs " +
                            (Number(cf[13] ?? 0) >= 85 ? "bg-green-100 text-green-800"
                              : Number(cf[13] ?? 0) >= 70 ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800")
                          }>{String(cf[13] ?? "?")}</span>
                        </td>
                        <td className="p-2">
                          <div className="flex justify-end gap-1 flex-nowrap">
                            {!isEditing && (
                              <>
                                <button onClick={() => startEdit(d)} title="Edit"
                                  className="p-1 hover:bg-neutral-200 rounded"><Edit3 className="w-4 h-4 text-neutral-600" /></button>
                                {desc.status === "vorgeschlagen" && (
                                  <button onClick={() => approve(d.id)} disabled={busyAction !== null} title="Approve"
                                    className="p-1 hover:bg-green-100 rounded disabled:opacity-50">
                                    <CheckCircle className="w-4 h-4 text-green-700" />
                                  </button>
                                )}
                                <button onClick={() => reject(d.id)} disabled={busyAction !== null} title="Re-Cascade"
                                  className="p-1 hover:bg-blue-100 rounded disabled:opacity-50">
                                  <RefreshCw className="w-4 h-4 text-blue-700" />
                                </button>
                                <button onClick={() => markSpam(d.id)} disabled={busyAction !== null} title="Spam"
                                  className="p-1 hover:bg-neutral-200 rounded disabled:opacity-50">
                                  <Trash className="w-4 h-4 text-neutral-600" />
                                </button>
                                <button onClick={() => deleteDoc(d.id, false)} disabled={busyAction !== null} title="Löschen (Trash)"
                                  className="p-1 hover:bg-red-100 rounded disabled:opacity-50">
                                  <Trash2 className="w-4 h-4 text-red-700" />
                                </button>
                                {desc.status === "verbucht" && (
                                  <button onClick={() => deleteDoc(d.id, true)} disabled={busyAction !== null}
                                    title="Löschen + bexio-Storno"
                                    className="p-1 hover:bg-red-200 rounded disabled:opacity-50">
                                    <Trash2 className="w-4 h-4 text-red-900" />
                                    <span className="text-xs">+B</span>
                                  </button>
                                )}
                              </>
                            )}
                            {isEditing && (
                              <>
                                <button onClick={() => saveEdit(d)} disabled={busyAction !== null} title="Speichern"
                                  className="p-1 hover:bg-green-100 rounded disabled:opacity-50">
                                  <Save className="w-4 h-4 text-green-700" />
                                </button>
                                <button onClick={cancelEdit} title="Abbrechen"
                                  className="p-1 hover:bg-neutral-200 rounded"><X className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr key={`edit-${d.id}`} className="border-t bg-amber-50/40">
                          <td colSpan={8} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {Object.entries(FIELD_LABELS).map(([fidStr, info]) => {
                                const fid = Number(fidStr);
                                const v = editingFields[fid];
                                return (
                                  <div key={fid}>
                                    <label className="block text-xs font-medium text-neutral-600 mb-0.5">{info.label}</label>
                                    {info.type === "select" ? (
                                      <select value={(v as string) || ""}
                                        onChange={(e) => setEditingFields({ ...editingFields, [fid]: e.target.value })}
                                        className="w-full px-2 py-1 text-sm border rounded">
                                        <option value="">—</option>
                                        {info.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                                      </select>
                                    ) : (
                                      <input type={info.type === "date" ? "date" : info.type === "number" ? "number" : "text"}
                                        value={v == null ? "" : String(v)}
                                        onChange={(e) => setEditingFields({
                                          ...editingFields,
                                          [fid]: info.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value,
                                        })}
                                        className="w-full px-2 py-1 text-sm border rounded" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <p className="mt-3 text-xs text-amber-800">
                              Änderungen werden in Paperless gespeichert UND als KI-Trainings-Sample in <code>core.bookkeeper_feedback</code> persistiert.
                            </p>
                          </td>
                        </tr>
                      )}
                      {activeTab === "duplikat" && !isEditing && (() => {
                        const notiz = String((cf[18] as string) || "");
                        const partners = relatedDocs[d.id] || [];
                        const parsedIds = parseRelatedIds(notiz).filter((rid) => rid !== d.id);
                        const decisionBusy = duplicateBusyId === d.id;
                        const compareCols: Array<[number, string]> = [
                          [2, "Belegart"], [3, "Datum"], [4, "Beleg-Nr"], [5, "Lieferant"],
                          [6, "Betrag"], [7, "Währung"], [10, "Soll"], [11, "Haben"], [13, "Conf"],
                        ];
                        return (
                          <tr key={`dup-${d.id}`} className="border-t bg-orange-50/40">
                            <td colSpan={8} className="p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <GitMerge className="w-4 h-4 text-orange-700" />
                                <span className="font-medium text-orange-900">Duplikat-Vergleich</span>
                                {parsedIds.length > 0 && (
                                  <span className="text-xs text-orange-700">
                                    Container vermutet Verwandtschaft mit: {parsedIds.map((rid) => `#${rid}`).join(", ")}
                                  </span>
                                )}
                              </div>
                              {notiz && (
                                <div className="mb-3 p-2 bg-orange-100/60 border border-orange-200 rounded text-xs text-orange-900">
                                  <span className="font-medium">Notiz AI:</span> {notiz}
                                </div>
                              )}
                              {parsedIds.length === 0 && (
                                <p className="text-sm text-neutral-600 mb-3">
                                  Keine Doc-IDs in <code>notiz_ai</code> gefunden — Tag wurde evtl. manuell gesetzt.
                                </p>
                              )}
                              {parsedIds.length > 0 && partners.length === 0 && (
                                <p className="text-sm text-neutral-500 mb-3 italic">Lade verwandte Belege …</p>
                              )}
                              {partners.length > 0 && (
                                <div className="overflow-x-auto mb-3">
                                  <table className="w-full text-xs border">
                                    <thead className="bg-orange-100">
                                      <tr>
                                        <th className="p-1.5 text-left font-medium">Feld</th>
                                        <th className="p-1.5 text-left font-medium">
                                          <a href={`${PAPERLESS_BASE}/documents/${d.id}/details`} target="_blank" rel="noopener noreferrer"
                                            className="text-orange-800 hover:underline">
                                            #{d.id} (dieser Beleg)
                                          </a>
                                        </th>
                                        {partners.map((p) => (
                                          <th key={p.id} className="p-1.5 text-left font-medium">
                                            <a href={`${PAPERLESS_BASE}/documents/${p.id}/details`} target="_blank" rel="noopener noreferrer"
                                              className="text-orange-800 hover:underline">
                                              #{p.id}
                                            </a>
                                            <span className="ml-1 text-[10px] text-neutral-600 font-normal">({statusFromTags(p.tags)})</span>
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {compareCols.map(([fid, label]) => {
                                        const ownVal = (cf[fid] as unknown);
                                        return (
                                          <tr key={fid} className="border-t">
                                            <td className="p-1.5 font-medium text-neutral-700">{label}</td>
                                            <td className="p-1.5 font-mono">{ownVal == null || ownVal === "" ? "—" : String(ownVal)}</td>
                                            {partners.map((p) => {
                                              const pcf = p.custom_fields as Record<string, unknown>;
                                              const pVal = pcf[fid];
                                              const same = String(ownVal ?? "") === String(pVal ?? "")
                                                && (ownVal != null && ownVal !== "");
                                              return (
                                                <td key={p.id} className={"p-1.5 font-mono " + (same ? "bg-yellow-100" : "")}>
                                                  {pVal == null || pVal === "" ? "—" : String(pVal)}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              <label className="block text-xs font-medium text-neutral-700 mb-1">
                                Begründung (fließt als Trainings-Sample in <code>core.bookkeeper_feedback</code> ein)
                              </label>
                              <textarea
                                value={duplicateReason[d.id] || ""}
                                onChange={(e) => setDuplicateReason({ ...duplicateReason, [d.id]: e.target.value })}
                                placeholder="z.B. 'Beleg-Nr identisch, gleicher Betrag, gleicher Lieferant — eindeutig dieselbe Rechnung' oder 'Mahnung zu #1234'"
                                rows={2}
                                className="w-full text-sm border rounded p-2 mb-3"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => submitDuplicateDecision(d.id, true, notiz)}
                                  disabled={decisionBusy || busyAction !== null}
                                  className="text-sm px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                                  title="Bestätigen → Beleg in Paperless-Trash + Begründung als Feedback"
                                >
                                  <Trash2 className="w-4 h-4" /> Ja, ist Duplikat → löschen
                                </button>
                                <button
                                  onClick={() => submitDuplicateDecision(d.id, false, notiz)}
                                  disabled={decisionBusy || busyAction !== null}
                                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                                  title="Ablehnen → Beleg zurück in Cascade-Queue, Tag wird neu evaluiert"
                                >
                                  <RefreshCw className="w-4 h-4" /> Nein, kein Duplikat → Re-Cascade
                                </button>
                                {decisionBusy && <span className="text-xs text-neutral-500 self-center">…läuft</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Training-Tab */}
      {activeTab === "training" && (
        <div className="bg-white border rounded-md p-3 sm:p-6">
          <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-medium">User-Korrekturen ({feedback.length})</h3>
            <p className="text-sm text-neutral-500">Werden vom Few-Shot-Generator zu Beispielen im Cascade-Prompt eingewoben.</p>
          </div>
          {feedback.length === 0 && (() => {
            const d = feedbackDebug;
            if (!d) return <p className="text-neutral-500 text-sm">Noch keine Korrekturen erfasst.</p>;
            const reasons: string[] = [];
            if (!d.database_url_set) reasons.push("DATABASE_URL nicht gesetzt");
            if (d.database_url_set && !d.pool_available) reasons.push("DB-Pool nicht initialisiert");
            if (d.pool_available && d.table_exists === false) reasons.push("Tabelle core.bookkeeper_feedback fehlt — Migration 060 nicht eingespielt");
            if (d.pool_available && d.migration_applied === false) reasons.push("Migration 060_bookkeeper_feedback.sql nicht in core.applied_migrations");
            if (d.error) reasons.push(`Diagnose-Fehler: ${d.error}`);
            const isHealthy = d.pool_available && d.table_exists && d.row_count === 0;
            return (
              <div className={`text-sm rounded p-3 mb-2 ${isHealthy ? "bg-neutral-50 text-neutral-600" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                {isHealthy ? (
                  <>Tabelle leer — bisher hat noch niemand inline editiert. Sobald ein Feld in einem Beleg geändert &amp; gespeichert wird, erscheint hier ein Eintrag.</>
                ) : (
                  <>
                    <strong>Persistenz-Problem:</strong>
                    <ul className="list-disc pl-5 mt-1">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  </>
                )}
                <details className="mt-2 text-xs text-neutral-500">
                  <summary className="cursor-pointer">Diagnose-Details</summary>
                  <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(d, null, 2)}</pre>
                </details>
              </div>
            );
          })()}
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-neutral-50">
              <tr>
                <th className="p-2 text-left">Doc</th>
                <th className="p-2 text-left">Field</th>
                <th className="p-2 text-left">Original (KI)</th>
                <th className="p-2 text-left">Korrektur</th>
                <th className="p-2 text-left">Wann</th>
                <th className="p-2 text-left">Applied</th>
              </tr>
            </thead>
            <tbody>
              {(feedback as Array<Record<string, unknown>>).slice(0, 100).map((f) => (
                <tr key={String(f.id)} className="border-t">
                  <td className="p-2 font-mono text-xs">#{String(f.doc_id)}</td>
                  <td className="p-2">{String(f.field_name || f.field_id)}</td>
                  <td className="p-2 text-neutral-500 truncate max-w-xs" title={String(f.original_value || "")}>{String(f.original_value || "—")}</td>
                  <td className="p-2 font-medium truncate max-w-xs" title={String(f.corrected_value || "")}>{String(f.corrected_value || "—")}</td>
                  <td className="p-2 text-xs text-neutral-500">{String(f.created_at).slice(0, 16)}</td>
                  <td className="p-2">{f.applied_to_prompt ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminBookkeeperPage;
