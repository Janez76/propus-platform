import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getLinkMatterportBookingSearch,
  getLinkMatterportCustomerDetail,
  getLinkMatterportCustomerSearch,
  getToursAdminLinkMatterport,
  postLinkMatterport,
  postLinkMatterportBatch,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminLinkMatterportQueryKey } from "../../../lib/queryKeys";
import { Tooltip } from "../../../components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../../../components/ui/dialog";

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildQs(sp: URLSearchParams) {
  const n = new URLSearchParams();
  ["q", "page", "sort", "order", "openSpaceId"].forEach((k) => {
    const v = sp.get(k);
    if (v) n.set(k, v);
  });
  return n.toString();
}

function matterportShowUrl(spaceId: string) {
  const id = spaceId.trim();
  return id ? `https://my.matterport.com/show/?m=${encodeURIComponent(id)}` : "";
}

function extractSpaceIdFromUrl(url: string): string {
  if (!url) return "";
  const match = url.match(/[?&]m=([a-zA-Z0-9]+)/);
  return match ? match[1] : "";
}

function relativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "heute";
  if (diffDays === 1) return "vor 1 Tag";
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 30) return `vor ${Math.floor(diffDays / 7)} Wochen`;
  return `vor ${Math.floor(diffDays / 30)} Monaten`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isRecentSpace(dateStr: unknown): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr as string).getTime() < 7 * 86_400_000;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = 0 | 1 | 2; // 0 = Bestehender Kunde, 1 = Neuer Kunde, 2 = Ohne Zuordnung
type ToastVariant = "success" | "error";
interface ToastState {
  message: string;
  variant: ToastVariant;
}

// ── Batch action definitions ──────────────────────────────────────────────────

const BATCH_ACTIONS: {
  action: "auto" | "refresh-created" | "sync-status" | "check-ownership";
  label: string;
  tooltip: string;
  confirmRequired: boolean;
}[] = [
  {
    action: "auto",
    label: "Auto-Link URLs",
    tooltip: "URLs automatisch mit Spaces abgleichen",
    confirmRequired: false,
  },
  {
    action: "refresh-created",
    label: "MP created nachziehen",
    tooltip: "Erstellungsdatum von Matterport synchronisieren",
    confirmRequired: false,
  },
  {
    action: "sync-status",
    label: "Status sync",
    tooltip: "Achtung: Überschreibt lokale Status-Werte",
    confirmRequired: true,
  },
  {
    action: "check-ownership",
    label: "Ownership prüfen",
    tooltip: "Prüfen ob Spaces deinem Account gehören",
    confirmRequired: false,
  },
];

// ── Toast component ───────────────────────────────────────────────────────────

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const isSuccess = toast.variant === "success";
  return (
    <div
      className={`fixed top-5 right-5 z-[200] flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
        isSuccess
          ? "border-green-500/30 bg-[var(--surface)] text-[var(--text-main)]"
          : "border-red-500/30 bg-[var(--surface)] text-[var(--text-main)]"
      }`}
      role="alert"
    >
      <span className={isSuccess ? "text-green-500" : "text-red-500"}>{isSuccess ? "✓" : "!"}</span>
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-2 text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
        aria-label="Schliessen"
      >
        ×
      </button>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmBatchDialog({
  label,
  tooltip,
  onConfirm,
  onCancel,
}: {
  label: string;
  tooltip: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogClose onClose={onCancel} />
        <DialogHeader>
          <DialogTitle className="text-base">{label}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-subtle)] mb-5">{tooltip}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[var(--border-soft)] px-3 py-1.5 text-sm text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 transition-colors"
          >
            Bestätigen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab navigation ────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabId, string> = {
  0: "Bestehender Kunde",
  1: "Neuer Kunde",
  2: "Ohne Zuordnung",
};

// ── Main Component ────────────────────────────────────────────────────────────

export function ToursAdminLinkMatterportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const listQuery = useMemo(() => buildQs(searchParams), [searchParams]);
  const qk = toursAdminLinkMatterportQueryKey(listQuery);
  const queryFn = useCallback(() => getToursAdminLinkMatterport(listQuery), [listQuery]);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 20_000 });

  // Form state
  const [activeTab, setActiveTab] = useState<TabId>(0);
  const [mpId, setMpId] = useState("");
  const [tourUrl, setTourUrl] = useState("");
  const [bezeichnung, setBezeichnung] = useState("");
  const [coreCustomerId, setCoreCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [customerSearchDraft, setCustomerSearchDraft] = useState("");
  const [debouncedCustomerQ, setDebouncedCustomerQ] = useState("");
  const [suggestions, setSuggestions] = useState<{
    companies: Record<string, unknown>[];
    contacts: Record<string, unknown>[];
  }>({ companies: [], contacts: [] });
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [archiveIt, setArchiveIt] = useState(true);

  // Booking search state
  const [bookingSearchDraft, setBookingSearchDraft] = useState("");
  const [debouncedBookingQ, setDebouncedBookingQ] = useState("");
  const [bookingOrderNo, setBookingOrderNo] = useState<number | null>(null);
  const [bookingLabel, setBookingLabel] = useState("");
  const [bookingSuggestions, setBookingSuggestions] = useState<
    { id: number; order_no: number; status: string; address: string; company: string; email: string; date: string | null; created_at: string }[]
  >([]);
  const [bookingSuggestLoading, setBookingSuggestLoading] = useState(false);

  // cannotAssign is derived from the active tab
  const cannotAssign = activeTab === 2;

  // Busy / UI state
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<(typeof BATCH_ACTIONS)[number] | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const selectedLabelRef = useRef<string | null>(null);
  const appliedOpenSpaceIdRef = useRef<string | null>(null);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSpaces = (data?.openSpaces as Record<string, unknown>[]) || [];
  const pagination = data?.pagination as Record<string, unknown> | undefined;
  const mpError = data?.mpError as string | null | undefined;
  const autoOpenSpace = data?.autoOpenSpace as Record<string, unknown> | null | undefined;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function showToast(message: string, variant: ToastVariant = "success") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, variant });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  function clearCustomerSelection() {
    selectedLabelRef.current = null;
    setCoreCustomerId("");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerContact("");
    setCustomerSearchDraft("");
    setSuggestions({ companies: [], contacts: [] });
  }

  function clearBookingSelection() {
    setBookingOrderNo(null);
    setBookingLabel("");
    setBookingSearchDraft("");
    setBookingSuggestions([]);
  }

  function resetForm() {
    setMpId("");
    setTourUrl("");
    setBezeichnung("");
    setArchiveIt(true);
    clearCustomerSelection();
    clearBookingSelection();
    appliedOpenSpaceIdRef.current = null;
  }

  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (value == null || value === "") n.delete(key);
        else n.set(key, value);
        if (key !== "page") n.delete("page");
        return n;
      },
      { replace: true }
    );
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerQ(customerSearchDraft.trim()), 200);
    return () => clearTimeout(t);
  }, [customerSearchDraft]);

  useEffect(() => {
    if (debouncedCustomerQ.length < 2) {
      setSuggestions({ companies: [], contacts: [] });
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    void getLinkMatterportCustomerSearch(debouncedCustomerQ)
      .then((dataRes) => {
        if (cancelled) return;
        setSuggestions({
          companies: Array.isArray(dataRes.companies) ? (dataRes.companies as Record<string, unknown>[]) : [],
          contacts: Array.isArray(dataRes.contacts) ? (dataRes.contacts as Record<string, unknown>[]) : [],
        });
      })
      .catch(() => {
        if (!cancelled) setSuggestions({ companies: [], contacts: [] });
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedCustomerQ]);

  // Booking search debounce + fetch
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBookingQ(bookingSearchDraft.trim()), 250);
    return () => clearTimeout(t);
  }, [bookingSearchDraft]);

  useEffect(() => {
    if (debouncedBookingQ.length < 1) {
      setBookingSuggestions([]);
      return;
    }
    let cancelled = false;
    setBookingSuggestLoading(true);
    void getLinkMatterportBookingSearch(debouncedBookingQ)
      .then((r) => {
        if (!cancelled) setBookingSuggestions(r.orders);
      })
      .catch(() => {
        if (!cancelled) setBookingSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setBookingSuggestLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedBookingQ]);

  // Clear customer state whenever we switch away from "Bestehender Kunde"
  useEffect(() => {
    if (cannotAssign) {
      clearCustomerSelection();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cannotAssign]);

  const openSpaceIdInUrl = searchParams.get("openSpaceId") || "";

  useEffect(() => {
    if (!openSpaceIdInUrl) {
      appliedOpenSpaceIdRef.current = null;
      return;
    }
    if (!autoOpenSpace?.id || String(autoOpenSpace.id) !== openSpaceIdInUrl) return;
    if (appliedOpenSpaceIdRef.current === openSpaceIdInUrl) return;
    appliedOpenSpaceIdRef.current = openSpaceIdInUrl;
    setMpId(openSpaceIdInUrl);
    setTourUrl(matterportShowUrl(openSpaceIdInUrl));
    setBezeichnung(String(autoOpenSpace.name || ""));
    setActiveTab(0);
    setArchiveIt(true);

    // Bestellvorschlag aus internalId vorausfüllen
    const suggested = (autoOpenSpace as Record<string, unknown>).suggestedOrder as { order_no: number; status: string; address: string; company: string } | null | undefined;
    if (suggested?.order_no) {
      setBookingOrderNo(suggested.order_no);
      const label = `#${suggested.order_no} – ${suggested.address || suggested.company || ""}`.trim();
      setBookingLabel(label);
      setBookingSearchDraft(label);
      setBookingSuggestions([]);
    }
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("openSpaceId");
        return n;
      },
      { replace: true }
    );
    queueMicrotask(() => formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [openSpaceIdInUrl, autoOpenSpace, setSearchParams]);

  // ── Event handlers ─────────────────────────────────────────────────────────

  function handleTourUrlChange(value: string) {
    setTourUrl(value);
    const extracted = extractSpaceIdFromUrl(value);
    if (extracted) setMpId(extracted);
  }

  function prefillFromSpace(m: Record<string, unknown>) {
    const id = String(m.id || "").trim();
    if (!id) return;
    setMpId(id);
    setTourUrl(matterportShowUrl(id));
    setBezeichnung(String(m.name || ""));
    setActiveTab(0);
    setArchiveIt(true);

    // Bestellvorschlag aus internalId automatisch vorausfüllen
    const suggested = m.suggestedOrder as { order_no: number; status: string; address: string; company: string } | null | undefined;
    if (suggested?.order_no) {
      setBookingOrderNo(suggested.order_no);
      const label = `#${suggested.order_no} – ${suggested.address || suggested.company || ""}`.trim();
      setBookingLabel(label);
      setBookingSearchDraft(label);
      setBookingSuggestions([]);
    }

    queueMicrotask(() => formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function pickCompany(c: Record<string, unknown>) {
    const id = c.id;
    setCoreCustomerId(id != null ? String(id) : "");
    setCustomerName(String(c.firmenname ?? ""));
    setCustomerEmail(String(c.email ?? ""));
    setCustomerContact("");
    const label = String(c.firmenname ?? id ?? "");
    selectedLabelRef.current = label;
    setCustomerSearchDraft(label);
    setSuggestions({ companies: [], contacts: [] });
  }

  async function pickContact(hit: Record<string, unknown>) {
    setCoreCustomerId(String(hit.customerId ?? ""));
    setCustomerName(String(hit.firmenname ?? ""));
    setCustomerEmail(String(hit.contactEmail ?? hit.customerEmail ?? ""));
    setCustomerContact(String(hit.contactName ?? ""));
    const label =
      `${String(hit.contactName || "").trim()} · ${String(hit.firmenname || "").trim()}`.trim() ||
      String(hit.firmenname ?? "");
    selectedLabelRef.current = label;
    setCustomerSearchDraft(label);
    setSuggestions({ companies: [], contacts: [] });
    const cid = parseInt(String(hit.customerId ?? ""), 10);
    if (!Number.isFinite(cid) || cid < 1) return;
    try {
      const d = await getLinkMatterportCustomerDetail(cid);
      const cust = d.customer as Record<string, unknown> | null | undefined;
      if (cust) {
        setCustomerName(String(cust.firmenname ?? hit.firmenname ?? ""));
        setCustomerEmail(String(cust.email ?? hit.customerEmail ?? ""));
      }
    } catch {
      /* optional detail, non-critical */
    }
  }

  async function runBatch(action: "auto" | "refresh-created" | "sync-status" | "check-ownership") {
    setBusy(action);
    try {
      await postLinkMatterportBatch(action);
      void refetch({ force: true });
      showToast(`«${BATCH_ACTIONS.find((b) => b.action === action)?.label ?? action}» abgeschlossen`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fehler bei Batch-Aktion", "error");
    } finally {
      setBusy(null);
    }
  }

  async function submitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!mpId.trim()) {
      showToast("Matterport Space ID fehlt.", "error");
      return;
    }
    if (!cannotAssign && !tourUrl.trim()) {
      showToast("Tour-Link fehlt (oder Tab «Ohne Zuordnung» wählen).", "error");
      return;
    }
    if (activeTab === 1 && !customerName.trim()) {
      showToast("Kundenname ist bei «Neuer Kunde» Pflichtfeld.", "error");
      return;
    }
    setBusy("link");
    try {
      const body: Record<string, unknown> = {
        matterportSpaceId: mpId.trim(),
        tourUrl: tourUrl.trim(),
        bezeichnung: bezeichnung.trim(),
      };
      if (cannotAssign) {
        body.cannotAssign = true;
        if (archiveIt) body.archiveIt = true;
      }
      if (!cannotAssign && coreCustomerId.trim()) body.coreCustomerId = coreCustomerId.trim();
      if (!cannotAssign && customerName.trim()) body.customerName = customerName.trim();
      if (!cannotAssign && customerEmail.trim()) body.customerEmail = customerEmail.trim();
      if (!cannotAssign && customerContact.trim()) body.customerContact = customerContact.trim();
      if (bookingOrderNo) body.bookingOrderNo = bookingOrderNo;

      const r = await postLinkMatterport(body);
      if ((r as { ok?: boolean }).ok === false) {
        const dup = (r as { duplicateTourId?: number }).duplicateTourId;
        showToast(dup ? `Duplikat – Tour #${dup}` : String((r as { error?: string }).error), "error");
        return;
      }
      showToast("Tour erfolgreich angelegt");
      resetForm();
      void refetch({ force: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Fehler", "error");
    } finally {
      setBusy(null);
    }
  }

  // ── Table selection ───────────────────────────────────────────────────────

  const allOnPageSelected =
    openSpaces.length > 0 && openSpaces.every((s) => selectedIds.has(String(s.id)));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      const next = new Set(selectedIds);
      openSpaces.forEach((s) => next.delete(String(s.id)));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      openSpaces.forEach((s) => next.add(String(s.id)));
      setSelectedIds(next);
    }
  }

  function toggleSelectRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function handleBulkTake() {
    if (selectedIds.size === 1) {
      const spaceId = [...selectedIds][0];
      const space = openSpaces.find((s) => String(s.id) === spaceId);
      if (space) prefillFromSpace(space);
    } else {
      showToast(`${selectedIds.size} Spaces ausgewählt – bitte einzeln mit «Übernehmen» verknüpfen.`, "error");
    }
  }

  // ── Derive ────────────────────────────────────────────────────────────────

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const showSuggestPanel =
    debouncedCustomerQ.length >= 2 &&
    (suggestLoading || suggestions.companies.length > 0 || suggestions.contacts.length > 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]" style={{ fontFamily: "var(--propus-font-heading)" }}>
          Matterport verknüpfen
        </h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">Offene Spaces und Batch-Aktionen.</p>
      </div>

      {/* API error banners */}
      {mpError ? (
        <p className="text-sm text-amber-700 dark:text-amber-400 rounded border border-amber-300/30 bg-amber-50/10 px-3 py-2">
          Matterport API: {mpError}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600 rounded border border-red-300/30 bg-red-50/10 px-3 py-2">{error}</p>
      ) : null}

      {/* Batch Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        {BATCH_ACTIONS.map((ba) => (
          <Tooltip key={ba.action} content={ba.tooltip}>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                if (ba.confirmRequired) {
                  setConfirmBatch(ba);
                } else {
                  void runBatch(ba.action);
                }
              }}
              className={`text-xs rounded border px-3 py-1.5 transition-colors disabled:opacity-50 ${
                ba.confirmRequired
                  ? "border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-50/10 dark:hover:bg-red-900/10"
                  : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
              }`}
            >
              {busy === ba.action ? "…" : ba.label}
            </button>
          </Tooltip>
        ))}

        {selectedIds.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-[var(--propus-gold)]">{selectedIds.size} ausgewählt</span>
            <button
              type="button"
              onClick={handleBulkTake}
              className="text-xs rounded bg-[var(--accent)] px-3 py-1.5 text-white hover:opacity-90 transition-opacity"
            >
              Übernehmen
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-[var(--text-subtle)] underline hover:text-[var(--text-main)]"
            >
              Auswahl leeren
            </button>
          </div>
        )}
      </div>

      {/* Form anchor */}
      <div ref={formAnchorRef} className="scroll-mt-4" />

      {/* Form card */}
      <form onSubmit={submitLink} className="surface-card-strong p-4 text-sm space-y-4">
        <h2 className="font-semibold text-[var(--text-main)]">Neue Tour anlegen</h2>

        {/* Tab navigation */}
        <div className="flex border-b border-[var(--border-soft)] -mb-1">
          {([0, 1, 2] as TabId[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? "border-[var(--propus-gold)] text-[var(--propus-gold)]"
                  : "border-transparent text-[var(--text-subtle)] hover:text-[var(--text-main)]"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Space ID + Tour URL */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
              Tour-URL{!cannotAssign ? <span className="text-[var(--propus-gold)] ml-0.5">*</span> : null}
            </label>
            <input
              className="w-full rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
              placeholder="https://my.matterport.com/show/?m=…"
              value={tourUrl}
              onChange={(e) => handleTourUrlChange(e.target.value)}
            />
            <p className="text-xs text-[var(--text-subtle)]">↳ Space ID wird automatisch extrahiert</p>
          </div>
          <div className="space-y-1">
            <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
              Matterport Space ID
            </label>
            <input
              className="w-full rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-[var(--propus-gold)]"
              placeholder="Wird aus URL befüllt"
              value={mpId}
              onChange={(e) => setMpId(e.target.value)}
            />
          </div>
        </div>

        {/* Bezeichnung */}
        <div className="space-y-1">
          <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
            Bezeichnung / Objekt
          </label>
          <input
            className="w-full rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
            placeholder="z.B. Albisstrasse 158, Zürich – 4.5 Zi."
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
          />
        </div>

        {/* Bestellung verknüpfen */}
        <div className="relative space-y-1">
          <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
            Bestellung verknüpfen
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              className="flex-1 min-w-[200px] rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
              placeholder="Bestellnr., Adresse, Firma, E-Mail…"
              value={bookingSearchDraft}
              onChange={(e) => {
                const v = e.target.value;
                setBookingSearchDraft(v);
                if (bookingOrderNo != null && v.trim() !== bookingLabel) {
                  setBookingOrderNo(null);
                  setBookingLabel("");
                }
              }}
              autoComplete="off"
            />
            {bookingOrderNo != null && (
              <button
                type="button"
                className="text-xs underline text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                onClick={clearBookingSelection}
              >
                Bestellung lösen
              </button>
            )}
          </div>
          {bookingOrderNo != null ? (
            <p className="text-xs text-[var(--text-subtle)] flex items-center gap-1.5">
              <span className="rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 text-[10px] font-medium">Bestellung verknüpft</span>
              <span>Nr.</span>
              <span className="font-mono text-[var(--text-main)]">{bookingOrderNo}</span>
            </p>
          ) : null}
          {bookingOrderNo == null && debouncedBookingQ.length >= 1 && (bookingSuggestLoading || bookingSuggestions.length > 0) ? (
            <div className="absolute z-20 mt-1 w-full max-w-lg rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] shadow-lg max-h-64 overflow-y-auto">
              {bookingSuggestLoading ? (
                <p className="p-2 text-xs text-[var(--text-subtle)]">Suche…</p>
              ) : bookingSuggestions.length === 0 ? (
                <p className="p-2 text-xs text-[var(--text-subtle)]">Keine Bestellungen gefunden.</p>
              ) : (
                <ul className="py-1 text-xs">
                  {bookingSuggestions.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-[var(--surface-raised)]"
                        onClick={() => {
                          setBookingOrderNo(o.order_no);
                          const label = `#${o.order_no} – ${o.address || o.company || ""}`.trim();
                          setBookingLabel(label);
                          setBookingSearchDraft(label);
                          setBookingSuggestions([]);
                        }}
                      >
                        <span className="font-medium text-[var(--text-main)]">#{o.order_no}</span>
                        <span className="text-[var(--text-subtle)] ml-2">{o.address || "—"}</span>
                        {o.company ? <span className="text-[var(--text-subtle)] ml-1">· {o.company}</span> : null}
                        <span className={`ml-2 rounded px-1 py-0.5 text-[10px] font-medium ${
                          o.status === "completed" || o.status === "done"
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : o.status === "cancelled"
                              ? "bg-red-500/15 text-red-600 dark:text-red-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}>
                          {o.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {/* Tab 0: Bestehender Kunde */}
        {activeTab === 0 && (
          <div className="relative space-y-1">
            <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
              Kunde suchen (min. 2 Zeichen)
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                className="flex-1 min-w-[200px] rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                placeholder="Firma, E-Mail, Kontakt…"
                value={customerSearchDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomerSearchDraft(v);
                  if (selectedLabelRef.current != null && v.trim() !== selectedLabelRef.current) {
                    selectedLabelRef.current = null;
                    setCoreCustomerId("");
                  }
                }}
                autoComplete="off"
              />
              {(coreCustomerId || customerName) && (
                <button
                  type="button"
                  className="text-xs underline text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                  onClick={clearCustomerSelection}
                >
                  Kunde leeren
                </button>
              )}
            </div>
            {coreCustomerId ? (
              <p className="text-xs text-[var(--text-subtle)] flex items-center gap-1.5">
                <span className="rounded bg-green-500/15 text-green-600 dark:text-green-400 px-1.5 py-0.5 text-[10px] font-medium">Kunde verknüpft</span>
                <span>Kunden-ID</span>
                <span className="font-mono text-[var(--text-main)]">{coreCustomerId}</span>
              </p>
            ) : null}
            {showSuggestPanel ? (
              <div className="absolute z-20 mt-1 w-full max-w-lg rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] shadow-lg max-h-64 overflow-y-auto">
                {suggestLoading ? (
                  <p className="p-2 text-xs text-[var(--text-subtle)]">Suche…</p>
                ) : (
                  <ul className="py-1 text-xs">
                    {suggestions.companies.map((c, idx) => (
                      <li key={`c-${String(c.id ?? idx)}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-[var(--surface-raised)]"
                          onClick={() => pickCompany(c)}
                        >
                          <span className="font-medium text-[var(--text-main)]">
                            {String(c.firmenname ?? c.id ?? "—")}
                          </span>
                          {c.nummer != null && String(c.nummer).trim() !== "" ? (
                            <span className="text-[var(--text-subtle)] ml-1">· Nr. {String(c.nummer)}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                    {suggestions.contacts.map((hit, idx) => (
                      <li key={`k-${String(hit.contactId ?? idx)}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-[var(--surface-raised)]"
                          onClick={() => void pickContact(hit)}
                        >
                          <span className="text-[var(--text-main)]">{String(hit.contactName || "—")}</span>
                          <span className="text-[var(--text-subtle)]"> · {String(hit.firmenname ?? "—")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-3 pt-1">
              <input
                className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                placeholder="Kundenname (Anzeige)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <input
                type="email"
                className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                placeholder="E-Mail"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
              <input
                className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                placeholder="Ansprechpartner"
                value={customerContact}
                onChange={(e) => setCustomerContact(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Tab 1: Neuer Kunde */}
        {activeTab === 1 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                Kundenname <span className="text-[var(--propus-gold)]">*</span>
              </label>
              <input
                className="w-full rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                placeholder="Firmenname"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                E-Mail <span className="text-[var(--propus-gold)]">*</span>
              </label>
              <input
                type="email"
                className="w-full rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                placeholder="email@firma.ch"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                Ansprechpartner
              </label>
              <input
                className="w-full rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                placeholder="Vor- und Nachname"
                value={customerContact}
                onChange={(e) => setCustomerContact(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Ohne Zuordnung */}
        {activeTab === 2 && (
          <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)]/50 p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-main)]">
              <input
                type="checkbox"
                checked={archiveIt}
                onChange={(e) => setArchiveIt(e.target.checked)}
                className="accent-[var(--propus-gold)]"
              />
              <span>Archivieren</span>
            </label>
            <p className="text-xs text-amber-700 dark:text-amber-300 pl-6 leading-snug">
              Das Matterport-Modell wird dabei auf <strong>inaktiv</strong> gesetzt.
            </p>
            <p className="text-xs text-[var(--text-subtle)] pl-6">Ohne Zuweisung werden keine Kundendaten gespeichert.</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={!!busy}
            className="rounded bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy === "link" ? "…" : "Tour anlegen"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded border border-[var(--border-soft)] px-4 py-1.5 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            Zurücksetzen
          </button>
        </div>
      </form>

      {/* Search + Sort */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          placeholder="Suche Name / ID…"
          defaultValue={searchParams.get("q") || ""}
          key={searchParams.get("q") || ""}
          className="flex-1 min-w-[200px] rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 text-sm focus:outline-none focus:border-[var(--propus-gold)]"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value.trim() || null);
          }}
        />
        <select
          value={searchParams.get("sort") || "space"}
          onChange={(e) => setParam("sort", e.target.value)}
          className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 text-sm focus:outline-none focus:border-[var(--propus-gold)]"
        >
          <option value="space">Sort: Name</option>
          <option value="created">Sort: Erstellt</option>
        </select>
        <select
          value={searchParams.get("order") || "asc"}
          onChange={(e) => setParam("order", e.target.value)}
          className="rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 text-sm focus:outline-none focus:border-[var(--propus-gold)]"
        >
          <option value="asc">Aufwärts</option>
          <option value="desc">Abwärts</option>
        </select>
      </div>

      {/* Table */}
      {loading && !data ? (
        <div className="flex justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="surface-card-strong overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                <th className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    className="accent-[var(--propus-gold)] cursor-pointer"
                    title="Alle auf dieser Seite auswählen"
                  />
                </th>
                <th className="px-4 py-2.5 text-xs uppercase tracking-wide">Space</th>
                <th className="px-4 py-2.5 text-xs uppercase tracking-wide">ID</th>
                <th className="px-4 py-2.5 text-xs uppercase tracking-wide">Erstellt</th>
                <th className="px-4 py-2.5 text-xs uppercase tracking-wide text-right w-44">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {openSpaces.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-subtle)]">
                    Keine offenen Spaces gefunden
                  </td>
                </tr>
              )}
              {openSpaces.map((m) => {
                const id = String(m.id);
                const isSelected = selectedIds.has(id);
                const isHovered = hoveredRow === id;
                return (
                  <tr
                    key={id}
                    onMouseEnter={() => setHoveredRow(id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    className={`border-b border-[var(--border-soft)]/40 transition-colors ${
                      isHovered ? "bg-[var(--surface-raised)]" : isSelected ? "bg-[var(--accent)]/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(id)}
                        className="accent-[var(--propus-gold)] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-main)]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{String(m.name || "—")}</span>
                        {String(m.internalId || "") && (
                          <span className="font-mono text-[10px] text-[var(--text-subtle)] bg-[var(--surface-raised)] rounded px-1 py-0.5">
                            {String(m.internalId)}
                          </span>
                        )}
                        {isRecentSpace(m.created) && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-500/15 text-green-600 dark:text-green-400">
                            Neu
                          </span>
                        )}
                      </div>
                      {(() => {
                        const s = (m as Record<string, unknown>).suggestedOrder as { order_no: number; address: string; company: string; status: string } | null | undefined;
                        if (!s) return null;
                        return (
                          <div className="mt-1 flex items-center gap-1 text-[10px]">
                            <span className="rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 font-medium">
                              Bestellung #{s.order_no}
                            </span>
                            <span className="text-[var(--text-subtle)] truncate max-w-[160px]">{s.address || s.company || ""}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-subtle)]">{id}</td>
                    <td className="px-4 py-3 text-xs">
                      {m.created ? (
                        <>
                          <span className="text-[var(--text-subtle)]">{relativeTime(m.created as string)}</span>
                          <br />
                          <span className="text-[var(--text-muted,var(--text-subtle))]">{formatDate(m.created as string)}</span>
                        </>
                      ) : (
                        <span className="text-[var(--text-subtle)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="text-xs rounded border border-[var(--border-soft)] px-2 py-1 text-[var(--text-subtle)] hover:border-[var(--propus-gold)] hover:text-[var(--propus-gold)] transition-colors"
                          onClick={() => prefillFromSpace(m)}
                        >
                          Übernehmen
                        </button>
                        <a
                          href={matterportShowUrl(id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--accent)] hover:underline px-1"
                          title="Im Matterport öffnen"
                        >
                          ↗
                        </a>
                        <Tooltip content="Seite mit openSpaceId laden (EJS Deep-Link)">
                          <button
                            type="button"
                            className="text-xs rounded border border-[var(--border-soft)] px-2 py-1 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] transition-colors"
                            onClick={() => {
                              setSearchParams(
                                (prev) => {
                                  const n = new URLSearchParams(prev);
                                  n.set("openSpaceId", id);
                                  n.delete("page");
                                  return n;
                                },
                                { replace: true }
                              );
                            }}
                          >
                            Link
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination && Number(pagination.totalPages) > 1 ? (
            <div className="flex justify-between items-center px-4 py-2.5 text-xs text-[var(--text-subtle)] border-t border-[var(--border-soft)]">
              <span>
                {String(pagination.totalItems)} Space{Number(pagination.totalItems) !== 1 ? "s" : ""} total ·
                Seite {String(pagination.page)} / {String(pagination.totalPages)}
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={!pagination.hasPrev}
                  className="hover:text-[var(--text-main)] disabled:opacity-40 transition-colors"
                  onClick={() => setParam("page", String(page - 1))}
                >
                  ← Zurück
                </button>
                <button
                  type="button"
                  disabled={!pagination.hasNext}
                  className="hover:text-[var(--text-main)] disabled:opacity-40 transition-colors"
                  onClick={() => setParam("page", String(page + 1))}
                >
                  Weiter →
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Confirm dialog for destructive batch actions */}
      {confirmBatch && (
        <ConfirmBatchDialog
          label={confirmBatch.label}
          tooltip={confirmBatch.tooltip}
          onConfirm={() => {
            const action = confirmBatch.action;
            setConfirmBatch(null);
            void runBatch(action);
          }}
          onCancel={() => setConfirmBatch(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
