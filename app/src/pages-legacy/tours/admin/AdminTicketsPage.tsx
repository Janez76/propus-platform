import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Inbox,
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
  Mail,
  User,
  ShoppingCart,
  Map,
  Paperclip,
  ExternalLink,
  Search,
} from "lucide-react";
import {
  getTicketsList,
  getTicketDetail,
  patchTicketAssignment,
  patchTicketStatus,
  getMailInbox,
  postTicketFromEmail,
  getToursAdminCustomersList,
  getToursAdminToursList,
  type TicketRow,
  type TicketStatus,
  type InboxMessage,
} from "../../../api/toursAdmin";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── Status-Helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  open: {
    label: "Offen",
    icon: <Clock className="h-3 w-3" />,
    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  in_progress: {
    label: "In Arbeit",
    icon: <Loader2 className="h-3 w-3" />,
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  done: {
    label: "Erledigt",
    icon: <CheckCircle2 className="h-3 w-3" />,
    cls: "bg-green-500/15 text-green-400 border-green-500/30",
  },
  rejected: {
    label: "Abgelehnt",
    icon: <XCircle className="h-3 w-3" />,
    cls: "bg-red-500/15 text-red-400 border-red-500/30",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: null, cls: "bg-[var(--surface)] text-[var(--text-subtle)]" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  startpunkt: "Startpunkt",
  name_aendern: "Name ändern",
  blur_request: "Blur-Anfrage",
  sweep_verschieben: "Sweep verschieben",
  gallery_anmerkung: "Galerie-Anmerkung",
  sonstiges: "Sonstiges",
};

const STATUS_TABS: { value: TicketStatus | "all"; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Arbeit" },
  { value: "done", label: "Erledigt" },
  { value: "rejected", label: "Abgelehnt" },
];

// ─── Assign Panel ─────────────────────────────────────────────────────────────

function AssignSection({ ticket, onUpdated }: { ticket: TicketRow; onUpdated: () => void }) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [tourSearch, setTourSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: number; name: string; email: string }[]>([]);
  const [tourResults, setTourResults] = useState<{ id: number; bezeichnung: string | null; customer_email: string | null }[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [tourLoading, setTourLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tourTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function searchCustomers(q: string) {
    if (q.trim().length < 2) { setCustomerResults([]); return; }
    setCustomerLoading(true);
    try {
      const res = await getToursAdminCustomersList(`q=${encodeURIComponent(q)}&limit=8`) as { customers?: { id: number; name: string; email: string }[] };
      setCustomerResults(res.customers ?? []);
    } catch {
      setCustomerResults([]);
    } finally {
      setCustomerLoading(false);
    }
  }

  async function searchTours(q: string) {
    if (q.trim().length < 2) { setTourResults([]); return; }
    setTourLoading(true);
    try {
      const res = await getToursAdminToursList(`q=${encodeURIComponent(q)}&limit=8`) as unknown as { tours?: { id: number; bezeichnung: string | null; customer_email: string | null }[] };
      setTourResults(res.tours ?? []);
    } catch {
      setTourResults([]);
    } finally {
      setTourLoading(false);
    }
  }

  function onCustomerInput(v: string) {
    setCustomerSearch(v);
    if (customerTimer.current) clearTimeout(customerTimer.current);
    customerTimer.current = setTimeout(() => searchCustomers(v), 350);
  }

  function onTourInput(v: string) {
    setTourSearch(v);
    if (tourTimer.current) clearTimeout(tourTimer.current);
    tourTimer.current = setTimeout(() => searchTours(v), 350);
  }

  async function assign(patch: Parameters<typeof patchTicketAssignment>[1]) {
    setSaving(true);
    setError(null);
    try {
      await patchTicketAssignment(ticket.id, patch);
      onUpdated();
    } catch (err) {
      setError((err as Error).message ?? "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]";
  const resultCls =
    "w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] divide-y divide-[var(--border-soft)] overflow-hidden";
  const resultItemCls =
    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--surface)] transition-colors cursor-pointer";
  const removeBtnCls =
    "text-xs text-[var(--text-subtle)] hover:text-red-400 transition-colors underline underline-offset-2";

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Kunde */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
            <User className="h-3 w-3" /> Kunde
          </span>
          {ticket.customer_id && (
            <button className={removeBtnCls} onClick={() => assign({ customer_id: null })}>
              Entfernen
            </button>
          )}
        </div>
        {ticket.customer_id ? (
          <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm">
            <div className="font-medium text-[var(--text-main)]">{ticket.customer_name ?? `Kunde #${ticket.customer_id}`}</div>
            {ticket.customer_email && <div className="text-xs text-[var(--text-subtle)]">{ticket.customer_email}</div>}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
              <input
                type="search"
                placeholder="Kunde suchen…"
                value={customerSearch}
                onChange={(e) => onCustomerInput(e.target.value)}
                className={`${inputCls} pl-8`}
              />
            </div>
            {customerLoading && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--text-subtle)]" />
              </div>
            )}
            {customerResults.length > 0 && (
              <div className={resultCls}>
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    className={resultItemCls}
                    disabled={saving}
                    onClick={() => { assign({ customer_id: c.id }); setCustomerSearch(""); setCustomerResults([]); }}
                  >
                    <span>
                      <span className="font-medium text-[var(--text-main)]">{c.name}</span>
                      <span className="ml-1.5 text-[var(--text-subtle)]">{c.email}</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--text-subtle)] shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bestellung */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
            <ShoppingCart className="h-3 w-3" /> Bestellung
          </span>
          {ticket.reference_type === "order" && ticket.reference_id && (
            <button className={removeBtnCls} onClick={() => assign({ reference_type: null, reference_id: null })}>
              Entfernen
            </button>
          )}
        </div>
        {ticket.reference_type === "order" && ticket.reference_id ? (
          <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)]">
            Bestellung #{ticket.reference_order_no ?? ticket.reference_id}
          </div>
        ) : (
          <div className="relative">
            <ShoppingCart className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
            <input
              type="search"
              placeholder="Bestellnummer (z.B. 12345)…"
              className={`${inputCls} pl-8`}
              onKeyDown={async (e) => {
                if (e.key !== "Enter") return;
                const val = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, "");
                if (!val) return;
                await assign({ reference_type: "order", reference_id: val });
                (e.target as HTMLInputElement).value = "";
              }}
            />
          </div>
        )}
        <p className="text-xs text-[var(--text-subtle)]">Bestellnummer eingeben und Enter drücken</p>
      </div>

      {/* Tour */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
            <Map className="h-3 w-3" /> Tour
          </span>
          {ticket.reference_type === "tour" && ticket.reference_id && (
            <button className={removeBtnCls} onClick={() => assign({ reference_type: null, reference_id: null })}>
              Entfernen
            </button>
          )}
        </div>
        {ticket.reference_type === "tour" && ticket.reference_id ? (
          <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm">
            <div className="font-medium text-[var(--text-main)]">
              {ticket.tour_label ?? ticket.tour_bezeichnung ?? `Tour #${ticket.reference_id}`}
            </div>
            {ticket.tour_space_id && (
              <div className="text-xs text-[var(--text-subtle)]">{ticket.tour_space_id}</div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
              <input
                type="search"
                placeholder="Tour suchen…"
                value={tourSearch}
                onChange={(e) => onTourInput(e.target.value)}
                className={`${inputCls} pl-8`}
              />
            </div>
            {tourLoading && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--text-subtle)]" />
              </div>
            )}
            {tourResults.length > 0 && (
              <div className={resultCls}>
                {tourResults.map((t) => (
                  <button
                    key={t.id}
                    className={resultItemCls}
                    disabled={saving}
                    onClick={() => { assign({ reference_type: "tour", reference_id: String(t.id) }); setTourSearch(""); setTourResults([]); }}
                  >
                    <span>
                      <span className="font-medium text-[var(--text-main)]">
                        {t.bezeichnung ?? `Tour #${t.id}`}
                      </span>
                      {t.customer_email && (
                        <span className="ml-1.5 text-[var(--text-subtle)]">{t.customer_email}</span>
                      )}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--text-subtle)] shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {ticket.reference_type === "gallery" && ticket.reference_id && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
              <Map className="h-3 w-3" /> Galerie
            </span>
            <button className={removeBtnCls} onClick={() => assign({ reference_type: null, reference_id: null })}>
              Entfernen
            </button>
          </div>
          <a
            href={`/admin/listing/${ticket.reference_id}`}
            className="block rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
          >
            Galerie {String(ticket.reference_id).slice(0, 8)} öffnen →
          </a>
        </div>
      )}

      {saving && (
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-subtle)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Wird gespeichert…
        </div>
      )}
    </div>
  );
}

// ─── Ticket Detail Panel ──────────────────────────────────────────────────────

function TicketDetailPanel({
  ticketId,
  onClose,
  onUpdated,
}: {
  ticketId: number;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTicketDetail(ticketId);
      setTicket(res.ticket);
    } catch (err) {
      setError((err as Error).message ?? "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: TicketStatus) {
    if (!ticket) return;
    setStatusSaving(true);
    try {
      const res = await patchTicketStatus(ticket.id, status);
      setTicket(res.ticket);
      onUpdated();
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleAssignUpdated() {
    await load();
    onUpdated();
  }

  const labelCls = "text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide";
  const valueCls = "text-sm text-[var(--text-main)]";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--border-soft)]">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">Ticket-Details</h3>
        <button
          onClick={onClose}
          className="rounded-lg border border-[var(--border-soft)] p-1.5 text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-subtle)]" />
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {ticket && !loading && (
          <>
            {/* Betreff */}
            <div className="space-y-1">
              <div className={labelCls}>Betreff</div>
              <div className="text-sm font-medium text-[var(--text-main)]">{ticket.subject}</div>
            </div>

            {/* Status + Ändern */}
            <div className="space-y-2">
              <div className={labelCls}>Status</div>
              <div className="flex flex-wrap gap-1.5">
                {(["open", "in_progress", "done", "rejected"] as TicketStatus[]).map((s) => (
                  <button
                    key={s}
                    disabled={statusSaving || ticket.status === s}
                    onClick={() => changeStatus(s)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                      ticket.status === s
                        ? STATUS_CONFIG[s]?.cls ?? ""
                        : "border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-subtle)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                    }`}
                  >
                    {STATUS_CONFIG[s]?.label ?? s}
                  </button>
                ))}
              </div>
            </div>

            {/* Modul / Kategorie / Priorität */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1">
                <div className={labelCls}>Modul</div>
                <div className={valueCls}>{ticket.module === "booking" ? "Buchung" : "Touren"}</div>
              </div>
              <div className="space-y-1">
                <div className={labelCls}>Kategorie</div>
                <div className={valueCls}>{CATEGORY_LABELS[ticket.category] ?? ticket.category}</div>
              </div>
              <div className="space-y-1">
                <div className={labelCls}>Priorität</div>
                <div className={valueCls}>{ticket.priority === "high" ? "Hoch" : ticket.priority === "low" ? "Niedrig" : "Normal"}</div>
              </div>
              <div className="space-y-1">
                <div className={labelCls}>Erstellt von</div>
                <div className={`${valueCls} truncate`}>{ticket.created_by ?? "—"}</div>
              </div>
              <div className="space-y-1">
                <div className={labelCls}>Erstellt am</div>
                <div className={valueCls}>{fmtDate(ticket.created_at)}</div>
              </div>
              {ticket.assigned_to && (
                <div className="space-y-1">
                  <div className={labelCls}>Zugewiesen an</div>
                  <div className={`${valueCls} truncate`}>{ticket.assigned_to}</div>
                </div>
              )}
            </div>

            {/* Beschreibung */}
            {ticket.description && (
              <div className="space-y-1.5">
                <div className={labelCls}>Beschreibung</div>
                <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-main)] whitespace-pre-wrap">
                  {ticket.description}
                </div>
              </div>
            )}

            {/* Anhang / Link */}
            {ticket.attachment_path && (
              <div className="space-y-1">
                <div className={labelCls}>Anhang</div>
                <a
                  href={`/api/tours/admin/tickets/attachment/${ticket.attachment_path.split("/").pop()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {ticket.attachment_path.split("/").pop()}
                </a>
              </div>
            )}
            {ticket.link_url && (
              <div className="space-y-1">
                <div className={labelCls}>Link</div>
                <a
                  href={ticket.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline truncate"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  {ticket.link_url}
                </a>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-[var(--border-soft)] pt-4">
              <div className="mb-3 text-xs font-semibold text-[var(--text-main)] uppercase tracking-wide">
                Zuweisung
              </div>
              <AssignSection ticket={ticket} onUpdated={handleAssignUpdated} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tickets Tab ──────────────────────────────────────────────────────────────

function TicketsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = (searchParams.get("status") ?? "all") as TicketStatus | "all";
  const moduleFilter = searchParams.get("module") ?? "all";

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailKey, setDetailKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(moduleFilter !== "all" ? { module: moduleFilter } : {}),
      };
      const res = await getTicketsList(filters);
      setTickets(res.tickets);
    } catch (err) {
      setError((err as Error).message ?? "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, moduleFilter]);

  useEffect(() => { load(); }, [load]);

  function setParam(key: string, value: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    });
  }

  function onRowClick(id: number) {
    setSelectedId(id);
    setDetailKey((k) => k + 1);
  }

  function onDetailUpdated() {
    load();
    setDetailKey((k) => k + 1);
  }

  const thCls = "px-3 py-2.5 text-left text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide";
  const tdCls = "px-3 py-3 text-sm text-[var(--text-main)]";

  return (
    <div className="flex gap-4 min-h-0 flex-1">
      {/* Left: list */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Filters */}
        <div className="surface-card-strong rounded-xl p-4 space-y-3">
          {/* Status-Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setParam("status", tab.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === tab.value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Modul-Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-subtle)]">Modul:</span>
            {[
              { value: "all", label: "Alle" },
              { value: "tours", label: "Touren" },
              { value: "booking", label: "Buchung" },
            ].map((m) => (
              <button
                key={m.value}
                onClick={() => setParam("module", m.value)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  moduleFilter === m.value
                    ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30"
                    : "border border-[var(--border-soft)] text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="data-table-wrap surface-card-strong rounded-xl overflow-hidden">
          {error && (
            <div className="flex items-center gap-2 p-4 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {loading && !error && (
            <div className="flex items-center justify-center gap-2 p-12 text-[var(--text-subtle)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Tickets werden geladen…</span>
            </div>
          )}
          {!loading && !error && tickets.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-[var(--text-subtle)]">
              <Inbox className="h-8 w-8 opacity-30" />
              <span className="text-sm">Keine Tickets gefunden.</span>
            </div>
          )}
          {!loading && tickets.length > 0 && (
            <table className="dt w-full">
              <thead>
                <tr>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Betreff</th>
                  <th className={thCls}>Referenz</th>
                  <th className={thCls}>Kunde</th>
                  <th className={thCls}>Datum</th>
                  <th className={`${thCls} w-6`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)]">
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onRowClick(t.id)}
                    className={`cursor-pointer transition-colors hover:bg-[var(--surface)] ${selectedId === t.id ? "bg-[var(--accent)]/5" : ""}`}
                  >
                    <td className={tdCls}>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className={tdCls}>
                      <div className="font-medium">{t.subject}</div>
                      <div className="text-xs text-[var(--text-subtle)]">
                        {CATEGORY_LABELS[t.category] ?? t.category}
                        {t.module === "booking" && " · Buchung"}
                      </div>
                    </td>
                    <td className={tdCls}>
                      {t.reference_type === "tour" && (
                        <span className="text-xs text-[var(--text-subtle)]">
                          {t.tour_label ?? t.tour_bezeichnung ?? `Tour #${t.reference_id}`}
                        </span>
                      )}
                      {t.reference_type === "order" && (
                        <span className="text-xs text-[var(--text-subtle)]">
                          Bestellung #{t.reference_order_no ?? t.reference_id}
                        </span>
                      )}
                      {t.reference_type === "gallery" && (
                        <span className="text-xs text-[var(--text-subtle)]">
                          Galerie {t.reference_id ? String(t.reference_id).slice(0, 8) : ""}
                        </span>
                      )}
                      {!t.reference_type && <span className="text-[var(--text-subtle)]">—</span>}
                    </td>
                    <td className={tdCls}>
                      {t.customer_name ? (
                        <span className="text-xs">{t.customer_name}</span>
                      ) : (
                        <span className="text-[var(--text-subtle)]">—</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      <span className="text-xs text-[var(--text-subtle)]">{fmtDateShort(t.created_at)}</span>
                    </td>
                    <td className={tdCls}>
                      <ChevronRight className="h-4 w-4 text-[var(--text-subtle)]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {selectedId !== null && (
        <div className="w-96 shrink-0 surface-card-strong rounded-xl flex flex-col overflow-hidden">
          <TicketDetailPanel
            key={detailKey}
            ticketId={selectedId}
            onClose={() => setSelectedId(null)}
            onUpdated={onDetailUpdated}
          />
        </div>
      )}
    </div>
  );
}

// ─── Inbox Tab ────────────────────────────────────────────────────────────────

import { TicketCreateDialog } from "./components/TicketCreateDialog";

function InboxTab() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createFor, setCreateFor] = useState<InboxMessage | null>(null);
  const [creatingDirect, setCreatingDirect] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMailInbox({ top: 50 });
      setMessages(res.messages);
    } catch (err) {
      setError((err as Error).message ?? "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function quickCreateTicket(msg: InboxMessage) {
    setCreatingDirect(msg.fromEmail);
    try {
      const customer_id = msg.matchedCustomers[0]?.id ?? null;
      const tour = msg.matchedTours[0];
      await postTicketFromEmail({
        fromEmail: msg.fromEmail,
        subject: msg.subject,
        bodyPreview: msg.bodyPreview,
        receivedAt: msg.receivedAt,
        customer_id,
        reference_id: tour ? String(tour.id) : null,
        reference_type: tour ? "tour" : undefined,
      });
    } catch {
      /* noop */
    } finally {
      setCreatingDirect(null);
    }
  }

  const thCls = "px-3 py-2.5 text-left text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide";
  const tdCls = "px-3 py-3 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-subtle)]">
          E-Mails aus <span className="font-medium">office@propus.ch</span> mit automatischer Kunden-/Touren-Zuordnung
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      <div className="data-table-wrap surface-card-strong rounded-xl overflow-hidden">
        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {loading && !error && (
          <div className="flex items-center justify-center gap-2 p-12 text-[var(--text-subtle)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">E-Mails werden geladen…</span>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-[var(--text-subtle)]">
            <Mail className="h-8 w-8 opacity-30" />
            <span className="text-sm">Keine E-Mails im Posteingang.</span>
          </div>
        )}
        {!loading && messages.length > 0 && (
          <table className="dt w-full">
            <thead>
              <tr>
                <th className={thCls}>Absender</th>
                <th className={thCls}>Betreff</th>
                <th className={thCls}>Zuordnung</th>
                <th className={thCls}>Datum</th>
                <th className={`${thCls} w-36`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-soft)]">
              {messages.map((msg, idx) => {
                const hasMatch = msg.matchedTours.length > 0 || msg.matchedCustomers.length > 0;
                const isCreating = creatingDirect === msg.fromEmail;
                return (
                  <tr key={idx} className="hover:bg-[var(--surface)] transition-colors">
                    <td className={tdCls}>
                      <div className="font-medium text-[var(--text-main)] truncate max-w-[160px]">
                        {msg.fromName ?? msg.fromEmail}
                      </div>
                      {msg.fromName && (
                        <div className="text-xs text-[var(--text-subtle)] truncate max-w-[160px]">
                          {msg.fromEmail}
                        </div>
                      )}
                    </td>
                    <td className={tdCls}>
                      <div className="text-[var(--text-main)] truncate max-w-[220px]">{msg.subject}</div>
                      {msg.bodyPreview && (
                        <div className="text-xs text-[var(--text-subtle)] truncate max-w-[220px]">{msg.bodyPreview}</div>
                      )}
                    </td>
                    <td className={tdCls}>
                      {hasMatch ? (
                        <div className="space-y-0.5">
                          {msg.matchedCustomers.map((c) => (
                            <div key={c.id} className="flex items-center gap-1 text-xs text-green-400">
                              <User className="h-3 w-3 shrink-0" />
                              {c.name}
                            </div>
                          ))}
                          {msg.matchedTours.map((t) => (
                            <div key={t.id} className="flex items-center gap-1 text-xs text-blue-400">
                              <Map className="h-3 w-3 shrink-0" />
                              {t.bezeichnung ?? `Tour #${t.id}`}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-subtle)]">—</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      <span className="text-xs text-[var(--text-subtle)]">
                        {fmtDateShort(msg.receivedAt)}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setCreateFor(msg)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2.5 py-1 text-xs font-medium text-[var(--text-subtle)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors"
                        >
                          Ticket
                        </button>
                        {hasMatch && (
                          <button
                            onClick={() => quickCreateTicket(msg)}
                            disabled={isCreating}
                            title="Schnell-Ticket erstellen (auto-zugeordnet)"
                            className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-50"
                          >
                            {isCreating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Auto"
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Ticket-Create-Dialog aus E-Mail */}
      {createFor && (
        <TicketCreateDialog
          emailData={{
            subject: createFor.subject,
            bodyPreview: createFor.bodyPreview,
            fromEmail: createFor.fromEmail,
            receivedAt: createFor.receivedAt,
            customer_id: createFor.matchedCustomers[0]?.id ?? null,
            reference_id: createFor.matchedTours[0] ? String(createFor.matchedTours[0].id) : null,
            reference_type: createFor.matchedTours[0] ? "tour" : undefined,
          }}
          onClose={() => setCreateFor(null)}
          onCreated={() => setCreateFor(null)}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabId = "tickets" | "inbox";

interface TicketKpiCounts {
  open: number;
  inProgress: number;
  unassigned: number;
  high: number;
}

function useTicketKpiCounts(enabled: boolean): TicketKpiCounts | null {
  const [counts, setCounts] = useState<TicketKpiCounts | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getTicketsList()
      .then((res) => {
        if (cancelled) return;
        const open = res.tickets.filter((t) => t.status === "open").length;
        const inProgress = res.tickets.filter((t) => t.status === "in_progress").length;
        const unassigned = res.tickets.filter(
          (t) => t.status !== "done" && t.status !== "rejected" && !t.assigned_to,
        ).length;
        const high = res.tickets.filter(
          (t) => t.priority === "high" && t.status !== "done" && t.status !== "rejected",
        ).length;
        setCounts({ open, inProgress, unassigned, high });
      })
      .catch(() => {
        if (cancelled) return;
        setCounts({ open: 0, inProgress: 0, unassigned: 0, high: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return counts;
}

export function AdminTicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as TabId) ?? "tickets";
  const counts = useTicketKpiCounts(tab === "tickets");

  function setTab(t: TabId) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", t);
      // Clear ticket-specific filters when switching tabs
      if (t === "inbox") {
        next.delete("status");
        next.delete("module");
      }
      return next;
    });
  }

  return (
    <div className="padmin-shell flex flex-col min-h-0 h-full">
      <header className="pad-page-header">
        <div className="pad-ph-top">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="pad-eyebrow">Support</div>
            <h1 className="pad-h1">Tickets &amp; Postfach</h1>
            <div className="pad-ph-sub">Zentrale Übersicht über alle Module (Touren, Buchung und künftige Kanäle)</div>
          </div>
        </div>
        {tab === "tickets" && counts ? (
          <div className="pad-kpis">
            <div className={`pad-kpi${counts.high > 0 ? " is-warn" : ""}`}>
              <div className="pad-kpi-label">Offen</div>
              <div className="pad-kpi-value">{counts.open}</div>
              {counts.high > 0 && (
                <div className="pad-kpi-trend is-warn">{counts.high} hohe Prio</div>
              )}
            </div>
            <div className="pad-kpi">
              <div className="pad-kpi-label">In Bearbeitung</div>
              <div className="pad-kpi-value">{counts.inProgress}</div>
            </div>
            <div className={`pad-kpi${counts.unassigned > 0 ? " is-warn" : ""}`}>
              <div className="pad-kpi-label">Nicht zugewiesen</div>
              <div className="pad-kpi-value">{counts.unassigned}</div>
            </div>
            <div className="pad-kpi is-gold">
              <div className="pad-kpi-label">Hohe Prio offen</div>
              <div className="pad-kpi-value is-gold">{counts.high}</div>
            </div>
          </div>
        ) : null}
      </header>
      <div className="pad-content flex flex-col gap-5">

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-soft)]">
        {([
          { id: "tickets" as TabId, label: "Tickets", icon: <Inbox className="h-3.5 w-3.5" /> },
          { id: "inbox" as TabId, label: "Postfach", icon: <Mail className="h-3.5 w-3.5" /> },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "tickets" && <TicketsTab />}
        {tab === "inbox" && <InboxTab />}
      </div>
      </div>
    </div>
  );
}
