import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getLinkMatterportBookingSearch,
  getLinkMatterportCustomerSearch,
  getToursAdminLinkMatterport,
  postLinkMatterport,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminLinkMatterportQueryKey } from "../../../lib/queryKeys";
import { Tooltip } from "../../../components/ui/tooltip";
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
  // Ansprechpartner-Dropdown aus Firma
  const [contactSearchDraft, setContactSearchDraft] = useState("");
  const [contactSuggestions, setContactSuggestions] = useState<{ name: string; email: string; tel: string }[]>([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [archiveIt, setArchiveIt] = useState(true);

  // Booking search state
  const [bookingSearchDraft, setBookingSearchDraft] = useState("");
  const [debouncedBookingQ, setDebouncedBookingQ] = useState("");
  const [bookingOrderNo, setBookingOrderNo] = useState<number | null>(null);
  const [bookingLabel, setBookingLabel] = useState("");
  const [bookingSuggestions, setBookingSuggestions] = useState<
    { id: number; order_no: number; status: string; address: string; company: string; email: string; contactSalutation: string; contactFirstName: string; contactName: string; contactEmail: string; contactPhone: string; date: string | null; created_at: string; coreCustomerId: string | null; coreCompany: string; coreEmail: string; contacts: { name: string; email: string; tel: string }[] }[]
  >([]);
  const [bookingSuggestLoading, setBookingSuggestLoading] = useState(false);

  // cannotAssign is derived from the active tab
  const cannotAssign = activeTab === 2;

  // Busy / UI state
  const [busy, setBusy] = useState<string | null>(null);
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
    setContactSearchDraft("");
    setContactSuggestions([]);
    setShowContactDropdown(false);
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

  // URL-Parameter bookingOrderNo beim ersten Laden auswerten
  const appliedBookingOrderNoRef = useRef<string | null>(null);
  const bookingOrderNoInUrl = searchParams.get("bookingOrderNo") || "";
  useEffect(() => {
    if (!bookingOrderNoInUrl) return;
    if (appliedBookingOrderNoRef.current === bookingOrderNoInUrl) return;
    appliedBookingOrderNoRef.current = bookingOrderNoInUrl;
    void getLinkMatterportBookingSearch(bookingOrderNoInUrl).then((r) => {
      const o = r.orders?.[0];
      if (!o) return;
      const label = `#${o.order_no} – ${o.address || o.company || ""}`.trim();
      setBookingOrderNo(o.order_no);
      setBookingLabel(label);
      setBookingSearchDraft(label);
      setBookingSuggestions([]);
      if (o.address) setBezeichnung(o.address);
      if (o.coreCustomerId) {
        const firmenname = o.coreCompany || o.company || "";
        setCoreCustomerId(o.coreCustomerId);
        setCustomerName(firmenname);
        setCustomerEmail(o.coreEmail || o.email || "");
        selectedLabelRef.current = firmenname;
        setCustomerSearchDraft(firmenname);
        setSuggestions({ companies: [], contacts: [] });
        setContactSuggestions(o.contacts || []);
        setContactSearchDraft("");
        setShowContactDropdown(false);
        if (o.contacts?.length > 0) {
          setCustomerContact(o.contacts[0].name);
          setContactSearchDraft(o.contacts[0].name);
        }
      } else {
        const fallbackName = o.company || "";
        if (fallbackName) {
          setCustomerName(fallbackName);
          setCustomerSearchDraft(fallbackName);
          selectedLabelRef.current = fallbackName;
        }
        if (o.email) setCustomerEmail(o.email);
        const fullName = [o.contactFirstName, o.contactName].filter(Boolean).join(" ").trim();
        if (fullName) {
          setCustomerContact(fullName);
          setContactSearchDraft(fullName);
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingOrderNoInUrl]);

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
    const suggested = (autoOpenSpace as Record<string, unknown>).suggestedOrder as {
      order_no: number; status: string; address: string; company: string; email?: string;
      coreCustomerId?: string; coreCompany?: string; coreEmail?: string; coreCustomerNumber?: string;
      contacts?: { name: string; email: string; tel: string }[];
    } | null | undefined;
    if (suggested?.order_no) {
      setBookingOrderNo(suggested.order_no);
      const label = `#${suggested.order_no} – ${suggested.address || suggested.company || ""}`.trim();
      setBookingLabel(label);
      setBookingSearchDraft(label);
      setBookingSuggestions([]);
      if (suggested.address) setBezeichnung(suggested.address);
      if (suggested.coreCustomerId) {
        setCoreCustomerId(suggested.coreCustomerId);
        const firmenname = suggested.coreCompany || suggested.company || "";
        setCustomerName(firmenname);
        setCustomerEmail(suggested.coreEmail || suggested.email || "");
        selectedLabelRef.current = firmenname;
        setCustomerSearchDraft(firmenname);
        setSuggestions({ companies: [], contacts: [] });
        const cts = Array.isArray(suggested.contacts) ? suggested.contacts : [];
        setContactSuggestions(cts);
        setContactSearchDraft("");
        setShowContactDropdown(false);
      } else {
        if (suggested.company) setCustomerName(suggested.company);
        if (suggested.email) setCustomerEmail(suggested.email);
      }
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
    const suggested = m.suggestedOrder as {
      order_no: number; status: string; address: string; company: string; email?: string;
      coreCustomerId?: string; coreCompany?: string; coreEmail?: string; coreCustomerNumber?: string;
      contacts?: { name: string; email: string; tel: string }[];
    } | null | undefined;
    if (suggested?.order_no) {
      setBookingOrderNo(suggested.order_no);
      const label = `#${suggested.order_no} – ${suggested.address || suggested.company || ""}`.trim();
      setBookingLabel(label);
      setBookingSearchDraft(label);
      setBookingSuggestions([]);
      if (suggested.address) setBezeichnung(suggested.address);
      // Kunde aus core.customers vorausfüllen wenn bekannt
      if (suggested.coreCustomerId) {
        setCoreCustomerId(suggested.coreCustomerId);
        const firmenname = suggested.coreCompany || suggested.company || "";
        setCustomerName(firmenname);
        setCustomerEmail(suggested.coreEmail || suggested.email || "");
        selectedLabelRef.current = firmenname;
        setCustomerSearchDraft(firmenname);
        setSuggestions({ companies: [], contacts: [] });
        const cts = Array.isArray(suggested.contacts) ? suggested.contacts : [];
        setContactSuggestions(cts);
        setContactSearchDraft("");
        setShowContactDropdown(false);
        if (cts.length > 0) {
          setCustomerContact(cts[0].name);
          setContactSearchDraft(cts[0].name);
          if (!suggested.coreEmail && cts[0].email) setCustomerEmail(cts[0].email);
        }
      } else {
        const fallbackName = suggested.company || "";
        if (fallbackName) {
          setCustomerName(fallbackName);
          setCustomerSearchDraft(fallbackName);
          selectedLabelRef.current = fallbackName;
        }
        if (suggested.email) setCustomerEmail(suggested.email);
      }
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
    // Kontakte aus dem companies-Objekt für Ansprechpartner-Dropdown laden
    const cts = Array.isArray(c.contacts) ? (c.contacts as { name: string; email: string; tel: string }[]) : [];
    setContactSuggestions(cts);
    setContactSearchDraft("");
    setShowContactDropdown(false);
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
    (suggestLoading || suggestions.companies.length > 0);

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

      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
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

      {/* Form anchor */}
      <div ref={formAnchorRef} className="scroll-mt-4" />

      {/* Form card */}
      <form onSubmit={submitLink} className="surface-card-strong p-4 text-sm space-y-4">
        <h2 className="font-semibold text-[var(--text-main)]">Verknüpfen mit Kunde</h2>

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
                          // Bezeichnung aus Adresse
                          if (!bezeichnung.trim() && o.address) setBezeichnung(o.address);
                          // Kunde aus core.customers (per E-Mail gefunden)
                          if (activeTab === 0 || activeTab === 1) {
                            if (o.coreCustomerId) {
                              const firmenname = o.coreCompany || o.company || "";
                              setCoreCustomerId(o.coreCustomerId);
                              setCustomerName(firmenname);
                              setCustomerEmail(o.coreEmail || o.email || "");
                              selectedLabelRef.current = firmenname;
                              setCustomerSearchDraft(firmenname);
                              setSuggestions({ companies: [], contacts: [] });
                              setContactSuggestions(o.contacts || []);
                              setContactSearchDraft("");
                              setShowContactDropdown(false);
                              // Ersten Kontakt als Ansprechpartner vorausfüllen
                              if (!customerContact.trim() && o.contacts?.length > 0) {
                                setCustomerContact(o.contacts[0].name);
                                setContactSearchDraft(o.contacts[0].name);
                                if (!customerEmail.trim() && o.contacts[0].email) setCustomerEmail(o.contacts[0].email);
                              }
                            } else {
                              // Kein core.customers Eintrag – direkt aus billing befüllen
                              const fallbackName = o.company || "";
                              if (fallbackName) {
                                setCustomerName(fallbackName);
                                setCustomerSearchDraft(fallbackName);
                                selectedLabelRef.current = fallbackName;
                              }
                              if (!customerEmail.trim() && o.email) setCustomerEmail(o.email);
                              if (!customerContact.trim()) {
                                const fullName = [o.contactFirstName, o.contactName].filter(Boolean).join(" ").trim();
                                if (fullName) {
                                  setCustomerContact(fullName);
                                  setContactSearchDraft(fullName);
                                }
                              }
                            }
                          }
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
          <div className="space-y-3">
            {/* Firmensuche */}
            <div className="relative space-y-1">
              <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                Kunde suchen (min. 2 Zeichen)
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  className="flex-1 min-w-[200px] rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                  placeholder="Firma, E-Mail…"
                  value={customerSearchDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomerSearchDraft(v);
                    if (selectedLabelRef.current != null && v.trim() !== selectedLabelRef.current) {
                      selectedLabelRef.current = null;
                      setCoreCustomerId("");
                      setContactSuggestions([]);
                      setContactSearchDraft("");
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
                            {Array.isArray(c.contacts) && (c.contacts as unknown[]).length > 0 ? (
                              <span className="text-[var(--text-subtle)] ml-1 text-[10px]">
                                · {(c.contacts as unknown[]).length} Kontakt{(c.contacts as unknown[]).length !== 1 ? "e" : ""}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            {/* Ansprechpartner – erscheint nach Firmen-Auswahl */}
            {coreCustomerId && (
              <div className="relative space-y-1">
                <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                  Ansprechpartner
                  {contactSuggestions.length > 0 && (
                    <span className="ml-1 font-normal normal-case text-[var(--text-subtle)]">
                      ({contactSuggestions.length} verfügbar)
                    </span>
                  )}
                </label>
                <input
                  className="w-full rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 focus:outline-none focus:border-[var(--propus-gold)]"
                  placeholder={contactSuggestions.length > 0 ? "Mitarbeiter wählen oder tippen…" : "Name des Ansprechpartners"}
                  value={contactSearchDraft || customerContact}
                  onFocus={() => { if (contactSuggestions.length > 0) setShowContactDropdown(true); }}
                  onChange={(e) => {
                    const v = e.target.value;
                    setContactSearchDraft(v);
                    setCustomerContact(v);
                    setShowContactDropdown(contactSuggestions.length > 0);
                  }}
                  autoComplete="off"
                />
                {showContactDropdown && contactSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full max-w-lg rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] shadow-lg max-h-48 overflow-y-auto">
                    <ul className="py-1 text-xs">
                      {contactSuggestions
                        .filter((ct) => {
                          const q = (contactSearchDraft || "").toLowerCase();
                          if (!q) return true;
                          return ct.name.toLowerCase().includes(q) || (ct.email || "").toLowerCase().includes(q);
                        })
                        .map((ct, idx) => (
                          <li key={idx}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-[var(--surface-raised)]"
                              onClick={() => {
                                setCustomerContact(ct.name);
                                setContactSearchDraft(ct.name);
                                if (ct.email && !customerEmail.trim()) setCustomerEmail(ct.email);
                                setShowContactDropdown(false);
                              }}
                            >
                              <span className="font-medium text-[var(--text-main)]">{ct.name || "—"}</span>
                              {ct.email ? <span className="text-[var(--text-subtle)] ml-2">{ct.email}</span> : null}
                              {ct.tel ? <span className="text-[var(--text-subtle)] ml-2">{ct.tel}</span> : null}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Tab 1: Neuer Kunde */}
        {activeTab === 1 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                Firma <span className="text-[var(--propus-gold)]">*</span>
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
            {busy === "link" ? "…" : "Tour verknüpfen"}
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

      {/* Toast */}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
