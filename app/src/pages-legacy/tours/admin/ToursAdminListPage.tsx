import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowDown, ArrowUp, ChevronsUpDown, Link2, Search } from "lucide-react";
import { getToursAdminToursList } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminToursListQueryKey } from "../../../lib/queryKeys";
import type { ToursAdminTourRow } from "../../../types/toursAdmin";

const SORT_OPTIONS = [
  { value: "matterport_created", label: "Neueste zuerst" },
  { value: "ablaufdatum", label: "Ablaufdatum" },
  { value: "customer", label: "Kunde / Objekt" },
  { value: "status", label: "Status" },
  { value: "days", label: "Tage bis Ablauf" },
] as const;

type ListSortKey = (typeof SORT_OPTIONS)[number]["value"];


function formatDate(value: unknown) {
  if (value == null || value === "") return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatRestzeit(days: unknown) {
  const n = typeof days === "number" ? days : parseInt(String(days ?? ""), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return `Seit ${Math.abs(n)} ${Math.abs(n) === 1 ? "Tag" : "Tagen"} abgelaufen`;
  if (n === 0) return "Läuft heute ab";
  return `${n} ${n === 1 ? "Tag" : "Tage"}`;
}

function sortHeaderIcon(sort: string, order: "asc" | "desc", col: ListSortKey) {
  const active = sort === col;
  if (!active) return <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-40 shrink-0" aria-hidden />;
  return order === "asc" ? (
    <ArrowUp className="ml-1 h-3.5 w-3.5 text-[var(--accent)] shrink-0" aria-hidden />
  ) : (
    <ArrowDown className="ml-1 h-3.5 w-3.5 text-[var(--accent)] shrink-0" aria-hidden />
  );
}

function tourTitle(t: ToursAdminTourRow) {
  return (
    (t.canonical_object_label as string) ||
    (t.object_label as string) ||
    (t.bezeichnung as string) ||
    `Tour #${t.id}`
  );
}

/** Wenn URL o. Ä. eine MP-ID liefert, DB-Feld aber leer → Deep-Link zur Verknüpfungsseite (offener Space). */
function matterportOpenLinkHref(t: ToursAdminTourRow): string | null {
  const persisted = String(t.matterport_space_id ?? "").trim();
  const canonical = String(t.canonical_matterport_space_id ?? "").trim();
  if (!canonical || persisted) return null;
  return `/admin/tours/link-matterport?openSpaceId=${encodeURIComponent(canonical)}`;
}

function buildListQueryString(sp: URLSearchParams): string {
  const keys = [
    "status",
    "expiringSoon",
    "awaitingPayment",
    "unlinkedOnly",
    "fremdeOnly",
    "activeRunning",
    "unverifiedOnly",
    "verifiedOnly",
    "invoiceOpenOnly",
    "invoiceOverdueOnly",
    "noCustomerOnly",
    "q",
    "page",
    "sort",
    "order",
  ];
  const next = new URLSearchParams();
  for (const k of keys) {
    const v = sp.get(k);
    if (v != null && v !== "") next.set(k, v);
  }
  // Default-Sortierung sicherstellen: neueste zuerst
  if (!next.has("sort")) next.set("sort", "matterport_created");
  if (!next.has("order")) next.set("order", "desc");
  return next.toString();
}

export function ToursAdminListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const listQuery = useMemo(() => buildListQueryString(searchParams), [searchParams]);
  const queryKey = toursAdminToursListQueryKey(listQuery);

  const queryFn = useCallback(() => getToursAdminToursList(listQuery), [listQuery]);
  const { data, loading, error, refetch } = useQuery(queryKey, queryFn, { staleTime: 30_000 });

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

  function toggleFlag(key: string) {
    const on = searchParams.get(key) === "1";
    setParam(key, on ? null : "1");
  }

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const q = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "matterport_created";
  const order = (searchParams.get("order") as "asc" | "desc" | null) ?? (sort === "matterport_created" ? "desc" : "asc");

  const [searchDraft, setSearchDraft] = useState(q);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  const applySearchToUrlNow = useCallback(
    (value: string) => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      const trimmed = value.trim();
      setSearchParams(
        (prev) => {
          const urlQ = (prev.get("q") || "").trim();
          if (trimmed === urlQ) return prev;
          const n = new URLSearchParams(prev);
          if (!trimmed) n.delete("q");
          else n.set("q", trimmed);
          n.delete("page");
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      const trimmed = searchDraft.trim();
      setSearchParams(
        (prev) => {
          const urlQ = (prev.get("q") || "").trim();
          if (trimmed === urlQ) return prev;
          const n = new URLSearchParams(prev);
          if (!trimmed) n.delete("q");
          else n.set("q", trimmed);
          n.delete("page");
          return n;
        },
        { replace: true },
      );
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchDraft, setSearchParams]);

  function setSortFromTableHeader(col: ListSortKey) {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        const cur = n.get("sort") || "ablaufdatum";
        const curOrder = n.get("order") === "desc" ? "desc" : "asc";
        if (cur === col) {
          n.set("order", curOrder === "asc" ? "desc" : "asc");
        } else {
          n.set("sort", col);
          n.set("order", "asc");
        }
        n.delete("page");
        return n;
      },
      { replace: true },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Touren</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">
            Gefilterte Tour-Übersicht.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/tours"
            className="inline-flex items-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button type="button" onClick={() => void refetch({ force: true })} className="text-sm underline font-medium">
            Erneut versuchen
          </button>
        </div>
      ) : null}

      <div className="surface-card-strong p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-subtle)]" />
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applySearchToUrlNow(searchDraft);
                }
              }}
              onBlur={() => applySearchToUrlNow(searchDraft)}
              placeholder="Suche Kunde, E-Mail, Objekt, Tour-ID, Matterport-ID …"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)]"
              aria-label="Touren durchsuchen"
            />
          </div>
          <select
            value={searchParams.get("status") || ""}
            onChange={(e) => setParam("status", e.target.value || null)}
            className="px-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)]"
          >
            <option value="">Alle Status</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="EXPIRING_SOON">Läuft bald ab</option>
            <option value="AWAITING_CUSTOMER_DECISION">Wartet auf Kunde</option>
            <option value="CUSTOMER_ACCEPTED_AWAITING_PAYMENT">Wartet auf Zahlung</option>
            <option value="CUSTOMER_DECLINED">Abgelehnt</option>
            <option value="ARCHIVED">Archiviert</option>
            <option value="EXPIRED_PENDING_ARCHIVE">Abgelaufen</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={order}
            onChange={(e) => setParam("order", e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)]"
          >
            <option value="asc">Aufsteigend</option>
            <option value="desc">Absteigend</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["expiringSoon", "Läuft in 30 Tagen ab"],
              ["awaitingPayment", "Wartet auf Zahlung"],
              ["unlinkedOnly", "Ohne Matterport-Link"],
              ["activeRunning", "Nur aktive (Workflow)"],
              ["invoiceOpenOnly", "Rechnung offen"],
              ["invoiceOverdueOnly", "Rechnung überfällig"],
              ["noCustomerOnly", "Ohne Kundendaten"],
              ["unverifiedOnly", "Kunde unverifiziert"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleFlag(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                searchParams.get(key) === "1"
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data?.stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="surface-card p-3">
            <div className="text-[var(--text-subtle)]">Gesamt</div>
            <div className="text-lg font-semibold text-[var(--text-main)]">{data.stats.total ?? "—"}</div>
          </div>
          <div className="surface-card p-3">
            <div className="text-[var(--text-subtle)]">Aktiv (MP)</div>
            <div className="text-lg font-semibold text-[var(--text-main)]">{data.stats.activeRunning ?? "—"}</div>
          </div>
          <div className="surface-card p-3">
            <div className="text-[var(--text-subtle)]">Bald ablaufend</div>
            <div className="text-lg font-semibold text-[var(--text-main)]">{data.stats.expiringSoon ?? "—"}</div>
          </div>
          <div className="surface-card p-3">
            <div className="text-[var(--text-subtle)]">Rechn. offen</div>
            <div className="text-lg font-semibold text-[var(--text-main)]">{data.stats.invoicesOpenTotal ?? "—"}</div>
          </div>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : data ? (
        <div className="surface-card-strong overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-soft)] text-left text-[var(--text-subtle)]">
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => setSortFromTableHeader("customer")}
                      className="inline-flex items-center gap-0.5 rounded-md -mx-1 px-1 py-0.5 text-left hover:text-[var(--text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                      aria-sort={sort === "customer" ? (order === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span>Objekt / Kunde</span>
                      {sortHeaderIcon(sort, order, "customer")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => setSortFromTableHeader("status")}
                      className="inline-flex items-center gap-0.5 rounded-md -mx-1 px-1 py-0.5 text-left hover:text-[var(--text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                      aria-sort={sort === "status" ? (order === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span>Status</span>
                      {sortHeaderIcon(sort, order, "status")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Rechnung</th>
                  <th className="px-4 py-3 font-medium hidden xl:table-cell">Tour erstellt am</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">
                    <button
                      type="button"
                      onClick={() => setSortFromTableHeader("ablaufdatum")}
                      className="inline-flex items-center gap-0.5 rounded-md -mx-1 px-1 py-0.5 text-left hover:text-[var(--text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                      aria-sort={sort === "ablaufdatum" ? (order === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span>Ablauf</span>
                      {sortHeaderIcon(sort, order, "ablaufdatum")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {data.tours.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-subtle)]">
                      Keine Touren für diese Filter.
                    </td>
                  </tr>
                ) : (
                  data.tours.map((t) => {
                    const mpOpenHref = matterportOpenLinkHref(t);
                    return (
                    <tr key={t.id} className="border-b border-[var(--border-soft)]/50 hover:bg-[var(--surface-raised)]/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text-main)]">{tourTitle(t)}</div>
                        <div className="text-xs text-[var(--text-subtle)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{(t.canonical_customer_name as string) || (t.customer_email as string) || "—"}</span>
                          {t.booking_order_no ? (
                            <span className="text-[var(--propus-gold)]/80">#{t.booking_order_no}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-[var(--text-main)]">
                        {String(t.displayed_status_label || t.status || "—")}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span
                          className={
                            t.invoice_status_tone === "danger"
                              ? "text-red-600 dark:text-red-400"
                              : t.invoice_status_tone === "warning"
                                ? "text-amber-700 dark:text-amber-400"
                                : t.invoice_status_tone === "success"
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-[var(--text-subtle)]"
                          }
                        >
                          {String(t.invoice_status_label || "—")}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell text-[var(--text-subtle)]">
                        {formatDate((t.matterport_created_at as string | null) ?? t.created_at)}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-[var(--text-subtle)]">
                        {formatDate(t.canonical_term_end_date ?? t.term_end_date ?? t.ablaufdatum)}
                        {formatRestzeit(t.days_until_expiry) ? (
                          <div className="text-xs mt-0.5">{formatRestzeit(t.days_until_expiry)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-2">
                          <NavLink
                            to={`/admin/tours/${t.id}`}
                            className="text-[var(--accent)] font-medium hover:underline text-xs sm:text-sm"
                          >
                            Details
                          </NavLink>
                          {mpOpenHref ? (
                            <NavLink
                              to={mpOpenHref}
                              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium hover:underline text-[10px] sm:text-xs"
                              title="Offenen Matterport-Space zuordnen (Formular mit Space-ID)"
                            >
                              <Link2 className="h-3 w-3 shrink-0" />
                              MP-Space
                            </NavLink>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>

          {data.pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--border-soft)]">
              <span className="text-xs text-[var(--text-subtle)]">
                Seite {data.pagination.page} von {data.pagination.totalPages} ({data.pagination.totalItems} Einträge)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!data.pagination.hasPrev}
                  onClick={() => setParam("page", String(Math.max(1, page - 1)))}
                  className="rounded-lg border border-[var(--border-soft)] px-3 py-1 text-sm disabled:opacity-40"
                >
                  Zurück
                </button>
                <button
                  type="button"
                  disabled={!data.pagination.hasNext}
                  onClick={() => setParam("page", String(page + 1))}
                  className="rounded-lg border border-[var(--border-soft)] px-3 py-1 text-sm disabled:opacity-40"
                >
                  Weiter
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
