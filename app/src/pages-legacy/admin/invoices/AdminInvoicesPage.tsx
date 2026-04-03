import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { getAdminInvoicesCentral, renewalInvoicePdfUrl } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { adminInvoicesCentralQueryKey } from "../../../lib/queryKeys";

type InvoiceType = "renewal" | "exxas";

function formatMoney(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `CHF ${n.toFixed(2)}`;
}

function formatDate(v: unknown) {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatusBadge({ status, source }: { status: string; source: InvoiceType }) {
  if (source === "renewal") {
    const map: Record<string, { label: string; cls: string }> = {
      paid:    { label: "Bezahlt",    cls: "bg-green-500/10 text-green-700 border-green-500/20" },
      sent:    { label: "Offen",      cls: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
      overdue: { label: "Überfällig", cls: "bg-red-500/10 text-red-700 border-red-500/20" },
      draft:   { label: "Entwurf",    cls: "bg-[var(--border-soft)]/50 text-[var(--text-subtle)] border-[var(--border-soft)]" },
      cancelled: { label: "Storniert", cls: "bg-gray-500/10 text-gray-600 border-gray-400/20" },
    };
    const entry = map[status] ?? { label: status, cls: "bg-[var(--border-soft)]/50 text-[var(--text-subtle)] border-[var(--border-soft)]" };
    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
        {entry.label}
      </span>
    );
  }
  const isPaid = status === "bz";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${isPaid ? "bg-green-500/10 text-green-700 border-green-500/20" : "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"}`}>
      {isPaid ? "Bezahlt" : (status || "Offen")}
    </span>
  );
}

const RENEWAL_FILTERS = [
  { val: "", label: "Alle" },
  { val: "offen", label: "Offen" },
  { val: "ueberfaellig", label: "Überfällig" },
  { val: "bezahlt", label: "Bezahlt" },
  { val: "entwurf", label: "Entwurf" },
];

const EXXAS_FILTERS = [
  { val: "", label: "Alle" },
  { val: "offen", label: "Offen" },
  { val: "bezahlt", label: "Bezahlt" },
];

export function AdminInvoicesPage() {
  const [tab, setTab] = useState<InvoiceType>("renewal");
  const [renewalStatus, setRenewalStatus] = useState("");
  const [exxasStatus, setExxasStatus] = useState("");
  const [renewalSearch, setRenewalSearch] = useState("");
  const [exxasSearch, setExxasSearch] = useState("");
  const [renewalSearchInput, setRenewalSearchInput] = useState("");
  const [exxasSearchInput, setExxasSearchInput] = useState("");

  const status = tab === "renewal" ? renewalStatus : exxasStatus;
  const search = tab === "renewal" ? renewalSearch : exxasSearch;

  const qk = adminInvoicesCentralQueryKey(tab, status, search);
  const queryFn = useCallback(
    () => getAdminInvoicesCentral(tab, status || undefined, search || undefined),
    [tab, status, search],
  );
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const invoices = data?.invoices ?? [];
  const stats = (data?.stats as Record<string, number>) ?? {};

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "renewal") {
      setRenewalSearch(renewalSearchInput);
    } else {
      setExxasSearch(exxasSearchInput);
    }
  }

  function handleSearchClear() {
    if (tab === "renewal") {
      setRenewalSearchInput("");
      setRenewalSearch("");
    } else {
      setExxasSearchInput("");
      setExxasSearch("");
    }
  }

  const filters = tab === "renewal" ? RENEWAL_FILTERS : EXXAS_FILTERS;
  const currentStatus = tab === "renewal" ? renewalStatus : exxasStatus;
  const currentSearchInput = tab === "renewal" ? renewalSearchInput : exxasSearchInput;
  const setCurrentStatus = tab === "renewal" ? setRenewalStatus : setExxasStatus;
  const setCurrentSearchInput = tab === "renewal" ? setRenewalSearchInput : setExxasSearchInput;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Rechnungen</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">Zentrale Rechnungsübersicht — Verlängerungsrechnungen und Exxas-Rechnungen.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tab === "renewal" ? (
          <>
            <StatCard label="Offen" value={stats.offen ?? "—"} tone="warning" />
            <StatCard label="Überfällig" value={stats.ueberfaellig ?? "—"} tone="danger" />
            <StatCard label="Bezahlt" value={stats.bezahlt ?? "—"} tone="success" />
            <StatCard label="Entwurf" value={stats.entwurf ?? "—"} tone="neutral" />
          </>
        ) : (
          <>
            <StatCard label="Offen" value={stats.offen ?? "—"} tone="warning" />
            <StatCard label="Bezahlt" value={stats.bezahlt ?? "—"} tone="success" />
            <StatCard label="Gesamt" value={stats.total ?? "—"} tone="neutral" />
            <div />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 surface-card-strong rounded-xl p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("renewal")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "renewal"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
          }`}
        >
          Verlängerungsrechnungen
        </button>
        <button
          type="button"
          onClick={() => setTab("exxas")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "exxas"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
          }`}
        >
          Exxas-Rechnungen
        </button>
      </div>

      {/* Search + Filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map(({ val, label }) => (
            <button
              key={val || "all"}
              type="button"
              onClick={() => setCurrentStatus(val)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                currentStatus === val
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/50"
              }`}
            >
              {label}
              {val === "offen" && stats.offen != null ? ` (${stats.offen})` : null}
              {val === "bezahlt" && stats.bezahlt != null ? ` (${stats.bezahlt})` : null}
              {val === "ueberfaellig" && stats.ueberfaellig != null ? ` (${stats.ueberfaellig})` : null}
              {val === "entwurf" && stats.entwurf != null ? ` (${stats.entwurf})` : null}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
            <input
              type="text"
              value={currentSearchInput}
              onChange={(e) => setCurrentSearchInput(e.target.value)}
              placeholder={tab === "renewal" ? "Tour, Kunde, Nr." : "Kunde, Nr., Bezeichnung"}
              className="pl-8 pr-3 py-1.5 text-sm border border-[var(--border-soft)] rounded-lg bg-[var(--surface)] text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-52"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
          >
            Suchen
          </button>
          {(tab === "renewal" ? renewalSearch : exxasSearch) && (
            <button
              type="button"
              onClick={handleSearchClear}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border border-[var(--border-soft)] text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            >
              Zurücksetzen
            </button>
          )}
        </form>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void refetch({ force: true })}>
            Erneut laden
          </button>
        </p>
      ) : null}

      {/* Table */}
      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="surface-card-strong overflow-x-auto">
          {tab === "renewal" ? (
            <RenewalTable invoices={invoices} />
          ) : (
            <ExxasTable invoices={invoices} />
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone: "warning" | "danger" | "success" | "neutral" }) {
  const toneClass = {
    warning: "text-yellow-600",
    danger: "text-red-600",
    success: "text-green-600",
    neutral: "text-[var(--text-subtle)]",
  }[tone];
  return (
    <div className="surface-card-strong rounded-xl px-4 py-3">
      <p className="text-xs text-[var(--text-subtle)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function RenewalTable({ invoices }: { invoices: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
          <th className="px-4 py-3">Tour / Kunde</th>
          <th className="px-4 py-3">Nr.</th>
          <th className="px-4 py-3">Typ</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Betrag</th>
          <th className="px-4 py-3">Fällig</th>
          <th className="px-4 py-3 text-right">Aktionen</th>
        </tr>
      </thead>
      <tbody>
        {invoices.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-subtle)]">
              Keine Rechnungen gefunden.
            </td>
          </tr>
        ) : (
          invoices.map((row) => {
            const tid = row.tour_id as number;
            const iid = row.id as string | number;
            return (
              <tr key={String(iid)} className="border-b border-[var(--border-soft)]/50 hover:bg-[var(--accent)]/5 transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/admin/tours/${tid}`} className="text-[var(--accent)] hover:underline font-medium">
                    {String(row.tour_object_label || `Tour #${tid}`)}
                  </Link>
                  <div className="text-xs text-[var(--text-subtle)] mt-0.5">{String(row.tour_customer_name || "")}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{String(row.invoice_number || iid)}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-subtle)]">{invoiceKindLabel(String(row.invoice_kind || ""))}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={String(row.invoice_status || "")} source="renewal" />
                </td>
                <td className="px-4 py-3 font-medium">{formatMoney(row.amount_chf)}</td>
                <td className="px-4 py-3">{formatDate(row.due_at)}</td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={renewalInvoicePdfUrl(tid, iid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    PDF
                  </a>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function ExxasTable({ invoices }: { invoices: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
          <th className="px-4 py-3">Kunde</th>
          <th className="px-4 py-3">Nr.</th>
          <th className="px-4 py-3">Bezeichnung</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Betrag</th>
          <th className="px-4 py-3">Fällig</th>
          <th className="px-4 py-3">Tour</th>
        </tr>
      </thead>
      <tbody>
        {invoices.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-subtle)]">
              Keine Exxas-Rechnungen gefunden.
            </td>
          </tr>
        ) : (
          invoices.map((row) => {
            const tid = row.tour_id as number | null;
            const iid = row.id as string | number;
            return (
              <tr key={String(iid)} className="border-b border-[var(--border-soft)]/50 hover:bg-[var(--accent)]/5 transition-colors">
                <td className="px-4 py-3 font-medium">{String(row.kunde_name || "—")}</td>
                <td className="px-4 py-3 font-mono text-xs">{String(row.nummer || iid)}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-subtle)] max-w-[200px] truncate" title={String(row.bezeichnung || "")}>
                  {String(row.bezeichnung || "—")}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={String(row.exxas_status || "")} source="exxas" />
                </td>
                <td className="px-4 py-3 font-medium">{formatMoney(row.preis_brutto)}</td>
                <td className="px-4 py-3">{formatDate(row.zahlungstermin)}</td>
                <td className="px-4 py-3">
                  {tid ? (
                    <Link to={`/admin/tours/${tid}`} className="text-[var(--accent)] hover:underline text-xs">
                      {String(row.tour_object_label || `#${tid}`)}
                    </Link>
                  ) : (
                    <span className="text-xs text-[var(--text-subtle)]">—</span>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function invoiceKindLabel(kind: string): string {
  const map: Record<string, string> = {
    portal_extension: "Verlängerung",
    portal_reactivation: "Reaktivierung",
    floorplan_order: "Grundriss",
  };
  return map[kind] ?? kind ?? "—";
}
