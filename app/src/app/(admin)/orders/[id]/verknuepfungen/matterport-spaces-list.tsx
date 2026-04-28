"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { linkMatterportTour } from "./actions";

type OpenSpace = {
  id: string | number;
  name?: string;
  internalId?: string | number;
  created?: string;
  suggestedOrder?: { order_no: number; address?: string; company?: string; status?: string } | null;
};

type Pagination = {
  page?: number;
  totalPages?: number;
  totalItems?: number;
  hasPrev?: boolean;
  hasNext?: boolean;
};

type Props = {
  orderNo: number;
};

function relativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "heute";
  if (diffDays === 1) return "vor 1 Tag";
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 30) return `vor ${Math.floor(diffDays / 7)} Wochen`;
  return `vor ${Math.floor(diffDays / 30)} Monaten`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isRecentSpace(dateStr: unknown): boolean {
  if (!dateStr) return false;
  const t = new Date(String(dateStr)).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 7 * 86_400_000;
}

export function MatterportSpacesList({ orderNo }: Props) {
  const [q, setQ] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [sort, setSort] = useState<"space" | "created">("space");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ openSpaces: OpenSpace[]; pagination?: Pagination; mpError?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (sort) sp.set("sort", sort);
    if (order) sp.set("order", order);
    if (page > 1) sp.set("page", String(page));
    return sp.toString();
  }, [q, sort, order, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/tours/admin/link-matterport${queryString ? `?${queryString}` : ""}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          openSpaces?: OpenSpace[];
          pagination?: Pagination;
          mpError?: string | null;
        };
        if (cancelled) return;
        setData({
          openSpaces: Array.isArray(json.openSpaces) ? json.openSpaces : [],
          pagination: json.pagination,
          mpError: json.mpError ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Fehler beim Laden");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const openSpaces = data?.openSpaces ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Suche Name / ID…"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setQ(searchDraft.trim());
              setPage(1);
            }
          }}
          className="min-w-[200px] flex-1 rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:border-[var(--gold-500)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
        />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as "space" | "created");
            setPage(1);
          }}
          className="rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:border-[var(--gold-500)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
        >
          <option value="space">Sort: Name</option>
          <option value="created">Sort: Erstellt</option>
        </select>
        <select
          value={order}
          onChange={(e) => {
            setOrder(e.target.value as "asc" | "desc");
            setPage(1);
          }}
          className="rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:border-[var(--gold-500)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
        >
          <option value="asc">Aufwärts</option>
          <option value="desc">Abwärts</option>
        </select>
      </div>

      {data?.mpError && (
        <p className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Matterport API: {data.mpError}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-xs text-[#8A2515]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
              <th className="px-4 py-2.5">Space</th>
              <th className="px-4 py-2.5">ID</th>
              <th className="px-4 py-2.5">Erstellt</th>
              <th className="w-44 px-4 py-2.5 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--ink-3)]">
                  Spaces werden geladen…
                </td>
              </tr>
            )}
            {!loading && openSpaces.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--ink-3)]">
                  Keine offenen Spaces gefunden
                </td>
              </tr>
            )}
            {!loading &&
              openSpaces.map((m) => {
                const id = String(m.id);
                const showUrl = `https://my.matterport.com/show/?m=${encodeURIComponent(id)}`;
                return (
                  <tr key={id} className="border-b border-[var(--border)]/40 last:border-b-0">
                    <td className="px-4 py-3 text-[var(--ink)]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{m.name || "—"}</span>
                        {m.internalId ? (
                          <span className="rounded bg-[var(--paper-strip)] px-1 py-0.5 font-mono text-[10px] text-[var(--ink-3)]">
                            #{String(m.internalId)}
                          </span>
                        ) : null}
                        {isRecentSpace(m.created) && (
                          <span className="rounded-full border border-[#2A7A2A]/30 bg-[#E6F2E3] px-1.5 py-0.5 text-[10px] font-medium text-[#1F5C20]">
                            Neu
                          </span>
                        )}
                      </div>
                      {m.suggestedOrder?.order_no ? (
                        <div className="mt-1 flex items-center gap-1 text-[10px]">
                          <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-medium text-blue-700">
                            Bestellung #{m.suggestedOrder.order_no}
                          </span>
                          <span className="max-w-[220px] truncate text-[var(--ink-3)]">
                            {m.suggestedOrder.address || m.suggestedOrder.company || ""}
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--ink-3)]">{id}</td>
                    <td className="px-4 py-3 text-xs">
                      {m.created ? (
                        <>
                          <span className="text-[var(--ink-3)]">{relativeTime(m.created)}</span>
                          <br />
                          <span className="text-[var(--ink-3)]">{formatDate(m.created)}</span>
                        </>
                      ) : (
                        <span className="text-[var(--ink-3)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <form action={linkMatterportTour} className="inline">
                          <input type="hidden" name="order_no" value={String(orderNo)} />
                          <input type="hidden" name="space_id_or_url" value={id} />
                          <button
                            type="submit"
                            className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs text-[var(--ink-2)] hover:border-[var(--gold-500)] hover:text-[var(--gold-700)]"
                            title={`Space ${id} mit Bestellung #${orderNo} verknüpfen`}
                          >
                            Übernehmen
                          </button>
                        </form>
                        <a
                          href={showUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs text-[var(--ink-2)] hover:border-[var(--gold-500)] hover:text-[var(--gold-700)]"
                          title="Im Matterport öffnen"
                        >
                          <span className="inline-flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            Link
                          </span>
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {pagination && Number(pagination.totalPages ?? 0) > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--ink-3)]">
            <span>
              {String(pagination.totalItems ?? 0)} Space
              {Number(pagination.totalItems ?? 0) !== 1 ? "s" : ""} total · Seite{" "}
              {String(pagination.page ?? page)} / {String(pagination.totalPages ?? 1)}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={!pagination.hasPrev}
                className="hover:text-[var(--ink)] disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Zurück
              </button>
              <button
                type="button"
                disabled={!pagination.hasNext}
                className="hover:text-[var(--ink)] disabled:opacity-40"
                onClick={() => setPage((p) => p + 1)}
              >
                Weiter →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
