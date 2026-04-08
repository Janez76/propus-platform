import { useEffect, useState } from "react";
import { RefreshCw, ChevronRight } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getTickets, patchTicket, type Ticket } from "../api/tickets";
import { cn } from "../lib/utils";

type StatusFilter = "all" | "open" | "in_progress" | "done" | "rejected";
type ModuleFilter = "all" | "tours" | "booking";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Offen", color: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" },
  in_progress: { label: "In Arbeit", color: "bg-blue-500/20 text-blue-400 border border-blue-500/30" },
  done: { label: "Erledigt", color: "bg-green-500/20 text-green-400 border border-green-500/30" },
  rejected: { label: "Abgelehnt", color: "bg-red-500/20 text-red-400 border border-red-500/30" },
};

const MODULE_LABELS: Record<string, string> = {
  tours: "Touren",
  booking: "Buchung",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "bg-gray-500/20 text-gray-400" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", s.color)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function TicketsPage() {
  const token = useAuthStore((s) => s.token);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  const [selected, setSelected] = useState<Ticket | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await getTickets(token, {
        status: statusFilter === "all" ? undefined : statusFilter,
        module: moduleFilter === "all" ? undefined : moduleFilter,
      });
      setTickets(res.tickets ?? []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, moduleFilter, token]);

  async function changeStatus(id: number, status: string) {
    await patchTicket(token, id, { status });
    await load();
    setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev));
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-main)" }}>
            Tickets &amp; Postfach
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Zentrale Übersicht über alle Module (Touren, Buchung und künftige Geräte)
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{ background: "var(--surface-raised)", color: "var(--text-muted)", border: "1px solid var(--border-soft)" }}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Aktualisieren
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        {/* Status filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Status
          </span>
          {(["all", "open", "in_progress", "done", "rejected"] as StatusFilter[]).map((s) => {
            const labels: Record<StatusFilter, string> = {
              all: "Alle",
              open: "Offen",
              in_progress: "In Arbeit",
              done: "Erledigt",
              rejected: "Abgelehnt",
            };
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  statusFilter === s
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
                )}
                style={statusFilter !== s ? { background: "var(--surface-raised)", border: "1px solid var(--border-soft)" } : {}}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>

        {/* Module filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Modul
          </span>
          {(["all", "tours", "booking"] as ModuleFilter[]).map((m) => {
            const labels: Record<ModuleFilter, string> = {
              all: "Alle Module",
              tours: "Touren",
              booking: "Buchung",
            };
            return (
              <button
                key={m}
                onClick={() => setModuleFilter(m)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  moduleFilter === m
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
                )}
                style={moduleFilter !== m ? { background: "var(--surface-raised)", border: "1px solid var(--border-soft)" } : {}}
              >
                {labels[m]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table + Detail Panel */}
      <div className="flex gap-4 min-h-0">
        {/* Table */}
        <div className={cn("flex-1 rounded-xl overflow-hidden", selected ? "hidden lg:block" : "")}
          style={{ border: "1px solid var(--border-soft)", background: "var(--surface-raised)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-soft)" }}>
                  {["Status", "Modul", "Kategorie", "Betreff", "Referenz", "Datum"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}>
                      {h}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                      Laden…
                    </td>
                  </tr>
                )}
                {!loading && tickets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                      Keine Tickets gefunden.
                    </td>
                  </tr>
                )}
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => setSelected(selected?.id === ticket.id ? null : ticket)}
                    className="cursor-pointer transition-colors hover:bg-[var(--surface-hover)]"
                    style={{
                      borderBottom: "1px solid var(--border-soft)",
                      background: selected?.id === ticket.id ? "var(--surface-hover)" : undefined,
                    }}
                  >
                    <td className="px-4 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                      {MODULE_LABELS[ticket.module] ?? ticket.module}
                    </td>
                    <td className="px-4 py-3 capitalize" style={{ color: "var(--text-muted)" }}>
                      {ticket.category}
                    </td>
                    <td className="px-4 py-3 font-medium max-w-xs truncate" style={{ color: "var(--text-main)" }}>
                      {ticket.subject}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {ticket.reference_id ? (
                        <span>
                          {ticket.reference_type === "tour" ? "Touren" : ticket.reference_type} {ticket.reference_id}
                        </span>
                      ) : ticket.customer_id ? (
                        <span>Kunde #{ticket.customer_id}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatDate(ticket.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="w-full lg:w-96 flex-shrink-0 rounded-xl overflow-hidden flex flex-col"
            style={{ border: "1px solid var(--border-soft)", background: "var(--surface-raised)" }}>
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-soft)" }}>
              <h2 className="font-semibold text-sm" style={{ color: "var(--text-main)" }}>
                Ticket #{selected.id}
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="text-xs px-2 py-1 rounded"
                style={{ color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Betreff</p>
                <p className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>{selected.subject}</p>
              </div>
              {selected.description && (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Beschreibung</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-main)" }}>{selected.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Status</p>
                  <StatusBadge status={selected.status} />
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Priorität</p>
                  <p className="text-sm capitalize" style={{ color: "var(--text-main)" }}>{selected.priority}</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Modul</p>
                  <p className="text-sm" style={{ color: "var(--text-main)" }}>
                    {MODULE_LABELS[selected.module] ?? selected.module}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Kategorie</p>
                  <p className="text-sm capitalize" style={{ color: "var(--text-main)" }}>{selected.category}</p>
                </div>
              </div>
              {(selected.reference_id || selected.customer_id) && (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Referenz</p>
                  <p className="text-sm" style={{ color: "var(--text-main)" }}>
                    {selected.reference_id
                      ? `${selected.reference_type === "tour" ? "Tour" : selected.reference_type} #${selected.reference_id}`
                      : `Kunde #${selected.customer_id}`}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Erstellt</p>
                <p className="text-sm" style={{ color: "var(--text-main)" }}>{formatDate(selected.created_at)}</p>
              </div>

              {/* Status ändern */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Status ändern</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
                    <button
                      key={key}
                      onClick={() => changeStatus(selected.id, key)}
                      disabled={selected.status === key}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        selected.status === key ? cn(color, "opacity-100") : "opacity-50 hover:opacity-80",
                        color,
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
